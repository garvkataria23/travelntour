import { Type } from 'class-transformer';
import {
  IsEnum,
  IsISO8601,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
} from 'class-validator';
import { ExpenseCategory } from '@prisma/client';

export class CreateExpenseDto {
  @IsEnum(ExpenseCategory, { message: 'Category must be DIRECT or OPERATING' })
  category: ExpenseCategory;

  @IsString()
  @IsNotEmpty({ message: 'Title is required' })
  @MinLength(2, { message: 'Title is too short' })
  @MaxLength(120)
  title: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  description?: string;

  @Type(() => Number)
  @IsNumber({}, { message: 'Amount must be a number' })
  amount: number;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  payableTo?: string;

  @IsOptional()
  @IsISO8601({}, { message: 'Incurred date must be a valid date' })
  incurredOn?: string; // ISO date; defaults to today

  @IsOptional()
  @IsString()
  @MaxLength(120)
  createdBy?: string;

  @IsOptional()
  @IsString()
  @MaxLength(10)
  currency?: string;

  @IsOptional()
  @IsString()
  @MinLength(2)
  paymentMethod?: string;
}
