import { Injectable, Logger, OnApplicationShutdown, OnModuleInit } from '@nestjs/common';
import { BackupTrigger } from '@prisma/client';
import { Queue, Worker } from 'bullmq';
import { AUTOMATION_QUEUE } from '../queue/queue.module';
import { BackupService } from './backup.service';

/**
 * Unattended backups.
 *
 * Previously there was no scheduler at all: every "backup" was a human clicking a button in a
 * browser tab, and the client-side Drive path reported success even when the upload failed. So the
 * honest answer to "do we have backups?" was "no".
 *
 * A dedicated repeatable BullMQ job fixes that. It runs every tenant sequentially inside one
 * process, which is the right shape here: a single scheduler avoids N instances each uploading the
 * same archives, and tenant-level concurrency would add nothing when the bottleneck is one Drive
 * folder.
 *
 * OFF BY DEFAULT
 *
 * A schedule that uploads data to a third party should be an explicit decision, not a side effect
 * of booting. Set `BACKUP_SCHEDULE_ENABLED=true` and `BACKUP_CRON_HOURS` (default 24) to turn it on.
 *
 * NOTE ON NO DUPLICATE SCHEDULES
 *
 * `upsertJobScheduler` is keyed on `${BACKUP_JOB}-${hours}h`, so re-registering the same interval
 * replaces the existing repeatable rather than adding a second one. Two schedulers pointing at the
 * same key cannot both exist in Redis, which is what makes a restart safe. The key includes the
 * interval on purpose: changing the interval is then a new key that replaces the old one, instead of
 * leaving the previous cadence running forever.
 */

const BACKUP_JOB = 'scheduled-backup';

@Injectable()
export class BackupScheduler implements OnModuleInit, OnApplicationShutdown {
  private readonly logger = new Logger(BackupScheduler.name);
  private worker?: Worker;
  private queue?: Queue;

  constructor(private readonly backups: BackupService) {}

  onModuleInit() {
    if (!this.isEnabled()) {
      this.logger.log(
        'Scheduled backups are disabled. Set BACKUP_SCHEDULE_ENABLED=true to archive every tenant on a timer.',
      );
      return;
    }
    if (!this.backups.destinationStatus().configured) {
      // Loud, because a scheduler that silently archives nothing is worse than no scheduler.
      this.logger.error(
        'BACKUP_SCHEDULE_ENABLED is set but no Drive destination is configured. Backups will fail. ' +
          'Connect a Google account from Settings > Backups, or set GOOGLE_SERVICE_ACCOUNT_JSON and GOOGLE_DRIVE_FOLDER_ID.',
      );
      return;
    }

    const connection = { url: process.env.REDIS_URL || 'redis://localhost:6379' };
    this.queue = new Queue(AUTOMATION_QUEUE, { connection });

    this.worker = new Worker(
      AUTOMATION_QUEUE,
      async (job) => {
        if (job.name !== BACKUP_JOB) return;
        const results = await this.backups.runBackup(null, { trigger: BackupTrigger.SCHEDULED });
        const failed = results.filter((r) => r.status === 'FAILED');
        this.logger.log(
          `Scheduled backup finished: ${results.length - failed.length}/${results.length} succeeded.`,
        );
      },
      { connection, concurrency: 1 },
    );

    this.worker.on('failed', (job, err) => {
      this.logger.error(`Scheduled backup job failed: ${err.message}`);
    });

    void this.registerSchedule();
    this.logger.log(`Scheduled backups enabled, every ${this.everyHours()}h.`);
  }

  private isEnabled(): boolean {
    return process.env.BACKUP_SCHEDULE_ENABLED === 'true';
  }

  private everyHours(): number {
    const hours = Number(process.env.BACKUP_CRON_HOURS ?? 24);
    return Number.isFinite(hours) && hours >= 1 ? hours : 24;
  }

  private async registerSchedule(): Promise<void> {
    if (!this.queue) return;
    try {
      const hours = this.everyHours();
      const currentKey = `${BACKUP_JOB}-${hours}h`;
      const existing = (await this.queue.getJobSchedulers?.()) ?? [];
      for (const s of existing) {
        if ((s.name === BACKUP_JOB || s.key?.startsWith(`${BACKUP_JOB}-`)) && s.key !== currentKey) {
          await this.queue.removeJobScheduler(s.key);
        }
      }
      await this.queue.upsertJobScheduler(
        currentKey,
        { every: hours * 60 * 60 * 1000 },
        { name: BACKUP_JOB, opts: { removeOnComplete: 10, removeOnFail: 20 } },
      );
    } catch (err) {
      this.logger.error(`Could not register the backup schedule: ${String(err)}`);
    }
  }

  /** Runs a backup right now. Used by the admin UI and available for an external cron. */
  async runNow(): Promise<number> {
    const results = await this.backups.runBackup(null, { trigger: BackupTrigger.MANUAL });
    return results.length;
  }

  async onApplicationShutdown() {
    await this.worker?.close();
    await this.queue?.close();
  }
}