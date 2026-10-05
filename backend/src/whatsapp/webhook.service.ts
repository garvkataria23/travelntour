import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { MessageStatus } from '@prisma/client';
import { createHmac, timingSafeEqual } from 'crypto';
import { PrismaService } from '../prisma/prisma.service';
import { normalizePhone } from '../common/utils';
import { WhatsAppService } from './whatsapp.service';

@Injectable()
export class WebhookService {
  private readonly logger = new Logger(WebhookService.name);
  private readonly verifyToken: string;
  private readonly webhookSecret: string;

  constructor(
    private readonly config: ConfigService,
    private readonly prisma: PrismaService,
    private readonly whatsapp: WhatsAppService,
  ) {
    // No hardcoded fallback: a published default token would let anyone complete the Meta
    // handshake against a live app. An unset token fails the handshake closed instead.
    this.verifyToken = this.config.get<string>('WHATSAPP_WEBHOOK_VERIFY_TOKEN') ?? '';
    this.webhookSecret =
      this.config.get<string>('WHATSAPP_WEBHOOK_APP_SECRET') ||
      this.config.get<string>('WHATSAPP_META_APP_SECRET') ||
      '';
  }

  isValidToken(token: string | undefined): boolean {
    if (!token || !this.verifyToken) return false;
    const a = Buffer.from(token);
    const b = Buffer.from(this.verifyToken);
    return a.length === b.length && timingSafeEqual(a, b);
  }

  /**
   * Verifies the Meta X-Hub-Signature-256 header (HMAC-SHA256 of the raw body,
   * signed with the app secret).
   *
   * This fails closed in every environment. The previous behaviour skipped verification
   * whenever no secret was configured outside production, which meant any deployment that
   * did not set NODE_ENV (pm2, systemd, hand-rolled Docker) accepted unsigned webhooks and
   * let a third party forge delivery-status events for arbitrary messages.
   */
  isValidSignature(rawBody: Buffer | undefined, signatureHeader: string | undefined): boolean {
    if (!this.webhookSecret) {
      this.logger.error(
        'WhatsApp webhook secret is not configured (WHATSAPP_WEBHOOK_APP_SECRET / WHATSAPP_META_APP_SECRET). Rejecting unsigned request.',
      );
      return false;
    }
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
          await this.processInbound(messages);
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

  private async processInbound(messages: Array<Record<string, unknown>>): Promise<void> {
    for (const message of messages) {
      const id = message.id as string | undefined;
      const fromRaw = message.from as string | undefined;
      if (!id || !fromRaw) continue;
      const phone = `+${normalizePhone(fromRaw.replace(/^\+/, ''))}`;

      const existing = await this.prisma.messageLog.findUnique({ where: { waMessageId: id } }).catch(() => null);
      if (existing) continue;

      // Identify tenant context for inbound message:
      // 1. Look for the most recent outbound message sent to this phone number
      const lastOutbound = await this.prisma.messageLog.findFirst({
        where: { toPhone: phone, direction: 'OUTBOUND' },
        orderBy: { createdAt: 'desc' },
        select: { businessId: true, customerId: true },
      });

      let businessId = lastOutbound?.businessId;
      let customerId = lastOutbound?.customerId;

      // 2. If no prior outbound message, look up single unique active customer
      if (!businessId || !customerId) {
        const candidates = await this.prisma.customer.findMany({
          where: { phone, status: 'ACTIVE' },
          select: { id: true, businessId: true },
        });
        if (candidates.length === 1) {
          businessId = candidates[0].businessId;
          customerId = candidates[0].id;
        } else if (candidates.length > 1) {
          this.logger.warn(`Ambiguous customer phone ${phone} across multiple businesses; cannot route inbound message`);
          continue;
        }
      }

      if (businessId && customerId) {
        const text = (message.text as { body?: string } | undefined)?.body;
        await this.prisma.messageLog.create({
          data: {
            businessId,
            customerId,
            direction: 'INBOUND',
            status: 'SENT',
            waMessageId: id,
            toPhone: phone,
            fromPhone: phone,
            content: text,
          },
        }).catch((err) => {
          this.logger.warn(`Failed to store inbound message ${id}: ${err.message}`);
        });
      }
    }
  }
}