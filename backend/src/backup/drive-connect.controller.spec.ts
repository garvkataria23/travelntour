import { ForbiddenException, ServiceUnavailableException } from '@nestjs/common';
import { BackupController } from './backup.controller';
import type { Response as ExpressResponse } from 'express';
import type { BackupService } from './backup.service';
import type { BackupScheduler } from './backup.scheduler';
import type { RestoreService } from './restore.service';
import type { DriveDestinationService } from './drive-destination.service';

/**
 * The Google connect flow is the one place where a browser arrives without a FlyConnect bearer token,
 * which makes the `state` nonce the only thing standing between an attacker and FlyConnect taking
 * over the backup destination. These tests treat that nonce as the thing worth protecting.
 */

const SUPER_ADMIN = { id: 'super-1', businessId: 'biz-1', role: 'SUPER_ADMIN' } as never;
const ADMIN = { id: 'admin-1', businessId: 'biz-1', role: 'ADMIN' } as never;
const STAFF = { id: 'staff-1', businessId: 'biz-1', role: 'STAFF' } as never;

interface HarnessOptions {
  canStartConnect?: boolean;
  connectError?: Error;
}

function makeController(opts: HarnessOptions = {}) {
  const backups = {
    runBackup: jest.fn(async () => [{ id: 'r1', status: 'SUCCEEDED' }]),
    reloadDriveClient: jest.fn(async () => undefined),
    storageUsage: jest.fn(async () => ({
      drive: { limitBytes: 16106127360, usageBytes: 4294967296, freeBytes: 0, percentUsed: 26.7, live: true },
      flyconnect: { totalBytes: 1234, archiveCount: 3, liveArchiveCount: 3, lastSuccessAt: null },
    })),
  };
  const destinations = {
    canStartConnect: jest.fn(() => opts.canStartConnect ?? true),
    authorizationUrl: jest.fn((state: string) => `https://accounts.google.com/o/oauth2/v2/auth?state=${state}`),
    connect: opts.connectError
      ? jest.fn(async () => {
          throw opts.connectError;
        })
      : jest.fn(async () => ({ accountEmail: 'flyconnect.backups@gmail.com', folderId: 'folder-1' })),
    markBroken: jest.fn(async () => undefined),
    summary: jest.fn(async () => ({
      kind: 'USER_OAUTH',
      accountEmail: 'flyconnect.backups@gmail.com',
      folderId: 'folder-1',
      folderUrl: 'https://drive.google.com/drive/folders/folder-1',
      connectedAt: '2026-10-07T00:00:00.000Z',
      lastUsedAt: null,
      broken: false,
      errorMessage: null,
    })),
  };
  const controller = new BackupController(
    backups as unknown as BackupService,
    { runNow: jest.fn(async () => []) } as unknown as BackupScheduler,
    { preview: jest.fn(), restore: jest.fn() } as unknown as RestoreService,
    destinations as unknown as DriveDestinationService,
  );

// Records every redirect so assertions can check where the browser was actually sent, rather than
  // trusting that `redirect` was merely called. `res` is cast at the boundary because the double
  // implements one method while the handler's signature is the full Express Response.
  const redirects: string[] = [];
  const res = {
    redirect(url: string) {
      redirects.push(url);
      return this;
    },
  };

  return {
    controller,
    backups,
    destinations,
    res: res as unknown as ExpressResponse,
    /** Last redirect target, or null if none happened. */
    redirectedTo: () => redirects[redirects.length - 1] ?? null,
  };
}

describe('Google Drive connect flow', () => {
  describe('authorization', () => {
    it('refuses a tenant admin', async () => {
      const { controller } = makeController();
      await expect(controller.connectGoogle(ADMIN)).rejects.toBeInstanceOf(ForbiddenException);
    });

    it('refuses staff', async () => {
      const { controller } = makeController();
      await expect(controller.connectGoogle(STAFF)).rejects.toBeInstanceOf(ForbiddenException);
    });

    it('refuses a tenant admin disconnecting someone else', async () => {
      const { controller } = makeController();
      await expect(controller.disconnectGoogle(ADMIN)).rejects.toBeInstanceOf(ForbiddenException);
    });

    it('lets the platform owner start a connect flow', async () => {
      const { controller } = makeController();
      await expect(controller.connectGoogle(SUPER_ADMIN)).resolves.toMatchObject({
        authorizationUrl: expect.stringContaining('accounts.google.com'),
      });
    });
  });

  describe('configuration', () => {
    it('refuses to start when no OAuth client is configured', async () => {
      // Failing here is much better than sending an operator to a Google consent screen that will
      // reject the redirect URI, which reads as a FlyConnect fault.
      const { controller } = makeController({ canStartConnect: false });
      await expect(controller.connectGoogle(SUPER_ADMIN)).rejects.toBeInstanceOf(
        ServiceUnavailableException,
      );
    });

    it('issues a fresh unguessable nonce each time', async () => {
      const { controller, destinations } = makeController();

      const first = await controller.connectGoogle(SUPER_ADMIN);
      const second = await controller.connectGoogle(SUPER_ADMIN);

      const stateOf = (url: string) => new URL(url).searchParams.get('state');
      expect(stateOf(first.authorizationUrl)).toBeTruthy();
      // Identical nonces would make a captured URL replayable for every later attempt.
      expect(stateOf(first.authorizationUrl)).not.toBe(stateOf(second.authorizationUrl));
      expect(String(stateOf(first.authorizationUrl)).length).toBeGreaterThanOrEqual(32);
      expect(destinations.authorizationUrl).toHaveBeenCalledTimes(2);
    });
  });

  describe('callback', () => {
    async function startConnect(harness: ReturnType<typeof makeController>): Promise<string> {
      const { authorizationUrl } = await harness.controller.connectGoogle(SUPER_ADMIN);
      return new URL(authorizationUrl).searchParams.get('state')!;
    }

    it('connects and reports which account was granted', async () => {
      const h = makeController();
      const state = await startConnect(h);

      await h.controller.googleCallback(h.res, 'the-code', state);

      expect(h.destinations.connect).toHaveBeenCalledWith('the-code');
      // The console is told which account, because connecting the wrong one is otherwise invisible.
      expect(h.redirectedTo()).toContain('driveConnected=flyconnect.backups');
    });

    it('reloads the Drive client so the next backup uses the new grant without a restart', async () => {
      const h = makeController();
      const state = await startConnect(h);

      await h.controller.googleCallback(h.res, 'the-code', state);

      expect(h.backups.reloadDriveClient).toHaveBeenCalled();
    });

    it('rejects a callback whose state was never issued', async () => {
      const h = makeController();

      await h.controller.googleCallback(h.res, 'attacker-code', 'never-issued-state');

      // The whole point of the nonce.
      expect(h.destinations.connect).not.toHaveBeenCalled();
      expect(h.redirectedTo()).toContain('code=BAD_STATE');
    });

    it('refuses to replay a state that was already used', async () => {
      const h = makeController();
      const state = await startConnect(h);

      await h.controller.googleCallback(h.res, 'the-code', state);
      expect(h.destinations.connect).toHaveBeenCalledTimes(1);

      // Same nonce, second time. Without single-use semantics a leaked log line would be a
      // permanent takeover vector.
      await h.controller.googleCallback(h.res, 'the-code', state);
      expect(h.destinations.connect).toHaveBeenCalledTimes(1);
    });

    it('refuses a callback with no code', async () => {
      const h = makeController();
      const state = await startConnect(h);

      await h.controller.googleCallback(h.res, undefined, state);

      expect(h.destinations.connect).not.toHaveBeenCalled();
      expect(h.redirectedTo()).toContain('code=NO_CODE');
    });

    it('reports a user denial without connecting anything', async () => {
      const h = makeController();

      await h.controller.googleCallback(h.res, undefined, undefined, 'access_denied');

      expect(h.destinations.connect).not.toHaveBeenCalled();
      expect(h.redirectedTo()).toContain('code=DENIED');
    });

    it('surfaces a failed exchange as a message, not a redirect loop', async () => {
      const h = makeController({ connectError: new Error('Google did not return a refresh token') });
      const state = await startConnect(h);

      await h.controller.googleCallback(h.res, 'the-code', state);

      expect(h.redirectedTo()).toContain('code=CONNECT_FAILED');
      expect(h.redirectedTo()).toContain('refresh');
      expect(h.backups.reloadDriveClient).not.toHaveBeenCalled();
    });

    it('never puts the authorisation code in the redirect URL', async () => {
      // The code is a bearer credential for the grant. Echoing it into a URL that lands in browser
      // history, a referrer header or an analytics script would leak it.
      const h = makeController();
      const state = await startConnect(h);

      await h.controller.googleCallback(h.res, 'super-secret-code', state);

      expect(h.redirectedTo()).not.toContain('super-secret-code');
    });
  });

  describe('disconnect', () => {
    it('marks the destination broken and reloads, rather than deleting the record', async () => {
      // Kept so the console can still show what the destination was, and so archives in Drive are
      // untouched. Only FlyConnect's access is revoked.
      const h = makeController();

      await h.controller.disconnectGoogle(SUPER_ADMIN);

      expect(h.destinations.markBroken).toHaveBeenCalled();
      expect(h.backups.reloadDriveClient).toHaveBeenCalled();
    });
  });

  describe('storage panel', () => {
    it('returns Drive figures and FlyConnect usage side by side', async () => {
      // They are different numbers. Drive's includes Gmail and Photos; FlyConnect's is what the
      // app wrote. Collapsing them would mislead whoever is deciding when to buy storage.
      const h = makeController();

      const result = await h.controller.storage(SUPER_ADMIN);

      expect(result.drive).toMatchObject({ live: true, limitBytes: 16106127360 });
      expect(result.flyconnect.totalBytes).toBe(1234);
      expect(result.destination).toMatchObject({ accountEmail: 'flyconnect.backups@gmail.com' });
    });

    it('refuses a tenant admin, because the figure is the operator personal Drive', async () => {
      const h = makeController();
      await expect(h.controller.storage(ADMIN)).rejects.toBeInstanceOf(ForbiddenException);
    });

    it('refuses staff', async () => {
      const h = makeController();
      await expect(h.controller.storage(STAFF)).rejects.toBeInstanceOf(ForbiddenException);
    });
  });
});
