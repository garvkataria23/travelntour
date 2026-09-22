import { Injectable, Logger, OnApplicationShutdown, OnModuleInit } from '@nestjs/common';
import { Job, Worker } from 'bullmq';
import { MessageStatus, MessageType } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { WhatsAppApiError, WhatsAppService } from './whatsapp.service';
import { MAX_SEND_ATTEMPTS, RETRYABLE_ERROR_CODES, WHATSAPP_SEND_QUEUE } from '../queue/queue.module';
import { TemplatesService } from '../templates/templates.service';
import { templateBodyValues } from '../templates/render.util';
import { bookingTemplateContext } from '../automation/context.util';

interface SendJobPayload {
  scheduledMessageId: string;
}

@Injectable()
export class WhatsAppSendWorker implements OnModuleInit, OnApplicationShutdown {
  private readonly logger = new Logger(WhatsAppSendWorker.name);
  private worker?: Worker;

  constructor(
    private readonly prisma: PrismaService,
    private readonly whatsapp: WhatsAppService,
    private readonly templates: TemplatesService,
  ) {}

  onModuleInit() {
    const connection = { url: process.env.REDIS_URL || 'redis://localhost:6379' };
    this.worker = new Worker(
      WHATSAPP_SEND_QUEUE,
      async (job) => this.process(job),
      {
        connection,
        concurrency: 5,
        lockDuration: 30000,
      },
    );
    this.worker.on('failed', (job, err) => {
      this.logger.error(`Send job failed for scheduled message ${job?.data?.scheduledMessageId}: ${err.message}`);
    });
    this.worker.on('error', (err) => {
      this.logger.error(`WhatsApp send worker error: ${err.message}`);
    });
    this.logger.log('WhatsApp send worker started');
  }

  async onApplicationShutdown() {
    await this.worker?.close();
  }

  private async process(job: Job<SendJobPayload>) {
    const { scheduledMessageId } = job.data;
    const message = await this.prisma.scheduledMessage.findUnique({
      where: { id: scheduledMessageId },
      include: {
        booking: {
          include: {
            customer: true,
            business: true,
          },
        },
        template: true,
        rule: true,
      },
    });
    if (!message) return;

    // A message cancelled or already handled must not be sent.
    if (message.status !== 'SCHEDULED' && message.status !== 'PROCESSING') return;

    await this.prisma.scheduledMessage.update({
      where: { id: message.id },
      data: { status: 'PROCESSING' },
    });

    const context = bookingTemplateContext(message.booking, message.booking.customer, message.booking.business.timezone);
    const rendered = this.templates.render(message.template, context);

    try {
      const templateName =
        message.template.whatsappTemplateName?.trim() ||
        message.template.name.toLowerCase().replace(/[^a-z0-9]+/g, '_');
      const result = await this.whatsapp.sendTemplate({
        to: message.booking.customer.phone,
        templateName,
        language: message.template.language || 'en',
        bodyVariables: templateBodyValues(message.template.variables, context),
      });

      await this.prisma.scheduledMessage.update({
        where: { id: message.id },
        data: {
          status: 'SENT',
          sentAt: new Date(),
          attempts: { increment: 1 },
          waMessageId: result.waMessageId,
          renderedContent: rendered,
          lastError: null,
        },
      });

      await this.logMessage(message.id, message.businessId, message.bookingId, message.customerId, message.messageType, 'SENT', message, rendered, result.waMessageId);
    } catch (error) {
      const wErr = error instanceof WhatsAppApiError ? error : new WhatsAppApiError(
        'UNKNOWN_ERROR',
        error instanceof Error ? error.message : String(error),
        true,
      );
      const attemptsNow = message.attempts + 1;
      const finalAttempt = (job.attemptsMade + 1) >= Math.max(job.opts.attempts ?? 1, 1);
      const canRetry = wErr.retryable && RETRYABLE_ERROR_CODES.includes(wErr.code) && attemptsNow < MAX_SEND_ATTEMPTS && !finalAttempt;

      await this.prisma.scheduledMessage.update({
        where: { id: message.id },
        data: {
          attempts: attemptsNow,
          lastError: wErr.message,
          ...(canRetry ? {} : { status: 'FAILED' as MessageStatus, failedAt: new Date() }),
        },
      });

      if (!canRetry) {
        await this.logMessage(message.id, message.businessId, message.bookingId, message.customerId, message.messageType, 'FAILED', message, rendered, undefined, wErr.message, wErr.code);
        return;
      }
      throw wErr; // trigger BullMQ retry with backoff
    }
  }

  private async logMessage(
    scheduledMessageId: string,
    businessId: string,
    bookingId: string,
    customerId: string,
    messageType: MessageType,
    status: MessageStatus,
    message: { template: { whatsappTemplateName: string | null; name: string }; booking: { customer: { phone: string } } },
    content?: string,
    waMessageId?: string,
    errorMessage?: string,
    errorCode?: string,
  ) {
    const now = new Date();
    await this.prisma.messageLog.create({
      data: {
        businessId,
        scheduledMessageId,
        bookingId,
        customerId,
        direction: 'OUTBOUND',
        messageType,
        status,
        toPhone: message.booking.customer.phone,
        templateName: message.template.whatsappTemplateName || message.template.name,
        content,
        waMessageId,
        errorMessage,
        errorCode,
        ...(status === 'SENT' ? { sentAt: now } : {}),
      },
    });
  }
}