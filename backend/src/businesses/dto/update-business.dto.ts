import { IsEmail, IsOptional, IsString, Matches } from 'class-validator';

export class UpdateBusinessDto {
  @IsOptional()
  @IsString()
  name?: string;

  @IsOptional()
  @IsEmail({}, { message: 'Enter a valid email address' })
  email?: string;

  @IsOptional()
  @Matches(/^\+?[0-9]{7,15}$/, { message: 'Enter a valid phone number' })
  phone?: string;

  @IsOptional()
  @IsString()
  logo?: string;

  @IsOptional()
  @IsString()
  timezone?: string;

  @IsOptional()
  @IsString()
  currency?: string;
}