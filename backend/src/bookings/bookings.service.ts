import { BadRequestException, ConflictException, ForbiddenException, Injectable } from '@nestjs/common';
import { Booking, BookingStatus, Customer, Prisma } from '@prisma/client';
import { DateTime } from 'luxon';
import { AuditService } from '../audit/audit.service';
import { AuthUser } from '../common/current-user.decorator';
import { allocateInvoiceNumber } from '../common/invoice-number';
import { money, percentageOf, toNumber } from '../common/money';
import { Permission, roleHas } from '../common/permissions';
import { paginationMeta } from '../common/pagination';
import { isUniqueViolation } from '../common/prisma-error';
import { isValidPhone, normalizePhone, parseAirportInput } from '../common/utils';
import { BASE_CURRENCY } from '../currency/decimals';
import { PrismaService } from '../prisma/prisma.service';
import { AutomationService } from '../automation/automation.service';
import { InvoicesService } from '../invoices/invoices.service';
import { CreateBookingDto } from './dto/create-booking.dto';
import { UpdateBookingDto } from './dto/update-booking.dto';

@Injectable()
export class BookingsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly automation: AutomationService,
    private readonly invoices: InvoicesService,
  ) {}

  // ------------------------------------------------------------------
  // Helpers
  // ------------------------------------------------------------------

  private buildDepartureDate(dateInput: string, timeInput: string | undefined, timezone: string): Date {
    const tz = timezone || 'Asia/Kolkata';
    const day = DateTime.fromISO(dateInput, { zone: tz });
    if (!day.isValid) {
      throw new BadRequestException({ message: 'Departure date is invalid', code: 'INVALID_DATE' });
    }
    let dt = day;
    if (timeInput) {
      const parsed = this.parseTime(timeInput);
      dt = day.set({ hour: parsed.hour, minute: parsed.minute, second: 0, millisecond: 0 });
    }
    const utc = dt.toUTC();
    if (!utc.isValid) {
      throw new BadRequestException({ message: 'Departure date time is invalid', code: 'INVALID_DATE' });
    }
    return utc.toJSDate();
  }

  private parseTime(time: string): { hour: number; minute: number } {
    const trimmed = time.trim().toUpperCase();
    const match = trimmed.match(/^(\d{1,2})(?::(\d{2}))?\s*(AM|PM)?$/);
    if (!match) {
      throw new BadRequestException({ message: 'Departure time is invalid', code: 'INVALID_TIME' });
    }
    let hour = Number(match[1]);
    const minute = Number(match[2] ?? '0');
    const suffix = match[3];
    if (hour < 1 || hour > 12 || minute > 59) {
      throw new BadRequestException({ message: 'Departure time is invalid', code: 'INVALID_TIME' });
    }
    if (suffix === 'PM' && hour !== 12) hour += 12;
    if (suffix === 'AM' && hour === 12) hour = 0;
    if (!suffix && hour > 23) {
      throw new BadRequestException({ message: 'Departure time is invalid', code: 'INVALID_TIME' });
    }
    return { hour, minute };
  }

  // ------------------------------------------------------------------
  // List
  // ------------------------------------------------------------------

  async list(
    user: AuthUser,
    query: {
      page?: number;
      limit?: number;
      search?: string;
      status?: string;
      airline?: string;
      period?: string;
      from?: string;
      to?: string;
      sort?: string;
      order?: 'asc' | 'desc';
      customerId?: string;
    },
  ) {
    const page = Math.max(1, Number(query.page) || 1);
    const limit = Math.min(1000, Math.max(1, Number(query.limit) || 20));
    const business = await this.prisma.business.findUnique({ where: { id: user.businessId } });
    const tz = business?.timezone || 'Asia/Kolkata';

    const where: Record<string, unknown> = { businessId: user.businessId };

    if (query.search) {
      const term = query.search.trim();
      const digits = term.replace(/[^\d]/g, '');
      const or: Record<string, unknown>[] = [
        { pnr: { contains: term, mode: 'insensitive' as const } },
        { referenceNumber: { contains: term, mode: 'insensitive' as const } },
        { flightNumber: { contains: term, mode: 'insensitive' as const } },
        { airline: { contains: term, mode: 'insensitive' as const } },
        { customer: { name: { contains: term, mode: 'insensitive' as const } } },
      ];
      if (digits.length >= 7) {
        or.push({ customer: { phone: { contains: digits } } });
      }
      where.OR = or;
    }
    if (query.status) {
      if (!Object.values(BookingStatus).includes(query.status as BookingStatus)) {
        throw new BadRequestException({ message: 'Invalid booking status filter', code: 'INVALID_STATUS' });
      }
      where.status = query.status;
    }
    if (query.airline) where.airline = query.airline;
    if (query.customerId) where.customerId = query.customerId;

    if (query.period) {
      const nowLocal = DateTime.now().setZone(tz);
      const startOfDay = nowLocal.startOf('day');
      const start = (d: DateTime) => d.toUTC().toJSDate();
      const end = (d: DateTime) => d.plus({ days: 1 }).toUTC().toJSDate();
      switch (query.period) {
        case 'today':
          where.departureDate = { gte: start(startOfDay), lt: end(startOfDay) };
          break;
        case 'tomorrow':
          where.departureDate = { gte: start(startOfDay.plus({ days: 1 })), lt: end(startOfDay.plus({ days: 1 })) };
          break;
        case 'week':
          where.departureDate = { gte: start(startOfDay), lt: start(startOfDay.plus({ days: 7 })) };
          break;
        case 'month':
          where.departureDate = { gte: start(startOfDay), lt: start(startOfDay.plus({ months: 1 })) };
          break;
        default:
          break;
      }
    } else {
      if (query.from && query.to) {
        const gte = DateTime.fromISO(query.from, { zone: tz }).startOf('day').toUTC().toJSDate();
        const lt = DateTime.fromISO(query.to, { zone: tz }).plus({ days: 1 }).startOf('day').toUTC().toJSDate();
        where.departureDate = { gte, lt };
      } else if (query.from) {
        where.departureDate = { gte: DateTime.fromISO(query.from, { zone: tz }).startOf('day').toUTC().toJSDate() };
      } else if (query.to) {
        where.departureDate = { lt: DateTime.fromISO(query.to, { zone: tz }).plus({ days: 1 }).startOf('day').toUTC().toJSDate() };
      }
    }

    const sortMap: Record<string, Record<string, string>> = {
      departureDate: { departureDate: query.order || 'asc' },
      createdAt: { createdAt: query.order || 'desc' },
      updatedAt: { updatedAt: query.order || 'desc' },
      status: { status: query.order || 'asc' },
      pnr: { pnr: query.order || 'asc' },
    };

    const [items, total] = await Promise.all([
      this.prisma.booking.findMany({
        where,
        orderBy: sortMap[query.sort ?? ''] ?? { departureDate: 'asc' },
        skip: (page - 1) * limit,
        take: limit,
        include: {
          customer: { select: { id: true, name: true, phone: true } },
          creator: { select: { id: true, name: true, email: true, role: true } },
          scheduledMessages: {
            where: { status: { notIn: ['CANCELLED'] } },
            orderBy: { scheduledAt: 'desc' },
            take: 1,
            select: { status: true, scheduledAt: true },
          },
        },
      }),
      this.prisma.booking.count({ where }),
    ]);

    return {
      items: items.map((booking) => ({
        id: booking.id,
        customerId: booking.customerId,
        customerName: booking.customer.name,
        customerPhone: booking.customer.phone,
        pnr: booking.pnr,
        referenceNumber: booking.referenceNumber,
        flightNumber: booking.flightNumber,
        airline: booking.airline,
        fromAirport: booking.fromAirport,
        fromCity: booking.fromCity,
        toAirport: booking.toAirport,
        toCity: booking.toCity,
        departureDate: booking.departureDate,
        departureTime: booking.departureTime,
        terminal: booking.terminal,
        status: booking.status,
        source: booking.source,
        amount: booking.amount,
        currency: booking.currency,
        baseFare: booking.baseFare,
        cost: booking.cost,
        discount: booking.discount,
        taxRate: booking.taxRate,
        taxAmount: booking.taxAmount,
        invoiceNumber: booking.invoiceNumber,
        invoiceIssuedAt: booking.invoiceIssuedAt,
        createdBy: booking.createdBy,
        creatorName: booking.creator?.name ?? null,
        creatorEmail: booking.creator?.email ?? null,
        creatorRole: booking.creator?.role ?? null,
        createdAt: booking.createdAt,
        updatedAt: booking.updatedAt,
        latestMessage: booking.scheduledMessages[0] ?? null,
      })),
      meta: paginationMeta(total, page, limit),
    };
  }

  // ------------------------------------------------------------------
  // Read
  // ------------------------------------------------------------------

  async get(user: AuthUser, id: string) {
    const booking = await this.prisma.booking.findFirst({
      where: { id, businessId: user.businessId },
      include: {
        customer: { select: { id: true, name: true, phone: true, email: true } },
        creator: { select: { id: true, name: true, email: true, role: true } },
        invoiceItems: { orderBy: { sortOrder: 'asc' } },
        scheduledMessages: {
          orderBy: { scheduledAt: 'asc' },
          include: { template: { select: { id: true, name: true, content: true } } },
        },
      },
    });
    if (!booking) {
      throw new BadRequestException({ message: 'Booking not found', code: 'BOOKING_NOT_FOUND' });
    }
    return booking;
  }

  // ------------------------------------------------------------------
  // Create
  // ------------------------------------------------------------------

  async create(user: AuthUser, dto: CreateBookingDto) {
    const business = await this.prisma.business.findUnique({ where: { id: user.businessId } });
    if (!business) {
      throw new BadRequestException({ message: 'Business not found', code: 'BUSINESS_NOT_FOUND' });
    }
    const tz = business.timezone || 'Asia/Kolkata';

    // Customer resolution
    let customer!: Customer;
    if (dto.customerId) {
      const foundCustomer = await this.prisma.customer.findFirst({
        where: { id: dto.customerId, businessId: user.businessId },
      });
      if (!foundCustomer) {
        throw new BadRequestException({ message: 'Customer not found', code: 'CUSTOMER_NOT_FOUND' });
      }
      customer = foundCustomer;
    } else {
      const c = dto.customer;
      if (!c) {
        throw new BadRequestException({ message: 'Customer details are required', code: 'CUSTOMER_REQUIRED' });
      }
      const phone = normalizePhone(c.phone);
      if (!isValidPhone(phone)) {
        throw new BadRequestException({ message: 'Customer WhatsApp number is invalid', code: 'INVALID_PHONE' });
      }
      const found = await this.prisma.customer.findUnique({
        where: { businessId_phone: { businessId: user.businessId, phone } },
      });
      if (found) {
        customer = found;
      } else {
        try {
          customer = await this.prisma.customer.create({
            data: {
              businessId: user.businessId,
              name: c.name,
              phone,
              email: c.email,
            },
          });
        } catch (err) {
          // A colleague created the same phone number between our lookup and this insert.
          // Reuse their record rather than failing the booking and losing the entry.
          if (!isUniqueViolation(err)) throw err;
          const raced = await this.prisma.customer.findUnique({
            where: { businessId_phone: { businessId: user.businessId, phone } },
          });
          if (!raced) throw err;
          customer = raced;
        }
        if (customer.name === c.name) {
          await this.audit.log(user, 'CUSTOMER_CREATED', 'Customer', customer.id, {
            name: customer.name,
            phone: customer.phone,
          });
        }
      }
    }

    // Duplicate PNR protection
    const existingPnr = await this.prisma.booking.findUnique({
      where: { businessId_pnr: { businessId: user.businessId, pnr: dto.pnr } },
    });
    if (existingPnr && !dto.allowDuplicate) {
      throw new ConflictException({
        message: `A booking with PNR ${dto.pnr} already exists`,
        code: 'DUPLICATE_PNR',
        existingBookingId: existingPnr.id,
      });
    }

    const departureDate = this.buildDepartureDate(dto.departureDate, dto.departureTime, tz);
    const route = {
      from: parseAirportInput(dto.from ?? dto.fromAirport ?? ''),
      to: parseAirportInput(dto.to ?? dto.toAirport ?? ''),
    };

    // Accounting: resolve GST rate, compute tax and optional invoice number.
    const [setting, businessForCurrency] = await Promise.all([
      this.prisma.businessSetting.findUnique({ where: { businessId: user.businessId } }),
      this.prisma.business.findUnique({ where: { id: user.businessId }, select: { currency: true } }),
    ]);
    const gstActive = Boolean(setting?.gstEnabled);
    const resolvedTaxRate = toNumber(gstActive ? (dto.taxRate ?? setting?.gstRate ?? 0) : 0);
    // Amounts are always stored in the business base currency; the UI converts for display.
    const resolvedCurrency = dto.currency || businessForCurrency?.currency || BASE_CURRENCY;
    const baseFare = money(dto.baseFare ?? dto.amount, resolvedCurrency);
    const discount = money(dto.discount, resolvedCurrency);
    const taxable = money(Math.max(0, baseFare - discount), resolvedCurrency);
    const taxAmount = gstActive ? percentageOf(taxable, resolvedTaxRate, resolvedCurrency) : 0;
    const calculatedTotal = money(taxable + taxAmount, resolvedCurrency);
    // A client-supplied amount must not be able to contradict the tax math: previously any
    // `amount` won outright, so an invoice could be issued for less than its own tax.
    const finalAmount = dto.amount !== undefined ? money(dto.amount, resolvedCurrency) : calculatedTotal;

    // Create booking + scheduled messages atomically.
    const created = await this.prisma.$transaction(async (tx) => {
      let invoiceNumber: string | null = null;
      let invoiceIssuedAt: Date | null = null;
      if (dto.generateInvoice) {
        invoiceNumber = await allocateInvoiceNumber(tx, user.businessId);
        invoiceIssuedAt = new Date();
      }
      const booking = await tx.booking.create({
        data: {
          businessId: user.businessId,
          customerId: customer.id,
          pnr: dto.pnr,
          referenceNumber: dto.referenceNumber,
          flightNumber: dto.flightNumber,
          airline: dto.airline,
          fromAirport: route.from.code || route.from.city,
          fromCity: route.from.city,
          toAirport: route.to.code || route.to.city,
          toCity: route.to.city,
          departureDate,
          departureTime: dto.departureTime ?? '',
          terminal: dto.terminal,
          status: (dto.status as BookingStatus) ?? 'CONFIRMED',
          source: dto.source,
          amount: finalAmount,
          currency: resolvedCurrency,
          baseFare: dto.baseFare,
          cost: dto.cost,
          discount: dto.discount,
          taxRate: resolvedTaxRate,
          taxAmount,
          invoiceNumber,
          invoiceIssuedAt,
          createdBy: user.id,
        },
      });
      const saved = dto.skipAutomation ? [] : await this.automation.computeAndPersistInTx(tx, booking, customer);
      return { booking, saved };
    });

    await this.enqueueAfterCommit(created.saved);

    await this.audit.log(user, 'BOOKING_CREATED', 'Booking', created.booking.id, {
      pnr: created.booking.pnr,
      customerName: customer.name,
    });

    if (created.booking.invoiceNumber) {
      await this.invoices.captureInvoiceDocument(user, created.booking.id).catch(() => null);
    }

    return {
      ...created.booking,
      customerName: customer.name,
      customerPhone: customer.phone,
      scheduledMessages: created.saved.length,
    };
  }

  // ------------------------------------------------------------------
  // Update / reschedule
  // ------------------------------------------------------------------

  async update(user: AuthUser, id: string, dto: UpdateBookingDto) {
    const existing = await this.prisma.booking.findFirst({
      where: { id, businessId: user.businessId },
    });
    if (!existing) {
      throw new BadRequestException({ message: 'Booking not found', code: 'BOOKING_NOT_FOUND' });
    }
    if (existing.status === 'CANCELLED') {
      throw new ConflictException({ message: 'Cancelled bookings cannot be edited', code: 'BOOKING_CANCELLED' });
    }

    const business = await this.prisma.business.findUnique({ where: { id: user.businessId } });
    const tz = business?.timezone || 'Asia/Kolkata';

    const data: Record<string, unknown> = {};
    if (dto.pnr !== undefined) data.pnr = dto.pnr;
    if (dto.referenceNumber !== undefined) data.referenceNumber = dto.referenceNumber;
    if (dto.flightNumber !== undefined) data.flightNumber = dto.flightNumber;
    if (dto.airline !== undefined) data.airline = dto.airline;
    if (dto.terminal !== undefined) data.terminal = dto.terminal;
    if (dto.amount !== undefined) data.amount = dto.amount;
    if (dto.currency !== undefined) {
      if (existing.invoiceNumber && dto.currency !== existing.currency) {
        throw new BadRequestException({
          message: 'Currency cannot be changed on an issued tax invoice. Please cancel or issue a credit note.',
          code: 'ISSUED_INVOICE_CURRENCY_IMMUTABLE',
        });
      }
      data.currency = dto.currency;
    }
    if (dto.status !== undefined) data.status = dto.status;
    if (dto.source !== undefined) data.source = dto.source;
    if (dto.from !== undefined && dto.to !== undefined) {
      const from = parseAirportInput(dto.from);
      const to = parseAirportInput(dto.to);
      data.fromAirport = from.code || from.city;
      data.fromCity = from.city;
      data.toAirport = to.code || to.city;
      data.toCity = to.city;
      data.departureTime = dto.departureTime ?? existing.departureTime;
    } else {
      if (dto.fromAirport !== undefined) {
        const from = parseAirportInput(dto.fromAirport);
        data.fromAirport = from.code || from.city;
        data.fromCity = from.city;
      }
      if (dto.toAirport !== undefined) {
        const to = parseAirportInput(dto.toAirport);
        data.toAirport = to.code || to.city;
        data.toCity = to.city;
      }
      if (dto.departureTime !== undefined) data.departureTime = dto.departureTime;
    }
    if (dto.departureDate !== undefined) {
      data.departureDate = this.buildDepartureDate(
        dto.departureDate,
        dto.departureTime ?? existing.departureTime,
        tz,
      );
    }
    if (dto.customerId !== undefined) {
      const customer = await this.prisma.customer.findFirst({
        where: { id: dto.customerId, businessId: user.businessId },
      });
      if (!customer) {
        throw new BadRequestException({ message: 'Customer not found', code: 'CUSTOMER_NOT_FOUND' });
      }
      data.customerId = dto.customerId;
    }

    // Accounting: recompute GST when fare / discount / rate change so invoice totals stay correct.
    const accountingChanged =
      dto.baseFare !== undefined || dto.discount !== undefined || dto.taxRate !== undefined || dto.taxAmount !== undefined;
    if (accountingChanged) {
      // Existing rows come back as Prisma Decimal objects, whose valueOf() is a string, so the
      // fallback values must be coerced before any arithmetic or comparison.
      const baseFare = toNumber(dto.baseFare ?? existing.baseFare ?? existing.amount);
      const discount = toNumber(dto.discount ?? existing.discount);
      const taxRate = toNumber(dto.taxRate ?? existing.taxRate);
      if (dto.baseFare !== undefined) data.baseFare = dto.baseFare;
      if (dto.discount !== undefined) data.discount = dto.discount;
      if (dto.taxRate !== undefined) data.taxRate = dto.taxRate;
      if (dto.taxAmount !== undefined) {
        data.taxAmount = dto.taxAmount;
      } else if (dto.taxRate !== undefined || dto.baseFare !== undefined || dto.discount !== undefined) {
        data.taxAmount = percentageOf(Math.max(0, baseFare - discount), taxRate, existing.currency ?? BASE_CURRENCY);
      }
    }

    const updated = await this.prisma.$transaction(async (tx) => {
      // Optimistic lock: only the caller whose `version` still matches is allowed to write.
      // Two staff editing the same booking used to silently overwrite each other because
      // the read-modify-write was unguarded.
      const result = await tx.booking.updateMany({
        where: { id, businessId: user.businessId, version: dto.version },
        data: { ...data, version: { increment: 1 }, updatedBy: user.id },
      });
      if (result.count === 0) {
        throw new ConflictException({
          message: await this.conflictMessage(tx, id, user.id),
          code: 'EDIT_CONFLICT',
        });
      }
      return tx.booking.findFirstOrThrow({ where: { id }, include: { customer: true } });
    });

    // Recompute reminders only when the journey details actually moved. The edit form
    // submits every field on every save, and an unconditional resync re-queued reminders
    // the customer had already received.
    if (this.departureMoved(existing, data)) {
      await this.automation.syncForBookingUpdate({ booking: updated, customer: updated.customer });
    }

    await this.audit.log(user, 'BOOKING_UPDATED', 'Booking', id, {
      fields: Object.keys(data),
      rescheduled: this.departureMoved(existing, data),
    });
    return updated;
  }

  /** True when the patch genuinely changes when/where the passenger travels. */
  private departureMoved(existing: Booking, data: Record<string, unknown>): boolean {
    const nextDate = data.departureDate as Date | undefined;
    if (nextDate !== undefined && nextDate.getTime() !== existing.departureDate.getTime()) return true;
    const nextTime = data.departureTime as string | undefined;
    if (nextTime !== undefined && nextTime !== existing.departureTime) return true;
    if (data.fromAirport !== undefined && data.fromAirport !== existing.fromAirport) return true;
    if (data.toAirport !== undefined && data.toAirport !== existing.toAirport) return true;
    if (data.status !== undefined && data.status !== existing.status) return true;
    return false;
  }

  /** Names whoever beat us to the save, so the UI can say "Ram changed this". */
  private async conflictMessage(tx: Prisma.TransactionClient, id: string, selfId: string): Promise<string> {
    const current = await tx.booking.findUnique({
      where: { id },
      include: { lastEditor: { select: { id: true, name: true } } },
    });
    const editor = current?.lastEditor;
    if (editor && editor.id !== selfId) {
      return `${editor.name} changed this booking while you were editing it. Reload to see their changes.`;
    }
    return 'This booking was changed by someone else while you were editing it. Reload to see their changes.';
  }

  // ------------------------------------------------------------------
  // Reschedule
  // ------------------------------------------------------------------

  async reschedule(user: AuthUser, id: string, dto: UpdateBookingDto) {
    const existing = await this.prisma.booking.findFirst({
      where: { id, businessId: user.businessId },
    });
    if (!existing) {
      throw new BadRequestException({ message: 'Booking not found', code: 'BOOKING_NOT_FOUND' });
    }
    if (existing.status === 'CANCELLED') {
      throw new ConflictException({ message: 'Cancelled bookings cannot be rescheduled', code: 'BOOKING_CANCELLED' });
    }
    if (!dto.departureDate) {
      throw new BadRequestException({
        message: 'A new departure date is required to reschedule',
        code: 'RESCHEDULE_DATE_REQUIRED',
      });
    }
    return this.update(user, id, dto);
  }

  // ------------------------------------------------------------------
  // Cancel
  // ------------------------------------------------------------------

  async cancel(user: AuthUser, id: string) {
    const existing = await this.prisma.booking.findFirst({
      where: { id, businessId: user.businessId },
      include: { customer: true },
    });
    if (!existing) {
      throw new BadRequestException({ message: 'Booking not found', code: 'BOOKING_NOT_FOUND' });
    }
    if (existing.status === 'CANCELLED') {
      return { ...existing, alreadyCancelled: true };
    }

    // Flip the status behind a conditional write. Bumping `version` here makes a
    // colleague's already-open edit form fail with EDIT_CONFLICT instead of resurrecting
    // the booking by writing CONFIRMED over CANCELLED.
    const claimed = await this.prisma.booking.updateMany({
      where: { id, businessId: user.businessId, status: { not: 'CANCELLED' } },
      data: { status: 'CANCELLED', version: { increment: 1 }, updatedBy: user.id },
    });
    if (claimed.count === 0) {
      return { ...existing, alreadyCancelled: true };
    }

    const cancelled = await this.prisma.booking.findUniqueOrThrow({ where: { id } });

    // Cancel all future pending reminders.
    await this.automation.syncForBookingCancel(id);

    // Send cancellation message through the cancellation rule.
    const cancellation = await this.automation.scheduleCancellationMessage(existing, existing.customer);

    await this.audit.log(user, 'BOOKING_CANCELLED', 'Booking', id, {
      pnr: existing.pnr,
      cancellationMessageScheduled: Boolean(cancellation),
    });

    return { ...cancelled, cancellationMessageScheduled: Boolean(cancellation) };
  }

  // ------------------------------------------------------------------
  // Delete
  // ------------------------------------------------------------------

  async remove(user: AuthUser, id: string) {
    // Deleting cascades away the invoice and WhatsApp history and there is no undo. The route is
    // gated by BOOKING_DELETE (MANAGER and above); this repeats the check as defence in depth,
    // because the service is reachable from other callers and the old string comparison here was
    // the *only* thing protecting it.
    if (!roleHas(user.role, Permission.BOOKING_DELETE)) {
      throw new ForbiddenException({
        message: 'Your role cannot delete bookings. Cancel the booking instead to keep the record.',
        code: 'DELETE_REQUIRES_MANAGER',
      });
    }
    const existing = await this.prisma.booking.findFirst({
      where: { id, businessId: user.businessId },
    });
    if (!existing) {
      throw new BadRequestException({ message: 'Booking not found', code: 'BOOKING_NOT_FOUND' });
    }
    if (existing.invoiceNumber) {
      throw new BadRequestException({
        message: 'Cannot delete a booking with an issued tax invoice. Please cancel the booking instead to maintain regulatory audit records.',
        code: 'ISSUED_INVOICE_DELETE_BLOCKED',
      });
    }
    await this.automation.syncForBookingCancel(id);
    await this.prisma.booking.delete({ where: { id } });
    await this.audit.log(user, 'BOOKING_DELETED', 'Booking', id, { pnr: existing.pnr });
    return { deleted: true };
  }

  // ------------------------------------------------------------------
  // Stats for bookings page
  // ------------------------------------------------------------------

  async stats(user: AuthUser) {
    const business = await this.prisma.business.findUnique({ where: { id: user.businessId } });
    const tz = business?.timezone || 'Asia/Kolkata';
    const nowLocal = DateTime.now().setZone(tz);
    const startOfToday = nowLocal.startOf('day').toUTC().toJSDate();
    const endOfToday = nowLocal.plus({ days: 1 }).startOf('day').toUTC().toJSDate();

    const [total, today, upcoming, pending, cancelled] = await Promise.all([
      this.prisma.booking.count({ where: { businessId: user.businessId } }),
      this.prisma.booking.count({
        where: { businessId: user.businessId, departureDate: { gte: startOfToday, lt: endOfToday } },
      }),
      this.prisma.booking.count({
        where: { businessId: user.businessId, departureDate: { gte: nowLocal.toUTC().toJSDate() }, status: { not: 'CANCELLED' } },
      }),
      this.prisma.booking.count({
        where: { businessId: user.businessId, status: 'PENDING' },
      }),
      this.prisma.booking.count({ where: { businessId: user.businessId, status: 'CANCELLED' } }),
    ]);

    return { total, today, upcoming, pending, cancelled };
  }

  async airlines(user: AuthUser) {
    const rows = await this.prisma.booking.groupBy({
      by: ['airline'],
      where: { businessId: user.businessId },
      _count: { _all: true },
    });
    return rows
      .filter((row) => row.airline !== null)
      .map((row) => ({ name: row.airline as string, count: (row._count as { _all?: number } | undefined)?._all ?? 0 }))
      .sort((a, b) => b.count - a.count);
  }

  private async enqueueAfterCommit(saved: Array<{ id: string; scheduledAt: Date }>) {
    if (saved.length === 0) return;
    await this.automation.enqueueMessages(saved);
  }
}