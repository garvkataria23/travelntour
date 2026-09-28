import { Module } from '@nestjs/common';
import { StorageController } from './storage.controller';
import { StorageService } from './storage.service';

@Module({
  controllers: [StorageController],
  providers: [StorageService],
  // Exported so InvoicesService can snapshot issued documents.
  exports: [StorageService],
})
export class StorageModule {}
