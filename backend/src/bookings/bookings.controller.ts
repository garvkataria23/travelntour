import { Body, Controller, Delete, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { AuthUser, CurrentUser } from '../common/current-user.decorator';
import { BookingsService } from './bookings.service';
import { CreateBookingDto } from './dto/create-booking.dto';
import { UpdateBookingDto } from './dto/update-booking.dto';

@ApiTags('bookings')
@ApiBearerAuth()
@Controller('bookings')
export class BookingsController {
  constructor(private readonly bookingsService: BookingsService) {}

  @Get()
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
  stats(@CurrentUser() user: AuthUser) {
    return this.bookingsService.stats(user);
  }

  @Get('airlines')
  airlines(@CurrentUser() user: AuthUser) {
    return this.bookingsService.airlines(user);
  }

  @Get(':id')
  get(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.bookingsService.get(user, id);
  }

  @Post()
  create(@CurrentUser() user: AuthUser, @Body() dto: CreateBookingDto) {
    return this.bookingsService.create(user, dto);
  }

  @Patch(':id')
  update(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() dto: UpdateBookingDto) {
    return this.bookingsService.update(user, id, dto);
  }

  @Post(':id/reschedule')
  reschedule(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() dto: UpdateBookingDto) {
    return this.bookingsService.reschedule(user, id, dto);
  }

  @Post(':id/cancel')
  cancel(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.bookingsService.cancel(user, id);
  }

  @Delete(':id')
  remove(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.bookingsService.remove(user, id);
  }
}