import { Transform } from 'class-transformer';
import { IsEmail, IsOptional, IsString, IsUUID, Matches, MinLength, ValidateIf } from 'class-validator';

export class RegisterDto {
  @IsString()
  name: string;

  @Transform(({ value }) => String(value).trim().toLowerCase())
  @IsEmail({}, { message: 'Enter a valid email address' })
  email: string;

  @IsString()
  @MinLength(6, { message: 'Password must be at least 6 characters' })
  password: string;

  @IsOptional()
  @IsString()
  @Matches(/^\+?[0-9]{7,15}$/, { message: 'Enter a valid phone number' })
  phone?: string;

  @IsOptional()
  @IsString()
  businessName?: string;

  @IsOptional()
  @IsString()
  role?: string;

  @IsOptional()
  @IsString()
  userAgent?: string;

  @IsOptional()
  @IsString()
  ip?: string;

  @IsOptional()
  @IsString()
  @IsUUID('all', { message: 'Invalid invite id' })
  @ValidateIf((o: RegisterDto) => Boolean(o.inviteId))
  inviteId?: string;
}