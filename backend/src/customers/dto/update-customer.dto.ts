import { PartialType } from '@nestjs/swagger';
import { IsIn, IsOptional } from 'class-validator';
import { CustomerStatus } from '@prisma/client';
import { CreateCustomerDto } from './create-customer.dto';

export class UpdateCustomerDto extends PartialType(CreateCustomerDto) {
  @IsOptional()
  @IsIn([CustomerStatus.ACTIVE, CustomerStatus.INACTIVE])
  status?: CustomerStatus;
}