import { BadRequestException, Injectable } from '@nestjs/common';
import { Role, UserStatus } from '@prisma/client';
import * as bcrypt from 'bcryptjs';
import { AuthUser } from '../common/current-user.decorator';
import { paginationMeta } from '../common/pagination';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateUserDto } from './dto/update-user.dto';

@Injectable()
export class UsersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async list(user: AuthUser, query: { page?: number; limit?: number; search?: string }) {
    const page = query.page ?? 1;
    const limit = query.limit ?? 20;
    const where: Record<string, unknown> = { businessId: user.businessId };
    if (query.search) {
      where.OR = [
        { name: { contains: query.search, mode: 'insensitive' as const } },
        { email: { contains: query.search, mode: 'insensitive' as const } },
      ];
    }
    const [items, total] = await Promise.all([
      this.prisma.user.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
        select: {
          id: true,
          name: true,
          email: true,
          phone: true,
          role: true,
          status: true,
          lastLoginAt: true,
          createdAt: true,
        },
      }),
      this.prisma.user.count({ where }),
    ]);
    return { items, meta: paginationMeta(total, page, limit) };
  }

  async create(user: AuthUser, dto: CreateUserDto) {
    const existing = await this.prisma.user.findUnique({ where: { email: dto.email } });
    if (existing) {
      throw new BadRequestException({ message: 'A user with this email already exists', code: 'EMAIL_IN_USE' });
    }
    const role = (dto.role as Role) ?? Role.STAFF;
    const created = await this.prisma.user.create({
      data: {
        businessId: user.businessId,
        name: dto.name,
        email: dto.email,
        phone: dto.phone,
        passwordHash: await bcrypt.hash(dto.password, 12),
        role,
      },
      select: { id: true, name: true, email: true, phone: true, role: true, status: true },
    });
    await this.audit.log(user, 'USER_CREATED', 'User', created.id, { email: created.email, role });
    return created;
  }

  async update(user: AuthUser, id: string, dto: UpdateUserDto) {
    const target = await this.prisma.user.findFirst({ where: { id, businessId: user.businessId } });
    if (!target) throw new BadRequestException({ message: 'User not found', code: 'USER_NOT_FOUND' });
    if (target.id === user.id && dto.status === 'INACTIVE') {
      throw new BadRequestException({ message: 'You cannot deactivate your own account', code: 'SELF_DEACTIVATE' });
    }
    const data: Record<string, unknown> = {};
    if (dto.name) data.name = dto.name;
    if (dto.phone !== undefined) data.phone = dto.phone;
    if (dto.role) data.role = dto.role as Role;
    if (dto.status) data.status = dto.status as UserStatus;
    if (dto.password) data.passwordHash = await bcrypt.hash(dto.password, 12);
    const updated = await this.prisma.user.update({
      where: { id: target.id },
      data,
      select: { id: true, name: true, email: true, phone: true, role: true, status: true, lastLoginAt: true },
    });
    await this.audit.log(user, 'USER_UPDATED', 'User', updated.id, { fields: Object.keys(data) });
    return updated;
  }

  async remove(user: AuthUser, id: string) {
    const target = await this.prisma.user.findFirst({ where: { id, businessId: user.businessId } });
    if (!target) throw new BadRequestException({ message: 'User not found', code: 'USER_NOT_FOUND' });
    if (target.id === user.id) {
      throw new BadRequestException({ message: 'You cannot delete your own account', code: 'SELF_DELETE' });
    }
    await this.prisma.user.update({ where: { id: target.id }, data: { status: 'INACTIVE' } });
    await this.audit.log(user, 'USER_DELETED', 'User', target.id, { email: target.email });
    return { deleted: true };
  }
}