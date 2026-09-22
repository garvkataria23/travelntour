import { IsEmail, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';

export class CreateCustomerDto {
  @IsString()
  @MinLength(2, { message: 'Name is too short' })
  @MaxLength(120)
  name: string;

  @IsString()
  @MinLength(7, { message: 'Enter a valid phone number' })
  @MaxLength(16)
  phone: string;

  @IsOptional()
  @IsEmail({}, { message: 'Enter a valid email address' })
  email?: string;
}