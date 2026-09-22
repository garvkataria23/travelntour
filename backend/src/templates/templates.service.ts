import { BadRequestException, Injectable } from '@nestjs/common';
import { MessageTemplate, TemplateCategory, TemplateStatus } from '@prisma/client';
import { AuditService } from '../audit/audit.service';
import { AuthUser } from '../common/current-user.decorator';
import { paginationMeta } from '../common/pagination';
import { PrismaService } from '../prisma/prisma.service';
import { CreateTemplateDto } from './dto/create-template.dto';
import { UpdateTemplateDto } from './dto/update-template.dto';
import { extractVariables, renderTemplateContent } from './render.util';

export interface TemplateContext {
  customer_name: string;
  pnr?: string;
  reference_number?: string;
  flight_number?: string;
  airline?: string;
  from?: string;
  from_airport?: string;
  from_city?: string;
  to?: string;
  to_airport?: string;
  to_city?: string;
  date?: string;
  time?: string;
  journey_date?: string;
  journey_time?: string;
  terminal?: string;
  amount?: string;
  currency?: string;
  airport_from?: string;
  airport_to?: string;
}

const MESSAGE_TYPE_NAMES: Record<string, string> = {
  BOOKING_CONFIRMATION: 'Booking Confirmation',
  REMINDER_48H: '48h Reminder',
  REMINDER_24H: '24h Reminder',
  JOURNEY_DAY: 'Journey Day Reminder',
  BOOKING_CANCELLATION: 'Booking Cancellation',
  CUSTOM: 'Custom Message',
};

export function messageTypeName(type: string): string {
  return MESSAGE_TYPE_NAMES[type] || type;
}

@Injectable()
export class TemplatesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async list(
    user: AuthUser,
    query: { page?: number; limit?: number; search?: string; category?: string; status?: string },
  ) {
    const page = Number(query.page) || 1;
    const limit = Number(query.limit) || 20;
    const where: Record<string, unknown> = { businessId: user.businessId };
    if (query.search) {
      where.OR = [{ name: { contains: query.search, mode: 'insensitive' as const } }];
    }
    if (query.category) {
      where.category = query.category as TemplateCategory;
    }
    if (query.status) {
      where.status = query.status as TemplateStatus;
    }

    const [items, total, deliveryStats] = await Promise.all([
      this.prisma.messageTemplate.findMany({
        where,
        orderBy: { updatedAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
        include: {
          _count: { select: { messages: true } },
        },
      }),
      this.prisma.messageTemplate.count({ where }),
      this.prisma.scheduledMessage.findMany({
        where: { businessId: user.businessId },
        select: { status: true },
      }),
    ]);

    const delivered = deliveryStats.filter((m) => m.status === 'DELIVERED' || m.status === 'READ').length;
    const totalMsgs = deliveryStats.length;
    const [activeTemplates, draftTemplates] = await Promise.all([
      this.prisma.messageTemplate.count({ where: { businessId: user.businessId, status: 'ACTIVE' } }),
      this.prisma.messageTemplate.count({ where: { businessId: user.businessId, status: 'DRAFT' } }),
    ]);

    return {
      items,
      stats: {
        activeTemplates,
        draftTemplates,
        messagesSent: totalMsgs,
        deliveryRate: totalMsgs > 0 ? Math.round((delivered / totalMsgs) * 100) : 0,
      },
      meta: paginationMeta(total, page, limit),
    };
  }

  async get(user: AuthUser, id: string) {
    const template = await this.prisma.messageTemplate.findFirst({
      where: { id, businessId: user.businessId },
      include: { _count: { select: { messages: true } } },
    });
    if (!template) {
      throw new BadRequestException({ message: 'Template not found', code: 'TEMPLATE_NOT_FOUND' });
    }
    return template;
  }

  async create(user: AuthUser, dto: CreateTemplateDto) {
    const variables = dto.variables && dto.variables.length ? dto.variables : extractVariables(dto.content);
    const created = await this.prisma.messageTemplate.create({
      data: {
        businessId: user.businessId,
        name: dto.name,
        description: dto.description,
        category: dto.category ?? TemplateCategory.GENERAL,
        content: dto.content,
        whatsappTemplateName: dto.whatsappTemplateName,
        status: dto.status ?? TemplateStatus.DRAFT,
        language: dto.language ?? 'en',
        variables,
      },
    });
    await this.audit.log(user, 'TEMPLATE_CREATED', 'MessageTemplate', created.id, { name: created.name });
    return created;
  }

  async update(user: AuthUser, id: string, dto: UpdateTemplateDto) {
    const existing = await this.prisma.messageTemplate.findFirst({
      where: { id, businessId: user.businessId },
    });
    if (!existing) {
      throw new BadRequestException({ message: 'Template not found', code: 'TEMPLATE_NOT_FOUND' });
    }
    const data: Record<string, unknown> = {};
    if (dto.name !== undefined) data.name = dto.name;
    if (dto.description !== undefined) data.description = dto.description;
    if (dto.category !== undefined) data.category = dto.category;
    if (dto.content !== undefined) {
      data.content = dto.content;
      data.variables = extractVariables(dto.content);
    }
    if (dto.whatsappTemplateName !== undefined) data.whatsappTemplateName = dto.whatsappTemplateName;
    if (dto.status !== undefined) data.status = dto.status;
    if (dto.language !== undefined) data.language = dto.language;
    if (dto.variables !== undefined) data.variables = dto.variables;

    const updated = await this.prisma.messageTemplate.update({ where: { id }, data });
    await this.audit.log(user, 'TEMPLATE_UPDATED', 'MessageTemplate', updated.id, {
      fields: Object.keys(data),
    });
    return updated;
  }

  async remove(user: AuthUser, id: string) {
    const existing = await this.prisma.messageTemplate.findFirst({
      where: { id, businessId: user.businessId },
      include: { rules: { select: { id: true } } },
    });
    if (!existing) {
      throw new BadRequestException({ message: 'Template not found', code: 'TEMPLATE_NOT_FOUND' });
    }
    if (existing.rules.length > 0) {
      throw new BadRequestException({
        message: 'This template is used by automation rules. Disconnect the rules first.',
        code: 'TEMPLATE_IN_USE',
      });
    }
    await this.prisma.messageTemplate.delete({ where: { id } });
    await this.audit.log(user, 'TEMPLATE_DELETED', 'MessageTemplate', id, { name: existing.name });
    return { deleted: true };
  }

  async toggleStatus(user: AuthUser, id: string, status: TemplateStatus) {
    return this.update(user, id, { status });
  }

  render(template: Pick<MessageTemplate, 'content'>, context: Partial<TemplateContext>): string {
    return renderTemplateContent(template.content, context);
  }
}