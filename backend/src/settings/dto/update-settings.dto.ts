import { IsBoolean, IsEmail, IsOptional, IsString, Matches } from 'class-validator';

export class UpdateSettingsDto {
  @IsOptional()
  @IsString()
  businessName?: string;

  @IsOptional()
  @IsEmail({}, { message: 'Enter a valid email address' })
  email?: string;

  @IsOptional()
  @Matches(/^\+?[0-9]{7,15}$/, { message: 'Enter a valid phone number' })
  phone?: string;

  @IsOptional()
  @IsString()
  timezone?: string;

  @IsOptional()
  @IsString()
  currency?: string;

  @IsOptional()
  @IsString()
  logo?: string;

  @IsOptional()
  @IsBoolean()
  notifyConfirmation?: boolean;

  @IsOptional()
  @IsBoolean()
  notify48h?: boolean;

  @IsOptional()
  @IsBoolean()
  notify24h?: boolean;

  @IsOptional()
  @IsBoolean()
  notifyJourneyDay?: boolean;

  @IsOptional()
  @IsBoolean()
  notifyCancellation?: boolean;
}