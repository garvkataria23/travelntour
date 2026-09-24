import { Type } from 'class-transformer';
import {
  IsBoolean,
  IsEmail,
  IsEnum,
  IsISO8601,
  IsNumber,
  IsOptional,
  IsString,
  MaxLength,
  Min,
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
  @Min(0)
  amount?: number;

  @IsOptional()
  @IsString()
  currency?: string;

  // --- Accounting ----------------------------------------------------
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  baseFare?: number; // gross fare (taxable value) before discount

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  cost?: number; // direct cost of the ticket (COGS)

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  discount?: number; // ₹ discount applied to baseFare

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  taxRate?: number; // GST % for this booking (defaults to business setting)

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  taxAmount?: number; // GST amount (let backend compute if omitted)

  @IsOptional()
  @IsBoolean()
  generateInvoice?: boolean; // issue a printable invoice immediately

  @IsOptional()
  @IsBoolean()
  allowDuplicate?: boolean;

  @IsOptional()
  @IsBoolean()
  skipAutomation?: boolean;

  @IsOptional()
  @IsEnum(BookingStatus)
  status?: BookingStatus;

  @IsOptional()
  @IsEnum(BookingSource)
  source?: BookingSource;
}
