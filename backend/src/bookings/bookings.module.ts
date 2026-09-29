import { Module } from '@nestjs/common';
import { AuditModule } from '../audit/audit.module';
import { AutomationModule } from '../automation/automation.module';
import { InvoicesModule } from '../invoices/invoices.module';
import { QueueModule } from '../queue/queue.module';
import { BookingsController } from './bookings.controller';
import { BookingsService } from './bookings.service';

@Module({
  imports: [AuditModule, AutomationModule, QueueModule, InvoicesModule],
  controllers: [BookingsController],
  providers: [BookingsService],
})
export class BookingsModule {}