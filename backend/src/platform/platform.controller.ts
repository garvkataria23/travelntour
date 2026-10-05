import { Body, Controller, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { AuthUser, CurrentUser } from '../common/current-user.decorator';
import { Permission } from '../common/permissions';
import { RequirePermissions } from '../common/permissions.decorator';
import { CreateTenantDto, SetWhatsAppLimitDto, UpdateTenantDto, UpdateTenantStatusDto } from './dto/platform.dto';
import { PlatformService } from './platform.service';

@ApiTags('platform')
@ApiBearerAuth()
@Controller('platform')
// Every route here is platform-owner only. Tenant blocking, quota ceilings and tenant
// provisioning were previously client-side localStorage, where any browser could undo them.
@RequirePermissions(Permission.PLATFORM_TENANTS)
export class PlatformController {
  constructor(private readonly platform: PlatformService) {}

  @Get('tenants')
  listTenants(
    @CurrentUser() user: AuthUser,
    @Query() query: { search?: string; status?: string },
  ) {
    return this.platform.listTenants(user, query);
  }

  @Post('tenants')
  createTenant(@CurrentUser() user: AuthUser, @Body() dto: CreateTenantDto) {
    return this.platform.createTenant(user, dto);
  }

  @Patch('tenants/:businessId')
  @RequirePermissions(Permission.PLATFORM_TENANTS)
  updateTenant(@CurrentUser() user: AuthUser, @Param('businessId') id: string, @Body() dto: UpdateTenantDto) {
    return this.platform.updateTenant(user, id, dto);
  }

  @Patch('tenants/:businessId/status')
  @RequirePermissions(Permission.PLATFORM_TENANTS)
  setStatus(@CurrentUser() user: AuthUser, @Param('businessId') id: string, @Body() dto: UpdateTenantStatusDto) {
    return this.platform.setTenantStatus(user, id, dto);
  }

  // Separate permission from tenant management: raising a message ceiling has a direct billing
  // consequence, so it should be auditable separately from renaming a tenant.
  @Patch('tenants/:businessId/whatsapp-limit')
  @RequirePermissions(Permission.WHATSAPP_QUOTA_MANAGE)
  setWhatsAppLimit(@CurrentUser() user: AuthUser, @Param('businessId') id: string, @Body() dto: SetWhatsAppLimitDto) {
    return this.platform.setWhatsAppLimit(user, id, dto);
  }

  @Post('tenants/:businessId/deactivate')
  @RequirePermissions(Permission.PLATFORM_TENANTS)
  deactivateTenant(@CurrentUser() user: AuthUser, @Param('businessId') id: string) {
    return this.platform.deactivateTenant(user, id);
  }
}