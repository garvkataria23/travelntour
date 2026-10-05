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
    const page = Math.max(1, Number(query.page) || 1);
    const limit = Math.min(100, Math.max(1, Number(query.limit) || 20));
    const where: Record<string, unknown> = { businessId: user.businessId };
    if (query.search) {
      where.OR = [
        { name: { contains: query.search, mode: 'insensitive' as const } },
        { email: { contains: query.search, mode: 'insensitive' as const } },
      ];
    }
    const [rawItems, total] = await Promise.all([
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
          _count: {
            select: { bookings: true },
          },
          bookings: {
            select: {
              id: true,
              pnr: true,
              referenceNumber: true,
              flightNumber: true,
              airline: true,
              fromCity: true,
              toCity: true,
              departureDate: true,
              status: true,
              amount: true,
              currency: true,
              createdAt: true,
              customer: {
                select: { name: true, phone: true },
              },
            },
            orderBy: { createdAt: 'desc' },
            take: 50,
          },
        },
      }),
      this.prisma.user.count({ where }),
    ]);

    const items = rawItems.map((u) => {
      const bookings = u.bookings || [];
      let confirmedCount = 0;
      let pendingCount = 0;
      let cancelledCount = 0;
      let completedCount = 0;
      let totalRevenue = 0;
      for (const b of bookings) {
        if (b.status === 'CONFIRMED') confirmedCount++;
        else if (b.status === 'PENDING') pendingCount++;
        else if (b.status === 'CANCELLED') cancelledCount++;
        else if (b.status === 'COMPLETED') completedCount++;
        if (b.status !== 'CANCELLED') {
          totalRevenue += Number(b.amount || 0);
        }
      }
      return {
        id: u.id,
        name: u.name,
        email: u.email,
        phone: u.phone,
        role: u.role,
        status: u.status,
        lastLoginAt: u.lastLoginAt,
        createdAt: u.createdAt,
        totalBookings: u._count?.bookings ?? bookings.length,
        confirmedCount,
        pendingCount,
        cancelledCount,
        completedCount,
        totalRevenue,
        recentBookings: bookings.map((b) => ({
          id: b.id,
          pnr: b.pnr,
          referenceNumber: b.referenceNumber,
          flightNumber: b.flightNumber,
          airline: b.airline,
          route: `${b.fromCity} → ${b.toCity}`,
          departureDate: b.departureDate,
          status: b.status,
          amount: Number(b.amount || 0),
          currency: b.currency || 'AED',
          customerName: b.customer?.name || 'Traveller',
          customerPhone: b.customer?.phone || '',
          createdAt: b.createdAt,
        })),
      };
    });

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
      select: { id: true, name: true, email: true, phone: true, role: true, status: true, createdAt: true },
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
    if (dto.email && dto.email.toLowerCase() !== target.email.toLowerCase()) {
      const emailTaken = await this.prisma.user.findUnique({ where: { email: dto.email } });
      if (emailTaken && emailTaken.id !== target.id) {
        throw new BadRequestException({ message: 'A user with this email already exists', code: 'EMAIL_IN_USE' });
      }
      data.email = dto.email;
    }
    if (dto.phone !== undefined) data.phone = dto.phone;
    if (dto.role) data.role = dto.role as Role;
    if (dto.status) data.status = dto.status as UserStatus;
    if (dto.password) {
      data.passwordHash = await bcrypt.hash(dto.password, 12);
      await this.prisma.refreshToken.updateMany({
        where: { userId: target.id, revokedAt: null },
        data: { revokedAt: new Date() },
      });
    }
    if (dto.status === 'INACTIVE') {
      await this.prisma.refreshToken.updateMany({
        where: { userId: target.id, revokedAt: null },
        data: { revokedAt: new Date() },
      });
    }
    const updated = await this.prisma.user.update({
      where: { id: target.id },
      data,
      select: { id: true, name: true, email: true, phone: true, role: true, status: true, lastLoginAt: true },
    });
    await this.audit.log(user, 'USER_UPDATED', 'User', updated.id, { fields: Object.keys(data) });
    return updated;
  }

  /**
   * Deactivates a team member. Soft, not destructive: the row stays so the audit trail and every
   * booking they created keep their `createdBy`/`lastEditor` reference.
   */
  async remove(user: AuthUser, id: string) {
    const target = await this.prisma.user.findFirst({ where: { id, businessId: user.businessId } });
    if (!target) throw new BadRequestException({ message: 'User not found', code: 'USER_NOT_FOUND' });
    if (target.id === user.id) {
      throw new BadRequestException({ message: 'You cannot remove your own account', code: 'SELF_DELETE' });
    }

    // Without this, a tenant admin could deactivate the only other admin (or themselves after a
    // handover) and permanently lock everyone out of settings, invoicing and team management.
    if (target.role === Role.ADMIN) {
      const remainingAdmins = await this.prisma.user.count({
        where: { businessId: user.businessId, role: Role.ADMIN, status: 'ACTIVE', id: { not: target.id } },
      });
      if (remainingAdmins === 0) {
        throw new BadRequestException({
          message:
            'This is the last active administrator. Promote someone else to Admin before removing this account.',
          code: 'LAST_ADMIN',
        });
      }
    }

    await this.prisma.user.update({ where: { id: target.id }, data: { status: 'INACTIVE' } });
    await this.prisma.refreshToken.updateMany({
      where: { userId: target.id, revokedAt: null },
      data: { revokedAt: new Date() },
    });
    await this.audit.log(user, 'USER_DEACTIVATED', 'User', target.id, { email: target.email });
    return { deleted: true, deactivated: true };
  }
}