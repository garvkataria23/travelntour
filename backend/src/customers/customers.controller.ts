import { Body, Controller, Delete, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { AuthUser, CurrentUser } from '../common/current-user.decorator';
import { Permission } from '../common/permissions';
import { RequirePermissions } from '../common/permissions.decorator';
import { CreateCustomerDto } from './dto/create-customer.dto';
import { UpdateCustomerDto } from './dto/update-customer.dto';
import { CustomersService } from './customers.service';

@ApiTags('customers')
@ApiBearerAuth()
@Controller('customers')
export class CustomersController {
  constructor(private readonly customersService: CustomersService) {}

  @Get()
  @RequirePermissions(Permission.CUSTOMER_VIEW)
  list(
    @CurrentUser() user: AuthUser,
    @Query()
    query: {
      page?: number;
      limit?: number;
      search?: string;
      status?: string;
      sort?: string;
      order?: 'asc' | 'desc';
    },
  ) {
    return this.customersService.list(user, query);
  }

  @Get('stats')
  @RequirePermissions(Permission.CUSTOMER_VIEW)
  stats(@CurrentUser() user: AuthUser) {
    return this.customersService.stats(user);
  }

  @Get(':id')
  @RequirePermissions(Permission.CUSTOMER_VIEW)
  get(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.customersService.get(user, id);
  }

  @Post()
  @RequirePermissions(Permission.CUSTOMER_CREATE)
  create(@CurrentUser() user: AuthUser, @Body() dto: CreateCustomerDto) {
    return this.customersService.create(user, dto);
  }

  @Patch(':id')
  @RequirePermissions(Permission.CUSTOMER_EDIT)
  update(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() dto: UpdateCustomerDto) {
    return this.customersService.update(user, id, dto);
  }

  // Hard delete, cascading to that customer's bookings. Previously ungated: any authenticated
  // user could delete a customer. Now MANAGER and above.
  @Delete(':id')
  @RequirePermissions(Permission.CUSTOMER_DELETE)
  remove(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.customersService.remove(user, id);
  }
}