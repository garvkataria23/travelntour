import { PartialType } from '@nestjs/swagger';
import { ApiProperty } from '@nestjs/swagger';
import { IsInt, IsOptional, IsString, Min } from 'class-validator';
import { CreateBookingDto } from './create-booking.dto';

export class UpdateBookingDto extends PartialType(CreateBookingDto) {
  /**
   * Version the client last saw. The update is rejected with 409 if another member of
   * staff has saved since, instead of silently overwriting their changes.
   */
  @ApiProperty({ description: 'Version the client last read; required for conflict detection' })
  @IsInt({ message: 'version is required' })
  @Min(0)
  version: number;

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
}
