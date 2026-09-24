import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { MessageStatus } from '@prisma/client';
import { createHmac, timingSafeEqual } from 'crypto';
import { jsPDF } from 'jspdf';
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

      const customer = await this.prisma.customer.findFirst({
        where: { phone, status: 'ACTIVE' },
        orderBy: { createdAt: 'asc' },
      });
      const existing = await this.prisma.messageLog.findUnique({ where: { waMessageId: id } }).catch(() => null);
      if (existing) continue;
      const text = (message.text as { body?: string } | undefined)?.body;
      if (customer) {
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
      await this.replyAuto(phone);
    }
  }

  private async replyAuto(toPhone: string): Promise<void> {
    try {
      const text = 'Hi! 👋\n\nYour flight booking has been confirmed! ✈️\n\n🧾 PNR: ABC123\n✈️ Flight: AI-202\n🛫 From: Mumbai\n🛬 To: Delhi\n🗓️ Date: 25 Sep 2026\n⏱️ Time: 10:30 AM\nTerminal: 2\n\nWe wish you a safe and pleasant journey! 😊\nTeam Blue Aura Tourism';
      const textResult = await this.whatsapp.sendText({ to: toPhone, body: text });

      const pdf = this.buildExampleInvoicePdf();
      const fileName = 'Invoice-INV-2026-0001.pdf';
      await this.whatsapp.sendDocument({
        to: toPhone,
        document: pdf,
        fileName,
        caption: 'Here is your invoice INV-2026-0001. Total: Rs. 8,850.00',
      });
      this.logger.log(`Auto-replied to ${toPhone} (text ${textResult.waMessageId}, invoice attached)`);
    } catch (error) {
      this.logger.error(`Auto-reply failed for ${toPhone}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  private buildExampleInvoicePdf(): Buffer {
    const doc = new jsPDF({ unit: 'pt', format: 'a4' });
    const pageWidth = doc.internal.pageSize.getWidth();
    const margin = 48;
    doc.setFillColor(23, 78, 116);
    doc.rect(0, 0, pageWidth, 86, 'F');
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(20);
    doc.setTextColor(255, 255, 255);
    doc.text('Blue Aura Tourism', margin, 42);
    doc.text('INVOICE', pageWidth - margin, 42, { align: 'right' });
    doc.setFontSize(9);
    doc.setTextColor(220, 230, 240);
    doc.text('hello@aurashinetravels.com  \u2022  +91 88282 88282', margin, 58);
    doc.setFontSize(11);
    doc.text('Invoice # INV-2026-0001', pageWidth - margin, 58, { align: 'right' });

    const text = (t: string, x: number, yy: number, size: number, bold: boolean, color?: [number, number, number], align?: 'left' | 'right') => {
      doc.setFont('helvetica', bold ? 'bold' : 'normal');
      doc.setFontSize(size);
      doc.setTextColor(...(color || [40, 44, 52]));
      doc.text(t, x, yy, align ? { align } : undefined);
    };
    const right = (t: string, x: number, yy: number, size: number, bold: boolean, color?: [number, number, number]) => text(t, x, yy, size, bold, color, 'right');

    let y = 122;
    text('Bill To', margin, y, 10, true);
    text('Amit Sharma', margin, y + 18, 12, true);
    text('+91 90828 64488', margin, y + 34, 9, false);

    const meta: Array<[string, string]> = [
      ['Invoice Number', 'INV-2026-0001'],
      ['Invoice Date', '24 Sep 2026'],
      ['Booking PNR', 'ABC123'],
      ['Flight', 'AI-202'],
      ['Route', 'Mumbai \u2192 Delhi'],
      ['Departure', '25 Sep 2026 10:30 AM'],
    ];
    let my = 122;
    for (const [label, value] of meta) {
      text(label, pageWidth - margin - 150, my, 8, false, [120, 128, 140]);
      right(value, pageWidth - margin - 10, my, 9, false);
      my += 16;
    }

    y = 230;
    doc.setFillColor(240, 244, 248);
    doc.rect(margin, y - 14, pageWidth - margin * 2, 22, 'F');
    const cols: Array<[string, number]> = [
      ['DESCRIPTION', margin],
      ['QTY', margin + 320],
      ['UNIT PRICE', margin + 380],
      ['AMOUNT', pageWidth - margin],
    ];
    for (const [label, x] of cols) text(label, x, y, 8, true, [90, 98, 110], label === 'DESCRIPTION' ? 'left' : 'right');

    let rowY = y + 20;
    const rows: Array<[string, string, string, string]> = [['Domestic Flight Ticket (1 Pax)', '1', 'Rs. 7,500.00', 'Rs. 7,500.00']];
    for (const r of rows) {
      text(r[0], margin, rowY, 10, false);
      right(r[1], margin + 332, rowY, 10, false);
      right(r[2], margin + 392, rowY, 10, false);
      right(r[3], pageWidth - margin, rowY, 10, false);
      rowY += 26;
    }

    let ty = Math.max(rowY + 8, 320);
    const totals: Array<[string, string]> = [
      ['Subtotal', 'Rs. 7,500.00'],
      ['Discount', '- Rs. 0.00'],
      ['Tax (GST)', 'Rs. 1,350.00'],
    ];
    for (const [label, value] of totals) {
      text(label, margin + 250, ty, 9, false, [90, 98, 110]);
      right(value, pageWidth - margin, ty, 10, false);
      ty += 18;
    }
    doc.setDrawColor(23, 78, 116);
    doc.setLineWidth(1.2);
    doc.line(margin + 250, ty - 4, pageWidth - margin, ty - 4);
    text('TOTAL', margin + 250, ty + 14, 12, true);
    right('Rs. 8,850.00', pageWidth - margin, ty + 14, 13, true, [23, 78, 116]);
    text('Paid: Rs. 8,850.00', margin + 250, ty + 32, 9, false);
    right('Amount Due: Rs. 0.00', pageWidth - margin, ty + 32, 9, true);
    text('Payment Status: PAID', margin, ty + 12, 10, true);

    const fy = 792;
    doc.setDrawColor(200, 208, 216);
    doc.line(margin, fy - 24, pageWidth - margin, fy - 24);
    text('GSTIN: 27AAVCA1234A1Z5', margin, fy - 8, 8, false, [120, 128, 140]);
    right('Generated by Blue Aura Tourism  24/09/2026', pageWidth - margin, fy - 8, 8, false, [120, 128, 140]);

    return Buffer.from(doc.output('arraybuffer'));
  }
}