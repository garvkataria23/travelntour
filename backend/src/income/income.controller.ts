import { Body, Controller, Delete, Get, Param, Post, Query } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { AuthUser, CurrentUser } from '../common/current-user.decorator';
import { IncomeService } from './income.service';
import { CreateIncomeDto } from './dto/create-income.dto';

@ApiTags('Income')
@Controller('incomes')
export class IncomeController {
  constructor(private readonly income: IncomeService) {}

  @Get()
  @ApiOperation({ summary: 'List income records' })
  list(@CurrentUser() user: AuthUser, @Query() query: Record<string, string>) {
    return this.income.list(user, query);
  }

  @Post()
  @ApiOperation({ summary: 'Create an income record' })
  create(@CurrentUser() user: AuthUser, @Body() dto: CreateIncomeDto) {
    return this.income.create(user, dto);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Delete an income record' })
  remove(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.income.remove(user, id);
  }
}