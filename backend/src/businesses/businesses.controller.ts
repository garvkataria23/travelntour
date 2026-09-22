import { BadRequestException, Body, Controller, Get, Patch } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Role } from '@prisma/client';
import { AuditService } from '../audit/audit.service';
import { AuthUser, CurrentUser } from '../common/current-user.decorator';
import { Roles } from '../common/roles.decorator';
import { PrismaService } from '../prisma/prisma.service';
import { UpdateBusinessDto } from './dto/update-business.dto';
import { BusinessesService } from './businesses.service';

@ApiTags('businesses')
@ApiBearerAuth()
@Roles(Role.ADMIN, Role.SUPER_ADMIN)
@Controller('business')
export class BusinessesController {
  constructor(
    private readonly businessesService: BusinessesService,
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  @Get()
  profile(@CurrentUser() user: AuthUser) {
    return this.businessesService.profile(user.businessId);
  }

  @Patch()
  update(@CurrentUser() user: AuthUser, @Body() dto: UpdateBusinessDto) {
    return this.businessesService.update(user, dto);
  }
}