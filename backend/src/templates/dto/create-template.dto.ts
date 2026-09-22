import { Type } from 'class-transformer';
import {
  IsArray,
  IsEnum,
  IsIn,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
} from 'class-validator';
import { TemplateCategory, TemplateStatus } from '@prisma/client';

export class CreateTemplateDto {
  @IsString()
  @MinLength(2, { message: 'Template name is too short' })
  @MaxLength(120)
  name: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsEnum(TemplateCategory)
  category?: TemplateCategory;

  @IsString()
  @MinLength(1, { message: 'Template content cannot be empty' })
  content: string;

  @IsOptional()
  @IsString()
  whatsappTemplateName?: string;

  @IsOptional()
  @IsEnum(TemplateStatus)
  status?: TemplateStatus;

  @IsOptional()
  @IsString()
  language?: string;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  variables?: string[];
}