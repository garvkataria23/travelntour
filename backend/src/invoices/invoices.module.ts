import { Module } from '@nestjs/common';
import { WhatsAppModule } from '../whatsapp/whatsapp.module';
import { InvoicesController } from './invoices.controller';
import { InvoicesService } from './invoices.service';

@Module({
  imports: [WhatsAppModule],
  controllers: [InvoicesController],
  providers: [InvoicesService],
})
export class InvoicesModule {}