import { Booking, Business, Customer } from '@prisma/client';
import { DateTime } from 'luxon';
import { TemplateContext } from '../templates/templates.service';

/**
 * Builds the template variable context from a booking + customer.
 * All dates/times are formatted in the business timezone for display.
 */
export function bookingTemplateContext(
  booking: Booking & { departureDate?: Date },
  customer: Customer,
  timezone: string = 'Asia/Kolkata',
): TemplateContext {
  const tz: string = timezone || 'Asia/Kolkata';
  const departure = DateTime.fromJSDate(booking.departureDate).setZone(tz);

  const dateDisplay = departure.toFormat('dd MMM yyyy');
  const timeDisplay = booking.departureTime
    ? formatTime(booking.departureTime)
    : departure.toFormat('hh:mm a');

  return {
    customer_name: customer.name,
    pnr: booking.pnr,
    reference_number: booking.referenceNumber ?? undefined,
    flight_number: booking.flightNumber,
    airline: booking.airline,
    from: booking.fromAirport || booking.fromCity || '',
    from_airport: booking.fromAirport || '',
    from_city: booking.fromCity || '',
    airport_from: booking.fromAirport || '',
    to: booking.toAirport || booking.toCity || '',
    to_airport: booking.toAirport || '',
    to_city: booking.toCity || '',
    airport_to: booking.toAirport || '',
    date: dateDisplay,
    time: timeDisplay,
    journey_date: dateDisplay,
    journey_time: timeDisplay,
    terminal: booking.terminal ?? '',
    amount: booking.amount !== null && booking.amount !== undefined ? String(booking.amount) : '',
    currency: booking.currency ?? 'INR',
  };
}

function formatTime(time: string): string {
  const match = time.match(/^(\d{1,2}):(\d{2})\s*([AaPp][Mm])?$/);
  if (!match) return time;
  let hour = Number(match[1]);
  const minute = match[2];
  let suffix = match[3]?.toUpperCase();
  if (!suffix) {
    suffix = hour >= 12 ? 'PM' : 'AM';
    hour = hour % 12 || 12;
  }
  return `${hour}:${minute} ${suffix}`;
}