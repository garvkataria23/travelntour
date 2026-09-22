import { Injectable } from '@nestjs/common';
import { AuditService } from '../audit/audit.service';
import { AuthUser } from '../common/current-user.decorator';
import { PrismaService } from '../prisma/prisma.service';
import { UpdateBusinessDto } from './dto/update-business.dto';

@Injectable()
export class BusinessesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async profile(businessId: string) {
    return this.prisma.business.findUnique({ where: { id: businessId } });
  }

  async update(user: AuthUser, dto: UpdateBusinessDto) {
    const data: Record<string, unknown> = {};
    if (dto.name !== undefined) data.name = dto.name;
    if (dto.email !== undefined) data.email = dto.email;
    if (dto.phone !== undefined) data.phone = dto.phone;
    if (dto.logo !== undefined) data.logo = dto.logo;
    if (dto.timezone !== undefined) data.timezone = dto.timezone;
    if (dto.currency !== undefined) data.currency = dto.currency;
    const updated = await this.prisma.business.update({
      where: { id: user.businessId },
      data,
    });
    await this.audit.log(user, 'BUSINESS_UPDATED', 'Business', updated.id, {
      fields: Object.keys(data),
    });
    return updated;
  }
}