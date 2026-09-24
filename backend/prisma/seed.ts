import { PrismaClient, Role, TriggerType, MessageType, TemplateCategory, TemplateStatus } from '@prisma/client';
import * as bcrypt from 'bcryptjs';

const AIRPORT: Record<string, { code: string; city: string }> = {
  BOM: { code: 'BOM', city: 'Mumbai' },
  DEL: { code: 'DEL', city: 'Delhi' },
  BLR: { code: 'BLR', city: 'Bangalore' },
  HYD: { code: 'HYD', city: 'Hyderabad' },
  GOI: { code: 'GOI', city: 'Goa' },
  MAA: { code: 'MAA', city: 'Chennai' },
  CCU: { code: 'CCU', city: 'Kolkata' },
  AMD: { code: 'AMD', city: 'Ahmedabad' },
  COK: { code: 'COK', city: 'Kochi' },
  DXB: { code: 'DXB', city: 'Dubai' },
  SIN: { code: 'SIN', city: 'Singapore' },
  LHR: { code: 'LHR', city: 'London' },
  JFK: { code: 'JFK', city: 'New York' },
};

export function parseAirportInput(input: string): { code: string; city: string } {
  const raw = input.trim();
  if (!raw) return { code: '', city: '' };
  const paren = raw.match(/^(.*?)\s*\(([^)]+)\)\s*$/);
  if (paren) {
    const city = paren[1].trim();
    const code = paren[2].trim().toUpperCase();
    return { code, city: city || AIRPORT[code]?.city || code };
  }
  const codeOnly = raw.toUpperCase();
  if (AIRPORT[codeOnly]) return { code: codeOnly, city: AIRPORT[codeOnly].city };
  const codeMatch = raw.match(/\b([A-Z]{3})\b/);
  if (codeMatch) {
    const code = codeMatch[1];
    return { code, city: AIRPORT[code]?.city || raw.replace(/\b[A-Z]{3}\b/g, '').trim() || code };
  }
  return { code: raw.slice(0, 3).toUpperCase(), city: raw };
}

const prisma = new PrismaClient();
const TZ = 'Asia/Kolkata';
const BUSINESS_NAME = 'Blue Aura Tourism';

const TEMPLATES: Array<{
  key: string;
  name: string;
  description: string;
  category: TemplateCategory;
  content: string;
  whatsappTemplateName: string;
  language: string;
}> = [
  {
    key: 'confirmation',
    name: 'Booking Confirmation',
    description: 'Sent immediately after booking is created.',
    category: 'BOOKING',
    whatsappTemplateName: 'booking_confirm_enus',
    language: 'en_US',
    content: `Hi {{customer_name}} 👋

Your flight booking has been confirmed! ✈️

🧾 PNR: {{pnr}}
✈️ Flight: {{flight_number}}
🛫 From: {{from}}
🛬 To: {{to}}
🗓️ Date: {{date}}
⏱️ Time: {{time}}
{{#terminal}}Terminal: {{terminal}}{{/terminal}}

We wish you a safe and pleasant journey! 😊
Team {{business_name}}`,
  },
  {
    key: 'reminder_48h',
    name: '48 Hours Reminder',
    description: 'Reminder 2 days before departure.',
    category: 'REMINDER',
    whatsappTemplateName: 'reminder_48h',
    language: 'en',
    content: `Hi {{customer_name}},

Your flight to {{to}} is in 48 hours! ✈️

🧾 PNR: {{pnr}}
✈️ Flight: {{flight_number}}
🛫 From: {{from}}
🛬 To: {{to}}
🗓️ Date: {{date}}
⏱️ Time: {{time}}

Kindly complete web check-in to save time at the airport.
Team {{business_name}}`,
  },
  {
    key: 'reminder_24h',
    name: '24 Hours Reminder',
    description: 'Reminder 1 day before departure.',
    category: 'REMINDER',
    whatsappTemplateName: 'reminder_24h',
    language: 'en',
    content: `Hi {{customer_name}},

Your flight is tomorrow! 🛫

🧾 PNR: {{pnr}}
✈️ Flight: {{flight_number}}
🛫 From: {{from}}
🛬 To: {{to}}
🗓️ Date: {{date}}
⏱️ Time: {{time}}
{{#terminal}}Terminal: {{terminal}}{{/terminal}}

Don't forget to check-in online.
Team {{business_name}}`,
  },
  {
    key: 'journey_day',
    name: 'Journey Day Reminder',
    description: 'Sent on the day of journey.',
    category: 'REMINDER',
    whatsappTemplateName: 'journey_day',
    language: 'en',
    content: `Hi {{customer_name}},

Wishing you a safe journey! ✨

✈️ Flight: {{flight_number}}
🛫 From: {{from}}
🛬 To: {{to}}
🗓️ Date: {{date}}
⏱️ Time: {{time}}
{{#terminal}}Terminal: {{terminal}}{{/terminal}}

Have a wonderful trip! 😊
Team {{business_name}}`,
  },
  {
    key: 'cancellation',
    name: 'Booking Cancellation',
    description: 'Sent when a booking is cancelled.',
    category: 'BOOKING',
    whatsappTemplateName: 'booking_cancellation',
    language: 'en',
    content: `Hi {{customer_name}},

Your booking (PNR: {{pnr}}) has been cancelled. ✈️

✈️ Flight: {{flight_number}}
🛫 From: {{from}}
🛬 To: {{to}}
🗓️ Date: {{date}}

If you have any questions, please reply to this message.
Team {{business_name}}`,
  },
];

async function main() {
  const existing = await prisma.business.findFirst({ where: { name: BUSINESS_NAME } });

  if (existing) {
    console.log('Seed data already exists. Skipping.');
    return;
  }

  const business = await prisma.business.create({
    data: {
      name: BUSINESS_NAME,
      email: 'hello@blueauratourism.com',
      phone: '+91 88282 88282',
      timezone: TZ,
      currency: 'INR',
    },
  });

  await prisma.businessSetting.create({
    data: { businessId: business.id, timezone: TZ },
  });

  const admin = await prisma.user.create({
    data: {
      businessId: business.id,
      name: 'Garv Kataria',
      email: 'admin@flyconnect.dev',
      phone: '+91 98765 43210',
      passwordHash: await bcrypt.hash('Admin@123', 12),
      role: Role.ADMIN,
    },
  });

  const templateIds = new Map<string, string>();
  for (const tpl of TEMPLATES) {
    const template = await prisma.messageTemplate.create({
      data: {
        businessId: business.id,
        name: tpl.name,
        description: tpl.description,
        category: tpl.category,
        content: tpl.content,
        whatsappTemplateName: tpl.whatsappTemplateName,
        status: TemplateStatus.ACTIVE,
        language: tpl.language,
        variables: ['customer_name', 'pnr', 'flight_number', 'from', 'to', 'date', 'time', 'terminal'],
      },
    });
    templateIds.set(tpl.key, template.id);
  }

  const rules: Array<{ name: string; triggerType: TriggerType; messageType: MessageType; offsetMinutes: number; templateKey: string; active: boolean }> = [
    { name: 'Booking Confirmation', triggerType: 'BOOKING_CREATED', messageType: 'BOOKING_CONFIRMATION', offsetMinutes: 0, templateKey: 'confirmation', active: true },
    { name: '48 Hours Before Journey', triggerType: 'JOURNEY_DATE', messageType: 'REMINDER_48H', offsetMinutes: -2880, templateKey: 'reminder_48h', active: true },
    { name: '24 Hours Before Journey', triggerType: 'JOURNEY_DATE', messageType: 'REMINDER_24H', offsetMinutes: -1440, templateKey: 'reminder_24h', active: true },
    { name: 'On the Day of Journey', triggerType: 'JOURNEY_DATE', messageType: 'JOURNEY_DAY', offsetMinutes: -180, templateKey: 'journey_day', active: true },
    { name: 'Booking Cancellation', triggerType: 'BOOKING_CANCELLED', messageType: 'BOOKING_CANCELLATION', offsetMinutes: 0, templateKey: 'cancellation', active: false },
  ];

  for (const rule of rules) {
    const row = await prisma.automationRule.create({
      data: {
        businessId: business.id,
        name: rule.name,
        triggerType: rule.triggerType,
        messageType: rule.messageType,
        offsetMinutes: rule.offsetMinutes,
        templateId: templateIds.get(rule.templateKey)!,
        active: rule.active,
      },
    });
  }

  console.log('Seed completed:');
  console.log(`  - Business: ${BUSINESS_NAME}`);
  console.log(`  - Admin:    admin@flyconnect.dev / Admin@123`);
  console.log(`  - Templates: ${TEMPLATES.length}`);
  console.log(`  - Automation rules: ${rules.length}`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });