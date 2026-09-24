import { BadRequestException, Body, Controller, Get, Patch } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { AuthUser, CurrentUser } from '../common/current-user.decorator';
import { Roles } from '../common/roles.decorator';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { AutomationService, NotificationFlagName } from '../automation/automation.service';
import { UpdateSettingsDto } from './dto/update-settings.dto';
import { Role } from '@prisma/client';

const NOTIFICATION_FLAGS: NotificationFlagName[] = [
  'notifyConfirmation',
  'notify48h',
  'notify24h',
  'notifyJourneyDay',
  'notifyCancellation',
];

@ApiTags('settings')
@ApiBearerAuth()
@Controller('settings')
export class SettingsController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly automation: AutomationService,
  ) {}

  @Get()
  async get(@CurrentUser() user: AuthUser) {
    const [business, setting, me, whatsappAccount] = await Promise.all([
      this.prisma.business.findUnique({ where: { id: user.businessId } }),
      this.prisma.businessSetting.findUnique({ where: { businessId: user.businessId } }),
      this.prisma.user.findUnique({
        where: { id: user.id },
        select: { id: true, name: true, email: true, phone: true, role: true },
      }),
      this.prisma.whatsAppAccount.findFirst({
        where: { businessId: user.businessId },
        select: {
          id: true,
          phoneNumberId: true,
          displayPhoneNumber: true,
          status: true,
        },
      }),
    ]);
    return {
      profile: me,
      business: {
        id: business?.id,
        name: business?.name,
        email: business?.email,
        phone: business?.phone,
        logo: business?.logo,
        timezone: business?.timezone,
        currency: business?.currency,
      },
      preferences: setting,
      whatsapp: whatsappAccount ?? null,
    };
  }

  @Patch()
  @Roles(Role.ADMIN, Role.SUPER_ADMIN)
  async update(@CurrentUser() user: AuthUser, @Body() dto: UpdateSettingsDto) {
    const [, setting] = await Promise.all([
      this.prisma.business.update({
        where: { id: user.businessId },
        data: {
          ...(dto.businessName !== undefined ? { name: dto.businessName } : {}),
          ...(dto.email !== undefined ? { email: dto.email } : {}),
          ...(dto.phone !== undefined ? { phone: dto.phone } : {}),
          ...(dto.timezone !== undefined ? { timezone: dto.timezone } : {}),
          ...(dto.currency !== undefined ? { currency: dto.currency } : {}),
          ...(dto.logo !== undefined ? { logo: dto.logo } : {}),
        },
      }),
      this.prisma.businessSetting.upsert({
        where: { businessId: user.businessId },
        create: {
          businessId: user.businessId,
          ...(dto.timezone !== undefined ? { timezone: dto.timezone } : {}),
          ...(dto.currency !== undefined ? { currency: dto.currency } : {}),
          notifyConfirmation: dto.notifyConfirmation ?? true,
          notify48h: dto.notify48h ?? true,
          notify24h: dto.notify24h ?? true,
          notifyJourneyDay: dto.notifyJourneyDay ?? true,
          notifyCancellation: dto.notifyCancellation ?? true,
          ...(dto.gstEnabled !== undefined ? { gstEnabled: dto.gstEnabled } : {}),
          ...(dto.gstRate !== undefined ? { gstRate: dto.gstRate } : {}),
          ...(dto.gstin !== undefined ? { gstin: dto.gstin } : {}),
          ...(dto.invoicePrefix !== undefined ? { invoicePrefix: dto.invoicePrefix } : {}),
          ...(dto.nextInvoiceNo !== undefined ? { nextInvoiceNo: dto.nextInvoiceNo } : {}),
        },
        update: {
          ...(dto.timezone !== undefined ? { timezone: dto.timezone } : {}),
          ...(dto.currency !== undefined ? { currency: dto.currency } : {}),
          notifyConfirmation: dto.notifyConfirmation,
          notify48h: dto.notify48h,
          notify24h: dto.notify24h,
          notifyJourneyDay: dto.notifyJourneyDay,
          notifyCancellation: dto.notifyCancellation,
          ...(dto.gstEnabled !== undefined ? { gstEnabled: dto.gstEnabled } : {}),
          ...(dto.gstRate !== undefined ? { gstRate: dto.gstRate } : {}),
          ...(dto.gstin !== undefined ? { gstin: dto.gstin } : {}),
          ...(dto.invoicePrefix !== undefined ? { invoicePrefix: dto.invoicePrefix } : {}),
          ...(dto.nextInvoiceNo !== undefined ? { nextInvoiceNo: dto.nextInvoiceNo } : {}),
        },
      }),
    ]);
    await this.audit.log(user, 'SETTINGS_UPDATED', 'Business', user.businessId, { fields: Object.keys(dto) });

    // When a notification toggle is turned OFF, cancel any pending scheduled
    // messages of that type so the setting takes effect immediately.
    const turnedOff: Partial<Record<NotificationFlagName, boolean>> = {};
    for (const flag of NOTIFICATION_FLAGS) {
      if (dto[flag] === false) turnedOff[flag] = false;
    }
    if (Object.keys(turnedOff).length > 0) {
      await this.automation.applyNotificationFlags(user.businessId, turnedOff);
    }

    return { updated: true };
  }
}