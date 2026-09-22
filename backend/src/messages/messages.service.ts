import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { MessageType, MessageStatus } from '@prisma/client';
import { AuthUser } from '../common/current-user.decorator';
import { paginationMeta } from '../common/pagination';
import { PrismaService } from '../prisma/prisma.service';
import { getQueues } from '../queue/queue.module';
import { AuditService } from '../audit/audit.service';
import { messageTypeName } from '../templates/templates.service';
import { SendManualMessageDto } from './dto/send-manual-message.dto';

@Injectable()
export class MessagesService {
  private readonly logger = new Logger(MessagesService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async list(
    user: AuthUser,
    query: {
      page?: number;
      limit?: number;
      search?: string;
      type?: string;
      status?: string;
      from?: string;
      to?: string;
    },
  ) {
    const page = Number(query.page) || 1;
    const limit = Number(query.limit) || 20;
    const where: Record<string, unknown> = { businessId: user.businessId };

    if (query.type) where.messageType = query.type;
    if (query.status) where.status = query.status;
    if (query.from || query.to) {
      const gte = query.from ? new Date(query.from) : undefined;
      const lte = query.to ? new Date(query.to) : undefined;
      where.scheduledAt = {
        ...(gte ? { gte } : {}),
        ...(lte ? { lte } : {}),
      };
    }
    if (query.search) {
      const term = query.search.trim();
      const digits = term.replace(/[^\d]/g, '');
      const or: Record<string, unknown>[] = [
        { customer: { name: { contains: term, mode: 'insensitive' as const } } },
        { booking: { pnr: { contains: term, mode: 'insensitive' as const } } },
        { name: { contains: term, mode: 'insensitive' as const } },
      ];
      if (digits.length >= 7) {
        or.push({ customer: { phone: { contains: digits } } }, { booking: { customer: { phone: { contains: digits } } } });
      }
      where.OR = or;
    }

    const [items, total, counts] = await Promise.all([
      this.prisma.scheduledMessage.findMany({
        where,
        orderBy: { scheduledAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
        include: {
          customer: { select: { id: true, name: true, phone: true } },
          booking: { select: { id: true, pnr: true, flightNumber: true, airline: true } },
          template: { select: { id: true, name: true } },
          rule: { select: { id: true, name: true } },
        },
      }),
      this.prisma.scheduledMessage.count({ where }),
      this.prisma.scheduledMessage.groupBy({
        by: ['status'],
        where: { businessId: user.businessId },
        _count: { _all: true },
      }),
    ]);

    const stats = {
      total: counts.reduce((sum, c) => sum + c._count._all, 0),
      delivered: this.countStatus(counts, 'DELIVERED') + this.countStatus(counts, 'READ'),
      read: this.countStatus(counts, 'READ'),
      sent: this.countStatus(counts, 'SENT'),
      pending: this.countStatus(counts, 'SCHEDULED') + this.countStatus(counts, 'PROCESSING'),
      failed: this.countStatus(counts, 'FAILED'),
      cancelled: this.countStatus(counts, 'CANCELLED'),
    };

    return {
      items: items.map((m) => ({
        id: m.id,
        name: m.name,
        messageType: m.messageType,
        messageTypeLabel: messageTypeName(m.messageType),
        status: m.status,
        scheduledAt: m.scheduledAt,
        sentAt: m.sentAt,
        deliveredAt: m.deliveredAt,
        readAt: m.readAt,
        failedAt: m.failedAt,
        attempts: m.attempts,
        lastError: m.lastError,
        waMessageId: m.waMessageId,
        customer: m.customer,
        booking: m.booking,
        template: m.template,
        rule: m.rule ? { id: m.rule.id, name: m.rule.name } : null,
      })),
      stats,
      meta: paginationMeta(total, page, limit),
    };
  }

  private countStatus(group: Array<{ status: string; _count: { _all: number } }>, status: string): number {
    return group.find((g) => g.status === status)?._count._all ?? 0;
  }

  async get(user: AuthUser, id: string) {
    const message = await this.prisma.scheduledMessage.findFirst({
      where: { id, businessId: user.businessId },
      include: {
        customer: true,
        booking: { include: { customer: true } },
        template: true,
        rule: true,
        logs: { orderBy: { createdAt: 'asc' as const } },
      },
    });
    if (!message) {
      throw new BadRequestException({ message: 'Message not found', code: 'MESSAGE_NOT_FOUND' });
    }
    return message;
  }

  async sendManual(user: AuthUser, dto: SendManualMessageDto) {
    const customer = await this.prisma.customer.findFirst({
      where: { id: dto.customerId, businessId: user.businessId },
    });
    if (!customer) {
      throw new BadRequestException({ message: 'Customer not found', code: 'CUSTOMER_NOT_FOUND' });
    }

    const booking = dto.bookingId
      ? await this.prisma.booking.findFirst({
          where: { id: dto.bookingId, businessId: user.businessId, customerId: customer.id },
        })
      : await this.prisma.booking.findFirst({
          where: { businessId: user.businessId, customerId: customer.id },
          orderBy: { departureDate: 'desc' },
        });
    if (!booking) {
      throw new BadRequestException({
        message: 'Customer has no booking to attach this message to',
        code: 'BOOKING_REQUIRED',
      });
    }

    const text = dto.text.trim();
    const template = await this.prisma.messageTemplate.create({
      data: {
        businessId: user.businessId,
        name: 'Manual Message',
        content: text,
        status: 'ACTIVE',
      },
    });

    const scheduledAt = new Date();
    const row = await this.prisma.scheduledMessage.create({
      data: {
        businessId: user.businessId,
        bookingId: booking.id,
        customerId: customer.id,
        templateId: template.id,
        messageType: 'CUSTOM',
        name: 'Manual Message',
        scheduledAt,
        status: 'SCHEDULED',
        renderedContent: text,
      },
    });

    const queues = getQueues();
    const jobId = `sm_${row.id}`;
    await queues.whatsappQueue.add(
      'send',
      { scheduledMessageId: row.id },
      {
        jobId,
        delay: 0,
        attempts: 3,
        backoff: { type: 'exponential', delay: 5000 },
        removeOnComplete: true,
        removeOnFail: false,
      },
    );
    await this.prisma.scheduledMessage.update({ where: { id: row.id }, data: { bullmqJobId: jobId } });

    await this.audit.log(user, 'MESSAGE_SENT', 'ScheduledMessage', row.id, {
      messageType: 'CUSTOM',
      customerId: customer.id,
    });
    return { id: row.id, scheduledAt };
  }

  async retry(user: AuthUser, id: string) {
    const message = await this.prisma.scheduledMessage.findFirst({
      where: { id, businessId: user.businessId },
    });
    if (!message) {
      throw new BadRequestException({ message: 'Message not found', code: 'MESSAGE_NOT_FOUND' });
    }
    if (!['FAILED', 'CANCELLED'].includes(message.status)) {
      throw new BadRequestException({
        message: 'Only failed or cancelled messages can be retried',
        code: 'NOT_RETRYABLE',
      });
    }
    const scheduledAt = new Date();
    const row = await this.prisma.scheduledMessage.update({
      where: { id },
      data: { status: 'SCHEDULED', scheduledAt, attempts: 0, lastError: null, failedAt: null },
    });

    const queues = getQueues();
    const jobId = `sm_${row.id}`;
    await queues.whatsappQueue.add(
      'send',
      { scheduledMessageId: row.id },
      {
        jobId,
        delay: 0,
        attempts: 3,
        backoff: { type: 'exponential', delay: 5000 },
        removeOnComplete: true,
        removeOnFail: false,
      },
    );
    await this.prisma.scheduledMessage.update({ where: { id }, data: { bullmqJobId: jobId } });

    await this.audit.log(user, 'MESSAGE_RETRIED', 'ScheduledMessage', id, {
      messageType: row.messageType,
    });
    return { retried: true, scheduledAt, jobId };
  }
}