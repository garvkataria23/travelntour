import { Injectable, NotFoundException } from '@nestjs/common';
import { IncomeCategory, Prisma } from '@prisma/client';
import { DateTime } from 'luxon';
import { AuthUser } from '../common/current-user.decorator';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { CreateIncomeDto } from './dto/create-income.dto';

@Injectable()
export class IncomeService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  private async tz(user: AuthUser) {
    const business = await this.prisma.business.findUnique({ where: { id: user.businessId } });
    return business?.timezone || 'Asia/Kolkata';
  }

  async list(user: AuthUser, query: Record<string, string>) {
    const timezone = await this.tz(user);
    const page = Number(query.page) || 1;
    const limit = Math.min(100, Number(query.limit) || 20);
    const where: Prisma.IncomeWhereInput = { businessId: user.businessId };

    if (query.category) where.category = query.category as IncomeCategory;
    if (query.search && query.search.trim()) {
      const term = query.search.trim();
      where.OR = [
        { title: { contains: term, mode: 'insensitive' as const } },
        { reference: { contains: term, mode: 'insensitive' as const } },
        { note: { contains: term, mode: 'insensitive' as const } },
      ];
    }
    if (query.from || query.to) {
      const from = query.from
        ? DateTime.fromISO(query.from, { zone: timezone }).startOf('day').toUTC().toJSDate()
        : undefined;
      const to = query.to
        ? DateTime.fromISO(query.to, { zone: timezone }).plus({ days: 1 }).startOf('day').toUTC().toJSDate()
        : undefined;
      where.receivedOn = { ...(from ? { gte: from } : {}), ...(to ? { lt: to } : {}) };
    }

    const [items, total, byCategory] = await Promise.all([
      this.prisma.income.findMany({ where, orderBy: { receivedOn: 'desc' }, skip: (page - 1) * limit, take: limit }),
      this.prisma.income.count({ where }),
      this.prisma.income.groupBy({ by: ['category'], where, _sum: { amount: true }, _count: true }),
    ]);
    const agg = await this.prisma.income.aggregate({ where, _sum: { amount: true }, _count: true });

    return {
      items,
      meta: { page, limit, total, pages: Math.ceil(total / limit) },
      summary: {
        total: agg._sum.amount ?? 0,
        count: agg._count,
        byCategory: byCategory.map((c) => ({ category: c.category, total: c._sum.amount ?? 0, count: c._count })),
      },
    };
  }

  async create(user: AuthUser, dto: CreateIncomeDto) {
    const income = await this.prisma.income.create({
      data: {
        businessId: user.businessId,
        category: dto.category,
        title: dto.title,
        note: dto.note,
        amount: dto.amount,
        currency: dto.currency || 'INR',
        reference: dto.reference,
        receivedOn: dto.receivedOn ? new Date(dto.receivedOn) : new Date(),
        createdBy: user.id,
      },
    });

    await this.audit.log(user, 'INCOME_CREATED', 'Income', income.id, {
      title: income.title,
      amount: income.amount,
      category: income.category,
    });

    return income;
  }

  async remove(user: AuthUser, id: string) {
    const existing = await this.prisma.income.findFirst({ where: { id, businessId: user.businessId } });
    if (!existing) {
      throw new NotFoundException({ message: 'Income record not found', code: 'INCOME_NOT_FOUND' });
    }
    await this.prisma.income.delete({ where: { id } });
    await this.audit.log(user, 'INCOME_DELETED', 'Income', id, {
      title: existing.title,
      amount: existing.amount,
    });
    return { ok: true };
  }
}