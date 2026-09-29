import { Module } from '@nestjs/common';
import { StorageModule } from '../storage/storage.module';
import { WhatsAppModule } from '../whatsapp/whatsapp.module';
import { InvoicesController } from './invoices.controller';
import { InvoicesService } from './invoices.service';

@Module({
  imports: [WhatsAppModule, StorageModule],
  controllers: [InvoicesController],
  providers: [InvoicesService],
  exports: [InvoicesService],
})
export class InvoicesModule {}