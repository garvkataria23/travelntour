import { Module } from '@nestjs/common';
import { AuditModule } from '../audit/audit.module';
import { AutomationModule } from '../automation/automation.module';
import { SettingsController } from './settings.controller';

@Module({
  imports: [AuditModule, AutomationModule],
  controllers: [SettingsController],
})
export class SettingsModule {}