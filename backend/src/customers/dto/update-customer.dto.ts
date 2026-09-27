import { PartialType } from '@nestjs/swagger';
import { ApiProperty } from '@nestjs/swagger';
import { IsIn, IsInt, IsOptional, Min } from 'class-validator';
import { CustomerStatus } from '@prisma/client';
import { CreateCustomerDto } from './create-customer.dto';

export class UpdateCustomerDto extends PartialType(CreateCustomerDto) {
  /**
   * Version the client last saw. The update is rejected with 409 if another member of
   * staff has saved since, instead of silently overwriting their changes.
   */
  @ApiProperty({ description: 'Version the client last read; required for conflict detection' })
  @IsInt({ message: 'version is required' })
  @Min(0)
  version: number;

  @IsOptional()
  @IsIn([CustomerStatus.ACTIVE, CustomerStatus.INACTIVE])
  status?: CustomerStatus;
}
