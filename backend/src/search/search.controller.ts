import { Controller, Get, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { AuthUser, CurrentUser } from '../common/current-user.decorator';
import { PrismaService } from '../prisma/prisma.service';

@ApiTags('search')
@ApiBearerAuth()
@Controller('search')
export class SearchController {
  constructor(private readonly prisma: PrismaService) {}

  @Get()
  async search(@CurrentUser() user: AuthUser, @Query('q') q?: string) {
    const term = (q ?? '').trim();
    if (term.length < 2) return { customers: [], bookings: [] };

    const digits = term.replace(/[^\d]/g, '');
    const or: Array<Record<string, unknown>> = [{ name: { contains: term, mode: 'insensitive' as const } }];
    if (digits.length >= 7) or.push({ phone: { contains: digits } });

    const [customers, bookings] = await Promise.all([
      this.prisma.customer.findMany({
        where: { businessId: user.businessId, OR: or },
        take: 5,
        select: { id: true, name: true, phone: true, email: true },
      }),
      this.prisma.booking.findMany({
        where: {
          businessId: user.businessId,
          OR: [
            { pnr: { contains: term, mode: 'insensitive' as const } },
            { referenceNumber: { contains: term, mode: 'insensitive' as const } },
            { flightNumber: { contains: term, mode: 'insensitive' as const } },
            { customer: { name: { contains: term, mode: 'insensitive' as const } } },
            ...(digits.length >= 7 ? [{ customer: { phone: { contains: digits } } }] : []),
          ],
        },
        take: 5,
        include: { customer: { select: { id: true, name: true, phone: true } } },
      }),
    ]);

    return {
      query: term,
      customers,
      bookings: bookings.map((b) => ({
        id: b.id,
        pnr: b.pnr,
        flightNumber: b.flightNumber,
        airline: b.airline,
        route: `${b.fromAirport} → ${b.toAirport}`,
        departureDate: b.departureDate,
        status: b.status,
        customer: b.customer,
      })),
    };
  }
}