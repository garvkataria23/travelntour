import { Body, Controller, Delete, Get, Param, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { AuthUser } from '../common/current-user.decorator';
import { CurrentUser } from '../common/current-user.decorator';
import { Permission } from '../common/permissions';
import { RequirePermissions } from '../common/permissions.decorator';
import { ExpensesService } from './expenses.service';
import { CreateExpenseDto } from './dto/create-expense.dto';

@ApiTags('Expenses')
@ApiBearerAuth()
@Controller('expenses')
export class ExpensesController {
  constructor(private readonly expenses: ExpensesService) {}

  @Get()
  @RequirePermissions(Permission.EXPENSE_VIEW)
  @ApiOperation({ summary: 'List expenses' })
  list(@CurrentUser() user: AuthUser, @Query() query: Record<string, string>) {
    return this.expenses.list(user, query);
  }

  // Previously ungated: any authenticated user — including STAFF — could write expense rows that
  // feed straight into the tenant's P&L.
  @Post()
  @RequirePermissions(Permission.EXPENSE_CREATE)
  @ApiOperation({ summary: 'Create an expense' })
  create(@CurrentUser() user: AuthUser, @Body() dto: CreateExpenseDto) {
    return this.expenses.create(user, dto);
  }

  @Get('stats')
  @RequirePermissions(Permission.EXPENSE_VIEW)
  @ApiOperation({ summary: 'Expense summary & month totals' })
  stats(@CurrentUser() user: AuthUser, @Query('month') month?: string) {
    return this.expenses.stats(user, month);
  }

  @Delete(':id')
  @RequirePermissions(Permission.EXPENSE_DELETE)
  @ApiOperation({ summary: 'Delete an expense' })
  remove(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.expenses.remove(user, id);
  }
}