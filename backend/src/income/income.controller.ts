import { Body, Controller, Delete, Get, Param, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { AuthUser, CurrentUser } from '../common/current-user.decorator';
import { Permission } from '../common/permissions';
import { RequirePermissions } from '../common/permissions.decorator';
import { IncomeService } from './income.service';
import { CreateIncomeDto } from './dto/create-income.dto';

@ApiTags('Income')
@ApiBearerAuth()
@Controller('incomes')
export class IncomeController {
  constructor(private readonly income: IncomeService) {}

  @Get()
  @RequirePermissions(Permission.INCOME_VIEW)
  @ApiOperation({ summary: 'List income records' })
  list(@CurrentUser() user: AuthUser, @Query() query: Record<string, string>) {
    return this.income.list(user, query);
  }

  // Previously ungated: any authenticated user could write income rows feeding the P&L.
  @Post()
  @RequirePermissions(Permission.INCOME_CREATE)
  @ApiOperation({ summary: 'Create an income record' })
  create(@CurrentUser() user: AuthUser, @Body() dto: CreateIncomeDto) {
    return this.income.create(user, dto);
  }

  @Delete(':id')
  @RequirePermissions(Permission.INCOME_DELETE)
  @ApiOperation({ summary: 'Delete an income record' })
  remove(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.income.remove(user, id);
  }
}