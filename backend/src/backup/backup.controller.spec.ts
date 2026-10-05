import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { BackupStatus, BackupTrigger } from '@prisma/client';
import { BackupController } from './backup.controller';
import { RestoreService } from './restore.service';
import type { BackupService } from './backup.service';
import type { BackupScheduler } from './backup.scheduler';
import type { DriveDestinationService } from './drive-destination.service';

/**
 * Focuses on the safety guarantees of the execute endpoint, which is the one route in the product
 * that permanently destroys data.
 *
 * The service-level tests in `restore.service.spec.ts` cover planning and rewriting. What they
 * cannot see is the sequencing in the controller — in particular that the safety archive is taken
 * for exactly one tenant, before the rewrite, and that a failure aborts. That ordering was wrong
 * once already: the endpoint archived every tenant in the system because the target was not yet
 * known, which both leaked unrelated tenant data into Drive and made a single restore archive the
 * entire customer base.
 */

const SUPER_ADMIN = {
  id: 'admin-1',
  businessId: 'biz-1',
  role: 'SUPER_ADMIN',
} as never;

function uploadedFile() {
  return {
    buffer: Buffer.from('{"archive":"body"}', 'utf8'),
    originalname: 'archive.json',
    mimetype: 'application/json',
    size: 24,
  } as never;
}

/** A plan as `RestoreService.preview()` returns it. */
function plan(overrides: Record<string, unknown> = {}) {
  return {
    runId: 'run-old',
    tenantId: 'biz-42',
    tenantName: 'Acme Travel',
    archiveExportedAt: '2026-10-01T00:00:00.000Z',
    archiveVersion: '2.0.0',
    checksumMatches: true,
    scopes: ['customers', 'bookings'],
    willDelete: { customers: 5 },
    willInsert: { customers: 7 },
    warnings: [],
    blockers: [],
    usersNeedingPasswordReset: [],
    ...overrides,
  };
}

function makeController(
  previewResult: unknown = plan(),
  runBackup: jest.Mock = jest.fn(async () => [{ id: 'safety-1', status: BackupStatus.SUCCEEDED }]),
) {
  const restore = {
    preview: jest.fn(async () => previewResult),
    // Typed with the real parameter list so the call assertions can index into it.
    restore: jest.fn(
      async (
        _user: unknown,
        _buffer: unknown,
        _sha: unknown,
        _scopes: unknown,
        _options: unknown,
      ) => ({ restored: true, tenantId: 'biz-42' }),
    ),
  };
  const backups = {
    runBackup,
    // The OAuth connect flow reloads the Drive client once a grant lands, so an operator does not
    // need a restart. Absent from the older safety-archive tests, hence the default.
    reloadDriveClient: jest.fn(async () => undefined),
  };
  const destinations = {
    canStartConnect: jest.fn(() => true),
    authorizationUrl: jest.fn((state: string) => `https://accounts.google.com/o/oauth2/v2/auth?state=${state}`),
    connect: jest.fn(async () => ({ accountEmail: 'flyconnect.backups@gmail.com', folderId: 'folder-1' })),
    markBroken: jest.fn(async () => undefined),
    summary: jest.fn(async () => null),
  };
  const controller = new BackupController(
    backups as unknown as BackupService,
    { runNow: jest.fn(async () => []) } as unknown as BackupScheduler,
    restore as unknown as RestoreService,
    destinations as unknown as DriveDestinationService,
  );
  return { controller, restore, runBackup, backups, destinations };
}

async function execute(controller: BackupController, body: Record<string, unknown>) {
  return controller.restore(SUPER_ADMIN, uploadedFile(), body as never);
}

describe('BackupController restore', () => {
  const prevRestoreEnabled = process.env.RESTORE_ENABLED;

  beforeEach(() => {
    process.env.RESTORE_ENABLED = 'true';
  });

  afterEach(() => {
    if (prevRestoreEnabled === undefined) {
      delete process.env.RESTORE_ENABLED;
    } else {
      process.env.RESTORE_ENABLED = prevRestoreEnabled;
    }
  });

  describe('feature gate (RESTORE_ENABLED)', () => {
    it('blocks destructive restore execution by default when RESTORE_ENABLED is unset', async () => {
      delete process.env.RESTORE_ENABLED;
      const { controller, restore, runBackup } = makeController(plan());

      const err = await execute(controller, { confirmation: 'RESTORE' }).then(
        () => null,
        (e: unknown) => e,
      );

      expect(err).toBeInstanceOf(ForbiddenException);
      expect((err as ForbiddenException).getResponse()).toMatchObject({ code: 'RESTORE_DISABLED' });
      expect(runBackup).not.toHaveBeenCalled();
      expect(restore.restore).not.toHaveBeenCalled();
    });

    it('blocks safety-backup when RESTORE_ENABLED=false', async () => {
      process.env.RESTORE_ENABLED = 'false';
      const { controller, runBackup } = makeController(plan());

      await expect(controller.safetyBackup(SUPER_ADMIN, { businessId: 'biz-42' })).rejects.toBeInstanceOf(
        ForbiddenException,
      );
      expect(runBackup).not.toHaveBeenCalled();
    });

    it('still permits read-only restore/preview when RESTORE_ENABLED is false', async () => {
      process.env.RESTORE_ENABLED = 'false';
      const { controller, restore } = makeController(plan());

      const result = await controller.preview(SUPER_ADMIN, uploadedFile(), {});
      expect(result.tenantId).toBe('biz-42');
      expect(restore.preview).toHaveBeenCalledTimes(1);
    });
  });

  describe('safety archive', () => {
    it('archives only the tenant the archive belongs to', async () => {
      const { controller, runBackup } = makeController(plan({ tenantId: 'biz-42' }));

      await execute(controller, { confirmation: 'RESTORE' });

      expect(runBackup).toHaveBeenCalledTimes(1);
      expect(runBackup.mock.calls[0][1]).toEqual({
        businessId: 'biz-42',
        trigger: BackupTrigger.PRE_RESTORE,
      });
      // The bug this guards against: no `businessId` means "every tenant".
      expect(runBackup.mock.calls[0][1]).toHaveProperty('businessId');
    });

    it('takes the safety archive before rewriting anything', async () => {
      const order: string[] = [];
      const runBackup = jest.fn(async () => {
        order.push('backup');
        return [{ id: 'safety-1', status: BackupStatus.SUCCEEDED }];
      });
      const { controller, restore } = makeController(plan(), runBackup);
      restore.restore.mockImplementation(async () => {
        order.push('restore');
        return { restored: true, tenantId: 'biz-42' };
      });

      await execute(controller, { confirmation: 'RESTORE' });

      expect(order).toEqual(['backup', 'restore']);
    });

    it('refuses the restore when the safety archive fails', async () => {
      const runBackup = jest.fn(async () => [
        { id: 'safety-1', status: BackupStatus.FAILED, errorMessage: 'Drive rejected the upload' },
      ]);
      const { controller, restore } = makeController(plan(), runBackup);

      const err = await execute(controller, { confirmation: 'RESTORE' }).then(
        () => null,
        (e: unknown) => e,
      );

      expect(err).toBeInstanceOf(BadRequestException);
      const response = (err as BadRequestException).getResponse() as {
        code?: string;
        error?: string;
      };
      expect(response.code).toBe('SAFETY_BACKUP_FAILED');
      expect(response.error).toMatch(/Drive rejected the upload/);
      // The whole point: nothing was written.
      expect(restore.restore).not.toHaveBeenCalled();
    });

    it('refuses the restore when the safety archive produces no result at all', async () => {
      // A silently empty result used to fall through the check and restore unprotected.
      const { controller, restore } = makeController(plan(), jest.fn(async () => []));

      await expect(execute(controller, { confirmation: 'RESTORE' })).rejects.toThrow(
        /safety archive/i,
      );
      expect(restore.restore).not.toHaveBeenCalled();
    });

    it('cannot be told to skip the safety archive', async () => {
      const { controller, runBackup } = makeController(plan());

      // Previously honoured, which made "a restore with no way back" a supported state.
      await execute(controller, { confirmation: 'RESTORE', skipSafetyBackup: 'true' });

      expect(runBackup).toHaveBeenCalledTimes(1);
    });
  });

  describe('preconditions', () => {
    it('previews first so a bad file is rejected before anything is archived', async () => {
      const { controller, restore, runBackup } = makeController(plan());

      await execute(controller, { confirmation: 'RESTORE' });

      expect(restore.preview).toHaveBeenCalledTimes(1);
      expect(restore.preview.mock.invocationCallOrder[0]).toBeLessThan(
        runBackup.mock.invocationCallOrder[0],
      );
    });

    it('propagates a blocked archive without archiving or rewriting', async () => {
      const { controller, restore, runBackup } = makeController(plan({ blockers: ['dangling FK'] }));

      await expect(execute(controller, { confirmation: 'RESTORE' })).rejects.toThrow();

      expect(runBackup).not.toHaveBeenCalled();
      expect(restore.restore).not.toHaveBeenCalled();
    });

    it('records the safety run id so a bad restore can be traced back', async () => {
      const { controller, restore } = makeController(plan());

      await execute(controller, { confirmation: 'RESTORE' });

      const options = restore.restore.mock.calls[0][4] as unknown as { safetyBackupRunId?: string };
      expect(options.safetyBackupRunId).toBe('safety-1');
    });
  });
});
