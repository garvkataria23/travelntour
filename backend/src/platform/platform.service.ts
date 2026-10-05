import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { BusinessStatus, Role } from '@prisma/client';
import * as bcrypt from 'bcryptjs';
import { randomBytes } from 'crypto';
import { DateTime } from 'luxon';
import { AuthUser } from '../common/current-user.decorator';
import { AuditService } from '../audit/audit.service';
import { PrismaService } from '../prisma/prisma.service';
import { CreateTenantDto, SetWhatsAppLimitDto, UpdateTenantDto, UpdateTenantStatusDto } from './dto/platform.dto';

/**
 * Platform-owner (SUPER_ADMIN) tenant administration.
 *
 * Every one of these operations previously lived in the browser, in localStorage under
 * "fc_master_admin_accounts_v1" (see lib/admin-accounts.ts). That made tenant blocking a
 * per-browser cosmetic effect rather than an access control, let any user unblock themselves from
 * DevTools, let a tenant ADMIN grant themselves unlimited WhatsApp quota, and seeded five
 * fabricated tenants containing realistic PII into every visitor's browser on first read.
 *
 * All routes are gated with @Roles(Role.SUPER_ADMIN) at the controller; the guard also allows
 * SUPER_ADMIN through the @Roles(ADMIN, SUPER_ADMIN) paths elsewhere, which is intended.
 */
@Injectable()
export class PlatformService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  private async assertSuperAdmin(actor: AuthUser): Promise<void> {
    if (actor.role !== Role.SUPER_ADMIN) {
      throw new ForbiddenException({
        message: 'Platform administration requires the SUPER_ADMIN role',
        code: 'SUPER_ADMIN_REQUIRED',
      });
    }
  }

  /** All tenants, with the admin contacts and current-month WhatsApp usage. */
  async listTenants(actor: AuthUser, opts: { search?: string; status?: string } = {}) {
    await this.assertSuperAdmin(actor);

    const where: Record<string, unknown> = {};
    if (opts.status && opts.status !== 'ALL') {
      where.status = opts.status as BusinessStatus;
    }
    if (opts.search?.trim()) {
      const term = opts.search.trim();
      where.OR = [
        { name: { contains: term, mode: 'insensitive' } },
        { email: { contains: term, mode: 'insensitive' } },
        { users: { some: { name: { contains: term, mode: 'insensitive' } } } },
      ];
    }

    const businesses = await this.prisma.business.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      include: {
        users: {
          where: { role: { in: [Role.ADMIN, Role.SUPER_ADMIN] } },
          select: { id: true, name: true, email: true, phone: true, role: true, status: true, lastLoginAt: true },
        },
        _count: { select: { bookings: true } },
      },
    });

    // Usage is counted over the current calendar month in the business's own timezone, matching
    // how the frontend quota banner presented it.
    const monthStart = (timezone: string) => {
      const now = DateTime.now().setZone(timezone || 'UTC');
      return now.startOf('month').toUTC().toJSDate();
    };

    const rows = await Promise.all(
      businesses.map(async (b) => {
        const used = await this.prisma.messageLog.count({
          where: { businessId: b.id, direction: 'OUTBOUND', sentAt: { gte: monthStart(b.timezone) } },
        });
        const admin = b.users[0];
        return {
          id: b.id,
          name: b.name,
          ownerName: admin?.name ?? null,
          email: admin?.email ?? b.email ?? null,
          phone: admin?.phone ?? b.phone ?? null,
          plan: b.plan ?? 'PROFESSIONAL',
          status: b.status,
          blockReason: b.blockedReason ?? null,
          blockedAt: b.blockedAt ? b.blockedAt.toISOString() : null,
          whatsappLimit: b.whatsappMonthlyLimit ?? PlatformService.DEFAULT_WHATSAPP_LIMIT,
          whatsappLimitIsDefault: b.whatsappMonthlyLimit === null,
          whatsappUsed: used,
          totalBookings: b._count.bookings,
          timezone: b.timezone,
          currency: b.currency,
          notes: b.notes ?? null,
          createdAt: b.createdAt.toISOString(),
          lastActiveAt: admin?.lastLoginAt?.toISOString() ?? b.updatedAt.toISOString(),
        };
      }),
    );

    return { items: rows, total: rows.length };
  }

  static readonly DEFAULT_WHATSAPP_LIMIT = 1000;

  /**
   * Block or unblock a tenant.
   *
   * Blocking flips Business.status, which AuthService.issueSession already checks, so the effect
   * is real: no new session can be minted and the API rejects the tenant on every route that
   * resolves the business. Existing sessions are additionally revoked here so a blocked tenant
   * cannot keep working off an access token it already holds.
   */
  async setTenantStatus(actor: AuthUser, businessId: string, dto: UpdateTenantStatusDto) {
    await this.assertSuperAdmin(actor);

    const business = await this.prisma.business.findUnique({ where: { id: businessId } });
    if (!business) {
      throw new NotFoundException({ message: 'Tenant not found', code: 'TENANT_NOT_FOUND' });
    }
    if (business.id === actor.businessId && dto.blocked) {
      throw new BadRequestException({
        message: 'You cannot block your own tenant',
        code: 'CANNOT_BLOCK_SELF',
      });
    }

    if (dto.blocked) {
      const reason = dto.reason?.trim();
      if (!reason) {
        throw new BadRequestException({
          message: 'A reason is required to block a tenant',
          code: 'BLOCK_REASON_REQUIRED',
        });
      }
      await this.prisma.$transaction([
        this.prisma.business.update({
          where: { id: businessId },
          data: {
            status: BusinessStatus.BLOCKED,
            blockedReason: reason,
            blockedAt: new Date(),
            blockedById: actor.id,
          },
        }),
        // A blocked tenant must not keep an already-issued session alive.
        this.prisma.refreshToken.updateMany({
          where: { user: { businessId }, revokedAt: null },
          data: { revokedAt: new Date() },
        }),
      ]);
    } else {
      await this.prisma.business.update({
        where: { id: businessId },
        data: { status: BusinessStatus.ACTIVE, blockedReason: null, blockedAt: null, blockedById: null },
      });
    }

    await this.audit.log(actor, dto.blocked ? 'TENANT_BLOCKED' : 'TENANT_UNBLOCKED', 'Business', businessId, {
      reason: dto.reason ?? null,
    });

    return { id: businessId, status: dto.blocked ? BusinessStatus.BLOCKED : BusinessStatus.ACTIVE };
  }

  async setWhatsAppLimit(actor: AuthUser, businessId: string, dto: SetWhatsAppLimitDto) {
    await this.assertSuperAdmin(actor);

    const business = await this.prisma.business.findUnique({ where: { id: businessId } });
    if (!business) {
      throw new NotFoundException({ message: 'Tenant not found', code: 'TENANT_NOT_FOUND' });
    }

    await this.prisma.business.update({
      where: { id: businessId },
      data: { whatsappMonthlyLimit: dto.limit },
    });

    await this.audit.log(actor, 'TENANT_WHATSAPP_LIMIT_SET', 'Business', businessId, { limit: dto.limit });
    return { id: businessId, whatsappMonthlyLimit: dto.limit };
  }

  async updateTenant(actor: AuthUser, businessId: string, dto: UpdateTenantDto) {
    await this.assertSuperAdmin(actor);

    const business = await this.prisma.business.findUnique({ where: { id: businessId } });
    if (!business) {
      throw new NotFoundException({ message: 'Tenant not found', code: 'TENANT_NOT_FOUND' });
    }

    await this.prisma.business.update({
      where: { id: businessId },
      data: {
        ...(dto.name !== undefined ? { name: dto.name } : {}),
        ...(dto.notes !== undefined ? { notes: dto.notes } : {}),
        ...(dto.plan !== undefined ? { plan: dto.plan } : {}),
      },
    });

    // Contact details belong to the owner user record when one exists.
    const admin = await this.prisma.user.findFirst({
      where: { businessId, role: { in: [Role.ADMIN, Role.SUPER_ADMIN] } },
      orderBy: { createdAt: 'asc' },
    });
    if (admin) {
      await this.prisma.user.update({
        where: { id: admin.id },
        data: {
          ...(dto.ownerName !== undefined ? { name: dto.ownerName } : {}),
          ...(dto.email !== undefined ? { email: dto.email } : {}),
          ...(dto.phone !== undefined ? { phone: dto.phone } : {}),
        },
      });
    }

    await this.audit.log(actor, 'TENANT_UPDATED', 'Business', businessId, {
      fields: Object.keys(dto),
    });
    return { id: businessId, updated: true };
  }

  /** Provisions a tenant together with its first ADMIN user. */
  async createTenant(actor: AuthUser, dto: CreateTenantDto) {
    await this.assertSuperAdmin(actor);

    const email = dto.email.trim().toLowerCase();
    const existing = await this.prisma.user.findUnique({ where: { email } });
    if (existing) {
      throw new ConflictException({ message: 'That email already has an account', code: 'EMAIL_IN_USE' });
    }

    const generated = dto.adminPassword ?? randomBytes(12).toString('base64url');
    const passwordHash = await bcrypt.hash(generated, 12);

    const business = await this.prisma.business.create({
      data: {
        name: dto.name.trim(),
        email,
        phone: dto.phone ?? null,
        status: BusinessStatus.ACTIVE,
        ...(dto.whatsappMonthlyLimit !== undefined
          ? { whatsappMonthlyLimit: dto.whatsappMonthlyLimit }
          : {}),
        users: {
          create: {
            name: dto.ownerName.trim(),
            email,
            phone: dto.phone ?? null,
            passwordHash,
            role: Role.ADMIN,
          },
        },
        setting: { create: {} },
      },
      include: { users: { select: { id: true, email: true, role: true } } },
    });

    await this.audit.log(actor, 'TENANT_CREATED', 'Business', business.id, { email });

    return {
      id: business.id,
      name: business.name,
      admin: business.users[0] ?? null,
      // Returned exactly once so the platform owner can hand it over. It is not recoverable.
      initialPassword: dto.adminPassword ? undefined : generated,
    };
  }

  /**
   * Soft-deletes a tenant: blocks it and revokes its sessions, without destroying the
   * financial records that cascade from a hard delete.
   */
  async deactivateTenant(actor: AuthUser, businessId: string) {
    await this.assertSuperAdmin(actor);

    if (businessId === actor.businessId) {
      throw new BadRequestException({
        message: 'You cannot deactivate your own tenant',
        code: 'CANNOT_DEACTIVATE_SELF',
      });
    }

    const business = await this.prisma.business.findUnique({ where: { id: businessId } });
    if (!business) {
      throw new NotFoundException({ message: 'Tenant not found', code: 'TENANT_NOT_FOUND' });
    }

    await this.prisma.$transaction([
      this.prisma.business.update({
        where: { id: businessId },
        data: {
          status: BusinessStatus.BLOCKED,
          blockedReason: 'Tenant deactivated by platform owner',
          blockedAt: new Date(),
          blockedById: actor.id,
        },
      }),
      this.prisma.refreshToken.updateMany({
        where: { user: { businessId }, revokedAt: null },
        data: { revokedAt: new Date() },
      }),
    ]);

    await this.audit.log(actor, 'TENANT_DEACTIVATED', 'Business', businessId, {});
    return { id: businessId, status: BusinessStatus.BLOCKED, hardDeleted: false };
  }
}