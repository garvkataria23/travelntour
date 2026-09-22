import { Module } from '@nestjs/common';
import { AuditModule } from '../audit/audit.module';
import { QueueModule } from '../queue/queue.module';
import { TemplatesModule } from '../templates/templates.module';
import { AutomationController } from './automation.controller';
import { AutomationService } from './automation.service';

@Module({
  imports: [AuditModule, QueueModule],
  controllers: [AutomationController],
  providers: [AutomationService],
  exports: [AutomationService],
})
export class AutomationModule {}