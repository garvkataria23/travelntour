import { Type } from 'class-transformer';
import {
  IsEmail,
  IsIn,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
  Matches,
} from 'class-validator';
import { Role } from '@prisma/client';

export class CreateUserDto {
  @IsString()
  @MaxLength(120)
  name: string;

  @IsEmail({}, { message: 'Enter a valid email address' })
  email: string;

  @IsOptional()
  @Matches(/^\+?[0-9]{7,15}$/, { message: 'Enter a valid phone number' })
  phone?: string;

  @IsString()
  @MinLength(6, { message: 'Password must be at least 6 characters' })
  password: string;

  @IsOptional()
  @IsIn([Role.ADMIN, Role.STAFF])
  role?: Role;
}