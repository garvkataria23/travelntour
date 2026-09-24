import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Booking, InvoiceItem, InvoicePaymentStatus } from '@prisma/client';
import { DateTime } from 'luxon';
import { AuditService } from '../audit/audit.service';
import { AuthUser } from '../common/current-user.decorator';
import { paginationMeta } from '../common/pagination';
import { PrismaService } from '../prisma/prisma.service';
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
  ) {}

  // ------------------------------------------------------------------
  // Serialization / computation
  // ------------------------------------------------------------------

  private computeTotals(booking: Booking, items: InvoiceItem[]): InvoiceTotals {
    const subtotal =
      items.length > 0 ? items.reduce((sum, i) => sum + (i.amount || 0), 0) : booking.baseFare ?? booking.amount ?? 0;
    const discount = booking.discount ?? 0;
    const taxable = Math.max(0, subtotal - discount);
    const taxRate = booking.taxRate ?? 0;
    let taxAmount = 0;
    if (items.length > 0) {
      taxAmount = taxRate > 0 ? Math.round(taxable * (taxRate / 100) * 100) / 100 : 0;
    } else {
      taxAmount =
        booking.taxAmount ?? (taxRate > 0 ? Math.round(taxable * (taxRate / 100) * 100) / 100 : 0);
    }
    return { subtotal, discount, taxable, taxAmount, total: Math.max(0, taxable + taxAmount) };
  }

  private serialize(booking: Booking, items: InvoiceItem[]) {
    const totals = this.computeTotals(booking, items);
    const paidAmount = Math.min(booking.paidAmount ?? 0, totals.total);
    const due = Math.max(0, totals.total - paidAmount);
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
      fromCity: booking.fromCity,
      toCity: booking.toCity,
      departureDate: booking.departureDate,
      departureTime: booking.departureTime,
      amount: booking.amount,
      currency: booking.currency || 'INR',
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
    const page = Number(query.page) || 1;
    const limit = Number(query.limit) || 20;

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

    const [matched, items, total, aggregate] = await Promise.all([
      this.prisma.booking.findMany({ where, include }),
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
    for (const booking of matched) {
      const totals = this.computeTotals(booking, booking.invoiceItems as InvoiceItem[]);
      totalBilled += totals.total;
      totalCollected += Math.min(booking.paidAmount ?? 0, totals.total);
    }

    const stats = {
      issued: aggregate._count._all,
      pending: matched.filter((b) => b.paymentStatus === 'UNPAID').length,
      partial: matched.filter((b) => b.paymentStatus === 'PARTIAL').length,
      paid: matched.filter((b) => b.paymentStatus === 'PAID').length,
      totalBilled,
      totalCollected,
      outstanding: Math.max(0, totalBilled - totalCollected),
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
      const bs = await tx.businessSetting.findUnique({ where: { businessId: user.businessId } });
      const nextNo = bs?.nextInvoiceNo ?? 1;
      const invoiceNumber = `${bs?.invoicePrefix || 'INV'}-${String(nextNo).padStart(5, '0')}`;
      await tx.businessSetting.upsert({
        where: { businessId: user.businessId },
        create: { businessId: user.businessId, nextInvoiceNo: nextNo + 1 },
        update: { nextInvoiceNo: { increment: 1 } },
      });
      return tx.booking.update({
        where: { id },
        data: { invoiceNumber, invoiceIssuedAt: new Date() },
        include: {
          customer: { select: { id: true, name: true, phone: true, email: true } },
          invoiceItems: { orderBy: { sortOrder: 'asc' } },
        },
      });
    });

    await this.audit.log(user, 'INVOICE_ISSUED', 'Booking', id, {
      invoiceNumber: issued.invoiceNumber,
    });

    return this.serialize(issued as Booking, issued.invoiceItems as InvoiceItem[]);
  }

  // ------------------------------------------------------------------
  // Line items
  // ------------------------------------------------------------------

  async addItem(user: AuthUser, id: string, dto: CreateInvoiceItemDto) {
    const booking = await this.loadInvoice(user, id);
    const quantity = dto.quantity ?? 1;
    const unitPrice = dto.unitPrice ?? 0;
    const amount = dto.amount ?? Math.round(quantity * unitPrice * 100) / 100;
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

    const updated = await this.loadInvoice(user, id);
    return this.serialize(updated as Booking, updated.invoiceItems as InvoiceItem[]);
  }

  async updateItem(user: AuthUser, id: string, itemId: string, dto: UpdateInvoiceItemDto) {
    const existing = await this.prisma.invoiceItem.findFirst({ where: { id: itemId, bookingId: id } });
    if (!existing) {
      throw new NotFoundException({ message: 'Invoice item not found', code: 'INVOICE_ITEM_NOT_FOUND' });
    }

    const quantity = dto.quantity ?? existing.quantity;
    const unitPrice = dto.unitPrice ?? existing.unitPrice;
    const data: Record<string, unknown> = {};
    if (dto.description !== undefined) data.description = dto.description;
    if (dto.quantity !== undefined) data.quantity = dto.quantity;
    if (dto.unitPrice !== undefined) data.unitPrice = dto.unitPrice;
    if (dto.amount !== undefined) data.amount = dto.amount;
    else data.amount = Math.round(quantity * unitPrice * 100) / 100;
    if (dto.sortOrder !== undefined) data.sortOrder = dto.sortOrder;

    await this.prisma.invoiceItem.update({ where: { id: itemId }, data });

    await this.audit.log(user, 'INVOICE_ITEM_UPDATED', 'Booking', id, {
      itemId,
      fields: Object.keys(data),
    });

    const updated = await this.loadInvoice(user, id);
    return this.serialize(updated as Booking, updated.invoiceItems as InvoiceItem[]);
  }

  async removeItem(user: AuthUser, id: string, itemId: string) {
    const existing = await this.prisma.invoiceItem.findFirst({ where: { id: itemId, bookingId: id } });
    if (!existing) {
      throw new NotFoundException({ message: 'Invoice item not found', code: 'INVOICE_ITEM_NOT_FOUND' });
    }
    await this.prisma.invoiceItem.delete({ where: { id: itemId } });
    await this.audit.log(user, 'INVOICE_ITEM_REMOVED', 'Booking', id, { itemId });
    const updated = await this.loadInvoice(user, id);
    return this.serialize(updated as Booking, updated.invoiceItems as InvoiceItem[]);
  }

  // ------------------------------------------------------------------
  // Payment
  // ------------------------------------------------------------------

  async setPayment(user: AuthUser, id: string, dto: SetPaymentDto) {
    const booking = await this.loadInvoice(user, id);
    const totals = this.computeTotals(booking as Booking, booking.invoiceItems as InvoiceItem[]);

    let paidAmount = dto.paidAmount ?? booking.paidAmount ?? 0;
    if (dto.status === 'PAID') paidAmount = totals.total;
    if (dto.status === 'UNPAID') paidAmount = 0;

    const updated = await this.prisma.booking.update({
      where: { id },
      data: {
        paymentStatus: dto.status as InvoicePaymentStatus,
        paidAmount,
      },
      include: {
        customer: { select: { id: true, name: true, phone: true, email: true } },
        invoiceItems: { orderBy: { sortOrder: 'asc' } },
      },
    });

    await this.audit.log(user, 'INVOICE_PAYMENT_UPDATED', 'Booking', id, {
      status: dto.status,
      paidAmount,
    });

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
    const paidAmount = Math.min(booking.paidAmount ?? 0, totals.total);

    return {
      booking,
      business,
      setting,
      fromPhone: whatsappAccount?.displayPhoneNumber ?? null,
      pdf: renderInvoicePdf({
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
        },
        items,
        subtotal: totals.subtotal,
        discount: totals.discount,
        taxAmount: totals.taxAmount,
        total: totals.total,
        paidAmount,
      }),
      totals,
    };
  }

  async getPdf(user: AuthUser, id: string) {
    const { booking, pdf, totals } = await this.buildPdf(user, id);
    return {
      fileName: `Invoice-${booking.invoiceNumber || booking.pnr}.pdf`,
      base64: pdf.toString('base64'),
      total: totals.total,
      paymentStatus: booking.paymentStatus,
      currency: booking.currency || 'INR',
    };
  }

  // ------------------------------------------------------------------
  // WhatsApp delivery
  // ------------------------------------------------------------------

  async sendViaWhatsApp(user: AuthUser, id: string) {
    const { booking, pdf, totals, fromPhone } = await this.buildPdf(user, id);

    if (!booking.invoiceNumber) {
      throw new BadRequestException({
        message: 'Issue the invoice first before sending it via WhatsApp',
        code: 'INVOICE_NOT_ISSUED',
      });
    }
    if (!booking.customer.phone) {
      throw new BadRequestException({ message: 'Customer has no phone number', code: 'NO_CUSTOMER_PHONE' });
    }

    const fileName = `Invoice-${booking.invoiceNumber}.pdf`;
    const caption = `Dear ${booking.customer.name}, here is your invoice ${booking.invoiceNumber}. Total: ${new Intl.NumberFormat('en-IN', {
      style: 'currency',
      currency: booking.currency || 'INR',
    }).format(totals.total)}`;

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