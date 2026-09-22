import { IsNotEmpty, IsOptional, IsString, MaxLength } from 'class-validator';

export class SendManualMessageDto {
  @IsString()
  @IsNotEmpty()
  customerId: string;

  @IsOptional()
  @IsString()
  bookingId?: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(2048)
  text: string;
}