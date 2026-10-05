import { Body, Controller, Delete, Get, Param, Patch, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { AuthUser, CurrentUser } from '../common/current-user.decorator';
import { Permission } from '../common/permissions';
import { RequirePermissions } from '../common/permissions.decorator';
import { AutomationService } from './automation.service';
import { CreateRuleDto } from './dto/create-rule.dto';
import { UpdateRuleDto } from './dto/update-rule.dto';

@ApiTags('automation')
@ApiBearerAuth()
@Controller('automation')
export class AutomationController {
  constructor(private readonly automationService: AutomationService) {}

  @Get('rules')
  @RequirePermissions(Permission.AUTOMATION_VIEW)
  list(@CurrentUser() user: AuthUser) {
    return this.automationService.listRules(user);
  }

  @Get('rules/:id')
  @RequirePermissions(Permission.AUTOMATION_VIEW)
  getRule(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.automationService.getRule(user, id);
  }

  @Post('rules')
  @RequirePermissions(Permission.AUTOMATION_MANAGE)
  createRule(@CurrentUser() user: AuthUser, @Body() dto: CreateRuleDto) {
    return this.automationService.createRule(user, dto);
  }

  @Patch('rules/:id')
  @RequirePermissions(Permission.AUTOMATION_MANAGE)
  updateRule(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() dto: UpdateRuleDto) {
    return this.automationService.updateRule(user, id, dto);
  }

  @Post('rules/:id/toggle')
  @RequirePermissions(Permission.AUTOMATION_MANAGE)
  toggleRule(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.automationService.toggleRule(user, id);
  }

  @Delete('rules/:id')
  @RequirePermissions(Permission.AUTOMATION_MANAGE)
  removeRule(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.automationService.removeRule(user, id);
  }
}