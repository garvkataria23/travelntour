import { Transform } from 'class-transformer';
import { IsNotEmpty, IsString, MaxLength, MinLength } from 'class-validator';

export class LoginDto {
  @Transform(({ value }) => String(value).trim().toLowerCase())
  @IsString()
  @IsNotEmpty({ message: 'Enter your username or email' })
  @MaxLength(255)
  email: string;

  @IsString()
  @MinLength(4, { message: 'Password must be at least 4 characters' })
  @MaxLength(128, { message: 'Password must not exceed 128 characters' })
  password: string;
}