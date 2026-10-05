import { Injectable } from '@nestjs/common';
import { BookingStatus } from '@prisma/client';
import { DateTime } from 'luxon';
import { AuthUser } from '../common/current-user.decorator';
import { computeInvoiceTotals } from '../common/invoice-totals';
import { money, toNumber } from '../common/money';
import { BASE_CURRENCY } from '../currency/decimals';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class ReportsService {
  constructor(private readonly prisma: PrismaService) {}

  private async tz(user: AuthUser): Promise<string> {
    const business = await this.prisma.business.findUnique({ where: { id: user.businessId } });
    return business?.timezone || 'Asia/Kolkata';
  }

  // ------------------------------------------------------------------
  // Overview (dashboard)
  // ------------------------------------------------------------------

  async overview(user: AuthUser, daysParam?: number, opts?: { from?: string; to?: string }) {
    const timezone = await this.tz(user);
    const businessId = user.businessId;
    const nowLocal = DateTime.now().setZone(timezone);
    const startToday = nowLocal.startOf('day').toUTC().toJSDate();
    const endToday = nowLocal.plus({ days: 1 }).startOf('day').toUTC().toJSDate();
    const range = opts ? this.dateRange(timezone, opts) : null;

    const [totalBookings, todayJourneys, upcomingJourneys, messageSummary, recentScheduled] = await Promise.all([
      this.prisma.booking.count({ where: { businessId, ...(range ? { createdAt: range } : {}) } }),
      this.prisma.booking.count({
        where: { businessId, departureDate: { gte: startToday, lt: endToday } },
      }),
      this.prisma.booking.count({
        where: { businessId, departureDate: { gte: nowLocal.toUTC().toJSDate() }, status: { not: 'CANCELLED' } },
      }),
      this.prisma.scheduledMessage.groupBy({
        by: ['status'],
        where: { businessId },
        _count: { _all: true },
      }),
      this.prisma.scheduledMessage.findMany({
        where: { businessId, status: 'SCHEDULED' },
        orderBy: { scheduledAt: 'asc' },
        take: 5,
        include: { customer: { select: { id: true, name: true, phone: true } }, booking: { select: { pnr: true } } },
      }),
    ]);

    const count = (s: string) => messageSummary.find((m) => m.status === s)?._count._all ?? 0;
    const delivered = count('DELIVERED') + count('READ');
    const total = messageSummary.reduce((sum, m) => sum + m._count._all, 0);

    // Booking trend (last 7 days in business tz)
    const days = Math.min(90, Math.max(1, daysParam ?? 7));
    const trend = await this.bookingTrend(user, days);

    // Upcoming reminders (next scheduled messages)
    const reminders = recentScheduled.map((m) => ({
      id: m.id,
      scheduledAt: m.scheduledAt,
      type: m.name,
      status: m.status,
      customer: m.customer,
      pnr: m.booking.pnr,
    }));

    // Recent activity from audit logs
    const activitiesRaw = await this.prisma.auditLog.findMany({
      where: { businessId },
      orderBy: { createdAt: 'desc' },
      take: 6,
      include: { user: { select: { name: true } } },
    });
    const activities = activitiesRaw.map((a) => ({
      id: a.id,
      action: a.action,
      entity: a.entity,
      message: auditMessage(a),
      createdAt: a.createdAt,
    }));

    const [revenueAgg, manualIncomeAgg, bookingCostAgg, expenseAgg] = await Promise.all([
      this.prisma.booking.aggregate({
        where: {
          businessId,
          status: { not: 'CANCELLED' },
          amount: { not: null },
          ...(range ? { createdAt: range } : {}),
        },
        _sum: { amount: true },
      }),
      this.prisma.income.aggregate({
        where: {
          businessId,
          ...(range ? { receivedOn: range } : {}),
        },
        _sum: { amount: true },
      }),
      this.prisma.booking.aggregate({
        where: {
          businessId,
          status: { not: 'CANCELLED' },
          cost: { not: null },
          ...(range ? { createdAt: range } : {}),
        },
        _sum: { cost: true },
      }),
      this.prisma.expense.groupBy({
        by: ['category'],
        where: {
          businessId,
          ...(range ? { incurredOn: range } : {}),
        },
        _sum: { amount: true },
      }),
    ]);
    // Aggregates over Decimal columns return Prisma Decimal objects, so every value is coerced
    // before any arithmetic. Coercing here (rather than per field) keeps the P&L internally
    // consistent and lets the totals round once, at the end.
    const revenueTotal = toNumber(revenueAgg._sum.amount);
    const manualIncome = toNumber(manualIncomeAgg._sum.amount);
    const ticketCost = toNumber(bookingCostAgg._sum.cost);
    const totalIncome = money(revenueTotal + manualIncome, BASE_CURRENCY);
    const directCost = money(toNumber(expenseAgg.find((e) => e.category === 'DIRECT')?._sum.amount) + ticketCost, BASE_CURRENCY);
    const operatingCost = money(toNumber(expenseAgg.find((e) => e.category === 'OPERATING')?._sum.amount), BASE_CURRENCY);
    const grossProfit = money(totalIncome - directCost, BASE_CURRENCY);
    const netProfit = money(grossProfit - operatingCost, BASE_CURRENCY);

    return {
      stats: {
        totalBookings,
        todayJourneys,
        upcomingJourneys,
        revenue: revenueTotal,
        manualIncome,
        totalIncome,
        ticketCost,
        directCost,
        operatingCost,
        grossProfit,
        netProfit,
      },
      messageStatus: {
        total,
        sent: count('SENT'),
        delivered: delivered,
        pending: count('SCHEDULED') + count('PROCESSING'),
        failed: count('FAILED'),
        read: count('READ'),
      },
      bookingTrend: trend,
      reminders,
      activities,
    };
  }

  private async bookingTrend(user: AuthUser, days: number) {
    const timezone = await this.tz(user);
    const start = DateTime.now().setZone(timezone).minus({ days: days - 1 }).startOf('day').toUTC().toJSDate();
    const bookings = await this.prisma.booking.findMany({
      where: { businessId: user.businessId, createdAt: { gte: start } },
      select: { createdAt: true },
    });
    const buckets = new Map<string, number>();
    for (let i = days - 1; i >= 0; i--) {
      const label = DateTime.now().setZone(timezone).minus({ days: i }).toFormat('dd MMM');
      buckets.set(label, 0);
    }
    for (const b of bookings) {
      const label = DateTime.fromJSDate(b.createdAt).setZone(timezone).toFormat('dd MMM');
      if (buckets.has(label)) buckets.set(label, (buckets.get(label) ?? 0) + 1);
    }
    return [...buckets.entries()].map(([date, count]) => ({ date, count }));
  }

  // ------------------------------------------------------------------
  // Bookings report
  // ------------------------------------------------------------------

  async bookings(user: AuthUser, opts: { from?: string; to?: string }) {
    const timezone = await this.tz(user);
    const range = this.dateRange(timezone, opts);
    const where = { businessId: user.businessId, ...(range ? { createdAt: range } : {}) };

    const [total, byStatus, bySource, recent] = await Promise.all([
      this.prisma.booking.count({ where }),
      this.prisma.booking.groupBy({ by: ['status'], where, _count: { _all: true } }),
      this.prisma.booking.groupBy({ by: ['source'], where, _count: { _all: true } }),
      this.prisma.booking.findMany({
        where: { businessId: user.businessId },
        orderBy: { createdAt: 'desc' },
        take: 10,
        include: { customer: { select: { name: true } } },
      }),
    ]);

    const totalFare = await this.prisma.booking.aggregate({
      where,
      _sum: { amount: true },
    });

    return {
      total,
      revenue: totalFare._sum.amount ?? 0,
      byStatus: byStatus.map((s) => ({ status: s.status, count: s._count._all })),
      bySource: bySource.map((s) => ({ source: s.source, count: s._count._all })),
      trend: await this.bookingTrend(user, 30),
      recent: recent.map((b) => ({
        id: b.id,
        createdAt: b.createdAt,
        pnr: b.pnr,
        customerName: b.customer.name,
        fromAirport: b.fromAirport,
        toAirport: b.toAirport,
        amount: b.amount,
        status: b.status,
        source: b.source,
      })),
    };
  }

  async revenue(user: AuthUser, opts: { from?: string; to?: string }) {
    const timezone = await this.tz(user);
    const range = this.dateRange(timezone, opts);
    const where = {
      businessId: user.businessId,
      status: { not: 'CANCELLED' as BookingStatus },
      amount: { not: null },
      ...(range ? { createdAt: range } : {}),
    };
    const rows = await this.prisma.booking.findMany({
      where,
      select: { createdAt: true, amount: true, status: true },
    });
    const byMonth = new Map<string, { revenue: number; count: number }>();
    let revenueTotal = 0;
    // Rounded on accumulation: `amount` is a Decimal column, so summing raw values and rounding
    // once at the end is what keeps a month total from drifting.
    for (const row of rows) {
      const amount = toNumber(row.amount);
      revenueTotal = money(revenueTotal + amount, BASE_CURRENCY);
      const label = DateTime.fromJSDate(row.createdAt).setZone(timezone).toFormat('MMM yyyy');
      const bucket = byMonth.get(label) ?? { revenue: 0, count: 0 };
      bucket.revenue = money(bucket.revenue + amount, BASE_CURRENCY);
      bucket.count += 1;
      byMonth.set(label, bucket);
    }
    const currency = (await this.prisma.business.findUnique({ where: { id: user.businessId } }))?.currency || BASE_CURRENCY;
    return {
      totalRevenue: revenueTotal,
      currency,
      byMonth: [...byMonth.entries()].map(([month, value]) => ({ month, ...value })),
    };
  }

  async messages(user: AuthUser, opts: { from?: string; to?: string }) {
    const range = opts.from || opts.to ? { ...(opts.from ? { gte: new Date(opts.from) } : {}), ...(opts.to ? { lte: new Date(opts.to) } : {}) } : undefined;
    const where = { businessId: user.businessId, ...(range ? { scheduledAt: range } : {}) };
    const byStatus = await this.prisma.scheduledMessage.groupBy({ by: ['status'], where, _count: { _all: true } });
    const byType = await this.prisma.scheduledMessage.groupBy({ by: ['messageType'], where, _count: { _all: true } });

    const total = byStatus.reduce((s, r) => s + r._count._all, 0);
    const acc = (s: string) => byStatus.find((r) => r.status === s)?._count._all ?? 0;
    return {
      total,
      delivered: acc('DELIVERED') + acc('READ'),
      read: acc('READ'),
      sent: acc('SENT'),
      pending: acc('SCHEDULED') + acc('PROCESSING'),
      failed: acc('FAILED'),
      cancelled: acc('CANCELLED'),
      deliveryRate: total > 0 ? Math.round(((acc('DELIVERED') + acc('READ')) / total) * 100) : 0,
      readRate: total > 0 ? Math.round((acc('READ') / total) * 100) : 0,
      failedRate: total > 0 ? Math.round((acc('FAILED') / total) * 100) : 0,
      byStatus,
      byType,
    };
  }

  async expenses(user: AuthUser, opts: { from?: string; to?: string }) {
    const timezone = await this.tz(user);
    const range = this.dateRange(timezone, opts);
    const where = { businessId: user.businessId, ...(range ? { incurredOn: range } : {}) };

    const [byCategory, rows, agg] = await Promise.all([
      this.prisma.expense.groupBy({ by: ['category'], where, _sum: { amount: true }, _count: true }),
      this.prisma.expense.findMany({
        where,
        select: { incurredOn: true, amount: true, category: true, title: true, payableTo: true },
      }),
      this.prisma.expense.aggregate({ where, _sum: { amount: true }, _count: true }),
    ]);

    const byTitle = new Map<string, { total: number; count: number }>();
    for (const row of rows) {
      const bucket = byTitle.get(row.title) ?? { total: 0, count: 0 };
      bucket.total = money(bucket.total + toNumber(row.amount), BASE_CURRENCY);
      bucket.count += 1;
      byTitle.set(row.title, bucket);
    }

    const byMonth = new Map<string, { total: number; count: number }>();
    for (const row of rows) {
      const label = DateTime.fromJSDate(row.incurredOn).setZone(timezone).toFormat('MMM yyyy');
      const bucket = byMonth.get(label) ?? { total: 0, count: 0 };
      bucket.total = money(bucket.total + toNumber(row.amount), BASE_CURRENCY);
      bucket.count += 1;
      byMonth.set(label, bucket);
    }

    const currency = (await this.prisma.business.findUnique({ where: { id: user.businessId } }))?.currency || BASE_CURRENCY;

    return {
      total: agg._sum.amount ?? 0,
      count: agg._count,
      currency,
      byCategory: byCategory.map((c) => ({
        category: c.category,
        total: c._sum.amount ?? 0,
        count: c._count,
      })),
      directCost: byCategory.find((c) => c.category === 'DIRECT')?._sum.amount ?? 0,
      operatingCost: byCategory.find((c) => c.category === 'OPERATING')?._sum.amount ?? 0,
      byTitle: [...byTitle.entries()]
        .map(([title, value]) => ({ title, ...value }))
        .sort((a, b) => b.total - a.total)
        .slice(0, 10),
      byMonth: [...byMonth.entries()].map(([month, value]) => ({ month, ...value })),
    };
  }

  async invoicesReport(user: AuthUser, opts: { from?: string; to?: string }) {
    const timezone = await this.tz(user);
    const range = this.dateRange(timezone, opts);
    const where = {
      businessId: user.businessId,
      status: { not: 'CANCELLED' as BookingStatus },
      invoiceIssuedAt: { not: null },
      ...(range ? { invoiceIssuedAt: range } : {}),
    };

    const [byStatus, rows] = await Promise.all([
      this.prisma.booking.groupBy({ by: ['paymentStatus'], where, _count: { _all: true } }),
      this.prisma.booking.findMany({
        where,
        select: {
          invoiceIssuedAt: true,
          invoiceNumber: true,
          paymentStatus: true,
          paidAmount: true,
          baseFare: true,
          amount: true,
          discount: true,
          taxRate: true,
          taxAmount: true,
          currency: true,
          invoiceItems: { select: { amount: true } },
        },
      }),
    ]);

    const byMonth = new Map<string, { billed: number; collected: number; count: number }>();
    let billed = 0;
    let collected = 0;
    for (const row of rows) {
      // Single source of truth: this used to be an inline copy of the invoice total math that had
      // already drifted from InvoicesService, so the receivables report could disagree with the
      // invoice it was reporting on.
      const currency = row.currency ?? undefined;
      const totals = computeInvoiceTotals(row, row.invoiceItems ?? []);
      const total = totals.total;
      const paid = money(Math.min(toNumber(row.paidAmount), total), currency);
      billed = money(billed + total, currency);
      collected = money(collected + paid, currency);

      const label = DateTime.fromJSDate(row.invoiceIssuedAt!).setZone(timezone).toFormat('MMM yyyy');
      const bucket = byMonth.get(label) ?? { billed: 0, collected: 0, count: 0 };
      bucket.billed = money(bucket.billed + total, currency);
      bucket.collected = money(bucket.collected + paid, currency);
      bucket.count += 1;
      byMonth.set(label, bucket);
    }

    const currency = (await this.prisma.business.findUnique({ where: { id: user.businessId } }))?.currency || BASE_CURRENCY;

    return {
      issued: rows.length,
      billed,
      collected,
      outstanding: Math.max(0, billed - collected),
      currency,
      byStatus: byStatus.map((s) => ({ status: s.paymentStatus, count: s._count._all })),
      byMonth: [...byMonth.entries()].map(([month, value]) => ({ month, ...value })),
    };
  }

  async customers(user: AuthUser) {
    const businessId = user.businessId;
    const [total, perMonthRaw, top] = await Promise.all([
      this.prisma.customer.count({ where: { businessId } }),
      this.prisma.customer.findMany({ where: { businessId }, select: { createdAt: true } }),
      this.prisma.customer.findMany({
        where: { businessId },
        include: { _count: { select: { bookings: true } } },
        orderBy: [{ bookings: { _count: 'desc' } }],
        take: 5,
      }),
    ]);

    const timezone = await this.tz(user);
    const byMonth = new Map<string, number>();
    for (const c of perMonthRaw) {
      const label = DateTime.fromJSDate(c.createdAt).setZone(timezone).toFormat('MMM yyyy');
      byMonth.set(label, (byMonth.get(label) ?? 0) + 1);
    }

    return {
      total,
      growth: [...byMonth.entries()].map(([month, count]) => ({ month, count })),
      top: top.map((c) => ({
        id: c.id,
        name: c.name,
        phone: c.phone,
        bookings: c._count.bookings,
      })),
    };
  }

  async routes(user: AuthUser) {
    const rows = await this.prisma.booking.groupBy({
      by: ['fromAirport', 'toAirport'],
      where: { businessId: user.businessId },
      _count: { _all: true },
    });
    return rows
      .map((r) => ({
        route: `${r.fromAirport} → ${r.toAirport}`,
        count: r._count._all,
      }))
      .sort((a, b) => b.count - a.count);
  }

  async airlines(user: AuthUser) {
    const rows = await this.prisma.booking.groupBy({
      by: ['airline'],
      where: { businessId: user.businessId },
      _count: { _all: true },
      _sum: { amount: true },
    });
    const total = rows.reduce((s, r) => s + r._count._all, 0);
    return rows
      .map((r) => ({
        airline: r.airline,
        count: r._count._all,
        revenue: r._sum.amount ?? 0,
        share: total > 0 ? Math.round((r._count._all / total) * 100) : 0,
      }))
      .sort((a, b) => b.count - a.count);
  }

  private dateRange(timezone: string, opts: { from?: string; to?: string }) {
    if (!opts.from && !opts.to) return null;
    let gte: Date | undefined;
    let lt: Date | undefined;
    if (opts.from) {
      const dt = DateTime.fromISO(opts.from, { zone: timezone });
      if (dt.isValid) gte = dt.startOf('day').toUTC().toJSDate();
    }
    if (opts.to) {
      const dt = DateTime.fromISO(opts.to, { zone: timezone });
      if (dt.isValid) lt = dt.plus({ days: 1 }).startOf('day').toUTC().toJSDate();
    }
    if (!gte && !lt) return null;
    return {
      ...(gte ? { gte } : {}),
      ...(lt ? { lt } : {}),
    };
  }
}

function auditMessage(a: { action: string; entity: string; user: { name: string } | null; metadata?: unknown }): string {
  const name = a.user?.name ?? 'System';
  const meta = (a.metadata as Record<string, unknown> | null) ?? {};
  switch (a.action) {
    case 'BOOKING_CREATED':
      return `${name} created booking ${(meta.pnr as string) ?? ''}`.trim();
    case 'BOOKING_UPDATED':
      return `${name} updated a booking`;
    case 'BOOKING_CANCELLED':
      return `${name} cancelled booking ${(meta.pnr as string) ?? ''}`.trim();
    case 'CUSTOMER_CREATED':
      return `New customer added - ${(meta.name as string) ?? ''}`;
    case 'MESSAGE_SENT':
      return `${name} sent a message`;
    case 'USER_LOGIN':
      return `${name} logged in`;
    case 'TEMPLATE_CREATED':
      return `${name} created template ${(meta.name as string) ?? ''}`.trim();
    case 'RULE_TOGGLED':
      return `${name} toggled an automation rule`;
    case 'INCOME_CREATED':
      return `${name} recorded income ${(meta.title as string) ?? ''}`.trim();
    case 'INCOME_DELETED':
      return `${name} removed income ${(meta.title as string) ?? ''}`.trim();
    case 'INVOICE_ISSUED':
      return `${name} issued invoice ${(meta.invoiceNumber as string) ?? ''}`.trim();
    case 'INVOICE_PAYMENT_UPDATED':
      return `${name} updated payment for invoice ${(meta.invoiceNumber as string) ?? ''}`.trim();
    case 'INVOICE_SENT_VIA_WHATSAPP':
      return `${name} sent invoice ${(meta.invoiceNumber as string) ?? ''} on WhatsApp`;
    default:
      return `${name} ${a.action.toLowerCase().replace(/_/g, ' ')}`.trim();
  }
}