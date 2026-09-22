import { BadRequestException, ConflictException, Injectable } from '@nestjs/common';
import { Customer, CustomerStatus, Prisma } from '@prisma/client';
import { AuthUser } from '../common/current-user.decorator';
import { normalizePhone, isValidPhone } from '../common/utils';
import { paginationMeta } from '../common/pagination';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { CreateCustomerDto } from './dto/create-customer.dto';
import { UpdateCustomerDto } from './dto/update-customer.dto';

@Injectable()
export class CustomersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async list(
    user: AuthUser,
    query: {
      page?: number;
      limit?: number;
      search?: string;
      status?: string;
      sort?: string;
      order?: 'asc' | 'desc';
    },
  ) {
    const page = Number(query.page) || 1;
    const limit = Number(query.limit) || 20;
    const where: Record<string, unknown> = { businessId: user.businessId };

    if (query.status) {
      where.status = query.status as CustomerStatus;
    }
    if (query.search) {
      const term = query.search.trim();
      const digits = term.replace(/[^\d]/g, '');
      const or: Record<string, unknown>[] = [
        { name: { contains: term, mode: 'insensitive' as const } },
        { email: { contains: term, mode: 'insensitive' as const } },
        { phone: { contains: term, mode: 'insensitive' as const } },
      ];
      if (digits.length >= 7) {
        or.push({ phone: { contains: digits } });
      }
      where.OR = or;
    }

    const orderByOptions: Record<string, Prisma.CustomerOrderByWithRelationInput> = {
      name: { name: query.order || 'asc' },
      createdAt: { createdAt: query.order || 'desc' },
      updatedAt: { updatedAt: query.order || 'desc' },
      bookings: { bookings: { _count: query.order || 'desc' } },
    };

    const [items, total] = await Promise.all([
      this.prisma.customer.findMany({
        where,
        orderBy: orderByOptions[query.sort ?? ''] ?? { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
        include: {
          _count: { select: { bookings: true } },
          bookings: {
            orderBy: { departureDate: 'desc' },
            take: 1,
            select: {
              departureDate: true,
              fromCity: true,
              fromAirport: true,
              toCity: true,
              toAirport: true,
              status: true,
            },
          },
        },
      }),
      this.prisma.customer.count({ where }),
    ]);

    return {
      items: items.map((c) => ({
        id: c.id,
        name: c.name,
        phone: c.phone,
        email: c.email,
        status: c.status,
        createdAt: c.createdAt,
        updatedAt: c.updatedAt,
        totalBookings: c._count.bookings,
        lastJourney: c.bookings[0]
          ? {
              departureDate: c.bookings[0].departureDate,
              route: { fromAirport: c.bookings[0].fromAirport, toAirport: c.bookings[0].toAirport, fromCity: c.bookings[0].fromCity, toCity: c.bookings[0].toCity },
              status: c.bookings[0].status,
            }
          : null,
      })),
      meta: paginationMeta(total, page, limit),
    };
  }

  async stats(user: AuthUser) {
    const where = { businessId: user.businessId };
    const [total, active, inactive, booked] = await Promise.all([
      this.prisma.customer.count({ where }),
      this.prisma.customer.count({ where: { ...where, status: 'ACTIVE' } }),
      this.prisma.customer.count({ where: { ...where, status: 'INACTIVE' } }),
      this.prisma.customer.findMany({ where, select: { _count: { select: { bookings: true } } } }),
    ]);
    const repeat = this.totalRepeatCount(booked);
    return { total, active, inactive, repeat };
  }

  private totalRepeatCount(booked: Array<{ _count: { bookings: number } }>) {
    return booked.filter((b) => b._count.bookings > 1).length;
  }

  async get(user: AuthUser, id: string) {
    const customer = await this.prisma.customer.findFirst({
      where: { id, businessId: user.businessId },
      include: {
        bookings: { orderBy: { departureDate: 'desc' } as const },
        messages: { orderBy: { scheduledAt: 'desc' } as const, take: 20 },
      },
    });
    if (!customer) {
      throw new BadRequestException({ message: 'Customer not found', code: 'CUSTOMER_NOT_FOUND' });
    }
    return {
      ...customer,
      stats: {
        totalBookings: customer.bookings.length,
        upcomingTrips: customer.bookings.filter((b) => b.departureDate.getTime() > Date.now() && b.status !== 'CANCELLED').length,
        totalSpent: customer.bookings.reduce((sum, b) => sum + (b.amount ?? 0), 0),
      },
    };
  }

  async findByPhone(user: AuthUser, phone: string): Promise<Customer | null> {
    const phoneNumber = normalizePhone(phone);
    return this.prisma.customer.findUnique({
      where: { businessId_phone: { businessId: user.businessId, phone: phoneNumber } },
    });
  }

  async create(user: AuthUser, dto: CreateCustomerDto) {
    const phone = normalizePhone(dto.phone);
    if (!isValidPhone(phone)) {
      throw new BadRequestException({ message: 'Enter a valid phone number', code: 'INVALID_PHONE' });
    }

    const existing = await this.prisma.customer.findUnique({
      where: { businessId_phone: { businessId: user.businessId, phone } },
    });
    if (existing) {
      // Business-scoped phone matching: return the existing customer instead of duplicating.
      return { ...existing, existed: true };
    }

    const created = await this.prisma.customer.create({
      data: {
        businessId: user.businessId,
        name: dto.name,
        phone,
        email: dto.email,
      },
    });
    await this.audit.log(user, 'CUSTOMER_CREATED', 'Customer', created.id, {
      name: created.name,
      phone: created.phone,
    });
    return { ...created, existed: false };
  }

  async update(user: AuthUser, id: string, dto: UpdateCustomerDto) {
    const existing = await this.prisma.customer.findFirst({
      where: { id, businessId: user.businessId },
    });
    if (!existing) {
      throw new BadRequestException({ message: 'Customer not found', code: 'CUSTOMER_NOT_FOUND' });
    }
    const data: Record<string, unknown> = {};
    if (dto.name !== undefined) data.name = dto.name;
    if (dto.email !== undefined) data.email = dto.email;
    if (dto.status !== undefined) data.status = dto.status;
    if (dto.phone !== undefined) {
      const phone = normalizePhone(dto.phone);
      if (!isValidPhone(phone)) {
        throw new BadRequestException({ message: 'Enter a valid phone number', code: 'INVALID_PHONE' });
      }
      const clash = await this.prisma.customer.findUnique({
        where: { businessId_phone: { businessId: user.businessId, phone } },
      });
      if (clash && clash.id !== existing.id) {
        throw new ConflictException({ message: 'Another customer has this phone number', code: 'PHONE_IN_USE' });
      }
      data.phone = phone;
    }
    const updated = await this.prisma.customer.update({ where: { id }, data });
    await this.audit.log(user, 'CUSTOMER_UPDATED', 'Customer', id, { fields: Object.keys(data) });
    return updated;
  }

  async remove(user: AuthUser, id: string) {
    const existing = await this.prisma.customer.findFirst({
      where: { id, businessId: user.businessId },
      include: { bookings: { select: { id: true } } },
    });
    if (!existing) {
      throw new BadRequestException({ message: 'Customer not found', code: 'CUSTOMER_NOT_FOUND' });
    }
    if (existing.bookings.length > 0) {
      throw new BadRequestException({
        message: 'Customer has bookings. Delete or reassign the bookings first.',
        code: 'CUSTOMER_HAS_BOOKINGS',
      });
    }
    await this.prisma.customer.delete({ where: { id } });
    await this.audit.log(user, 'CUSTOMER_DELETED', 'Customer', id, { name: existing.name });
    return { deleted: true };
  }
}