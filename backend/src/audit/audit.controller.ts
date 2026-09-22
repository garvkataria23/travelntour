import { Controller, Get, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Role } from '@prisma/client';
import { AuthUser, CurrentUser } from '../common/current-user.decorator';
import { Roles } from '../common/roles.decorator';
import { AuditService } from './audit.service';

@ApiTags('audit')
@ApiBearerAuth()
@Controller('audit')
@Roles(Role.ADMIN, Role.SUPER_ADMIN)
export class AuditController {
  constructor(private readonly auditService: AuditService) {}

  @Get()
  list(
    @CurrentUser() user: AuthUser,
    @Query() query: { page?: number; limit?: number; entity?: string },
  ) {
    return this.auditService.list(user.businessId, query);
  }
}