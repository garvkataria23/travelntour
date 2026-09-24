import { Controller, Get, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { AuthUser, CurrentUser } from '../common/current-user.decorator';
import { ReportsService } from './reports.service';

@ApiTags('reports')
@ApiBearerAuth()
@Controller('reports')
export class ReportsController {
  constructor(private readonly reportsService: ReportsService) {}

  @Get('overview')
  overview(
    @CurrentUser() user: AuthUser,
    @Query('days') days?: string,
  ) {
    return this.reportsService.overview(user, days ? Number(days) : undefined);
  }

  @Get('bookings')
  bookings(
    @CurrentUser() user: AuthUser,
    @Query() query: { from?: string; to?: string },
  ) {
    return this.reportsService.bookings(user, query);
  }

  @Get('revenue')
  revenue(
    @CurrentUser() user: AuthUser,
    @Query() query: { from?: string; to?: string },
  ) {
    return this.reportsService.revenue(user, query);
  }

  @Get('messages')
  messages(
    @CurrentUser() user: AuthUser,
    @Query() query: { from?: string; to?: string },
  ) {
    return this.reportsService.messages(user, query);
  }

  @Get('expenses')
  expenses(
    @CurrentUser() user: AuthUser,
    @Query() query: { from?: string; to?: string },
  ) {
    return this.reportsService.expenses(user, query);
  }

  @Get('invoices')
  invoices(
    @CurrentUser() user: AuthUser,
    @Query() query: { from?: string; to?: string },
  ) {
    return this.reportsService.invoicesReport(user, query);
  }

  @Get('customers')
  customers(@CurrentUser() user: AuthUser) {
    return this.reportsService.customers(user);
  }

  @Get('routes')
  routes(@CurrentUser() user: AuthUser) {
    return this.reportsService.routes(user);
  }

  @Get('airlines')
  airlines(@CurrentUser() user: AuthUser) {
    return this.reportsService.airlines(user);
  }
}