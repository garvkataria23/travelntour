import { Type } from 'class-transformer';
import {
  IsBoolean,
  IsEmail,
  IsEnum,
  IsISO8601,
  IsNumber,
  IsObject,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
  ValidateNested,
} from 'class-validator';
import { BookingSource, BookingStatus } from '@prisma/client';

export class CustomerInputDto {
  @IsString()
  @MinLength(2, { message: 'Customer name is too short' })
  name: string;

  @IsString()
  @MinLength(7, { message: 'Enter a valid phone number' })
  @MaxLength(16)
  phone: string;

  @IsOptional()
  @IsEmail({}, { message: 'Enter a valid email address' })
  email?: string;
}

export class CreateBookingDto {
  @IsOptional()
  @IsString()
  customerId?: string;

  @IsOptional()
  @ValidateNested()
  @Type(() => CustomerInputDto)
  @IsObject()
  customer?: CustomerInputDto;

  @IsString()
  @MinLength(3, { message: 'PNR must be at least 3 characters' })
  @MaxLength(20)
  pnr: string;

  @IsOptional()
  @IsString()
  referenceNumber?: string;

  @IsString()
  @MinLength(1)
  flightNumber: string;

  @IsString()
  @MinLength(1)
  airline: string;

  @IsOptional()
  @IsString()
  from?: string;

  @IsOptional()
  @IsString()
  to?: string;

  @IsOptional()
  @IsString()
  fromAirport?: string;

  @IsOptional()
  @IsString()
  toAirport?: string;

  @IsISO8601({}, { message: 'Departure date must be a valid date' })
  departureDate: string;

  @IsOptional()
  @IsString()
  departureTime?: string;

  @IsOptional()
  @IsString()
  terminal?: string;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  amount?: number;

  @IsOptional()
  @IsString()
  currency?: string;

  @IsOptional()
  @IsEnum(BookingStatus)
  status?: BookingStatus;

  @IsOptional()
  @IsEnum(BookingSource)
  source?: BookingSource;

  @IsOptional()
  @IsBoolean()
  allowDuplicate?: boolean;

  @IsOptional()
  @IsBoolean()
  skipAutomation?: boolean;
}