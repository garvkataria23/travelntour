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
import { createHash, randomUUID } from 'crypto';
import { AuthUser } from '../common/current-user.decorator';
import { permissionsForRole } from '../common/permissions';
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
    // Public self-service signup hands every caller a brand new business plus an ADMIN
    // account, which is a full compromise of an internal CRM. Staff are provisioned by an
    // admin through POST /api/users instead. Signup only reopens if explicitly re-enabled.
    if (this.config.get<string>('ALLOW_PUBLIC_REGISTRATION') !== 'true') {
      throw new ForbiddenException({
        message: 'Public signup is disabled. Ask an administrator to create your account.',
        code: 'REGISTRATION_DISABLED',
      });
    }

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
        role: Role.ADMIN,
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

  /**
   * A short, independently-signed assertion describing who the caller is.
   *
   * The Next.js middleware runs on Vercel's edge and cannot call the API on every navigation, but
   * it does need to know whether a request is authenticated and whether the user is a SUPER_ADMIN.
   * The API host is cross-site from the app host, so the browser will not attach a cookie set by
   * the API to app requests. Instead this token is handed to the app, which stores it in its own
   * httpOnly cookie via POST /api/session, and the middleware verifies the signature locally.
   *
   * This is a UI-level gate only. The backend remains the authority for every data operation, and
   * an attacker forging or replaying this token gets no API access whatsoever.
   */
  private signSessionAssertion(user: User): string {
    const days = Number(this.config.get<string>('JWT_REFRESH_EXPIRES_IN')?.replace('d', '')) || 7;
    return this.jwtService.sign(
      {
        sub: user.id,
        businessId: user.businessId,
        email: user.email,
        name: user.name,
        role: user.role,
        type: 'session',
      },
      {
        secret: this.config.get<string>('SESSION_SECRET') || this.config.get<string>('JWT_SECRET'),
        expiresIn: `${days}d`,
      },
    );
  }

  private async issueRefreshToken(user: User, userAgent?: string, ip?: string): Promise<string> {
    const raw = randomUUID();
    const tokenHash = createHash('sha256').update(raw).digest('hex');
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
    const identifier = dto.email.trim().toLowerCase();
    const user = await this.prisma.user.findUnique({ where: { email: identifier } });

    // Mitigate timing attacks by comparing against a dummy hash when user is not found
    const dummyHash = '$2a$12$e80MvX9b07J7uV3C2pZqIeD9O3T3t.6g/K4T4M6U8i7m8h0m.1v1e';
    const passwordToCompare = user ? user.passwordHash : dummyHash;
    const ok = await bcrypt.compare(dto.password, passwordToCompare);

    if (!user || !ok) {
      this.logger.warn(`Failed login attempt for identifier="${identifier}" from ip="${ip || 'unknown'}"`);
      throw new UnauthorizedException({ message: 'Invalid email or password', code: 'INVALID_CREDENTIALS' });
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
      session: this.signSessionAssertion(user),
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        role: user.role,
        phone: user.phone,
        businessId: user.businessId,
        permissions: permissionsForRole(user.role),
      },
    };
  }

  async refresh(refreshToken: string, userAgent?: string, ip?: string) {
    if (!refreshToken) {
      throw new UnauthorizedException({ message: 'Refresh token required', code: 'REFRESH_REQUIRED' });
    }
    const tokenHash = createHash('sha256').update(refreshToken).digest('hex');
    const record = await this.prisma.refreshToken.findUnique({
      where: { tokenHash },
    });
    if (!record || record.revokedAt || record.expiresAt.getTime() <= Date.now()) {
      throw new UnauthorizedException({ message: 'Invalid or expired refresh token', code: 'INVALID_REFRESH_TOKEN' });
    }

    // Claim the token atomically. The previous read-then-update allowed two concurrent refreshes
    // to both observe revokedAt === null and both mint a live token pair.
    const revoked = await this.prisma.refreshToken.updateMany({
      where: { id: record.id, revokedAt: null },
      data: { revokedAt: new Date() },
    });
    if (revoked.count === 0) {
      throw new UnauthorizedException({
        message: 'Refresh token has already been used',
        code: 'REFRESH_TOKEN_REUSED',
      });
    }

    const user = await this.prisma.user.findUnique({ where: { id: record.userId } });
    if (!user || user.status !== 'ACTIVE') {
      throw new UnauthorizedException({ message: 'Account inactive', code: 'ACCOUNT_INACTIVE' });
    }
    const accessToken = this.signPayload(user);
    const newRefresh = await this.issueRefreshToken(user, userAgent, ip);
    return {
      accessToken: accessToken.accessToken,
      refreshToken: newRefresh,
      session: this.signSessionAssertion(user),
    };
  }

  async logout(refreshToken?: string) {
    if (!refreshToken) return { loggedOut: true };
    const tokenHash = createHash('sha256').update(refreshToken).digest('hex');
    await this.prisma.refreshToken.updateMany({
      where: { tokenHash, revokedAt: null },
      data: { revokedAt: new Date() },
    });
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
      // The UI gates navigation and actions off this list rather than off `role`, so that a
      // capability change does not require touching every page. It is derived from the same matrix
      // the API guard enforces, so the two cannot disagree.
      permissions: permissionsForRole(record.role),
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