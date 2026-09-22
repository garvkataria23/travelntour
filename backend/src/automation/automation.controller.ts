import { Body, Controller, Delete, Get, Param, Patch, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Role } from '@prisma/client';
import { AuthUser, CurrentUser } from '../common/current-user.decorator';
import { Roles } from '../common/roles.decorator';
import { AutomationService } from './automation.service';
import { CreateRuleDto } from './dto/create-rule.dto';
import { UpdateRuleDto } from './dto/update-rule.dto';

@ApiTags('automation')
@ApiBearerAuth()
@Controller('automation')
export class AutomationController {
  constructor(private readonly automationService: AutomationService) {}

  @Get('rules')
  list(@CurrentUser() user: AuthUser) {
    return this.automationService.listRules(user);
  }

  @Get('rules/:id')
  getRule(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.automationService.getRule(user, id);
  }

  @Post('rules')
  @Roles(Role.ADMIN, Role.SUPER_ADMIN)
  createRule(@CurrentUser() user: AuthUser, @Body() dto: CreateRuleDto) {
    return this.automationService.createRule(user, dto);
  }

  @Patch('rules/:id')
  @Roles(Role.ADMIN, Role.SUPER_ADMIN)
  updateRule(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() dto: UpdateRuleDto) {
    return this.automationService.updateRule(user, id, dto);
  }

  @Post('rules/:id/toggle')
  @Roles(Role.ADMIN, Role.SUPER_ADMIN)
  toggleRule(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.automationService.toggleRule(user, id);
  }

  @Delete('rules/:id')
  @Roles(Role.ADMIN, Role.SUPER_ADMIN)
  removeRule(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.automationService.removeRule(user, id);
  }
}