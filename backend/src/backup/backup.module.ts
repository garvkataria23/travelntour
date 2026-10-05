import { Module } from '@nestjs/common';
import { AuditModule } from '../audit/audit.module';
import { PrismaModule } from '../prisma/prisma.module';
import { QueueModule } from '../queue/queue.module';
import { StorageModule } from '../storage/storage.module';
import { BackupController } from './backup.controller';
import { BackupScheduler } from './backup.scheduler';
import { BackupService } from './backup.service';
import { DriveDestinationService } from './drive-destination.service';
import { RestoreService } from './restore.service';

@Module({
  imports: [PrismaModule, AuditModule, StorageModule, QueueModule],
  controllers: [BackupController],
  providers: [
    BackupService,
    BackupScheduler,
    RestoreService,
    // Resolves which Drive credential is active. Loaded once on module init so a connected Google
    // account is picked up without a restart.
    DriveDestinationService,
  ],
  exports: [BackupService, RestoreService, DriveDestinationService],
})
export class BackupModule {}