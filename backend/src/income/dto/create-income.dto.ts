import { Type } from 'class-transformer';
import { IsEnum, IsISO8601, IsNotEmpty, IsNumber, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';
import { IncomeCategory } from '@prisma/client';

export class CreateIncomeDto {
  @IsEnum(IncomeCategory, { message: 'Category must be TICKET_SALE, COMMISSION, REFUND or OTHER' })
  category: IncomeCategory;

  @IsString()
  @IsNotEmpty({ message: 'Title is required' })
  @MinLength(2, { message: 'Title is too short' })
  @MaxLength(120)
  title: string;

  @Type(() => Number)
  @IsNumber({}, { message: 'Amount must be a number' })
  amount: number;

  @IsOptional()
  @IsISO8601({}, { message: 'Received date must be a valid date' })
  receivedOn?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  note?: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  reference?: string;

  @IsOptional()
  @IsString()
  @MaxLength(10)
  currency?: string;
}