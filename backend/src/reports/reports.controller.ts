import { Controller, Get, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { AuthUser, CurrentUser } from '../common/current-user.decorator';
import { Permission } from '../common/permissions';
import { RequirePermissions } from '../common/permissions.decorator';
import { ReportsService } from './reports.service';

@ApiTags('reports')
@ApiBearerAuth()
@Controller('reports')
export class ReportsController {
  constructor(private readonly reportsService: ReportsService) {}

  // Operational counts (journeys today, booking mix). No money.
  @Get('overview')
  @RequirePermissions(Permission.REPORT_VIEW_OPERATIONAL)
  overview(
    @CurrentUser() user: AuthUser,
    @Query('days') days?: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
  ) {
    return this.reportsService.overview(user, days ? Number(days) : undefined, { from, to });
  }

  @Get('bookings')
  @RequirePermissions(Permission.REPORT_VIEW_OPERATIONAL)
  bookings(
    @CurrentUser() user: AuthUser,
    @Query() query: { from?: string; to?: string },
  ) {
    return this.reportsService.bookings(user, query);
  }

  // Revenue, expense and receivables aggregates. Previously ungated, so a STAFF could read the
  // tenant's P&L and margin.
  @Get('revenue')
  @RequirePermissions(Permission.REPORT_VIEW_FINANCIAL)
  revenue(
    @CurrentUser() user: AuthUser,
    @Query() query: { from?: string; to?: string },
  ) {
    return this.reportsService.revenue(user, query);
  }

  @Get('messages')
  @RequirePermissions(Permission.REPORT_VIEW_OPERATIONAL)
  messages(
    @CurrentUser() user: AuthUser,
    @Query() query: { from?: string; to?: string },
  ) {
    return this.reportsService.messages(user, query);
  }

  @Get('expenses')
  @RequirePermissions(Permission.REPORT_VIEW_FINANCIAL)
  expenses(
    @CurrentUser() user: AuthUser,
    @Query() query: { from?: string; to?: string },
  ) {
    return this.reportsService.expenses(user, query);
  }

  @Get('invoices')
  @RequirePermissions(Permission.REPORT_VIEW_FINANCIAL)
  invoices(
    @CurrentUser() user: AuthUser,
    @Query() query: { from?: string; to?: string },
  ) {
    return this.reportsService.invoicesReport(user, query);
  }

  @Get('customers')
  @RequirePermissions(Permission.REPORT_VIEW_OPERATIONAL)
  customers(@CurrentUser() user: AuthUser) {
    return this.reportsService.customers(user);
  }

  @Get('routes')
  @RequirePermissions(Permission.REPORT_VIEW_OPERATIONAL)
  routes(@CurrentUser() user: AuthUser) {
    return this.reportsService.routes(user);
  }

  @Get('airlines')
  @RequirePermissions(Permission.REPORT_VIEW_OPERATIONAL)
  airlines(@CurrentUser() user: AuthUser) {
    return this.reportsService.airlines(user);
  }
}