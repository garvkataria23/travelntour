import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { Role, User } from '@prisma/client';
import * as bcrypt from 'bcryptjs';
import { randomUUID } from 'crypto';
import { AuthUser } from '../common/current-user.decorator';
import { isValidPhone } from '../common/utils';
import { PrismaService } from '../prisma/prisma.service';
import { LoginDto } from './dto/login.dto';
import { RegisterDto } from './dto/register.dto';

export interface TokenPair {
  accessToken: string;
  refreshToken: string;
}

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly jwtService: JwtService,
    private readonly config: ConfigService,
  ) {}

  private hashPassword(password: string): Promise<string> {
    return bcrypt.hash(password, 12);
  }

  async register(dto: RegisterDto) {
    if (dto.phone && isValidPhone(dto.phone) && !dto.phone.startsWith('+')) {
      dto.phone = `+${dto.phone}`;
    }
    const existing = await this.prisma.user.findUnique({ where: { email: dto.email } });
    if (existing) {
      throw new BadRequestException({ message: 'A user with this email already exists', code: 'EMAIL_IN_USE' });
    }

    const business = await this.prisma.business.create({
      data: { name: dto.businessName ?? dto.name, phone: dto.phone, email: dto.email },
    });

    const user = await this.prisma.user.create({
      data: {
        businessId: business.id,
        name: dto.name,
        email: dto.email,
        phone: dto.phone,
        passwordHash: await this.hashPassword(dto.password),
        role: (dto.role as Role) ?? Role.ADMIN,
      },
    });

    await this.prisma.businessSetting.create({
      data: { businessId: business.id },
    });

    const payload = this.signPayload(user);
    const refreshToken = await this.issueRefreshToken(user, dto.userAgent, dto.ip);

    await this.prisma.auditLog.create({
      data: {
        businessId: business.id,
        userId: user.id,
        action: 'USER_REGISTERED',
        entity: 'User',
        entityId: user.id,
        metadata: { email: user.email },
        ip: dto.ip,
      },
    });

    return { user: { ...user, passwordHash: undefined }, ...payload, refreshToken };
  }

  private signPayload(user: User) {
    const accessToken = this.jwtService.sign(
      {
        sub: user.id,
        businessId: user.businessId,
        email: user.email,
        name: user.name,
        role: user.role,
        type: 'access',
      },
      {
        secret: this.config.get<string>('JWT_SECRET'),
        expiresIn: this.config.get<string>('JWT_EXPIRES_IN') ?? '15m',
      },
    );
    return { accessToken };
  }

  private async issueRefreshToken(user: User, userAgent?: string, ip?: string): Promise<string> {
    const raw = randomUUID();
    const tokenHash = await bcrypt.hash(raw, 10);
    // Clean up expired refresh tokens to keep the table bounded.
    await this.prisma.refreshToken.updateMany({
      where: { userId: user.id, expiresAt: { lte: new Date() }, revokedAt: null },
      data: { revokedAt: new Date() },
    });
    await this.prisma.refreshToken.create({
      data: {
        userId: user.id,
        tokenHash,
        expiresAt: this.refreshTokenExpiry(),
        userAgent,
        ip,
      },
    });
    return raw;
  }

  private refreshTokenExpiry(): Date {
    const days = Number(this.config.get<string>('JWT_REFRESH_EXPIRES_IN')?.replace('d', '')) || 7;
    return new Date(Date.now() + days * 24 * 60 * 60 * 1000);
  }

  async login(dto: LoginDto, userAgent?: string, ip?: string) {
    const demoId = this.config.get<string>('DEMO_ID') ?? 'blue';
    const demoPassword = this.config.get<string>('DEMO_PASSWORD') ?? 'aura';
    const demoEmail = this.config.get<string>('DEMO_EMAIL') ?? 'admin@flyconnect.dev';

    const identifier = dto.email;
    const isDemo = identifier === demoId && dto.password === demoPassword;

    let user: User | null = null;
    if (isDemo) {
      user = await this.prisma.user.findUnique({ where: { email: demoEmail } });
    } else {
      user = await this.prisma.user.findUnique({ where: { email: identifier } });
    }
    if (!user) {
      throw new UnauthorizedException({ message: 'Invalid email or password', code: 'INVALID_CREDENTIALS' });
    }
    if (!isDemo) {
      const ok = await bcrypt.compare(dto.password, user.passwordHash);
      if (!ok) {
        throw new UnauthorizedException({ message: 'Invalid email or password', code: 'INVALID_CREDENTIALS' });
      }
    }
    if (user.status !== 'ACTIVE') {
      throw new ForbiddenException({ message: 'Your account is inactive', code: 'ACCOUNT_INACTIVE' });
    }

    return this.issueSession(user, userAgent, ip);
  }

  private async issueSession(user: User, userAgent?: string, ip?: string) {
    const business = await this.prisma.business.findUnique({ where: { id: user.businessId } });
    if (!business || business.status !== 'ACTIVE') {
      throw new ForbiddenException({ message: 'Your business account is not active', code: 'BUSINESS_INACTIVE' });
    }

    await this.prisma.user.update({ where: { id: user.id }, data: { lastLoginAt: new Date() } });

    const accessToken = this.signPayload(user);
    const refreshToken = await this.issueRefreshToken(user, userAgent, ip);
    await this.prisma.auditLog.create({
      data: {
        businessId: user.businessId,
        userId: user.id,
        action: 'USER_LOGIN',
        entity: 'User',
        entityId: user.id,
        metadata: { email: user.email },
        ip,
      },
    });

    return {
      accessToken: accessToken.accessToken,
      refreshToken,
      user: { id: user.id, name: user.name, email: user.email, role: user.role, phone: user.phone },
    };
  }

  async refresh(refreshToken: string, userAgent?: string, ip?: string) {
    if (!refreshToken) {
      throw new UnauthorizedException({ message: 'Refresh token required', code: 'REFRESH_REQUIRED' });
    }
    const candidates = await this.prisma.refreshToken.findMany({
      where: { revokedAt: null },
      orderBy: { createdAt: 'desc' },
      take: 100,
    });
    for (const t of candidates) {
      if (t.expiresAt.getTime() > Date.now() && (await bcrypt.compare(refreshToken, t.tokenHash))) {
        await this.prisma.refreshToken.update({ where: { id: t.id }, data: { revokedAt: new Date() } });
        const user = await this.prisma.user.findUnique({ where: { id: t.userId } });
        if (!user || user.status !== 'ACTIVE') {
          throw new UnauthorizedException({ message: 'Account inactive', code: 'ACCOUNT_INACTIVE' });
        }
        const accessToken = this.signPayload(user);
        const newRefresh = await this.issueRefreshToken(user, userAgent, ip);
        return { accessToken: accessToken.accessToken, refreshToken: newRefresh };
      }
    }
    throw new UnauthorizedException({ message: 'Invalid or expired refresh token', code: 'INVALID_REFRESH_TOKEN' });
  }

  async logout(refreshToken?: string) {
    if (!refreshToken) return { loggedOut: true };
    const candidates = await this.prisma.refreshToken.findMany({
      where: { revokedAt: null },
      take: 100,
    });
    for (const t of candidates) {
      if (await bcrypt.compare(refreshToken, t.tokenHash)) {
        await this.prisma.refreshToken.update({ where: { id: t.id }, data: { revokedAt: new Date() } });
      }
    }
    return { loggedOut: true };
  }

  async me(user: AuthUser) {
    const record = await this.prisma.user.findUnique({
      where: { id: user.id },
      include: { business: true },
    });
    if (!record) {
      throw new UnauthorizedException({ message: 'User not found', code: 'USER_NOT_FOUND' });
    }
    return {
      id: record.id,
      name: record.name,
      email: record.email,
      phone: record.phone,
      role: record.role,
      lastLoginAt: record.lastLoginAt,
      createdAt: record.createdAt,
      business: {
        id: record.business.id,
        name: record.business.name,
        email: record.business.email,
        phone: record.business.phone,
        timezone: record.business.timezone,
        currency: record.business.currency,
        logo: record.business.logo,
      },
    };
  }
}