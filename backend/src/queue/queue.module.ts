import { Module, OnApplicationShutdown, Provider } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { Queue } from 'bullmq';

export const WHATSAPP_SEND_QUEUE = 'whatsapp-send';
export const AUTOMATION_QUEUE = 'automation';
export const NOTIFICATIONS_QUEUE = 'notifications';
export const MAX_SEND_ATTEMPTS = 5;

export const RETRYABLE_ERROR_CODES = [
  'TEMPORARY_ERROR',
  'RATE_LIMIT',
  'TIMEOUT',
  'NETWORK_ERROR',
  'UNKNOWN_ERROR',
  'MESSAGE_TOO_LONG',
];

export interface Queues {
  whatsappQueue: Queue;
  automationQueue: Queue;
  notificationsQueue: Queue;
}

let queues: Queues | null = null;

export function getQueues(): Queues {
  if (!queues) {
    throw new Error('Queue module not initialized');
  }
  return queues;
}

export const QUEUE_SERVICE = Symbol('QUEUE_SERVICE');

const queueProvider: Provider = {
  provide: QUEUE_SERVICE,
  useFactory: (): Queues => {
    const connection = { url: process.env.REDIS_URL || 'redis://localhost:6379' };
    queues = {
      whatsappQueue: new Queue(WHATSAPP_SEND_QUEUE, { connection }),
      automationQueue: new Queue(AUTOMATION_QUEUE, { connection }),
      notificationsQueue: new Queue(NOTIFICATIONS_QUEUE, { connection }),
    };
    return queues;
  },
};

@Module({
  imports: [ConfigModule],
  providers: [queueProvider],
  exports: [QUEUE_SERVICE],
})
export class QueueModule implements OnApplicationShutdown {
  async onApplicationShutdown() {
    if (queues) {
      await Promise.all([
        queues.whatsappQueue.close(),
        queues.automationQueue.close(),
        queues.notificationsQueue.close(),
      ]);
      queues = null;
    }
  }
}