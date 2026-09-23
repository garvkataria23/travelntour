import { Body, Controller, Delete, Get, Param, Post, Query } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { AuthUser } from '../common/current-user.decorator';
import { CurrentUser } from '../common/current-user.decorator';
import { ExpensesService } from './expenses.service';
import { CreateExpenseDto } from './dto/create-expense.dto';

@ApiTags('Expenses')
@Controller('expenses')
export class ExpensesController {
  constructor(private readonly expenses: ExpensesService) {}

  @Get()
  @ApiOperation({ summary: 'List expenses' })
  list(@CurrentUser() user: AuthUser, @Query() query: Record<string, string>) {
    return this.expenses.list(user, query);
  }

  @Post()
  @ApiOperation({ summary: 'Create an expense' })
  create(@CurrentUser() user: AuthUser, @Body() dto: CreateExpenseDto) {
    return this.expenses.create(user, dto);
  }

  @Get('stats')
  @ApiOperation({ summary: 'Expense summary & month totals' })
  stats(@CurrentUser() user: AuthUser, @Query('month') month?: string) {
    return this.expenses.stats(user, month);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Delete an expense' })
  remove(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.expenses.remove(user, id);
  }
}
