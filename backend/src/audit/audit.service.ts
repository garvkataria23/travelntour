import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AuthUser } from '../common/current-user.decorator';

@Injectable()
export class AuditService {
  private readonly logger = new Logger(AuditService.name);

  constructor(private readonly prisma: PrismaService) {}

  async log(
    user: AuthUser | { id: string; businessId: string },
    action: string,
    entity: string,
    entityId?: string,
    metadata?: Record<string, unknown>,
    ip?: string,
  ) {
    try {
      await this.prisma.auditLog.create({
        data: {
          businessId: user.businessId,
          userId: user.id,
          action,
          entity,
          entityId,
          metadata: metadata ? (metadata as object) : undefined,
          ip,
        },
      });
    } catch (error) {
      // Audit failures must never break the primary business flow — but swallowing them silently
      // meant a database outage produced no audit trail AND no signal that the trail was missing.
      // Surface it so the gap is visible in logs and alerting.
      this.logger.error(
        `Failed to write audit log ${action} ${entity}${entityId ? `#${entityId}` : ''} for business ${user.businessId}: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    }
  }

  async list(
    businessId: string,
    query: { page?: number; limit?: number; entity?: string },
  ) {
    const page = Math.max(1, Number(query.page) || 1);
    const limit = Math.min(100, Math.max(1, Number(query.limit) || 20));
    const where: Record<string, unknown> = { businessId };
    if (query.entity) where.entity = query.entity;
    const [items, total] = await Promise.all([
      this.prisma.auditLog.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
        include: { user: { select: { id: true, name: true } } },
      }),
      this.prisma.auditLog.count({ where }),
    ]);
    return {
      items,
      meta: { total, page, limit, totalPages: Math.max(1, Math.ceil(total / limit)) },
    };
  }

  async recent(businessId: string, take = 6) {
    return this.prisma.auditLog.findMany({
      where: { businessId },
      orderBy: { createdAt: 'desc' },
      take,
      include: { user: { select: { id: true, name: true } } },
    });
  }
}