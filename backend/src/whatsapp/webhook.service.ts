import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { MessageStatus } from '@prisma/client';
import { createHmac, timingSafeEqual } from 'crypto';
import { PrismaService } from '../prisma/prisma.service';
import { normalizePhone } from '../common/utils';

@Injectable()
export class WebhookService {
  private readonly verifyToken: string;
  private readonly webhookSecret: string;

  constructor(
    private readonly config: ConfigService,
    private readonly prisma: PrismaService,
  ) {
    this.verifyToken = this.config.get<string>('WHATSAPP_WEBHOOK_VERIFY_TOKEN') || 'flyconnect-verify-token';
    this.webhookSecret =
      this.config.get<string>('WHATSAPP_WEBHOOK_APP_SECRET') ||
      this.config.get<string>('WHATSAPP_META_APP_SECRET') ||
      '';
  }

  isValidToken(token: string | undefined): boolean {
    return Boolean(token && token === this.verifyToken);
  }

  /**
   * Verifies the Meta X-Hub-Signature-256 header (HMAC-SHA256 of the raw body,
   * signed with the app secret). When no secret is configured, validation is
   * skipped so local development keeps working.
   */
  isValidSignature(rawBody: Buffer | undefined, signatureHeader: string | undefined): boolean {
    if (!this.webhookSecret) return true;
    if (!rawBody || !signatureHeader) return false;
    const expected = `sha256=${createHmac('sha256', this.webhookSecret).update(rawBody).digest('hex')}`;
    const a = Buffer.from(expected);
    const b = Buffer.from(signatureHeader.trim());
    return a.length === b.length && timingSafeEqual(a, b);
  }

  async handleEvent(event: Record<string, unknown>): Promise<boolean> {
    const entries = (event.entry as Array<Record<string, unknown>>) ?? [];
    let handled = false;
    for (const entry of entries) {
      const changes = (entry.changes as Array<Record<string, unknown>>) ?? [];
      for (const change of changes) {
        const value = change.value as Record<string, unknown> | undefined;
        const statuses = (value?.statuses as Array<Record<string, unknown>>) ?? [];
        for (const status of statuses) {
          await this.processStatus(status);
          handled = true;
        }
        const messages = value?.messages as Array<Record<string, unknown>> | undefined;
        if (messages?.length && value) {
          await this.processInbound(messages, value);
          handled = true;
        }
      }
    }
    return handled;
  }

  private async processStatus(status: Record<string, unknown>): Promise<void> {
    const waMessageId = status.id as string | undefined;
    const metaStatus = (status.status as string | undefined) ?? '';
    const errorMeta = status.errors as Array<Record<string, unknown>> | undefined;

    if (!waMessageId) return;

    const log = await this.prisma.messageLog.findUnique({ where: { waMessageId } });
    if (!log) return; // Unknown message id — ignore.

    const now = new Date();
    let statusValue: MessageStatus | undefined;
    let scheduledData: Record<string, unknown> = {};

    if (metaStatus === 'sent') {
      statusValue = 'SENT';
      scheduledData = { status: 'SENT', sentAt: now };
    } else if (metaStatus === 'delivered') {
      statusValue = 'DELIVERED';
      scheduledData = { status: 'DELIVERED', deliveredAt: now, sentAt: log.sentAt ?? now };
    } else if (metaStatus === 'read') {
      statusValue = 'READ';
      scheduledData = { status: 'READ', readAt: now, deliveredAt: log.deliveredAt ?? now };
    } else if (metaStatus === 'failed') {
      const message = (errorMeta?.[0]?.message as string | undefined) ?? 'WhatsApp delivery failed';
      statusValue = 'FAILED';
      scheduledData = {
        status: 'FAILED',
        failedAt: now,
        lastError: message,
      };
    }

    if (statusValue) {
      await this.prisma.messageLog.update({
        where: { id: log.id },
        data: {
          status: statusValue,
          sentAt: statusValue === 'SENT' ? now : log.sentAt,
          deliveredAt: statusValue === 'DELIVERED' || statusValue === 'READ' ? log.deliveredAt ?? now : undefined,
          readAt: statusValue === 'READ' ? now : undefined,
          errorCode: statusValue === 'FAILED' ? (errorMeta?.[0]?.code ? String(errorMeta[0].code) : undefined) : undefined,
          errorMessage: statusValue === 'FAILED' ? (errorMeta?.[0]?.message as string | undefined) : undefined,
        },
      });

      if (log.scheduledMessageId) {
        await this.prisma.scheduledMessage.update({
          where: { id: log.scheduledMessageId },
          data: {
            ...scheduledData,
            deliveredAt:
              statusValue === 'DELIVERED' || statusValue === 'READ'
                ? (scheduledData.deliveredAt as Date)
                : undefined,
          },
        });
      }
    }
  }

  private async processInbound(
    messages: Array<Record<string, unknown>>,
    value: Record<string, unknown>,
  ): Promise<void> {
    const fromRaw = value.from as string | undefined;
    if (!fromRaw) return;
    const phone = `+${normalizePhone(fromRaw.replace(/^\+/, ''))}`;

    const customer = await this.prisma.customer.findFirst({
      where: { phone, status: 'ACTIVE' },
      orderBy: { createdAt: 'asc' },
    });
    if (!customer) return;

    for (const message of messages) {
      const id = message.id as string | undefined;
      if (!id) continue;
      const existing = await this.prisma.messageLog.findUnique({ where: { waMessageId: id } }).catch(() => null);
      if (existing) continue;
      const text = (message.text as { body?: string } | undefined)?.body;
      await this.prisma.messageLog.create({
        data: {
          businessId: customer.businessId,
          customerId: customer.id,
          direction: 'INBOUND',
          status: 'SENT',
          waMessageId: id,
          toPhone: phone,
          fromPhone: phone,
          content: text,
        },
      }).catch(() => undefined);
    }
  }
}