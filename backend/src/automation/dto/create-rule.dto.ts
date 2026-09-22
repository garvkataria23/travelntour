import {
  IsBoolean,
  IsEnum,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  Max,
  Min,
} from 'class-validator';
import { MessageType, TriggerType } from '@prisma/client';

export class CreateRuleDto {
  @IsString()
  @IsNotEmpty()
  name: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsEnum(TriggerType)
  triggerType: TriggerType;

  @IsEnum(MessageType)
  messageType: MessageType;

  @IsInt()
  @Min(-100000)
  @Max(100000)
  offsetMinutes: number;

  @IsString()
  @IsNotEmpty()
  templateId: string;

  @IsOptional()
  @IsBoolean()
  active?: boolean;
}