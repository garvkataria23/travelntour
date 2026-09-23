import { PrismaClient, Role, TriggerType, MessageType, TemplateCategory, TemplateStatus } from '@prisma/client';
import * as bcrypt from 'bcryptjs';
import { DateTime } from 'luxon';

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

function normalizePhone(input: string): string {
  return input.replace(/[\s\-().]/g, '');
}

const MESSAGE_NAMES: Record<string, string> = {
  BOOKING_CONFIRMATION: 'Booking Confirmation',
  REMINDER_48H: '48h Reminder',
  REMINDER_24H: '24h Reminder',
  JOURNEY_DAY: 'Journey Day Reminder',
  BOOKING_CANCELLATION: 'Booking Cancellation',
  CUSTOM: 'Custom Message',
};

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
}> = [
  {
    key: 'confirmation',
    name: 'Booking Confirmation',
    description: 'Sent immediately after booking is created.',
    category: 'BOOKING',
    whatsappTemplateName: 'booking_confirmation',
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

// idempotent PNR-indexed sample data
const SAMPLE_BOOKINGS = [
  { name: 'Rahul Sharma', phone: '+91 98765 43210', pnr: 'ABC123', flight: 'AI-202', airline: 'Air India', from: 'Mumbai (BOM)', to: 'Delhi (DEL)', dayOffset: 0, time: '10:30 AM', amount: 12450 },
  { name: 'Priya Mehta', phone: '+91 99887 76655', pnr: 'XYZ789', flight: '6E-531', airline: 'IndiGo', from: 'Mumbai (BOM)', to: 'Bangalore (BLR)', dayOffset: 0, time: '12:45 PM', amount: 8230 },
  { name: 'Amit Patel', phone: '+91 91234 56789', pnr: 'LMN456', flight: 'EK-501', airline: 'Emirates', from: 'Mumbai (BOM)', to: 'Dubai (DXB)', dayOffset: 1, time: '02:15 PM', amount: 48780 },
  { name: 'Sneha Iyer', phone: '+91 88776 65544', pnr: 'QWE321', flight: 'UK-955', airline: 'Vistara', from: 'Delhi (DEL)', to: 'Mumbai (BOM)', dayOffset: 1, time: '04:40 PM', amount: 11560 },
  { name: 'Karan Malhotra', phone: '+91 97654 32109', pnr: 'RTY654', flight: '6E-210', airline: 'IndiGo', from: 'Mumbai (BOM)', to: 'Hyderabad (HYD)', dayOffset: 2, time: '06:20 PM', amount: 8420 },
  { name: 'Neha Panjwani', phone: '+91 98675 43211', pnr: 'UIO987', flight: 'SG-816', airline: 'SpiceJet', from: 'Mumbai (BOM)', to: 'Goa (GOI)', dayOffset: 2, time: '08:10 PM', amount: 9560 },
  { name: 'Vikram Rao', phone: '+91 90987 65432', pnr: 'JKL654', flight: 'AI-887', airline: 'Air India', from: 'Bangalore (BLR)', to: 'Singapore (SIN)', dayOffset: 3, time: '11:25 AM', amount: 33420 },
  { name: 'Ananya Tiwari', phone: '+91 99876 12345', pnr: 'MNB321', flight: '6E-729', airline: 'IndiGo', from: 'Delhi (DEL)', to: 'Ahmedabad (AMD)', dayOffset: 4, time: '09:30 AM', amount: 6890 },
  { name: 'Rohit Verma', phone: '+91 90123 45678', pnr: 'DEF987', flight: 'AI-212', airline: 'Air India', from: 'Delhi (DEL)', to: 'Mumbai (BOM)', dayOffset: -3, time: '06:00 PM', amount: 11200, status: 'COMPLETED' },
  { name: 'Neha Soni', phone: '+91 89012 34567', pnr: 'GHI321', flight: '6E-454', airline: 'IndiGo', from: 'Mumbai (BOM)', to: 'Pune (PNQ)', dayOffset: -6, time: '09:15 AM', amount: 4200, status: 'COMPLETED' },
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
      email: 'hello@aurashinetravels.com',
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

  await prisma.user.create({
    data: {
      businessId: business.id,
      name: 'Staff Member',
      email: 'staff@flyconnect.dev',
      phone: '+91 99887 76655',
      passwordHash: await bcrypt.hash('Staff@123', 12),
      role: Role.STAFF,
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
        language: 'en',
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

  const activeRules: Array<{ id: string; triggerType: TriggerType; messageType: MessageType; offsetMinutes: number; templateId: string }> = [];
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
    if (rule.active) {
      activeRules.push({ id: row.id, triggerType: rule.triggerType, messageType: rule.messageType, offsetMinutes: rule.offsetMinutes, templateId: row.templateId });
    }
  }

  const now = DateTime.now().setZone(TZ);
  for (const b of SAMPLE_BOOKINGS) {
    const phone = normalizePhone(b.phone);
    let customer = await prisma.customer.findUnique({
      where: { businessId_phone: { businessId: business.id, phone } },
    });
    if (!customer) {
      customer = await prisma.customer.create({
        data: { businessId: business.id, name: b.name, phone, email: `${b.name.toLowerCase().replace(/\s+/g, '.')}@gmail.com` },
      });
    }

    const from = parseAirportInput(b.from);
    const to = parseAirportInput(b.to);
    const departureLocal = now.plus({ days: b.dayOffset }).startOf('day').set({ hour: 9, minute: 0 });
    const departureDate = departureLocal.toUTC().toJSDate();
    const departureTime = b.time;
    const status = (b.status ?? 'CONFIRMED') as 'CONFIRMED' | 'PENDING' | 'COMPLETED' | 'CANCELLED';

    const booking = await prisma.booking.create({
      data: {
        businessId: business.id,
        customerId: customer.id,
        pnr: b.pnr,
        flightNumber: b.flight,
        airline: b.airline,
        fromAirport: from.code,
        fromCity: from.city,
        toAirport: to.code,
        toCity: to.city,
        departureDate,
        departureTime,
        terminal: 'Terminal 2',
        status,
        source: 'DIRECT',
        amount: b.amount,
        currency: 'INR',
        createdBy: admin.id,
      },
    });

    // Generate scheduled messages using the same rules as the backend.
    for (const rule of activeRules) {
      if (rule.triggerType === 'BOOKING_CANCELLED') continue;
      let scheduledAt: DateTime | null = null;
      if (rule.triggerType === 'BOOKING_CREATED') {
        scheduledAt = now.plus({ minutes: rule.offsetMinutes });
        if (scheduledAt <= now) scheduledAt = now.plus({ seconds: 1 });
      } else if (rule.triggerType === 'JOURNEY_DATE') {
        const candidate = departureLocal.plus({ minutes: rule.offsetMinutes });
        scheduledAt = candidate > now ? candidate : null;
      }
      if (!scheduledAt) continue;
      await prisma.scheduledMessage.create({
        data: {
          businessId: business.id,
          bookingId: booking.id,
          customerId: customer.id,
          templateId: rule.templateId,
          automationRuleId: rule.id,
          messageType: rule.messageType,
          name: MESSAGE_NAMES[rule.messageType] ?? rule.messageType,
          scheduledAt: scheduledAt.toUTC().toJSDate(),
          status: 'SCHEDULED',
        },
      });
    }
  }

  // Sample expenses (accounting).
  await prisma.expense.createMany({
    data: [
      {
        businessId: business.id,
        category: 'DIRECT',
        title: 'Airline ticket settlement',
        description: 'Sample direct cost for ticketed inventory',
        amount: 284000,
        payableTo: 'VFS Airline Solutions Pvt Ltd',
        incurredOn: now.minus({ days: 2 }).toUTC().toJSDate(),
        createdBy: admin.id,
      },
      {
        businessId: business.id,
        category: 'OPERATING',
        title: 'Office rent',
        description: 'Monthly office space rent',
        amount: 45000,
        payableTo: 'Skyline Realty',
        incurredOn: now.minus({ days: 5 }).toUTC().toJSDate(),
        createdBy: admin.id,
      },
      {
        businessId: business.id,
        category: 'OPERATING',
        title: 'Salaries',
        description: 'Staff payroll for the month',
        amount: 180000,
        payableTo: 'Staff Payroll',
        incurredOn: now.minus({ days: 2 }).toUTC().toJSDate(),
        createdBy: admin.id,
      },
    ],
  });

  console.log('Seed completed:');
  console.log(`  - Business: ${BUSINESS_NAME}`);
  console.log(`  - Admin:    admin@flyconnect.dev / Admin@123`);
  console.log(`  - Staff:    staff@flyconnect.dev / Staff@123`);
  console.log(`  - Templates: ${TEMPLATES.length}`);
  console.log(`  - Customers/Bookings: ${SAMPLE_BOOKINGS.length}`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });