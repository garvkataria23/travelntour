import { Injectable, Logger, OnApplicationShutdown, OnModuleInit } from '@nestjs/common';
import { Queue, Worker } from 'bullmq';
import { PrismaService } from '../prisma/prisma.service';
import { AUTOMATION_QUEUE, WHATSAPP_SEND_QUEUE } from '../queue/queue.module';

const RECOVERY_SCAN = 'recovery-scan';

/**
 * Runs periodically and re-dispatches SCHEDULED messages whose BullMQ job
 * was lost (e.g. Redis restart) and resets PROCESSING messages that got
 * stuck after a worker crash. This guarantees scheduled messages are never
 * silently dropped even if Redis/broker state is lost.
 */
@Injectable()
export class AutomationRecoveryWorker implements OnModuleInit, OnApplicationShutdown {
  private readonly logger = new Logger(AutomationRecoveryWorker.name);
  private worker?: Worker;
  private whatsappQueue?: Queue;

  constructor(private readonly prisma: PrismaService) {}

  onModuleInit() {
    const connection = {
      url: process.env.REDIS_URL || 'redis://localhost:6379',
      maxRetriesPerRequest: 0,
    };
    this.whatsappQueue = new Queue(WHATSAPP_SEND_QUEUE, { connection });
    const automationQueue = new Queue(AUTOMATION_QUEUE, { connection });

    this.worker = new Worker(
      AUTOMATION_QUEUE,
      async (job) => {
        if (job.name === RECOVERY_SCAN) {
          await this.scan();
        }
      },
      { connection },
    );

    this.worker.on('completed', (job) => {
      if (job?.name === RECOVERY_SCAN) this.logger.log('Recovery scan completed');
    });
    this.worker.on('error', (err) => this.logger.error(`Recovery worker error: ${err.message}`));

    automationQueue
      .upsertJobScheduler(RECOVERY_SCAN, { every: 45000 }, { name: RECOVERY_SCAN })
      .then(() => this.logger.log('Recovery scheduler installed'))
      .catch((err) => this.logger.warn(`Could not install recovery scheduler: ${err.message}`));
  }

  async onApplicationShutdown() {
    await this.worker?.close();
    await this.whatsappQueue?.close();
  }

  private async scan() {
    const now = new Date();
    const whatsappQueue = this.whatsappQueue;
    if (!whatsappQueue) return;

    // Reset PROCESSING messages stuck for more than 10 minutes.
    const stuck = await this.prisma.scheduledMessage.updateMany({
      where: {
        status: 'PROCESSING',
        updatedAt: { lte: new Date(now.getTime() - 10 * 60 * 1000) },
      },
      data: { status: 'SCHEDULED' },
    });
    if (stuck.count > 0) {
      this.logger.warn(`Reset ${stuck.count} stuck PROCESSING messages to SCHEDULED`);
    }

    // Re-dispatch past-due SCHEDULED messages. jobId is idempotent in BullMQ,
    // so re-adding is safe even if the job is already present.
    const due = await this.prisma.scheduledMessage.findMany({
      where: { status: 'SCHEDULED', scheduledAt: { lte: now } },
      take: 500,
      select: { id: true },
    });

    for (const message of due) {
      const jobId = `sm_${message.id}`;
      await whatsappQueue.add(
        'send',
        { scheduledMessageId: message.id },
        {
          jobId,
          delay: 0,
          attempts: 3,
          backoff: { type: 'exponential', delay: 10000 },
          removeOnComplete: true,
          removeOnFail: false,
        },
      );
      await this.prisma.scheduledMessage.update({
        where: { id: message.id },
        data: { bullmqJobId: jobId },
      });
    }
    if (due.length > 0) {
      this.logger.log(`Re-dispatched ${due.length} due scheduled messages`);
    }
  }
}