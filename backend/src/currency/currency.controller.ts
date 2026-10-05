import { BadRequestException, Controller, Get, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Public } from '../common/public.decorator';
import { CurrencyService } from './currency.service';

const CURRENCY_CODE = /^[A-Z]{2,5}$/;

@ApiTags('currency')
@ApiBearerAuth()
@Public()
@Controller('currency')
export class CurrencyController {
  constructor(private readonly currency: CurrencyService) {}

  /** Full rate table plus freshness metadata, served from the backend cache. */
  @Get('rates')
  async rates(@Query('base') base?: string, @Query('refresh') refresh?: string) {
    const table = await this.currency.getRates(refresh === '1' || refresh === 'true');
    const requested = (base || table.base).toUpperCase();
    if (requested === table.base) return table;
    if (!CURRENCY_CODE.test(requested)) {
      throw new BadRequestException({ message: 'Invalid currency code', code: 'INVALID_CURRENCY' });
    }
    return { ...this.currency.rebase(table, requested), base: requested, cachedBase: table.base, derived: true };
  }

  @Get('list')
  list() {
    return this.currency.list();
  }

  @Get('convert')
  async convert(
    @Query('from') from?: string,
    @Query('to') to?: string,
    @Query('amount') amount?: string,
  ) {
    const toCode = (to || '').toUpperCase();
    const fromCode = from ? from.toUpperCase() : this.currency.getBase();
    if (!CURRENCY_CODE.test(toCode) || !CURRENCY_CODE.test(fromCode)) {
      throw new BadRequestException({ message: 'Invalid currency code', code: 'INVALID_CURRENCY' });
    }
    const value = Number(amount);
    if (!Number.isFinite(value)) {
      throw new BadRequestException({ message: 'Invalid amount', code: 'INVALID_AMOUNT' });
    }
    const result = await this.currency.convert(value, toCode, fromCode);
    return { ...result, formatted: this.currency.format(result.result, toCode) };
  }
}
