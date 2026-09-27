import { ConfigService } from '@nestjs/config';
import { CurrencyService } from './currency.service';

/** Live smoke test against the real upstreams - not part of `npm test`. Run with:
 *  npx ts-node -r tsconfig-paths/register src/currency/smoke.ts
 */
async function main() {
  const config = {
    get: (key: string) =>
      ({
        CURRENCY_BASE: 'AED',
        CURRENCY_PRIMARY_URL: 'https://api.exchangerate.fun/latest?base=',
        CURRENCY_TTL_SECONDS: '3300',
      })[key],
  } as unknown as ConfigService;

  const service = new CurrencyService(config);
  const table = await service.getRates();
  const codes = Object.keys(table.rates);

  console.log('source   :', table.source);
  console.log('base     :', table.base);
  console.log('asOf     :', table.asOf);
  console.log('fetchedAt:', table.fetchedAt);
  console.log('stale    :', table.stale);
  console.log('count    :', codes.length);
  console.log('has AED/INR:', Boolean(table.rates.AED), Boolean(table.rates.INR));

  for (const code of ['AED', 'INR', 'USD', 'EUR', 'PKR', 'GBP', 'AED']) {
    const out = await service.convert(1000, code);
    console.log(`  1,000 AED -> ${code.padEnd(4)} ${out.result.toFixed(4).padStart(12)}   (rate ${out.rate.toFixed(6)})  ${service.format(out.result, code)}`);
  }

  const cross = await service.convert(50000, 'AED', 'INR');
  console.log(`  50,000 INR -> AED  ${cross.result.toFixed(2)}  (${service.format(cross.result, 'AED')})`);

  const list = await service.list();
  console.log('list size:', list.currencies.length, '| first 5:', list.currencies.slice(0, 5).map((c) => `${c.code}:${c.name}`).join(', '));
  console.log('INR meta :', JSON.stringify(list.currencies.find((c) => c.code === 'INR')));
}

main().catch((err) => {
  console.error('SMOKE FAILED:', err?.message ?? err);
  process.exit(1);
});
