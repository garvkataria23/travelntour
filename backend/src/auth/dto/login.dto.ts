import { Transform } from 'class-transformer';
import { IsNotEmpty, IsString, MinLength } from 'class-validator';

export class LoginDto {
  @Transform(({ value }) => String(value).trim().toLowerCase())
  @IsString()
  @IsNotEmpty({ message: 'Enter your username or email' })
  email: string;

  @IsString()
  @MinLength(4, { message: 'Password must be at least 4 characters' })
  password: string;
}