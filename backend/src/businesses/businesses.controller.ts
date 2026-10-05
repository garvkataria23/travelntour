import { Body, Controller, Get, Patch } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { AuthUser, CurrentUser } from '../common/current-user.decorator';
import { Permission } from '../common/permissions';
import { RequirePermissions } from '../common/permissions.decorator';
import { UpdateBusinessDto } from './dto/update-business.dto';
import { BusinessesService } from './businesses.service';

@ApiTags('businesses')
@ApiBearerAuth()
@Controller('business')
export class BusinessesController {
  // PrismaService and AuditService were injected and never used here; the service layer owns both.
  constructor(private readonly businessesService: BusinessesService) {}

  @Get()
  @RequirePermissions(Permission.SETTINGS_VIEW)
  profile(@CurrentUser() user: AuthUser) {
    return this.businessesService.profile(user.businessId);
  }

  @Patch()
  @RequirePermissions(Permission.BUSINESS_MANAGE)
  update(@CurrentUser() user: AuthUser, @Body() dto: UpdateBusinessDto) {
    return this.businessesService.update(user, dto);
  }
}