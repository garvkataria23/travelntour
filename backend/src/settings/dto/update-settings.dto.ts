import { Type } from 'class-transformer';
import { IsBoolean, IsEmail, IsInt, IsNumber, IsOptional, IsString, Matches, Max, Min } from 'class-validator';

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

  // --- GST / Invoicing ----------------------------------------------
  @IsOptional()
  @IsBoolean()
  gstEnabled?: boolean;

  @IsOptional()
  @Type(() => Number)
  @IsNumber({}, { message: 'GST rate must be a number' })
  @Min(0)
  @Max(100)
  gstRate?: number;

  @IsOptional()
  @IsString()
  gstin?: string;

  @IsOptional()
  @IsString()
  invoicePrefix?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: 'Next invoice number must be an integer' })
  @Min(1)
  nextInvoiceNo?: number;
}