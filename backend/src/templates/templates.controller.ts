import { Body, Controller, Delete, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { TemplateStatus } from '@prisma/client';
import { AuthUser, CurrentUser } from '../common/current-user.decorator';
import { Permission } from '../common/permissions';
import { RequirePermissions } from '../common/permissions.decorator';
import { CreateTemplateDto } from './dto/create-template.dto';
import { UpdateTemplateDto } from './dto/update-template.dto';
import { TemplatesService } from './templates.service';

@ApiTags('templates')
@ApiBearerAuth()
@Controller('templates')
export class TemplatesController {
  constructor(private readonly templatesService: TemplatesService) {}

  @Get()
  @RequirePermissions(Permission.TEMPLATE_VIEW)
  list(
    @CurrentUser() user: AuthUser,
    @Query() query: { page?: number; limit?: number; search?: string; category?: string; status?: string },
  ) {
    return this.templatesService.list(user, query);
  }

  @Get(':id')
  @RequirePermissions(Permission.TEMPLATE_VIEW)
  get(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.templatesService.get(user, id);
  }

  @Post()
  @RequirePermissions(Permission.TEMPLATE_MANAGE)
  create(@CurrentUser() user: AuthUser, @Body() dto: CreateTemplateDto) {
    return this.templatesService.create(user, dto);
  }

  @Patch(':id')
  @RequirePermissions(Permission.TEMPLATE_MANAGE)
  update(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() dto: UpdateTemplateDto) {
    return this.templatesService.update(user, id, dto);
  }

  @Patch(':id/status/:status')
  @RequirePermissions(Permission.TEMPLATE_MANAGE)
  setStatus(@CurrentUser() user: AuthUser, @Param('id') id: string, @Param('status') status: TemplateStatus) {
    return this.templatesService.toggleStatus(user, id, status);
  }

  @Delete(':id')
  @RequirePermissions(Permission.TEMPLATE_MANAGE)
  remove(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.templatesService.remove(user, id);
  }
}