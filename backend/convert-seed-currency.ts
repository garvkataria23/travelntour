import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

/** INR per 1 AED, as served by the live rate source (AED->INR). */
const RATE = 26.091355;
const FROM_NAME = 'FlyConnect Travels India';
const TO_NAME = 'BlueAura Tourism';

async function main() {
  const biz = await prisma.business.findFirst({ where: { name: FROM_NAME } });
  if (!biz) {
    console.log(`No business named "${FROM_NAME}" - nothing to convert.`);
    return;
  }

  const before = await prisma.booking.findMany({
    where: { businessId: biz.id },
    select: { amount: true, baseFare: true, cost: true, discount: true, paidAmount: true, taxAmount: true, taxRate: true },
  });
  const beforeExpenses = await prisma.expense.findMany({ where: { businessId: biz.id }, select: { amount: true } });
  const sum = (xs: Array<number | null>) => xs.reduce<number>((a, b) => a + (b || 0), 0);

  console.log('BEFORE');
  console.log(`  bookings        : ${before.length}`);
  console.log(`  booking.amount  : ${sum(before.map((b) => b.amount)).toFixed(2)}`);
  console.log(`  booking.baseFare: ${sum(before.map((b) => b.baseFare)).toFixed(2)}`);
  console.log(`  booking.cost    : ${sum(before.map((b) => b.cost)).toFixed(2)}`);
  console.log(`  booking.discount: ${sum(before.map((b) => b.discount)).toFixed(2)}`);
  console.log(`  booking.paid    : ${sum(before.map((b) => b.paidAmount)).toFixed(2)}`);
  console.log(`  booking.taxAmt  : ${sum(before.map((b) => b.taxAmount)).toFixed(2)}`);
  console.log(`  booking.taxRate : ${sum(before.map((b) => b.taxRate)).toFixed(4)}  <- percentage, NOT money`);
  console.log(`  expenses        : ${beforeExpenses.length} summing ${sum(beforeExpenses.map((e) => e.amount)).toFixed(2)}`);

  // taxRate / quantity / version / sortOrder are deliberately excluded: they are not money.
  await prisma.$transaction([
    prisma.business.update({ where: { id: biz.id }, data: { name: TO_NAME, currency: 'AED' } }),
    prisma.businessSetting.updateMany({
      where: { businessId: biz.id },
      data: { currency: 'AED', defaultCurrency: 'AED' },
    }),
    prisma.booking.updateMany({
      where: { businessId: biz.id },
      data: {
        currency: 'AED',
        amount: { divide: RATE },
        baseFare: { divide: RATE },
        cost: { divide: RATE },
        discount: { divide: RATE },
        paidAmount: { divide: RATE },
        taxAmount: { divide: RATE },
      },
    }),
    prisma.expense.updateMany({
      where: { businessId: biz.id },
      data: { currency: 'AED', amount: { divide: RATE } },
    }),
  ]);

  const after = await prisma.booking.findMany({
    where: { businessId: biz.id },
    select: { amount: true, baseFare: true, cost: true, discount: true, paidAmount: true, taxAmount: true, taxRate: true },
  });
  const afterExpenses = await prisma.expense.findMany({ where: { businessId: biz.id }, select: { amount: true } });

  console.log('\nAFTER');
  console.log(`  booking.amount  : ${sum(after.map((b) => b.amount)).toFixed(2)}`);
  console.log(`  booking.baseFare: ${sum(after.map((b) => b.baseFare)).toFixed(2)}`);
  console.log(`  booking.cost    : ${sum(after.map((b) => b.cost)).toFixed(2)}`);
  console.log(`  booking.discount: ${sum(after.map((b) => b.discount)).toFixed(2)}`);
  console.log(`  booking.paid    : ${sum(after.map((b) => b.paidAmount)).toFixed(2)}`);
  console.log(`  booking.taxAmt  : ${sum(after.map((b) => b.taxAmount)).toFixed(2)}`);
  console.log(`  booking.taxRate : ${sum(after.map((b) => b.taxRate)).toFixed(4)}  <- unchanged`);
  console.log(`  expenses        : ${afterExpenses.length} summing ${sum(afterExpenses.map((e) => e.amount)).toFixed(2)}`);

  const currencies = await prisma.$queryRawUnsafe<{ currency: string; n: bigint }[]>(
    `SELECT currency, count(*)::bigint AS n FROM "Booking" WHERE "businessId" = '${biz.id}' GROUP BY currency`,
  );
  console.log('\n  booking currencies now:', JSON.stringify(currencies, (k, v) => (typeof v === 'bigint' ? Number(v) : v)));
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
