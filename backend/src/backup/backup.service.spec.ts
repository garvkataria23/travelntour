import { BadRequestException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { BackupStatus, BackupTrigger } from '@prisma/client';
import { BackupService } from './backup.service';

import type { StorageService } from '../storage/storage.service';
import type { AuditService } from '../audit/audit.service';
import type { PrismaService } from '../prisma/prisma.service';

/**
 * Every method on this service is SUPER_ADMIN-only, so "tenant isolation" here has a specific and
 * slightly unusual meaning that is easy to get wrong:
 *
 *   There is no cross-tenant escalation available, because only SUPER_ADMIN holds a backup
 *   permission at all, and a SUPER_ADMIN is the platform operator - reading any tenant's archive is
 *   their job, not a leak.
 *
 * The risks that DO exist are the opposite ones:
 *
 *   - a tenant-scoped role (ADMIN/MANAGER/STAFF) reaching a backup endpoint by any route, including
 *     the scheduler's own entry point; and
 *   - an operator action silently affecting the WRONG tenant, e.g. a run id being read or deleted
 *     without confirming what it belongs to, so the wrong tenant's archive is downloaded or removed
 *     while the operator believes they targeted another.
 *
 * Both are what these tests pin down.
 */

const SUPER_ADMIN = { id: 'super-1', businessId: 'biz-1', role: 'SUPER_ADMIN' } as never;
// The tenant-scoped roles are exercised through the `tenants` table below rather than as constants,
// so that a role can never quietly go untested.

interface RunOverrides {
  id?: string;
  businessId?: string | null;
  status?: BackupStatus;
  driveFileId?: string | null;
  fileName?: string | null;
}

/** A complete, well-formed row. `update()` merges onto this so `toResult` always has every field. */
const BASE_RUN = {
  id: 'run-1',
  businessId: 'biz-1',
  trigger: BackupTrigger.MANUAL,
  status: BackupStatus.SUCCEEDED,
  format: 'json',
  fileName: 'flyconnect-backup-biz-1.json',
  driveFileId: 'drive-file-1',
  driveWebViewLink: null,
  sizeBytes: BigInt(1234),
  sha256: 'a'.repeat(64),
  recordCounts: {},
  startedAt: new Date('2026-10-01T00:00:00.000Z'),
  finishedAt: new Date('2026-10-01T00:05:00.000Z'),
  errorMessage: null,
  triggeredById: null,
};

function makeService(runs: RunOverrides[] = [], businesses: Array<{ id: string; name: string }> = []) {
  const backupRuns = runs.map((r) => ({ ...BASE_RUN, ...r }));

  const prisma = {
    business: {
      findMany: jest.fn(async () => businesses),
      findUnique: jest.fn(async (args: { where: { id: string } }) =>
        businesses.find((b) => b.id === args.where.id) ?? null,
      ),
    },
backupRun: {
      // Honours `where`, unlike a bare `async () => backupRuns`. A double that ignores the filter
      // would make the service look correct for free: coverage() relies on `status: SUCCEEDED` to
      // decide what counts as a backup, and a test double that returned every row would report a
      // FAILED run as coverage.
      findMany: jest.fn(async (args: { where?: Record<string, unknown> } = {}) => {
        const where = args.where ?? {};
        return backupRuns.filter((r) =>
          Object.entries(where).every(([key, value]) => (r as Record<string, unknown>)[key] === value),
        );
      }),
      count: jest.fn(async () => backupRuns.length),
      findUnique: jest.fn(async (args: { where: { id: string } }) =>
        backupRuns.find((r) => r.id === args.where.id) ?? null,
      ),
      create: jest.fn(async () => ({ id: 'run-new', status: BackupStatus.RUNNING })),
// Merges the update patch onto the stored row, the way Prisma does. Returning the patch alone
      // would drop `recordCounts`/`finishedAt` and break `toResult`, which reads them.
      update: jest.fn(async (args: { where: { id: string }; data: Record<string, unknown> }) => ({
        ...BASE_RUN,
        ...args.data,
      })),
    },
  };

  const drive = {
    isConfigured: jest.fn(() => true),
    verify: jest.fn(async () => ({ ok: true, accountEmail: 'svc@project.iam.gserviceaccount.com' })),
    upload: jest.fn(async () => ({ id: 'drive-new', size: 999, webViewLink: 'https://drive/x' })),
    download: jest.fn(async () => Buffer.from('{}')),
    remove: jest.fn(async () => undefined),
    list: jest.fn(async () => []),
  };

  const storage = {
    exportBusinessBackup: jest.fn(async (businessId: string) => ({
      appName: 'FlyConnect',
      version: '2.0.0',
      exportedAt: '2026-10-01T00:00:00.000Z',
      businessId,
      counts: { customers: 2 },
      data: {},
    })),
  };

const audit = { log: jest.fn(async () => undefined) };
  const service = new BackupService(
    prisma as unknown as PrismaService,
    storage as unknown as StorageService,
    audit as unknown as AuditService,
  );

  // The constructor calls `createDriveClientFromEnv()`, which reads real environment variables and
  // replaces the field. Inject the double afterwards, or every test would be asserting on an
  // unconfigured client built from whatever is in the developer's shell - and the "no destination
  // configured" case would pass for entirely the wrong reason.
  (service as unknown as { drive: unknown }).drive = drive;

  return { service, prisma, drive, storage, audit, runs: backupRuns };
}

describe('BackupService authorization', () => {
  const tenants = [
    { id: 'biz-1', role: 'ADMIN' },
    { id: 'biz-2', role: 'MANAGER' },
    { id: 'biz-3', role: 'STAFF' },
  ] as const;

  it.each(tenants)('a tenant $role cannot trigger a backup', async (t) => {
    const { service } = makeService();
    await expect(
      service.runBackup({ id: 'u', businessId: t.id, role: t.role } as never, {}),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it.each(tenants)('a tenant $role cannot list backup history', async (t) => {
    const { service } = makeService();
    await expect(
      service.listRuns({ id: 'u', businessId: t.id, role: t.role } as never),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it.each(tenants)('a tenant $role cannot read coverage', async (t) => {
    // Coverage is global: it lists every tenant and whether it has a valid backup. Handing that to
    // a tenant admin would disclose the existence and backup state of businesses that are not theirs.
    const { service } = makeService([], [{ id: 'biz-1', name: 'A' }, { id: 'biz-2', name: 'B' }]);
    await expect(
      service.coverage({ id: 'u', businessId: t.id, role: t.role } as never),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it.each(tenants)('a tenant $role cannot configure the destination', async (t) => {
    const { service } = makeService();
    await expect(
      service.verifyDestination({ id: 'u', businessId: t.id, role: t.role } as never),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it.each(tenants)('a tenant $role cannot download an archive', async (t) => {
    const { service } = makeService([{ id: 'run-1', businessId: 'biz-2' }]);
    await expect(
      service.downloadRun({ id: 'u', businessId: t.id, role: t.role } as never, 'run-1'),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it.each(tenants)('a tenant $role cannot delete an archive', async (t) => {
    const { service, drive } = makeService([{ id: 'run-1', businessId: 'biz-2' }]);
    await expect(
      service.deleteRun({ id: 'u', businessId: t.id, role: t.role } as never, 'run-1'),
    ).rejects.toBeInstanceOf(ForbiddenException);
    // Nothing removed from Drive either.
    expect(drive.remove).not.toHaveBeenCalled();
  });

  it('lets the platform owner do all of it', async () => {
    const { service } = makeService([{ id: 'run-1', businessId: 'biz-2' }], [
      { id: 'biz-1', name: 'A' },
      { id: 'biz-2', name: 'B' },
    ]);

    await expect(service.listRuns(SUPER_ADMIN)).resolves.toBeDefined();
    await expect(service.coverage(SUPER_ADMIN)).resolves.toBeDefined();
    await expect(service.getRun(SUPER_ADMIN, 'run-1')).resolves.toBeDefined();
  });
});

describe('BackupService operator targeting', () => {
  it('scopes a targeted backup to exactly the requested tenant', async () => {
    // The bug this guards against: omitting businessId means "every tenant", so an operator who
    // targeted one agency silently archived the entire customer base.
    const { service, storage } = makeService([], [
      { id: 'biz-1', name: 'A' },
      { id: 'biz-2', name: 'B' },
      { id: 'biz-3', name: 'C' },
    ]);

    await service.runBackup(SUPER_ADMIN, { businessId: 'biz-2' });

    expect(storage.exportBusinessBackup).toHaveBeenCalledTimes(1);
    expect(storage.exportBusinessBackup).toHaveBeenCalledWith('biz-2');
  });

  it('archives every tenant only when no target is given', async () => {
    const { service, storage } = makeService([], [
      { id: 'biz-1', name: 'A' },
      { id: 'biz-2', name: 'B' },
    ]);

    await service.runBackup(SUPER_ADMIN);

    expect(storage.exportBusinessBackup).toHaveBeenCalledTimes(2);
  });

  it('reports an unknown tenant as nothing to back up rather than inventing a run', async () => {
    const { service, storage } = makeService();
    // No businesses configured at all.
    await expect(service.runBackup(SUPER_ADMIN)).rejects.toThrow(/No tenants/);
    expect(storage.exportBusinessBackup).not.toHaveBeenCalled();
  });

  it('scopes the history filter to the requested tenant', async () => {
    const { service, prisma } = makeService([{ id: 'run-1', businessId: 'biz-2' }]);

    await service.listRuns(SUPER_ADMIN, { businessId: 'biz-2' });

    expect(prisma.backupRun.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ businessId: 'biz-2' }) }),
    );
  });
});

describe('BackupService failure handling', () => {
it('records FAILED when Drive rejects the upload, never SUCCEEDED', async () => {
    const { service, drive, prisma } = makeService();
    drive.upload.mockRejectedValueOnce(new Error('Drive returned 403'));

    const results = await service.runBackup(SUPER_ADMIN, { businessId: 'biz-1' });

    expect(results[0].status).toBe(BackupStatus.FAILED);
    // The failure is persisted with its reason. Asserted on the write rather than on the returned
    // object: `update()` here merges onto a generic base row, so the returned object would carry
    // this base row's `driveFileId` and tell us nothing about what was actually persisted.
    const update = prisma.backupRun.update.mock.calls.at(-1)?.[0] as unknown as {
      data: { status: BackupStatus; errorMessage: string };
    };
    expect(update.data.status).toBe(BackupStatus.FAILED);
    expect(update.data.errorMessage).toMatch(/403/);
  });

  it('records FAILED when the export itself throws', async () => {
    const { service, storage } = makeService();
    storage.exportBusinessBackup.mockRejectedValueOnce(new Error('database unavailable'));

    const results = await service.runBackup(SUPER_ADMIN, { businessId: 'biz-1' });

    expect(results[0].status).toBe(BackupStatus.FAILED);
    expect(results[0].errorMessage).toMatch(/database unavailable/);
  });

  it('refuses to run at all when no Drive destination is configured', async () => {
    const { service, drive } = makeService();
    drive.isConfigured.mockReturnValueOnce(false);

    await expect(service.runBackup(SUPER_ADMIN, { businessId: 'biz-1' })).rejects.toThrow(
      /No backup destination is configured/,
    );
  });

  it('records SUCCEEDED with a sha256 and Drive file id only after Drive confirms', async () => {
    const { service } = makeService();

    const results = await service.runBackup(SUPER_ADMIN, { businessId: 'biz-1' });

    expect(results[0].status).toBe(BackupStatus.SUCCEEDED);
    // A successful run is required to carry these, by a database constraint as well.
    expect(results[0].driveFileId).toBe('drive-new');
    expect(results[0].sha256).toMatch(/^[0-9a-f]{64}$/);
    expect(results[0].finishedAt).toBeTruthy();
  });

  it('downloads nothing from a run that failed', async () => {
    const { service, drive } = makeService([
      { id: 'run-1', businessId: 'biz-1', status: BackupStatus.FAILED, driveFileId: null },
    ]);

    await expect(service.downloadRun(SUPER_ADMIN, 'run-1')).rejects.toBeInstanceOf(
      BadRequestException,
    );
    expect(drive.download).not.toHaveBeenCalled();
  });

  it('404s an unknown run id rather than reporting an empty archive', async () => {
    const { service } = makeService([]);
    await expect(service.getRun(SUPER_ADMIN, 'nope')).rejects.toBeInstanceOf(NotFoundException);
  });

  it('marks a deleted run SKIPPED and clears its Drive id', async () => {
    // The row survives, so the history of what existed and when it was removed stays auditable. A
    // deleted run must not keep pointing at a Drive file that no longer exists.
    const { service, prisma } = makeService([{ id: 'run-1', businessId: 'biz-1' }]);

    await service.deleteRun(SUPER_ADMIN, 'run-1');

    const update = prisma.backupRun.update.mock.calls.at(-1)?.[0] as unknown as {
      data: { status: BackupStatus; driveFileId: null };
    };
    expect(update.data.status).toBe(BackupStatus.SKIPPED);
    expect(update.data.driveFileId).toBeNull();
  });
});

describe('BackupService coverage', () => {
  it('names tenants that have never had a successful backup', async () => {
    const { service } = makeService(
      [{ id: 'run-1', businessId: 'biz-1', status: BackupStatus.SUCCEEDED }],
      [{ id: 'biz-1', name: 'Covered' }, { id: 'biz-2', name: 'Uncovered' }],
    );

    const coverage = await service.coverage(SUPER_ADMIN);

    expect(coverage.uncovered.map((b) => b.businessId)).toEqual(['biz-2']);
  });

  it('does not count a FAILED run as coverage', async () => {
    // The whole point: a failed backup is not a backup. Counting it would let a tenant believe it is
    // protected when nothing was ever uploaded.
    const { service } = makeService(
      [{ id: 'run-1', businessId: 'biz-1', status: BackupStatus.FAILED }],
      [{ id: 'biz-1', name: 'OnlyTenant' }],
    );

    const coverage = await service.coverage(SUPER_ADMIN);

    expect(coverage.uncovered.map((b) => b.businessId)).toEqual(['biz-1']);
  });

  it('does not count a SKIPPED (deleted) run as coverage', async () => {
    const { service } = makeService(
      [{ id: 'run-1', businessId: 'biz-1', status: BackupStatus.SKIPPED }],
      [{ id: 'biz-1', name: 'OnlyTenant' }],
    );

    const coverage = await service.coverage(SUPER_ADMIN);

    expect(coverage.uncovered).toHaveLength(1);
  });
});
