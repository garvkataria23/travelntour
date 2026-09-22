import { Module } from '@nestjs/common';
import { AuditModule } from '../audit/audit.module';
import { SettingsController } from './settings.controller';

@Module({
  imports: [AuditModule],
  controllers: [SettingsController],
})
export class SettingsModule {}