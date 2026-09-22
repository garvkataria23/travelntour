import { Booking, Customer } from '@prisma/client';
import { AuditService } from '../audit/audit.service';
import { AutomationService } from './automation.service';
import { PrismaService } from '../prisma/prisma.service';

describe('AutomationService.computeScheduledAt', () => {
  let service: AutomationService;

  beforeEach(() => {
    service = new AutomationService({} as PrismaService, {} as AuditService);
  });

  const booking = (departureInMs: number): Booking =>
    ({ id: 'b1', departureDate: new Date(departureInMs) } as Booking);

  it('schedules immediate confirmation ~now for offset 0', () => {
    const now = new Date('2026-09-22T10:00:00.000Z');
    const scheduled = service.computeScheduledAt(
      { triggerType: 'BOOKING_CREATED', offsetMinutes: 0 },
      booking(now.getTime() + 7 * 86400000),
      now,
    );
    expect(scheduled).not.toBeNull();
    expect(scheduled!.getTime()).toBe(now.getTime() + 300);
  });

  it('schedules BOOKING_CREATED at now + offsetMinutes for positive offsets', () => {
    const now = new Date('2026-09-22T10:00:00.000Z');
    const scheduled = service.computeScheduledAt(
      { triggerType: 'BOOKING_CREATED', offsetMinutes: 10 },
      booking(now.getTime() + 7 * 86400000),
      now,
    );
    expect(scheduled).not.toBeNull();
    expect(scheduled!.getTime()).toBe(now.getTime() + 10 * 60000);
  });

  it('returns null for a JOURNEY_DATE reminder that would be retroactive', () => {
    const now = new Date('2026-09-22T10:00:00.000Z');
    const nearDeparture = booking(now.getTime() + 30 * 60000);
    expect(
      service.computeScheduledAt({ triggerType: 'JOURNEY_DATE', offsetMinutes: -60 }, nearDeparture, now),
    ).toBeNull();
  });

  it('computes the 48h reminder as departure minus 2880 minutes', () => {
    const now = new Date('2026-09-22T10:00:00.000Z');
    const departure = booking(now.getTime() + 7 * 86400000);
    const scheduled = service.computeScheduledAt(
      { triggerType: 'JOURNEY_DATE', offsetMinutes: -2880 },
      departure,
      now,
    );
    expect(scheduled).not.toBeNull();
    expect(scheduled!.getTime()).toBe(departure.departureDate.getTime() - 2880 * 60000);
  });

  it('clamps BOOKING_CANCELLED offsets to now or later', () => {
    const now = new Date('2026-09-22T10:00:00.000Z');
    const immediate = service.computeScheduledAt(
      { triggerType: 'BOOKING_CANCELLED', offsetMinutes: 0 },
      booking(now.getTime() + 86400000),
      now,
    );
    expect(immediate!.getTime()).toBe(now.getTime());

    const delayed = service.computeScheduledAt(
      { triggerType: 'BOOKING_CANCELLED', offsetMinutes: 5 },
      booking(now.getTime() + 86400000),
      now,
    );
    expect(delayed!.getTime()).toBe(now.getTime() + 5 * 60000);
  });

  it('never returns a reminder in the past for journey-date rules', () => {
    const now = new Date('2026-09-22T10:00:00.000Z');
    const past = service.computeScheduledAt(
      { triggerType: 'JOURNEY_DATE', offsetMinutes: 60 },
      booking(now.getTime() - 3600000),
      now,
    );
    expect(past).toBeNull();
  });
});