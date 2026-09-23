import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { ExpenseCategory, Prisma } from '@prisma/client';
import { DateTime } from 'luxon';
import { AuthUser } from '../common/current-user.decorator';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { CreateExpenseDto } from './dto/create-expense.dto';

@Injectable()
export class ExpensesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async tz(user: AuthUser) {
    const business = await this.prisma.business.findUnique({ where: { id: user.businessId } });
    return business?.timezone || 'Asia/Kolkata';
  }

  async currency(user: AuthUser) {
    const business = await this.prisma.business.findUnique({ where: { id: user.businessId } });
    return business?.currency || 'INR';
  }

  async list(user: AuthUser, query: Record<string, string>) {
    const timezone = await this.tz(user);
    const page = Number(query.page) || 1;
    const limit = Math.min(100, Number(query.limit) || 20);
    const where: Prisma.ExpenseWhereInput = { businessId: user.businessId };

    if (query.category) where.category = query.category as ExpenseCategory;
    if (query.search && query.search.trim()) {
      const term = query.search.trim();
      where.OR = [
        { title: { contains: term, mode: 'insensitive' as const } },
        { payableTo: { contains: term, mode: 'insensitive' as const } },
        { description: { contains: term, mode: 'insensitive' as const } },
      ];
    }
    if (query.from || query.to) {
      const from = query.from
        ? DateTime.fromISO(query.from, { zone: timezone }).startOf('day').toUTC().toJSDate()
        : undefined;
      const to = query.to
        ? DateTime.fromISO(query.to, { zone: timezone }).plus({ days: 1 }).startOf('day').toUTC().toJSDate()
        : undefined;
      where.incurredOn = { ...(from ? { gte: from } : {}), ...(to ? { lt: to } : {}) };
    }

    const [items, total] = await Promise.all([
      this.prisma.expense.findMany({ where, orderBy: { incurredOn: 'desc' }, skip: (page - 1) * limit, take: limit }),
      this.prisma.expense.count({ where }),
    ]);
    const agg = await this.prisma.expense.aggregate({ where, _sum: { amount: true }, _count: true });

    return {
      items,
      meta: { page, limit, total, pages: Math.ceil(total / limit) },
      summary: { total: agg._sum.amount ?? 0, count: agg._count },
    };
  }

  async create(user: AuthUser, dto: CreateExpenseDto) {
    const expense = await this.prisma.expense.create({
      data: {
        businessId: user.businessId,
        category: dto.category,
        title: dto.title,
        description: dto.description,
        amount: dto.amount,
        currency: dto.currency || 'INR',
        incurredOn: dto.incurredOn ? new Date(dto.incurredOn) : new Date(),
        payableTo: dto.payableTo,
        createdBy: user.id,
      },
    });

    await this.audit.log(user, 'EXPENSE_CREATED', 'Expense', expense.id, {
      title: expense.title,
      amount: expense.amount,
      category: expense.category,
    });

    return expense;
  }

  async stats(user: AuthUser, month?: string) {
    const timezone = await this.tz(user);
    const start = month
      ? DateTime.fromISO(month, { zone: timezone }).startOf('month')
      : DateTime.now().setZone(timezone).startOf('month');
    const gte = start.toUTC().toJSDate();
    const lt = start.plus({ month: 1 }).toUTC().toJSDate();
    const where: Prisma.ExpenseWhereInput = { businessId: user.businessId, incurredOn: { gte, lt } };

    const [rows, agg] = await Promise.all([
      this.prisma.expense.groupBy({ by: ['category'], where, _sum: { amount: true }, _count: true }),
      this.prisma.expense.aggregate({ where, _sum: { amount: true }, _count: true }),
    ]);

    const byCategory = rows.map((r) => ({
      category: r.category,
      total: r._sum.amount ?? 0,
      count: r._count,
    }));

    return {
      month: month ?? 'current-month',
      direct: byCategory.find((r) => r.category === 'DIRECT')?.total ?? 0,
      operating: byCategory.find((r) => r.category === 'OPERATING')?.total ?? 0,
      total: agg._sum.amount ?? 0,
      count: agg._count,
      byCategory,
    };
  }

  async remove(user: AuthUser, id: string) {
    const existing = await this.prisma.expense.findFirst({
      where: { id, businessId: user.businessId },
    });
    if (!existing) {
      throw new NotFoundException({ message: 'Expense not found', code: 'EXPENSE_NOT_FOUND' });
    }
    await this.prisma.expense.delete({ where: { id } });
    await this.audit.log(user, 'EXPENSE_DELETED', 'Expense', id, {
      title: existing.title,
      amount: existing.amount,
    });
    return { ok: true };
  }
}
