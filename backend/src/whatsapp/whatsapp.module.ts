import { Module } from '@nestjs/common';
import { QueueModule } from '../queue/queue.module';
import { TemplatesModule } from '../templates/templates.module';
import { AutomationRecoveryWorker } from './automation-recovery.worker';
import { WhatsAppWebhookController } from './whatsapp.controller';
import { WhatsAppSendWorker } from './whatsapp-send.worker';
import { WhatsAppService } from './whatsapp.service';
import { WebhookService } from './webhook.service';

@Module({
  imports: [QueueModule, TemplatesModule],
  controllers: [WhatsAppWebhookController],
  providers: [WhatsAppService, WebhookService, WhatsAppSendWorker, AutomationRecoveryWorker],
  exports: [WhatsAppService],
})
export class WhatsAppModule {}