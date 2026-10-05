import { IsBoolean, IsInt, IsOptional, IsString, Max, MaxLength, Min, MinLength } from 'class-validator';

export class UpdateTenantStatusDto {
  @IsBoolean()
  blocked!: boolean;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  reason?: string;
}

export class UpdateTenantDto {
  @IsOptional()
  @IsString()
  @MaxLength(200)
  name?: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  ownerName?: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  email?: string;

  @IsOptional()
  @IsString()
  @MaxLength(40)
  phone?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  notes?: string;

  @IsOptional()
  @IsString()
  @MaxLength(40)
  plan?: string;
}

export class SetWhatsAppLimitDto {
  @IsInt()
  @Min(0)
  @Max(1000000)
  limit!: number;
}

export class CreateTenantDto {
  @IsString()
  @MinLength(2)
  @MaxLength(200)
  name!: string;

  @IsString()
  @MinLength(3)
  @MaxLength(200)
  ownerName!: string;

  @IsString()
  email!: string;

  @IsOptional()
  @IsString()
  @MaxLength(40)
  phone?: string;

  /**
   * Password for the tenant's first ADMIN user. Generated server-side when omitted, returned
   * once, and never stored in plain text.
   */
  @IsOptional()
  @IsString()
  @MinLength(10)
  @MaxLength(200)
  adminPassword?: string;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(1000000)
  whatsappMonthlyLimit?: number;
}