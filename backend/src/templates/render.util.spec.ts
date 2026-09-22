import { Booking, Customer } from '@prisma/client';
import { bookingTemplateContext } from '../automation/context.util';
import type { TemplateContext } from './templates.service';
import { extractVariables, renderTemplateContent, templateBodyValues } from './render.util';

describe('renderTemplateContent', () => {
  it('replaces known variables with context values', () => {
    const content = 'Hi {{customer_name}}, your flight {{flight_number}} departs from {{from}} on {{date}} at {{time}}.';
    const out = renderTemplateContent(content, {
      customer_name: 'Rahul',
      flight_number: 'AI-202',
      from: 'Mumbai',
      date: '25 Sep 2026',
      time: '10:30 AM',
    });
    expect(out).toBe('Hi Rahul, your flight AI-202 departs from Mumbai on 25 Sep 2026 at 10:30 AM.');
  });

  it('leaves unknown / non-whitelisted variables untouched', () => {
    const out = renderTemplateContent('Hello {{user_name}} {{totally_invalid}}', { user_name: 'x', customer_name: 'Rahul' } as Partial<TemplateContext>);
    expect(out).toBe('Hello {{user_name}} {{totally_invalid}}');
  });

  it('uses a safe fallback for terminal and empty string for missing values', () => {
    const out = renderTemplateContent('Terminal {{terminal}}, PNR {{pnr}}', {});
    expect(out).toBe('Terminal the designated terminal, PNR ');
  });

  it('extractVariables returns deduped whitelisted variables in order', () => {
    const vars = extractVariables('{{pnr}} and {{PNR}} and {{pnr}} and {{bad_var}}');
    expect(vars).toEqual(['pnr']);
  });

  it('templateBodyValues builds WhatsApp component values with fallbacks', () => {
    const values = templateBodyValues(['customer_name', 'terminal', 'pnr'], {
      customer_name: 'Priya',
      pnr: 'XYZ789',
    });
    expect(values).toEqual(['Priya', 'the designated terminal', 'XYZ789']);
  });
});

describe('bookingTemplateContext', () => {
  const departure = new Date('2026-09-25T05:00:00.000Z'); // 10:30 AM IST

  const booking = {
    pnr: 'ABC123',
    referenceNumber: 'REF1',
    flightNumber: 'AI-202',
    airline: 'Air India',
    fromAirport: 'BOM',
    fromCity: 'Mumbai',
    toAirport: 'DEL',
    toCity: 'Delhi',
    departureDate: departure,
    departureTime: '10:30 AM',
    terminal: 'T2',
    amount: 12450,
    currency: 'INR',
  } as unknown as Booking;

  const customer = { name: 'Rahul Sharma' } as Customer;

  it('builds a context with display date and time in business timezone', () => {
    const ctx = bookingTemplateContext(booking, customer, 'Asia/Kolkata');
    expect(ctx.customer_name).toBe('Rahul Sharma');
    expect(ctx.pnr).toBe('ABC123');
    expect(ctx.flight_number).toBe('AI-202');
    expect(ctx.from).toBe('BOM');
    expect(ctx.to).toBe('DEL');
    expect(ctx.date).toBe('25 Sep 2026');
    expect(ctx.time).toBe('10:30 AM');
    expect(ctx.terminal).toBe('T2');
    expect(ctx.amount).toBe('12450');
    expect(ctx.currency).toBe('INR');
  });

  it('derives time from the UTC departure when departureTime is empty', () => {
    const ctx = bookingTemplateContext(
      { ...booking, departureTime: '' },
      customer,
      'Asia/Kolkata',
    );
    expect(ctx.time).toMatch(/10:30/);
  });
});