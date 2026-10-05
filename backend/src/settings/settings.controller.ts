import { BadRequestException, Body, Controller, Get, Patch } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { AuthUser, CurrentUser } from '../common/current-user.decorator';
import { Permission, permissionsForRole, roleHas } from '../common/permissions';
import { RequirePermissions } from '../common/permissions.decorator';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { AutomationService, NotificationFlagName } from '../automation/automation.service';
import { redactSetting } from './setting-redaction';
import { UpdateSettingsDto } from './dto/update-settings.dto';

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

  /**
   * Reads the tenant's configuration.
   *
   * The `preferences` key used to be the entire `BusinessSetting` row, which handed every
   * authenticated user — including STAFF — the bank account number, IFSC/SWIFT, UPI id and GSTIN.
   * Those fields are now redacted unless the caller holds SETTINGS_VIEW_SENSITIVE, so the counter
   * role can still read notification preferences and tax configuration without being handed the
   * company's banking details.
   */
  @Get()
  @RequirePermissions(Permission.SETTINGS_VIEW)
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
      permissions: permissionsForRole(user.role),
      business: {
        id: business?.id,
        name: business?.name,
        email: business?.email,
        phone: business?.phone,
        logo: business?.logo,
        timezone: business?.timezone,
        currency: business?.currency,
      },
      preferences: setting ? redactSetting(setting, roleHas(user.role, Permission.SETTINGS_VIEW_SENSITIVE)) : null,
      whatsapp: whatsappAccount ?? null,
    };
  }

  @Patch()
  @RequirePermissions(Permission.SETTINGS_MANAGE)
  async update(@CurrentUser() user: AuthUser, @Body() dto: UpdateSettingsDto) {
    if (dto.nextInvoiceNo !== undefined) {
      const currentSetting = await this.prisma.businessSetting.findUnique({
        where: { businessId: user.businessId },
        select: { nextInvoiceNo: true },
      });
      if (currentSetting && dto.nextInvoiceNo < currentSetting.nextInvoiceNo) {
        throw new BadRequestException({
          message: `nextInvoiceNo cannot be decreased below current value (${currentSetting.nextInvoiceNo})`,
          code: 'INVOICE_NUMBER_REWIND_PROHIBITED',
        });
      }
    }

    // Wrapped in a transaction: these two writes update one logical "tenant configuration". With
    // Promise.all a failure in the second left the tenant half-configured — new logo and timezone
    // applied while the GST toggles silently kept their old values.
const [,] = await this.prisma.$transaction([
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
          ...(dto.taxLabel !== undefined ? { taxLabel: dto.taxLabel } : {}),
          ...(dto.invoicePrefix !== undefined ? { invoicePrefix: dto.invoicePrefix } : {}),
          ...(dto.nextInvoiceNo !== undefined ? { nextInvoiceNo: dto.nextInvoiceNo } : {}),
          ...(dto.bankName !== undefined ? { bankName: dto.bankName } : {}),
          ...(dto.bankAccountName !== undefined ? { bankAccountName: dto.bankAccountName } : {}),
          ...(dto.bankAccountNumber !== undefined ? { bankAccountNumber: dto.bankAccountNumber } : {}),
          ...(dto.bankIfscSwift !== undefined ? { bankIfscSwift: dto.bankIfscSwift } : {}),
          ...(dto.bankUpiId !== undefined ? { bankUpiId: dto.bankUpiId } : {}),
          ...(dto.invoiceTerms !== undefined ? { invoiceTerms: dto.invoiceTerms } : {}),
          ...(dto.invoiceNotes !== undefined ? { invoiceNotes: dto.invoiceNotes } : {}),
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
          ...(dto.taxLabel !== undefined ? { taxLabel: dto.taxLabel } : {}),
          ...(dto.invoicePrefix !== undefined ? { invoicePrefix: dto.invoicePrefix } : {}),
          ...(dto.nextInvoiceNo !== undefined ? { nextInvoiceNo: dto.nextInvoiceNo } : {}),
          ...(dto.bankName !== undefined ? { bankName: dto.bankName } : {}),
          ...(dto.bankAccountName !== undefined ? { bankAccountName: dto.bankAccountName } : {}),
          ...(dto.bankAccountNumber !== undefined ? { bankAccountNumber: dto.bankAccountNumber } : {}),
          ...(dto.bankIfscSwift !== undefined ? { bankIfscSwift: dto.bankIfscSwift } : {}),
          ...(dto.bankUpiId !== undefined ? { bankUpiId: dto.bankUpiId } : {}),
          ...(dto.invoiceTerms !== undefined ? { invoiceTerms: dto.invoiceTerms } : {}),
          ...(dto.invoiceNotes !== undefined ? { invoiceNotes: dto.invoiceNotes } : {}),
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