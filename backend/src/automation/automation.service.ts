import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { AutomationRule, Booking, Customer, MessageType } from '@prisma/client';
import { Prisma } from '@prisma/client';
import { AuditService } from '../audit/audit.service';
import { AuthUser } from '../common/current-user.decorator';
import { paginationMeta } from '../common/pagination';
import { PrismaService } from '../prisma/prisma.service';
import { getQueues } from '../queue/queue.module';
import { CreateRuleDto } from './dto/create-rule.dto';
import { UpdateRuleDto } from './dto/update-rule.dto';

type Tx = Prisma.TransactionClient;

export interface PendingMessage {
  id: string;
  scheduledAt: Date;
}

export interface SchedulingResult {
  saved: PendingMessage[];
  jobIdsToCancel: string[];
}

const MESSAGE_TYPE_NAMES: Record<MessageType, string> = {
  BOOKING_CONFIRMATION: 'Booking Confirmation',
  REMINDER_48H: '48h Reminder',
  REMINDER_24H: '24h Reminder',
  JOURNEY_DAY: 'Journey Day Reminder',
  BOOKING_CANCELLATION: 'Booking Cancellation',
  CUSTOM: 'Custom Message',
};

const SENT_STATUSES = ['SENT', 'DELIVERED', 'READ'];

@Injectable()
export class AutomationService {
  private readonly logger = new Logger(AutomationService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  // ------------------------------------------------------------------
  // Time calculation
  // ------------------------------------------------------------------

  /**
   * Computes the exact scheduled send time for a rule vs. a booking.
   * Returns null when the message must NOT be scheduled (retroactive).
   */
  computeScheduledAt(
    rule: Pick<AutomationRule, 'triggerType' | 'offsetMinutes'>,
    booking: Pick<Booking, 'departureDate'>,
    now = new Date(),
  ): Date | null {
    if (rule.triggerType === 'BOOKING_CREATED') {
      const scheduled = new Date(now.getTime() + rule.offsetMinutes * 60000);
      if (scheduled <= now) {
        // Only immediate confirmations may fire in the past.
        return rule.offsetMinutes <= 0 ? new Date(now.getTime() + 300) : null;
      }
      return scheduled;
    }
    if (rule.triggerType === 'BOOKING_CANCELLED') {
      return new Date(now.getTime() + Math.max(0, rule.offsetMinutes) * 60000);
    }
    // JOURNEY_DATE
    const scheduled = new Date(booking.departureDate.getTime() + rule.offsetMinutes * 60000);
    if (scheduled <= now) return null; // never send retroactive reminders
    return scheduled;
  }

  // ------------------------------------------------------------------
  // Scheduled message computation + persistence (inside transactions)
  // ------------------------------------------------------------------

  /**
   * Computes which scheduled messages should exist for a booking.
   * Rules that already produced a SENT/DELIVERED/READ message are skipped
   * (e.g. the confirmation must not re-send on an edit).
   */
  async computeMessagesForBooking(
    tx: Tx,
    booking: Booking,
    customer: Customer,
    now = new Date(),
  ): Promise<Array<{ data: Prisma.ScheduledMessageUncheckedCreateInput; scheduledAt: Date }>> {
    const rules = await tx.automationRule.findMany({
      where: { businessId: booking.businessId, active: true },
      orderBy: { createdAt: 'asc' },
    });

    const existing = await tx.scheduledMessage.findMany({
      where: { bookingId: booking.id },
      select: { automationRuleId: true, status: true },
    });
    const deliveredRuleIds = new Set(
      existing
        .filter((m) => m.automationRuleId && SENT_STATUSES.includes(m.status))
        .map((m) => m.automationRuleId as string),
    );

    const computed: Array<{ data: Prisma.ScheduledMessageUncheckedCreateInput; scheduledAt: Date }> = [];

    for (const rule of rules) {
      if (rule.triggerType === 'BOOKING_CANCELLED') continue; // handled separately on cancel
      if (deliveredRuleIds.has(rule.id)) continue;

      const scheduledAt = this.computeScheduledAt(rule, booking, now);
      if (!scheduledAt) continue;

      computed.push({
        data: {
          businessId: booking.businessId,
          bookingId: booking.id,
          customerId: customer.id,
          templateId: rule.templateId,
          automationRuleId: rule.id,
          messageType: rule.messageType,
          name: MESSAGE_TYPE_NAMES[rule.messageType] ?? rule.messageType,
          scheduledAt,
          status: 'SCHEDULED',
        },
        scheduledAt,
      });
    }
    return computed;
  }

  async persistMessages(
    tx: Tx,
    messages: Array<{ data: Prisma.ScheduledMessageUncheckedCreateInput; scheduledAt: Date }>,
  ): Promise<PendingMessage[]> {
    const saved: PendingMessage[] = [];
    for (const message of messages) {
      const row = await tx.scheduledMessage.create({
        data: { ...message.data },
      });
      saved.push({ id: row.id, scheduledAt: row.scheduledAt });
    }
    return saved;
  }

  /**
   * Compute + persist scheduled messages for a booking inside a
   * caller-provided transaction. Enqueueing must happen AFTER commit.
   */
  async computeAndPersistInTx(
    tx: Tx,
    booking: Booking,
    customer: Customer,
    now = new Date(),
  ): Promise<PendingMessage[]> {
    const messages = await this.computeMessagesForBooking(tx, booking, customer, now);
    return this.persistMessages(tx, messages);
  }

  async cancelPendingMessages(tx: Tx, bookingId: string): Promise<string[]> {
    const pending = await tx.scheduledMessage.findMany({
      where: { bookingId, status: { in: ['SCHEDULED', 'PROCESSING', 'FAILED'] } },
      select: { id: true, bullmqJobId: true },
    });
    if (pending.length === 0) return [];
    const jobIds = pending
      .map((m) => m.bullmqJobId)
      .filter((id): id is string => Boolean(id));
    await tx.scheduledMessage.updateMany({
      where: { id: { in: pending.map((m) => m.id) } },
      data: { status: 'CANCELLED', bullmqJobId: null },
    });
    return jobIds;
  }

  // ------------------------------------------------------------------
  // Queue enqueueing (AFTER the transaction commits)
  // ------------------------------------------------------------------

  async enqueueMessages(saved: PendingMessage[]) {
    const queues = getQueues();
    const jobs: Array<{ scheduledMessageId: string; jobId: string; delayMs: number }> = [];
    for (const message of saved) {
      const jobId = `sm_${message.id}`;
      const delayMs = Math.max(0, message.scheduledAt.getTime() - Date.now());
      await queues.whatsappQueue.add(
        'send',
        { scheduledMessageId: message.id },
        {
          jobId,
          delay: delayMs,
          attempts: 3,
          backoff: { type: 'exponential', delay: 5000 },
          removeOnComplete: true,
          removeOnFail: false,
        },
      );
      await this.prisma.scheduledMessage.update({
        where: { id: message.id },
        data: { bullmqJobId: jobId },
      });
      jobs.push({ scheduledMessageId: message.id, jobId, delayMs });
    }
    return jobs;
  }

  async removeJobs(jobIds: string[]) {
    if (jobIds.length === 0) return;
    const queues = getQueues();
    for (const jobId of jobIds) {
      await queues.whatsappQueue.remove(jobId).catch(() => undefined);
    }
  }

  // ------------------------------------------------------------------
  // Booking lifecycle orchestration
  // ------------------------------------------------------------------

  /** On booking create: compute + persist + enqueue inside a transaction. */
  async syncForBooking(booking: Booking, customer: Customer, now = new Date()) {
    const txResult = await this.prisma.$transaction(async (tx) => {
      const saved = await this.computeAndPersistInTx(tx, booking, customer, now);
      return { saved };
    });
    const jobs = await this.enqueueMessages(txResult.saved);
    return { saved: txResult.saved, jobs };
  }

  /** On booking update (reschedule): cancel old pending, compute new, persist. */
  async syncForBookingUpdate(result: { booking: Booking; customer: Customer }) {
    const txResult = await this.prisma.$transaction(async (tx) => {
      const jobIdsToCancel = await this.cancelPendingMessages(tx, result.booking.id);
      const saved = await this.computeAndPersistInTx(tx, result.booking, result.customer);
      return { saved, jobIdsToCancel };
    });
    await this.removeJobs(txResult.jobIdsToCancel);
    const jobs = await this.enqueueMessages(txResult.saved);
    return { saved: txResult.saved, jobs };
  }

  /** On booking cancel: cancel all future pending reminders and return removed jobs. */
  async syncForBookingCancel(bookingId: string) {
    const txResult = await this.prisma.$transaction(async (tx) => {
      const jobIdsToCancel = await this.cancelPendingMessages(tx, bookingId);
      return { jobIdsToCancel };
    });
    await this.removeJobs(txResult.jobIdsToCancel);
    return { jobIdsToCancel: txResult.jobIdsToCancel };
  }

  /** On booking cancel: schedule (and send) the cancellation template. */
  async scheduleCancellationMessage(booking: Booking, customer: Customer) {
    const created = await this.prisma.$transaction(async (tx) => {
      const rule = await tx.automationRule.findFirst({
        where: { businessId: booking.businessId, active: true, triggerType: 'BOOKING_CANCELLED' },
      });
      if (!rule) return null;
      const scheduledAt = new Date(Date.now() + Math.max(0, rule.offsetMinutes) * 60000);
      return tx.scheduledMessage.create({
        data: {
          businessId: booking.businessId,
          bookingId: booking.id,
          customerId: customer.id,
          templateId: rule.templateId,
          automationRuleId: rule.id,
          messageType: 'BOOKING_CANCELLATION',
          name: 'Booking Cancellation',
          scheduledAt,
          status: 'SCHEDULED',
        },
      });
    });
    if (created) {
      const jobs = await this.enqueueMessages([{ id: created.id, scheduledAt: created.scheduledAt }]);
      return { message: created, jobs };
    }
    return null;
  }

  // ------------------------------------------------------------------
  // Rules management
  // ------------------------------------------------------------------

  async listRules(user: AuthUser) {
    const rules = await this.prisma.automationRule.findMany({
      where: { businessId: user.businessId },
      orderBy: { createdAt: 'asc' },
      include: { template: { select: { id: true, name: true, content: true, whatsappTemplateName: true } } },
    });
    const activeCount = rules.filter((r) => r.active).length;
    const total = await this.prisma.scheduledMessage.count({ where: { businessId: user.businessId } });
    const ok = await this.prisma.scheduledMessage.count({
      where: { businessId: user.businessId, status: { in: ['SENT', 'DELIVERED', 'READ'] } },
    });
    const failed = await this.prisma.scheduledMessage.count({
      where: { businessId: user.businessId, status: 'FAILED' },
    });
    return {
      items: rules,
      stats: {
        activeRules: activeCount,
        inactiveRules: rules.length - activeCount,
        messagesSent: total,
        successRate: total > 0 ? Math.round((ok / total) * 100) : 0,
        failed,
      },
    };
  }

  async getRule(user: AuthUser, id: string) {
    const rule = await this.prisma.automationRule.findFirst({
      where: { id, businessId: user.businessId },
      include: { template: true },
    });
    if (!rule) throw new BadRequestException({ message: 'Automation rule not found', code: 'RULE_NOT_FOUND' });
    return rule;
  }

  async createRule(user: AuthUser, dto: CreateRuleDto) {
    const template = await this.prisma.messageTemplate.findFirst({
      where: { id: dto.templateId, businessId: user.businessId },
    });
    if (!template) {
      throw new BadRequestException({ message: 'Template not found', code: 'TEMPLATE_NOT_FOUND' });
    }
    const existing = await this.prisma.automationRule.findFirst({
      where: { businessId: user.businessId, triggerType: dto.triggerType, messageType: dto.messageType },
    });
    if (existing) {
      throw new BadRequestException({
        message: 'A rule for this trigger and message type already exists',
        code: 'RULE_EXISTS',
      });
    }
    const rule = await this.prisma.automationRule.create({
      data: {
        businessId: user.businessId,
        name: dto.name,
        description: dto.description,
        triggerType: dto.triggerType,
        messageType: dto.messageType,
        offsetMinutes: dto.offsetMinutes,
        templateId: dto.templateId,
        active: dto.active ?? true,
      },
    });
    await this.audit.log(user, 'RULE_CREATED', 'AutomationRule', rule.id, { name: rule.name });
    return rule;
  }

  async updateRule(user: AuthUser, id: string, dto: UpdateRuleDto) {
    const existing = await this.prisma.automationRule.findFirst({
      where: { id, businessId: user.businessId },
    });
    if (!existing) throw new BadRequestException({ message: 'Automation rule not found', code: 'RULE_NOT_FOUND' });
    const data: Prisma.AutomationRuleUpdateInput = {};
    if (dto.name !== undefined) data.name = dto.name;
    if (dto.description !== undefined) data.description = dto.description;
    if (dto.offsetMinutes !== undefined) data.offsetMinutes = dto.offsetMinutes;
    if (dto.active !== undefined) data.active = dto.active;
    if (dto.templateId !== undefined) {
      const template = await this.prisma.messageTemplate.findFirst({
        where: { id: dto.templateId, businessId: user.businessId },
      });
      if (!template) throw new BadRequestException({ message: 'Template not found', code: 'TEMPLATE_NOT_FOUND' });
      data.template = { connect: { id: dto.templateId } };
    }
    const rule = await this.prisma.automationRule.update({ where: { id }, data });
    await this.audit.log(user, 'RULE_UPDATED', 'AutomationRule', rule.id, { fields: Object.keys(dto) });
    return rule;
  }

  async toggleRule(user: AuthUser, id: string) {
    const existing = await this.prisma.automationRule.findFirst({
      where: { id, businessId: user.businessId },
    });
    if (!existing) throw new BadRequestException({ message: 'Automation rule not found', code: 'RULE_NOT_FOUND' });
    const rule = await this.prisma.automationRule.update({
      where: { id },
      data: { active: !existing.active },
    });
    await this.audit.log(user, 'RULE_TOGGLED', 'AutomationRule', rule.id, { active: rule.active });
    return rule;
  }

  async removeRule(user: AuthUser, id: string) {
    const existing = await this.prisma.automationRule.findFirst({ where: { id, businessId: user.businessId } });
    if (!existing) throw new BadRequestException({ message: 'Automation rule not found', code: 'RULE_NOT_FOUND' });
    await this.prisma.automationRule.delete({ where: { id } });
    await this.audit.log(user, 'RULE_DELETED', 'AutomationRule', id);
    return { deleted: true };
  }
}