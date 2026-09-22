import { Body, Controller, Delete, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Role, TemplateStatus } from '@prisma/client';
import { AuthUser, CurrentUser } from '../common/current-user.decorator';
import { Roles } from '../common/roles.decorator';
import { CreateTemplateDto } from './dto/create-template.dto';
import { UpdateTemplateDto } from './dto/update-template.dto';
import { TemplatesService } from './templates.service';

@ApiTags('templates')
@ApiBearerAuth()
@Controller('templates')
export class TemplatesController {
  constructor(private readonly templatesService: TemplatesService) {}

  @Get()
  list(
    @CurrentUser() user: AuthUser,
    @Query() query: { page?: number; limit?: number; search?: string; category?: string; status?: string },
  ) {
    return this.templatesService.list(user, query);
  }

  @Get(':id')
  get(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.templatesService.get(user, id);
  }

  @Post()
  @Roles(Role.ADMIN, Role.SUPER_ADMIN)
  create(@CurrentUser() user: AuthUser, @Body() dto: CreateTemplateDto) {
    return this.templatesService.create(user, dto);
  }

  @Patch(':id')
  @Roles(Role.ADMIN, Role.SUPER_ADMIN)
  update(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() dto: UpdateTemplateDto) {
    return this.templatesService.update(user, id, dto);
  }

  @Patch(':id/status/:status')
  @Roles(Role.ADMIN, Role.SUPER_ADMIN)
  setStatus(@CurrentUser() user: AuthUser, @Param('id') id: string, @Param('status') status: TemplateStatus) {
    return this.templatesService.toggleStatus(user, id, status);
  }

  @Delete(':id')
  @Roles(Role.ADMIN, Role.SUPER_ADMIN)
  remove(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.templatesService.remove(user, id);
  }
}