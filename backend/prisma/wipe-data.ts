/**
 * Wipes transactional data so a deployment starts from an empty database.
 *
 * KEEP: Business, BusinessSetting, User, MessageTemplate, AutomationRule,
 *       WhatsAppAccount. Everything a live deployment needs to function.
 *
 * DROP: bookings, customers, invoice items, expenses, income, scheduled
 *       messages, message logs, audit logs, refresh tokens.
 *
 * THIS IS NOT A MIGRATION FIX. A migration that fails on pre-existing rows is a
 * signal to reconcile those rows by hand, not to erase the database. Once this
 * database holds one real booking, this script must never be pointed at it.
 *
 * Three deliberate acts are required, so that no single stray flag or
 * copy-pasted muscle memory can destroy real data:
 *
 *   --confirm                    the operator meant it
 *   --database=<exact db name>   they know WHICH database they are destroying
 *   --data-is-expendable         they have a verified backup and are certain
 *
 * The database name is read back from the server, so a command aimed at one
 * environment cannot be satisfied by pointing it at another. The third flag is
 * only demanded when there is actually something to delete.
 *
 * Usage:
 *   npm run prisma:wipe -- --confirm --database=<name> --data-is-expendable
 *
 * A verified dump must exist in cloud storage before this is run. See
 * backup/README.md.
 */
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

const PRESERVED = [
  'Business',
  'BusinessSetting',
  'User',
  'MessageTemplate',
  'AutomationRule',
  'WhatsAppAccount',
];

async function main() {
  const argv = process.argv.slice(2);

  if (!argv.includes('--confirm')) {
    console.error('Refusing to run without --confirm. Nothing was deleted.');
    process.exit(1);
  }

  // The name is read from the server, not from argv, so it cannot be spoofed by
  // a copy-pasted command aimed at a different environment.
  const [{ db: current }] = await prisma.$queryRaw<{ db: string }[]>`
    SELECT current_database() AS db
  `;
  const claimed = (argv.find((a) => a.startsWith('--database=')) ?? '').split('=')[1];

  if (claimed !== current) {
    console.error(
      `Refusing to run: --database=${claimed || '(missing)'} does not match the ` +
        `connected database "${current}".\n` +
        'Re-run with the exact name, e.g. --database=' + current,
    );
    process.exit(1);
  }

  const before = {
    bookings: await prisma.booking.count(),
    customers: await prisma.customer.count(),
    invoiceItems: await prisma.invoiceItem.count(),
    expenses: await prisma.expense.count(),
    income: await prisma.income.count(),
    scheduledMessages: await prisma.scheduledMessage.count(),
    messageLogs: await prisma.messageLog.count(),
    auditLogs: await prisma.auditLog.count(),
  };

  const total = Object.values(before).reduce((a, b) => a + b, 0);

  console.log(`About to delete from "${current}":`);
  for (const [label, count] of Object.entries(before)) {
    console.log(`  - ${label}: ${count}`);
  }
  console.log(`\nPreserved: ${PRESERVED.join(', ')}`);

  // Nothing transactional means there is no risk and no work to do.
  if (total === 0) {
    console.log('\nNo transactional rows. Nothing deleted.');
    return;
  }

  // Rows exist, so destroying them is a real decision. Require the operator to
  // assert, in the same breath, that the data is expendable and a verified dump
  // exists. This is the third deliberate act; --confirm alone must not be enough.
  if (!argv.includes('--data-is-expendable')) {
    console.error(
      `\nRefusing to continue: "${current}" holds ${total} transactional rows.\n` +
        'Confirm you have a VERIFIED backup and that this data is disposable:\n' +
        `  npm run prisma:wipe -- --confirm --database=${current} --data-is-expendable\n` +
        'If this database is live, stop and reconcile the offending rows by hand instead.',
    );
    process.exit(1);
  }

  // Order matters: MessageLog and AuditLog first (they reference bookings and
  // customers), then bookings (cascades to InvoiceItem + ScheduledMessage),
  // then the rest.
  const removed = await prisma.$transaction([
    prisma.messageLog.deleteMany({}),
    prisma.auditLog.deleteMany({}),
    prisma.refreshToken.deleteMany({}),
    prisma.booking.deleteMany({}),
    prisma.expense.deleteMany({}),
    prisma.income.deleteMany({}),
    prisma.customer.deleteMany({}),
    prisma.scheduledMessage.deleteMany({}),
  ]);

  console.log('\nDeleted:');
  const [messages, audits, tokens, bookings, expenses, income, customers, scheduled] = removed;
  console.log(`  - messageLogs: ${messages.count}`);
  console.log(`  - auditLogs: ${audits.count}`);
  console.log(`  - refreshTokens: ${tokens.count}`);
  console.log(`  - bookings: ${bookings.count} (invoiceItems + scheduledMessages cascaded)`);
  console.log(`  - expenses: ${expenses.count}`);
  console.log(`  - income: ${income.count}`);
  console.log(`  - customers: ${customers.count}`);
  console.log(`  - scheduledMessages: ${scheduled.count}`);
  console.log('\nDone. Staff logins and WhatsApp templates are untouched.');
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
