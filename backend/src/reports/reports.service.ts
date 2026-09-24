import { Injectable } from '@nestjs/common';
import { BookingStatus, MessageStatus } from '@prisma/client';
import { DateTime } from 'luxon';
import { AuthUser } from '../common/current-user.decorator';
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

  async overview(user: AuthUser, daysParam?: number) {
    const timezone = await this.tz(user);
    const businessId = user.businessId;
    const nowLocal = DateTime.now().setZone(timezone);
    const startToday = nowLocal.startOf('day').toUTC().toJSDate();
    const endToday = nowLocal.plus({ days: 1 }).startOf('day').toUTC().toJSDate();

    const [totalBookings, todayJourneys, upcomingJourneys, messageSummary, recentScheduled] = await Promise.all([
      this.prisma.booking.count({ where: { businessId } }),
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

    const revenueTotal = (await this.prisma.booking.aggregate({
      where: { businessId, status: { not: 'CANCELLED' }, amount: { not: null } },
      _sum: { amount: true },
    }))._sum.amount ?? 0;
    const manualIncome =
      (await this.prisma.income.aggregate({ where: { businessId }, _sum: { amount: true } }))._sum.amount ?? 0;
    const totalIncome = (revenueTotal ?? 0) + manualIncome;
    const expenseAgg = await this.prisma.expense.groupBy({ by: ['category'], where: { businessId }, _sum: { amount: true } });
    const directCost = expenseAgg.find((e) => e.category === 'DIRECT')?._sum.amount ?? 0;
    const operatingCost = expenseAgg.find((e) => e.category === 'OPERATING')?._sum.amount ?? 0;

    return {
      stats: {
        totalBookings,
        todayJourneys,
        upcomingJourneys,
        revenue: revenueTotal ?? 0,
        manualIncome,
        totalIncome,
        directCost,
        operatingCost,
        grossProfit: totalIncome - directCost,
        netProfit: totalIncome - directCost - operatingCost,
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
    for (const row of rows) {
      revenueTotal += row.amount ?? 0;
      const label = DateTime.fromJSDate(row.createdAt).setZone(timezone).toFormat('MMM yyyy');
      const bucket = byMonth.get(label) ?? { revenue: 0, count: 0 };
      bucket.revenue += row.amount ?? 0;
      bucket.count += 1;
      byMonth.set(label, bucket);
    }
    const currency = (await this.prisma.business.findUnique({ where: { id: user.businessId } }))?.currency || 'INR';
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
      bucket.total += row.amount ?? 0;
      bucket.count += 1;
      byTitle.set(row.title, bucket);
    }

    const byMonth = new Map<string, { total: number; count: number }>();
    for (const row of rows) {
      const label = DateTime.fromJSDate(row.incurredOn).setZone(timezone).toFormat('MMM yyyy');
      const bucket = byMonth.get(label) ?? { total: 0, count: 0 };
      bucket.total += row.amount ?? 0;
      bucket.count += 1;
      byMonth.set(label, bucket);
    }

    const currency = (await this.prisma.business.findUnique({ where: { id: user.businessId } }))?.currency || 'INR';

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
          invoiceItems: { select: { amount: true } },
        },
      }),
    ]);

    const byMonth = new Map<string, { billed: number; collected: number; count: number }>();
    let billed = 0;
    let collected = 0;
    for (const row of rows) {
      const items = row.invoiceItems ?? [];
      const subtotal = items.length > 0 ? items.reduce((s, i) => s + (i.amount || 0), 0) : row.baseFare ?? row.amount ?? 0;
      const discount = row.discount ?? 0;
      const taxable = Math.max(0, subtotal - discount);
      const rate = row.taxRate ?? 0;
      const tax = items.length > 0 || !row.taxAmount ? Math.round(taxable * (rate / 100) * 100) / 100 : row.taxAmount;
      const total = Math.max(0, taxable + tax);
      const paid = row.paidAmount ?? 0;
      billed += total;
      collected += paid;

      const label = DateTime.fromJSDate(row.invoiceIssuedAt!).setZone(timezone).toFormat('MMM yyyy');
      const bucket = byMonth.get(label) ?? { billed: 0, collected: 0, count: 0 };
      bucket.billed += total;
      bucket.collected += paid;
      bucket.count += 1;
      byMonth.set(label, bucket);
    }

    const currency = (await this.prisma.business.findUnique({ where: { id: user.businessId } }))?.currency || 'INR';

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
    const gte = opts.from ? DateTime.fromISO(opts.from, { zone: timezone }).startOf('day').toUTC().toJSDate() : undefined;
    const lte = opts.to ? DateTime.fromISO(opts.to, { zone: timezone }).plus({ days: 1 }).startOf('day').toUTC().toJSDate() : undefined;
    return {
      ...(gte ? { gte } : {}),
      ...(lte ? { lte } : {}),
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