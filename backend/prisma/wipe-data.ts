/**
 * Wipes transactional data for a go-live-clean database.
 *
 * Keeps: Business, BusinessSetting, User, MessageTemplate, AutomationRule,
 *        WhatsAppAccount. Everything a live deployment needs to function.
 *
 * Deletes: bookings, customers, invoice items, expenses, income,
 *          scheduled messages, message logs, audit logs, refresh tokens.
 *
 * Requires --confirm to run.
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
  if (!process.argv.includes('--confirm')) {
    console.error('Refusing to run without --confirm. Nothing was deleted.');
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

  console.log('About to delete:');
  for (const [label, count] of Object.entries(before)) {
    console.log(`  - ${label}: ${count}`);
  }
  console.log(`\nPreserved: ${PRESERVED.join(', ')}`);

  // Order matters: MessageLog and AuditLog first (they reference bookings/customers),
  // then bookings (cascades to InvoiceItem + ScheduledMessage), then customers.
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

  const [messages, audits, tokens, bookings, expenses, income, customers, scheduled] = removed;
  console.log('\nDeleted:');
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
