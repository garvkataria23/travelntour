import { Module } from '@nestjs/common';
import { AuditModule } from '../audit/audit.module';
import { QueueModule } from '../queue/queue.module';
import { MessagesController } from './messages.controller';
import { MessagesService } from './messages.service';

@Module({
  imports: [AuditModule, QueueModule],
  controllers: [MessagesController],
  providers: [MessagesService],
})
export class MessagesModule {}