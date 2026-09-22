import { IsIn, IsOptional, IsString, Matches, MinLength } from 'class-validator';
import { Role, UserStatus } from '@prisma/client';

export class UpdateUserDto {
  @IsOptional()
  @IsString()
  name?: string;

  @IsOptional()
  @Matches(/^\+?[0-9]{7,15}$/, { message: 'Enter a valid phone number' })
  phone?: string;

  @IsOptional()
  @IsIn([Role.ADMIN, Role.STAFF])
  role?: Role;

  @IsOptional()
  @IsIn([UserStatus.ACTIVE, UserStatus.INACTIVE])
  status?: UserStatus;

  @IsOptional()
  @IsString()
  @MinLength(6, { message: 'Password must be at least 6 characters' })
  password?: string;
}