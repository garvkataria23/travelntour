import { Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';

/**
 * Prisma client.
 *
 * Monetary columns are `Decimal(18,2)`, not `Float`. `Float` maps to Postgres `double precision`,
 * which cannot represent 0.1, so arithmetic on stored money accumulates error — and this database
 * backs GST invoices and a P&L that gets exported to an accountant.
 *
 * Prisma returns Decimal.js objects for those columns. Decimal's `valueOf()` is a **string**, so
 * passing one to `Math.min`, `Math.round` or `+` yields NaN or string concatenation. Every read of
 * a money column therefore goes through `toNumber()` from src/common/money.ts, and the compiler
 * enforces it: the Decimal→number change surfaced every site that needed it rather than letting
 * them silently corrupt a total.
 *
 * NOTE: a driver adapter with Decimal→number result mapping would remove that manual conversion,
 * but the pinned Prisma version does not expose it, so it is not used here.
 */
@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  async onModuleInit() {
    await this.$connect();
  }

  async onModuleDestroy() {
    await this.$disconnect();
  }
}