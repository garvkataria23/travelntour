import { Body, Controller, Delete, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { AuthUser, CurrentUser } from '../common/current-user.decorator';
import { Permission } from '../common/permissions';
import { RequirePermissions } from '../common/permissions.decorator';
import { BookingsService } from './bookings.service';
import { CreateBookingDto } from './dto/create-booking.dto';
import { UpdateBookingDto } from './dto/update-booking.dto';

@ApiTags('bookings')
@ApiBearerAuth()
@Controller('bookings')
export class BookingsController {
  constructor(private readonly bookingsService: BookingsService) {}

  @Get()
  @RequirePermissions(Permission.BOOKING_VIEW)
  list(
    @CurrentUser() user: AuthUser,
    @Query()
    query: {
      page?: number;
      limit?: number;
      search?: string;
      status?: string;
      airline?: string;
      period?: string;
      from?: string;
      to?: string;
      sort?: string;
      order?: 'asc' | 'desc';
      customerId?: string;
    },
  ) {
    return this.bookingsService.list(user, query);
  }

  @Get('stats')
  @RequirePermissions(Permission.BOOKING_VIEW)
  stats(@CurrentUser() user: AuthUser) {
    return this.bookingsService.stats(user);
  }

  @Get('airlines')
  @RequirePermissions(Permission.BOOKING_VIEW)
  airlines(@CurrentUser() user: AuthUser) {
    return this.bookingsService.airlines(user);
  }

  @Get(':id')
  @RequirePermissions(Permission.BOOKING_VIEW)
  get(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.bookingsService.get(user, id);
  }

  @Post()
  @RequirePermissions(Permission.BOOKING_CREATE)
  create(@CurrentUser() user: AuthUser, @Body() dto: CreateBookingDto) {
    return this.bookingsService.create(user, dto);
  }

  @Patch(':id')
  @RequirePermissions(Permission.BOOKING_EDIT)
  update(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() dto: UpdateBookingDto) {
    return this.bookingsService.update(user, id, dto);
  }

  @Post(':id/reschedule')
  @RequirePermissions(Permission.BOOKING_RESCHEDULE)
  reschedule(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() dto: UpdateBookingDto) {
    return this.bookingsService.reschedule(user, id, dto);
  }

  @Post(':id/cancel')
  @RequirePermissions(Permission.BOOKING_CANCEL)
  cancel(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.bookingsService.cancel(user, id);
  }

  // Hard delete. The service also refuses this for an invoiced booking and re-checks the role as
  // defence in depth, since this is the one destructive booking action.
  @Delete(':id')
  @RequirePermissions(Permission.BOOKING_DELETE)
  remove(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.bookingsService.remove(user, id);
  }
}