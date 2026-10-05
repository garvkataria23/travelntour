import { BackupTrigger } from '@prisma/client';
import { BackupScheduler } from './backup.scheduler';
import type { BackupService } from './backup.service';

interface FakeSchedulerEntry {
  key: string;
  name: string;
  every?: number;
}

const activeSchedulers = new Map<string, FakeSchedulerEntry>();
const upsertJobScheduler = jest.fn(
  async (key: string, repeatOpts: { every?: number }, template?: { name?: string }) => {
    activeSchedulers.set(key, {
      key,
      name: template?.name ?? 'scheduled-backup',
      every: repeatOpts.every,
    });
    return { id: key };
  },
);
const getJobSchedulers = jest.fn(async () => Array.from(activeSchedulers.values()));
const removeJobScheduler = jest.fn(async (key: string) => activeSchedulers.delete(key));
const queueClose = jest.fn(async () => undefined);
const workerClose = jest.fn(async () => undefined);
const workerOn = jest.fn();

jest.mock('bullmq', () => ({
  Queue: jest.fn().mockImplementation(() => ({
    upsertJobScheduler,
    getJobSchedulers,
    removeJobScheduler,
    close: queueClose,
  })),
  Worker: jest.fn().mockImplementation(() => ({
    on: workerOn,
    close: workerClose,
  })),
}));

function makeBackups(configured = true) {
  return {
    destinationStatus: jest.fn(() => ({
      configured,
      reachable: configured,
      serviceAccountEmail: configured ? 'svc@project.iam.gserviceaccount.com' : '',
    })),
    runBackup: jest.fn(async () => [{ id: 'run-1', status: 'SUCCEEDED' }]),
  };
}

describe('BackupScheduler', () => {
  const prevEnabled = process.env.BACKUP_SCHEDULE_ENABLED;
  const prevHours = process.env.BACKUP_CRON_HOURS;

  beforeEach(() => {
    activeSchedulers.clear();
    jest.clearAllMocks();
    delete process.env.BACKUP_SCHEDULE_ENABLED;
    delete process.env.BACKUP_CRON_HOURS;
  });

  afterEach(() => {
    if (prevEnabled === undefined) delete process.env.BACKUP_SCHEDULE_ENABLED;
    else process.env.BACKUP_SCHEDULE_ENABLED = prevEnabled;
    if (prevHours === undefined) delete process.env.BACKUP_CRON_HOURS;
    else process.env.BACKUP_CRON_HOURS = prevHours;
  });

  it('is disabled by default and registers no repeatable job when BACKUP_SCHEDULE_ENABLED is not true', () => {
    const backups = makeBackups(true);
    const scheduler = new BackupScheduler(backups as unknown as BackupService);

    scheduler.onModuleInit();

    expect(upsertJobScheduler).not.toHaveBeenCalled();
    expect(activeSchedulers.size).toBe(0);
  });

  it('refuses to register a schedule when Drive destination is unconfigured', () => {
    process.env.BACKUP_SCHEDULE_ENABLED = 'true';
    const backups = makeBackups(false);
    const scheduler = new BackupScheduler(backups as unknown as BackupService);

    scheduler.onModuleInit();

    expect(upsertJobScheduler).not.toHaveBeenCalled();
    expect(activeSchedulers.size).toBe(0);
  });

  it('guarantees no duplicate schedules when re-registered with the same interval', async () => {
    process.env.BACKUP_SCHEDULE_ENABLED = 'true';
    process.env.BACKUP_CRON_HOURS = '24';

    const backups = makeBackups(true);
    const first = new BackupScheduler(backups as unknown as BackupService);
    first.onModuleInit();
    await new Promise((resolve) => setImmediate(resolve));

    const second = new BackupScheduler(backups as unknown as BackupService);
    second.onModuleInit();
    await new Promise((resolve) => setImmediate(resolve));

    expect(upsertJobScheduler).toHaveBeenCalledTimes(2);
    expect(Array.from(activeSchedulers.keys())).toEqual(['scheduled-backup-24h']);
    expect(activeSchedulers.get('scheduled-backup-24h')?.every).toBe(24 * 60 * 60 * 1000);
  });

  it('replaces the old cadence when BACKUP_CRON_HOURS changes from 24 to 12 so the old cadence does not survive', async () => {
    process.env.BACKUP_SCHEDULE_ENABLED = 'true';
    process.env.BACKUP_CRON_HOURS = '24';

    const backups = makeBackups(true);
    const first = new BackupScheduler(backups as unknown as BackupService);
    first.onModuleInit();
    await new Promise((resolve) => setImmediate(resolve));

    expect(Array.from(activeSchedulers.keys())).toEqual(['scheduled-backup-24h']);

    process.env.BACKUP_CRON_HOURS = '12';
    const second = new BackupScheduler(backups as unknown as BackupService);
    second.onModuleInit();
    await new Promise((resolve) => setImmediate(resolve));

    expect(removeJobScheduler).toHaveBeenCalledWith('scheduled-backup-24h');
    expect(Array.from(activeSchedulers.keys())).toEqual(['scheduled-backup-12h']);
    expect(activeSchedulers.get('scheduled-backup-12h')?.every).toBe(12 * 60 * 60 * 1000);
  });

  it('falls back to 24h when BACKUP_CRON_HOURS is invalid or below 1', async () => {
    process.env.BACKUP_SCHEDULE_ENABLED = 'true';
    process.env.BACKUP_CRON_HOURS = '0';

    const backups = makeBackups(true);
    const scheduler = new BackupScheduler(backups as unknown as BackupService);
    scheduler.onModuleInit();
    await new Promise((resolve) => setImmediate(resolve));

    expect(Array.from(activeSchedulers.keys())).toEqual(['scheduled-backup-24h']);
    expect(activeSchedulers.get('scheduled-backup-24h')?.every).toBe(24 * 60 * 60 * 1000);
  });

  it('runs a manual backup across all tenants via runNow()', async () => {
    const backups = makeBackups(true);
    const scheduler = new BackupScheduler(backups as unknown as BackupService);

    const count = await scheduler.runNow();

    expect(count).toBe(1);
    expect(backups.runBackup).toHaveBeenCalledWith(null, { trigger: BackupTrigger.MANUAL });
  });
});
