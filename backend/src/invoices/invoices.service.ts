import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { Booking, InvoiceItem, InvoicePaymentStatus } from '@prisma/client';
import { DateTime } from 'luxon';
import { AuditService } from '../audit/audit.service';
import { AuthUser } from '../common/current-user.decorator';
import { allocateInvoiceNumber } from '../common/invoice-number';
import { computeInvoiceTotals } from '../common/invoice-totals';
import { money, sum, toNumber } from '../common/money';
import { paginationMeta } from '../common/pagination';
import { BASE_CURRENCY, formatMoney } from '../currency/decimals';
import { PrismaService } from '../prisma/prisma.service';
import { StorageService, InvoicePayload } from '../storage/storage.service';
import { WhatsAppService } from '../whatsapp/whatsapp.service';
import { CreateInvoiceItemDto, SetPaymentDto, UpdateInvoiceItemDto } from './dto/invoice.dto';
import { renderInvoicePdf } from './invoice-pdf.util';

interface InvoiceTotals {
  subtotal: number;
  discount: number;
  taxable: number;
  taxAmount: number;
  total: number;
}

@Injectable()
export class InvoicesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly whatsapp: WhatsAppService,
    private readonly storage: StorageService,
  ) {}

  // ------------------------------------------------------------------
  // Serialization / computation
  // ------------------------------------------------------------------

  /** Delegates to the shared implementation so reports and invoices can never disagree. */
  private computeTotals(booking: Booking, items: InvoiceItem[]): InvoiceTotals {
    return computeInvoiceTotals(booking, items);
  }

  private serialize(booking: Booking, items: InvoiceItem[]) {
    const totals = this.computeTotals(booking, items);
    const currency = booking.currency || BASE_CURRENCY;
    const paidAmount = money(Math.min(toNumber(booking.paidAmount), totals.total), currency);
    const due = money(Math.max(0, totals.total - paidAmount), currency);
    const customer = (booking as unknown as { customer?: { id: string; name: string; phone: string; email?: string | null } })
      .customer;
    return {
      id: booking.id,
      pnr: booking.pnr,
      referenceNumber: booking.referenceNumber,
      customerId: booking.customerId,
      customerName: customer?.name ?? null,
      customerPhone: customer?.phone ?? null,
      customerEmail: customer?.email ?? null,
      invoiceNumber: booking.invoiceNumber,
      invoiceIssuedAt: booking.invoiceIssuedAt,
      paymentStatus: booking.paymentStatus,
      status: booking.status,
      airline: booking.airline,
      flightNumber: booking.flightNumber,
      fromAirport: booking.fromAirport,
      toAirport: booking.toAirport,
      fromCity: booking.fromCity,
      toCity: booking.toCity,
      departureDate: booking.departureDate,
      departureTime: booking.departureTime,
      terminal: booking.terminal,
      amount: booking.amount,
      currency: booking.currency || BASE_CURRENCY,
      baseFare: booking.baseFare,
      discount: booking.discount,
      taxRate: booking.taxRate,
      taxAmount: booking.taxAmount,
      subtotal: totals.subtotal,
      taxable: totals.taxable,
      total: totals.total,
      paidAmount,
      due,
      items: items.map((i) => ({
        id: i.id,
        description: i.description,
        quantity: i.quantity,
        unitPrice: i.unitPrice,
        amount: i.amount,
        sortOrder: i.sortOrder,
      })),
      createdAt: booking.createdAt,
      updatedAt: booking.updatedAt,
    };
  }

  private async loadInvoice(user: AuthUser, id: string) {
    const booking = await this.prisma.booking.findFirst({
      where: { id, businessId: user.businessId },
      include: {
        customer: { select: { id: true, name: true, phone: true, email: true } },
        invoiceItems: { orderBy: { sortOrder: 'asc' } },
      },
    });
    if (!booking) {
      throw new NotFoundException({ message: 'Booking not found', code: 'BOOKING_NOT_FOUND' });
    }
    return booking;
  }

  // ------------------------------------------------------------------
  // List + stats
  // ------------------------------------------------------------------

  async list(
    user: AuthUser,
    query: {
      page?: number;
      limit?: number;
      search?: string;
      paymentStatus?: string;
      from?: string;
      to?: string;
      sort?: string;
      order?: 'asc' | 'desc';
    },
  ) {
    const page = Math.max(1, Number(query.page) || 1);
    const limit = Math.min(1000, Math.max(1, Number(query.limit) || 20));

    const where: Record<string, unknown> = {
      businessId: user.businessId,
      invoiceNumber: { not: null },
    };

    if (query.search) {
      const term = query.search.trim();
      const digits = term.replace(/[^\d]/g, '');
      const or: Record<string, unknown>[] = [
        { invoiceNumber: { contains: term, mode: 'insensitive' as const } },
        { pnr: { contains: term, mode: 'insensitive' as const } },
        { referenceNumber: { contains: term, mode: 'insensitive' as const } },
        { flightNumber: { contains: term, mode: 'insensitive' as const } },
        { customer: { name: { contains: term, mode: 'insensitive' as const } } },
      ];
      if (digits.length >= 7) {
        or.push({ customer: { phone: { contains: digits } } });
      }
      where.OR = or;
    }

    if (query.paymentStatus) {
      where.paymentStatus = query.paymentStatus;
    }

    if (query.from || query.to) {
      const gte = query.from
        ? DateTime.fromISO(query.from, { zone: 'local' }).startOf('day').toJSDate()
        : new Date(0);
      const lt = query.to
        ? DateTime.fromISO(query.to, { zone: 'local' }).plus({ days: 1 }).startOf('day').toJSDate()
        : new Date();
      where.invoiceIssuedAt = { gte, lt };
    }

    const include = {
      customer: { select: { id: true, name: true, phone: true, email: true } },
      invoiceItems: { orderBy: { sortOrder: 'asc' as const } },
    } as const;

    const orderBy =
      query.sort === 'amount'
        ? { amount: query.order || 'desc' }
        : query.sort === 'customer'
          ? { customer: { name: (query.order || 'asc') as 'asc' } }
          : { invoiceIssuedAt: query.order || 'desc' };

    // The stats block used to load every matching booking *with its customer and every invoice
    // item* just to fold the totals in JavaScript, on every page view. It is now a
    // column-only scan (6 numbers per row, no relations, no nested arrays), which keeps
    // computeTotals as the single source of truth without pulling the whole tenant into memory.
    //
    // TODO(scaling): at ~50k+ invoices per tenant this is still O(n) per request. The fix is a
    // denormalised invoiceTotal column kept in sync by syncBookingInvoiceTotals, which would
    // turn this into a Prisma _sum. That is a schema migration and is deliberately not done here.
    const totalsScan = await this.prisma.booking.findMany({
      where,
      select: {
        amount: true,
        baseFare: true,
        discount: true,
        taxRate: true,
        taxAmount: true,
        paidAmount: true,
        paymentStatus: true,
        currency: true,
        invoiceItems: { select: { amount: true } },
      },
    });

    const [items, total, aggregate] = await Promise.all([
      this.prisma.booking.findMany({ where, include, orderBy, skip: (page - 1) * limit, take: limit }),
      this.prisma.booking.count({ where }),
      this.prisma.booking.aggregate({
        where,
        _count: { _all: true },
        _sum: { paidAmount: true },
      }),
    ]);

    let totalBilled = 0;
    let totalCollected = 0;
    for (const booking of totalsScan) {
      const currency = booking.currency || BASE_CURRENCY;
      const totals = this.computeTotals(booking as unknown as Booking, booking.invoiceItems as InvoiceItem[]);
      totalBilled = money(totalBilled + totals.total, currency);
      totalCollected = money(
        totalCollected + money(Math.min(toNumber(booking.paidAmount), totals.total), currency),
        currency,
      );
    }

    const stats = {
      issued: aggregate._count._all,
      pending: totalsScan.filter((b) => b.paymentStatus === 'UNPAID').length,
      partial: totalsScan.filter((b) => b.paymentStatus === 'PARTIAL').length,
      paid: totalsScan.filter((b) => b.paymentStatus === 'PAID').length,
      totalBilled,
      totalCollected,
      outstanding: Math.max(0, totalBilled - totalCollected),
      currency: totalsScan.find((b) => b.currency)?.currency || 'AED',
    };

    return {
      items: items.map((booking) => this.serialize(booking as Booking, booking.invoiceItems as InvoiceItem[])),
      stats,
      meta: paginationMeta(total, page, limit),
    };
  }

  // ------------------------------------------------------------------
  // Read / issue
  // ------------------------------------------------------------------

  async get(user: AuthUser, id: string) {
    const booking = await this.loadInvoice(user, id);
    return this.serialize(booking as Booking, booking.invoiceItems as InvoiceItem[]);
  }

  async issue(user: AuthUser, id: string) {
    const booking = await this.loadInvoice(user, id);
    if (booking.invoiceNumber) {
      return this.serialize(booking as Booking, booking.invoiceItems as InvoiceItem[]);
    }

    const issued = await this.prisma.$transaction(async (tx) => {
      // Claim the booking first: the conditional update means only the caller that
      // changes invoiceNumber from NULL actually wins, so two staff issuing at the same
      // moment cannot overwrite each other or burn two invoice numbers.
      const claimed = await tx.booking.updateMany({
        where: { id, businessId: user.businessId, invoiceNumber: null },
        data: { invoiceIssuedAt: new Date() },
      });
      if (claimed.count === 0) {
        throw new ConflictException({
          message: 'This invoice was already issued by someone else',
          code: 'INVOICE_ALREADY_ISSUED',
        });
      }

      const invoiceNumber = await allocateInvoiceNumber(tx, user.businessId);
      return tx.booking.update({
        where: { id },
        data: { invoiceNumber },
        include: {
          customer: { select: { id: true, name: true, phone: true, email: true } },
          invoiceItems: { orderBy: { sortOrder: 'asc' } },
        },
      });
    });

    await this.audit.log(user, 'INVOICE_ISSUED', 'Booking', id, {
      invoiceNumber: issued.invoiceNumber,
    });

    // Freeze the document now, while the numbers are the ones just committed. From
    // here on the served PDF comes from this snapshot rather than a live re-render, so
    // later corrections cannot rewrite what the customer was given.
    await this.captureInvoiceDocument(user, id);

    return this.serialize(issued as Booking, issued.invoiceItems as InvoiceItem[]);
  }

  /**
   * Render the current invoice and store it as the issued document.
   *
   * Separate from `issue()` so that editing line items on an already-issued invoice
   * can re-capture deliberately, and so a failure here never rolls back a committed
   * invoice number.
   */
  async captureInvoiceDocument(user: AuthUser, id: string) {
    const { booking, pdf, pdfInput, totals } = await this.buildPdf(user, id);
    if (!booking.invoiceNumber) return null;

    const itemsTotal = sum(
      (booking.invoiceItems as InvoiceItem[]).map((i) => toNumber(i.amount)),
      booking.currency || BASE_CURRENCY,
    );

    const payload: InvoicePayload = {
      booking: { ...(booking as unknown as Record<string, unknown>) },
      customer: { ...(booking.customer as unknown as Record<string, unknown>) },
      business: { ...pdfInput.business },
      setting: { ...pdfInput.setting },
      items: (booking.invoiceItems as InvoiceItem[]).map((i) => ({ ...(i as unknown as Record<string, unknown>) })),
      subtotal: totals.subtotal,
      discount: totals.discount,
      taxAmount: totals.taxAmount,
      total: totals.total,
      paidAmount: money(Math.min(toNumber(booking.paidAmount), totals.total), booking.currency || BASE_CURRENCY),
      itemsTotal,
      // The date the document is anchored to, matching the one the PDF was rendered
      // with. Storing "now" here instead would make the audit payload disagree with the
      // bytes it is supposed to explain.
      renderedAt: (booking.invoiceIssuedAt ?? new Date()).toISOString(),
    };

    await this.storage.snapshotInvoice({
      businessId: user.businessId,
      bookingId: id,
      invoiceNumber: booking.invoiceNumber,
      pdf,
      payload,
    });

    return { invoiceNumber: booking.invoiceNumber, total: totals.total };
  }

  // ------------------------------------------------------------------
  // Line items
  // ------------------------------------------------------------------

  private async syncBookingInvoiceTotals(user: AuthUser, bookingId: string) {
    const booking = await this.loadInvoice(user, bookingId);
    const currency = booking.currency || BASE_CURRENCY;
    const totals = this.computeTotals(booking as Booking, booking.invoiceItems as InvoiceItem[]);
    let paidAmount = money(Math.min(toNumber(booking.paidAmount), totals.total), currency);
    let paymentStatus: InvoicePaymentStatus = booking.paymentStatus;

    if (paidAmount >= totals.total && totals.total > 0) {
      paymentStatus = 'PAID';
      paidAmount = totals.total;
    } else if (paidAmount > 0) {
      paymentStatus = 'PARTIAL';
    } else {
      paymentStatus = 'UNPAID';
    }

    const updated = await this.prisma.booking.update({
      where: { id: bookingId },
      data: {
        amount: totals.total,
        taxAmount: totals.taxAmount,
        paidAmount,
        paymentStatus,
      },
      include: {
        customer: { select: { id: true, name: true, phone: true, email: true } },
        invoiceItems: { orderBy: { sortOrder: 'asc' } },
      },
    });

    if (updated.invoiceNumber) {
      await this.captureInvoiceDocument(user, bookingId);
    }

    return this.serialize(updated as Booking, updated.invoiceItems as InvoiceItem[]);
  }

  async addItem(user: AuthUser, id: string, dto: CreateInvoiceItemDto) {
    const booking = await this.loadInvoice(user, id);
    const currency = booking.currency || BASE_CURRENCY;
    const quantity = toNumber(dto.quantity ?? 1);
    const unitPrice = money(dto.unitPrice ?? 0, currency);
    const amount = money(dto.amount ?? quantity * unitPrice, currency);
    const sortOrder = dto.sortOrder ?? (booking.invoiceItems.length + 1) * 10;

    await this.prisma.invoiceItem.create({
      data: {
        bookingId: id,
        description: dto.description,
        quantity,
        unitPrice,
        amount,
        sortOrder,
      },
    });

    await this.audit.log(user, 'INVOICE_ITEM_ADDED', 'Booking', id, {
      description: dto.description,
      amount,
    });

    return this.syncBookingInvoiceTotals(user, id);
  }

  async updateItem(user: AuthUser, id: string, itemId: string, dto: UpdateInvoiceItemDto) {
    // Crucial: load invoice first to verify businessId and prevent IDOR
    const booking = await this.loadInvoice(user, id);
    const existing = booking.invoiceItems.find((item) => item.id === itemId);
    if (!existing) {
      throw new NotFoundException({ message: 'Invoice item not found', code: 'INVOICE_ITEM_NOT_FOUND' });
    }
    const currency = booking.currency || BASE_CURRENCY;

    const quantity = dto.quantity ?? existing.quantity;
    const unitPrice = money(dto.unitPrice ?? existing.unitPrice, currency);
    const data: Record<string, unknown> = {};
    if (dto.description !== undefined) data.description = dto.description;
    if (dto.quantity !== undefined) data.quantity = toNumber(dto.quantity);
    if (dto.unitPrice !== undefined) data.unitPrice = unitPrice;
    if (dto.amount !== undefined) data.amount = money(dto.amount, currency);
    else data.amount = money(toNumber(quantity) * unitPrice, currency);
    if (dto.sortOrder !== undefined) data.sortOrder = dto.sortOrder;

    await this.prisma.invoiceItem.update({ where: { id: itemId }, data });

    await this.audit.log(user, 'INVOICE_ITEM_UPDATED', 'Booking', id, {
      itemId,
      fields: Object.keys(data),
    });

    return this.syncBookingInvoiceTotals(user, id);
  }

  async removeItem(user: AuthUser, id: string, itemId: string) {
    // Crucial: load invoice first to verify businessId and prevent IDOR
    const booking = await this.loadInvoice(user, id);
    const existing = booking.invoiceItems.find((item) => item.id === itemId);
    if (!existing) {
      throw new NotFoundException({ message: 'Invoice item not found', code: 'INVOICE_ITEM_NOT_FOUND' });
    }

    await this.prisma.invoiceItem.delete({ where: { id: itemId } });

    await this.audit.log(user, 'INVOICE_ITEM_REMOVED', 'Booking', id, { itemId });
    return this.syncBookingInvoiceTotals(user, id);
  }

  // ------------------------------------------------------------------
  // Payment
  // ------------------------------------------------------------------

  async setPayment(user: AuthUser, id: string, dto: SetPaymentDto) {
    const booking = await this.loadInvoice(user, id);
    const currency = booking.currency || BASE_CURRENCY;
    const totals = this.computeTotals(booking as Booking, booking.invoiceItems as InvoiceItem[]);

    let paidAmount = money(dto.paidAmount !== undefined ? dto.paidAmount : booking.paidAmount, currency);
    if (!Number.isFinite(paidAmount) || paidAmount < 0) {
      paidAmount = 0;
    }

    let status: InvoicePaymentStatus;
    if (dto.status === 'PAID') {
      paidAmount = totals.total;
      status = 'PAID';
    } else if (dto.status === 'UNPAID') {
      paidAmount = 0;
      status = 'UNPAID';
    } else if (dto.status === 'PARTIAL') {
      if (paidAmount <= 0 || paidAmount >= totals.total) {
        throw new BadRequestException({
          message: 'Partial payment must be greater than 0 and less than the invoice total',
          code: 'PARTIAL_AMOUNT_INVALID',
        });
      }
      status = 'PARTIAL';
    } else {
      if (paidAmount >= totals.total && totals.total > 0) {
        status = 'PAID';
        paidAmount = totals.total;
      } else if (paidAmount > 0) {
        status = 'PARTIAL';
      } else {
        status = 'UNPAID';
      }
    }

    paidAmount = money(Math.min(paidAmount, totals.total), currency);

    // Concurrency guard with version check
    const claimed = await this.prisma.booking.updateMany({
      where: { id, businessId: user.businessId, version: booking.version },
      data: {
        paymentStatus: status,
        paidAmount,
        version: { increment: 1 },
        updatedBy: user.id,
      },
    });

    if (claimed.count === 0) {
      throw new ConflictException({
        message: 'This invoice was modified by another user. Please reload.',
        code: 'EDIT_CONFLICT',
      });
    }

    const updated = await this.prisma.booking.findUniqueOrThrow({
      where: { id },
      include: {
        customer: { select: { id: true, name: true, phone: true, email: true } },
        invoiceItems: { orderBy: { sortOrder: 'asc' } },
      },
    });

    await this.audit.log(user, 'INVOICE_PAYMENT_UPDATED', 'Booking', id, {
      status,
      paidAmount,
    });

    if (updated.invoiceNumber) {
      await this.captureInvoiceDocument(user, id);
    }

    return this.serialize(updated as Booking, updated.invoiceItems as InvoiceItem[]);
  }

  // ------------------------------------------------------------------
  // PDF
  // ------------------------------------------------------------------

  private async buildPdf(user: AuthUser, id: string) {
    const booking = await this.loadInvoice(user, id);
    const [business, setting, whatsappAccount] = await Promise.all([
      this.prisma.business.findUnique({ where: { id: user.businessId } }),
      this.prisma.businessSetting.findUnique({ where: { businessId: user.businessId } }),
      this.prisma.whatsAppAccount.findFirst({
        where: { businessId: user.businessId },
        select: { displayPhoneNumber: true },
      }),
    ]);

    const items = booking.invoiceItems as InvoiceItem[];
    const totals = this.computeTotals(booking as Booking, items);
    const paidAmount = money(Math.min(toNumber(booking.paidAmount), totals.total), booking.currency || BASE_CURRENCY);

    const pdfInput = {
      booking: booking as Booking,
      customer: booking.customer,
      business: {
        name: business?.name,
        email: business?.email,
        phone: business?.phone,
        logo: business?.logo,
      },
      setting: {
        gstin: setting?.gstin,
        gstRate: setting?.gstRate,
        gstEnabled: setting?.gstEnabled,
        taxLabel: setting?.taxLabel,
        bankName: setting?.bankName,
        bankAccountName: setting?.bankAccountName,
        bankAccountNumber: setting?.bankAccountNumber,
        bankIfscSwift: setting?.bankIfscSwift,
        bankUpiId: setting?.bankUpiId,
        invoiceTerms: setting?.invoiceTerms,
        invoiceNotes: setting?.invoiceNotes,
      },
      items,
      subtotal: totals.subtotal,
      discount: totals.discount,
      taxAmount: totals.taxAmount,
      total: totals.total,
      paidAmount,
      generatedAt: booking.invoiceIssuedAt ?? undefined,
    };

    return {
      booking,
      business,
      setting,
      fromPhone: whatsappAccount?.displayPhoneNumber ?? null,
      pdf: renderInvoicePdf(pdfInput),
      totals,
      pdfInput,
    };
  }

  /**
   * Fetch the PDF a customer was actually issued.
   *
   * The stored snapshot wins over a live render. That is the whole point of keeping
   * it: an issued invoice is a financial record, and a live re-render would silently
   * rewrite it the moment the business name, GSTIN or an itemised line is corrected.
   * Falls back to rendering when nothing is stored (issued before this feature, or the
   * retention sweep has dropped the bytes) so no invoice ever becomes undownloadable.
   */
  private async pdfForIssued(bookingId: string, build: () => Promise<Buffer>): Promise<{ pdf: Buffer; stored: boolean }> {
    const snapshot = await this.storage.readInvoicePdf(bookingId);
    if (snapshot) return { pdf: snapshot.pdf, stored: true };
    return { pdf: await build(), stored: false };
  }

  async getPdf(user: AuthUser, id: string) {
    // One load for both branches. A draft has nothing to preserve, but it still needs the
    // live figures; an issued invoice needs the snapshot, and only falls back to a render
    // if no document was ever stored or its bytes have since been swept.
    const booking = await this.loadInvoice(user, id);
    const totals = this.computeTotals(booking as Booking, booking.invoiceItems as InvoiceItem[]);

    if (booking.invoiceNumber) {
      const { pdf, stored } = await this.pdfForIssued(id, async () => (await this.buildPdf(user, id)).pdf);
      // Decompressed, not read as JSON: the payload is brotli-compressed so that
      // freezing it does not cost more than the PDF it explains.
      const payload = await this.storage.readInvoicePayload<{ total?: number }>(id);

      return {
        fileName: `Invoice-${booking.invoiceNumber}.pdf`,
        base64: pdf.toString('base64'),
        // Prefer the frozen total so a corrected line item cannot disagree with the
        // archived document the customer holds.
        total: payload?.total ?? totals.total,
        paymentStatus: booking.paymentStatus,
        currency: booking.currency || BASE_CURRENCY,
        source: stored ? 'snapshot' : 'live',
      };
    }

    // Not yet issued: nothing to preserve, so always render current figures.
    const { pdf } = await this.buildPdf(user, id);
    return {
      fileName: `Invoice-${booking.pnr}.pdf`,
      base64: pdf.toString('base64'),
      total: totals.total,
      paymentStatus: booking.paymentStatus,
      currency: booking.currency || BASE_CURRENCY,
      source: 'live',
    };
  }

  // ------------------------------------------------------------------
  // WhatsApp delivery
  // ------------------------------------------------------------------

  async sendViaWhatsApp(user: AuthUser, id: string) {
    const { booking, pdf: livePdf, fromPhone } = await this.buildPdf(user, id);

    if (!booking.invoiceNumber) {
      throw new BadRequestException({
        message: 'Issue the invoice first before sending it via WhatsApp',
        code: 'INVOICE_NOT_ISSUED',
      });
    }
    if (!booking.customer.phone) {
      throw new BadRequestException({ message: 'Customer has no phone number', code: 'NO_CUSTOMER_PHONE' });
    }

    // Send the same bytes the customer can download, not a fresh render. A WhatsApp
    // message is not retrievable once sent, so this is the one place where a
    // divergence is genuinely permanent.
    //
    // `livePdf` is reused as the fallback rather than rendering twice - `buildPdf` has
    // already produced it, and re-rendering would double the cost of every send.
    const { pdf } = await this.pdfForIssued(id, async () => livePdf);
    const totals = this.computeTotals(booking as Booking, booking.invoiceItems as InvoiceItem[]);

    const fileName = `Invoice-${booking.invoiceNumber}.pdf`;
    const caption = `Dear ${booking.customer.name}, here is your invoice ${booking.invoiceNumber}. Total: ${formatMoney(
      totals.total,
      booking.currency || BASE_CURRENCY,
    )}`;

    const result = await this.whatsapp.sendDocument({
      to: booking.customer.phone,
      document: pdf,
      fileName,
      caption,
    });

    await this.prisma.messageLog.create({
      data: {
        businessId: user.businessId,
        bookingId: id,
        customerId: booking.customerId,
        direction: 'OUTBOUND',
        status: 'SENT',
        toPhone: booking.customer.phone,
        fromPhone,
        content: caption,
        waMessageId: result.waMessageId,
        sentAt: new Date(),
      },
    });

    await this.audit.log(user, 'INVOICE_SENT_VIA_WHATSAPP', 'Booking', id, {
      invoiceNumber: booking.invoiceNumber,
      waMessageId: result.waMessageId,
    });

    return {
      sent: true,
      waMessageId: result.waMessageId,
      fileName,
    };
  }
}