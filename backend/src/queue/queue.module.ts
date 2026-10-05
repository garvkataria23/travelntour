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

/**
 * Single entry point for scheduling a WhatsApp send.
 *
 * The jobId must change on every (re)enqueue. BullMQ silently ignores an add() whose jobId
 * already exists, so reusing a stable id meant `retry()` flipped the row back to SCHEDULED and
 * returned success while the previously failed job sat in Redis — the message was never sent.
 */
export async function enqueueSendJob(
  queue: Queue,
  scheduledMessageId: string,
  options: { delay?: number; sequence?: number } = {},
): Promise<string> {
  const { delay = 0, sequence = 0 } = options;
  const jobId = `sm_${scheduledMessageId}_s${sequence}`;

  // Drop the previous job (if any) so the old id cannot swallow this enqueue and so
  // failed jobs do not accumulate in Redis forever (they are enqueued with removeOnFail: false).
  for (const candidate of [jobId, `sm_${scheduledMessageId}`]) {
    try {
      const existing = await queue.getJob(candidate);
      if (existing) await existing.remove();
    } catch {
      // A job that is currently locked by an active worker cannot be removed; it will finish
      // and be discarded. Not fatal for the enqueue itself.
    }
  }

  await queue.add(
    'send',
    { scheduledMessageId },
    {
      jobId,
      delay,
      attempts: MAX_SEND_ATTEMPTS,
      backoff: { type: 'exponential', delay: 5000 },
      removeOnComplete: true,
      removeOnFail: true,
    },
  );
  return jobId;
}

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