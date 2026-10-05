import { Body, Controller, Delete, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { AuthUser, CurrentUser } from '../common/current-user.decorator';
import { Permission } from '../common/permissions';
import { RequirePermissions } from '../common/permissions.decorator';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateUserDto } from './dto/update-user.dto';
import { UsersService } from './users.service';

@ApiTags('users')
@ApiBearerAuth()
@Controller('users')
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @Get()
  @RequirePermissions(Permission.USER_VIEW)
  list(@CurrentUser() user: AuthUser, @Query() query: { page?: number; limit?: number; search?: string }) {
    return this.usersService.list(user, query);
  }

  @Post()
  @RequirePermissions(Permission.USER_CREATE)
  create(@CurrentUser() user: AuthUser, @Body() dto: CreateUserDto) {
    return this.usersService.create(user, dto);
  }

  @Patch(':id')
  @RequirePermissions(Permission.USER_EDIT)
  update(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() dto: UpdateUserDto) {
    return this.usersService.update(user, id, dto);
  }

  // Previously unreachable: UsersService.remove() existed but no route exposed it, so a tenant
  // admin could deactivate nobody and had to edit a status field instead. Removing someone is a
  // distinct authority from editing them, so it gets its own permission.
  @Delete(':id')
  @RequirePermissions(Permission.USER_DELETE)
  remove(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.usersService.remove(user, id);
  }
}