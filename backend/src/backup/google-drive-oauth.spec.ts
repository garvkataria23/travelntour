import { DriveAuthError, GoogleDriveOAuth } from './google-drive-oauth';
import { encryptSecret } from './credential-vault';

/**
 * These tests never touch Google. Every request goes through a `fetch` double, so a regression is
 * caught here rather than by a failed 3am backup.
 *
 * What matters most: a revoked or malformed credential must produce an error the operator can act
 * on, and must never produce a *successful-looking* no-op. The previous client-side Drive code
 * reported "Saved to Google Drive!" on a failure, which is the specific failure mode this whole
 * rewrite exists to prevent.
 */

const KEY = 'a-sufficiently-long-test-key-value';
const CLIENT_ID = 'client-id.apps.googleusercontent.com';
const CLIENT_SECRET = 'client-secret';
const REDIRECT = 'http://localhost:4000/api/backups/destination/google/callback';
const TOKEN_URI_PREFIX = 'https://oauth2.googleapis.com/token';

/**
 * Builds a Response double.
 *
 * `tokenStatus` controls only the FIRST call (the token exchange) so that a test can have the token
 * endpoint succeed and the Drive endpoint return whatever status it is testing. Without this the
 * single-double had one status for both, so a test meant to check a 403 upload silently got a 403
 * token refresh and asserted against the wrong error.
 */
function makeFetch(
  opts: { driveBody?: unknown; driveStatus?: number; tokenBody?: unknown; tokenStatus?: number } = {},
) {
  const calls: Array<[string, unknown]> = [];
  let call = 0;

  const impl = jest.fn(async (url: string, init?: unknown) => {
    calls.push([String(url), init]);
    const isToken = String(url).startsWith(TOKEN_URI_PREFIX);
    const status = isToken ? (opts.tokenStatus ?? 200) : (opts.driveStatus ?? 200);
    const body = isToken
      ? (opts.tokenBody ?? { access_token: 'at', expires_in: 3600 })
      : (opts.driveBody ?? {});
    call += 1;
    void call;
    return {
      ok: status >= 200 && status < 300,
      status,
      json: async () => body,
      text: async () => JSON.stringify(body),
      arrayBuffer: async () => Buffer.from(JSON.stringify(body)).buffer,
    } as unknown as Response;
  });

  return { impl: impl as unknown as typeof fetch, calls, mock: impl };
}

function jsonResponse(body: unknown, status = 200): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
    text: async () => JSON.stringify(body),
    arrayBuffer: async () => Buffer.from(JSON.stringify(body)).buffer,
  } as unknown as Response;
}

function seal(token: string): string {
  return encryptSecret(token, { BACKUP_TOKEN_ENCRYPTION_KEY: KEY } as NodeJS.ProcessEnv);
}

function makeClient(
  fetchImpl: typeof fetch,
  opts: { ciphertext?: string | null; folderId?: string | null; env?: NodeJS.ProcessEnv } = {},
) {
  const ciphertext = opts.ciphertext === undefined ? seal('refresh-token') : opts.ciphertext;
  return new GoogleDriveOAuth(
    CLIENT_ID,
    CLIENT_SECRET,
    // The constructor takes a string, so "no token at all" is expressed as an empty string here and
    // as null only at the opts level.
    ciphertext ?? '',
    opts.folderId === undefined ? 'folder-123' : (opts.folderId ?? undefined),
    REDIRECT,
    fetchImpl,
    opts.env ?? ({ BACKUP_TOKEN_ENCRYPTION_KEY: KEY } as NodeJS.ProcessEnv),
  );
}

describe('GoogleDriveOAuth', () => {
  describe('configuration', () => {
    it('is not configured without a folder', () => {
      const client = makeClient(jest.fn() as unknown as typeof fetch, { folderId: null });
      expect(client.isConfigured()).toBe(false);
    });

    it('is not configured without a stored token', () => {
      const client = makeClient(jest.fn() as unknown as typeof fetch, { ciphertext: null });
      expect(client.isConfigured()).toBe(false);
    });

    it('requests drive.file and appdata, never a broad drive scope', () => {
      // `drive` or `drive.readonly` would give this credential the operator's existing documents.
      // That is a far larger grant than backups justify and must never appear here.
      const url = makeClient(jest.fn() as unknown as typeof fetch).authorizationUrl('state-123');

      expect(url).toContain('drive.file');
      expect(url).toContain('drive.appdata');
      expect(url).not.toContain('auth/drive%2C');
      expect(url).not.toContain('/auth/drive.readonly');
      expect(url).not.toContain('/auth/drive.metadata.readonly');
    });

    it('asks for offline access so a refresh token is actually returned', () => {
      // Without access_type=offline Google may return only a short-lived token, which looks like a
      // successful connect and then fails the first scheduled backup.
      const url = makeClient(jest.fn() as unknown as typeof fetch).authorizationUrl('s');
      expect(url).toContain('access_type=offline');
    });

    it('carries the state through, since it is the CSRF defence on the callback', () => {
      const url = makeClient(jest.fn() as unknown as typeof fetch).authorizationUrl('nonce-abc');
      expect(url).toContain('state=nonce-abc');
    });
  });

  describe('code exchange', () => {
    it('returns a refresh token on success', async () => {
      const fetchImpl = jest.fn(async () =>
        jsonResponse({ access_token: 'at', refresh_token: 'rt', expires_in: 3600, scope: 'drive.file' }),
      );
      const client = makeClient(fetchImpl as unknown as typeof fetch);

      const tokens = await client.exchangeCode('the-code');

      expect(tokens.refreshToken).toBe('rt');
      expect(tokens.accessToken).toBe('at');
    });

    it('fails loudly when Google returns no refresh token', async () => {
      // This is the trap: an access token without a refresh token means backups work for an hour and
      // then stop forever. It must be an error, not a quiet success.
      const fetchImpl = jest.fn(async () => jsonResponse({ access_token: 'at', expires_in: 3600 }));
      const client = makeClient(fetchImpl as unknown as typeof fetch);

      await expect(client.exchangeCode('c')).rejects.toThrow(/did not return a refresh token/i);
    });

    it('maps invalid_grant to a reconnect instruction', async () => {
      const fetchImpl = jest.fn(async () =>
        jsonResponse({ error: 'invalid_grant', error_description: 'Bad Request' }, 400),
      );
      const client = makeClient(fetchImpl as unknown as typeof fetch);

      const err = await client
        .exchangeCode('c')
        .then(() => null)
        .catch((e: unknown) => e);

      expect(err).toBeInstanceOf(DriveAuthError);
      expect((err as DriveAuthError).reason).toBe('INVALID_GRANT');
      expect((err as Error).message).toMatch(/Reconnect/i);
    });

    it('distinguishes a rejected OAuth client from a revoked grant', async () => {
      const fetchImpl = jest.fn(async () => jsonResponse({ error: 'invalid_client' }, 401));
      const client = makeClient(fetchImpl as unknown as typeof fetch);

      const err = await client
        .exchangeCode('c')
        .then(() => null)
        .catch((e: unknown) => e);

      expect((err as DriveAuthError).reason).toBe('INVALID_CLIENT');
      expect((err as Error).message).toMatch(/CLIENT_ID|CLIENT_SECRET/);
    });
  });

  describe('token refresh', () => {
    it('exchanges the stored refresh token for an access token', async () => {
      const fetchImpl = jest.fn(async (_url: string, init?: { body?: unknown }) => {
        expect(String(init?.body)).toContain('grant_type=refresh_token');
        return jsonResponse({ access_token: 'fresh-at', expires_in: 3600 });
      });
      const client = makeClient(fetchImpl as unknown as typeof fetch);

      await expect(client.accessToken()).resolves.toBe('fresh-at');
    });

    it('never sends the raw refresh token to a Drive endpoint', async () => {
      const fetchImpl = jest.fn(async () => jsonResponse({ access_token: 'fresh-at', expires_in: 3600 }));
      const client = makeClient(fetchImpl as unknown as typeof fetch);

      await client.accessToken();

      // The refresh token goes only to the token endpoint, never to Drive.
      const calls = (fetchImpl as unknown as jest.Mock).mock.calls;
      const driveCalls = calls.filter(([url]) =>
        String(url).startsWith('https://www.googleapis.com/drive'),
      );
      expect(driveCalls).toHaveLength(0);
      expect(calls.every(([url]) => String(url).startsWith(TOKEN_URI_PREFIX))).toBe(true);
    });

    it('reuses a cached token instead of refreshing on every call', async () => {
      const fetchImpl = jest.fn(async () => jsonResponse({ access_token: 'fresh-at', expires_in: 3600 }));
      const client = makeClient(fetchImpl as unknown as typeof fetch);

      await client.accessToken();
      await client.accessToken();
      await client.accessToken();

      expect(fetchImpl).toHaveBeenCalledTimes(1);
    });

    it('reports a revoked grant as needing a reconnect, not as a transient failure', async () => {
      const fetchImpl = jest.fn(async () => jsonResponse({ error: 'invalid_grant' }, 400));
      const client = makeClient(fetchImpl as unknown as typeof fetch);

      const err = await client
        .accessToken()
        .then(() => null)
        .catch((e: unknown) => e);

      expect(err).toBeInstanceOf(DriveAuthError);
      expect((err as DriveAuthError).reason).toBe('INVALID_GRANT');
    });

    it('refuses to use a token that cannot be decrypted, rather than sending garbage', async () => {
      const fetchImpl = jest.fn(async () => jsonResponse({ access_token: 'x', expires_in: 3600 }));
      const client = makeClient(fetchImpl as unknown as typeof fetch, {
        ciphertext: 'v1.broken.tag.data',
      });

      const err = await client
        .accessToken()
        .then(() => null)
        .catch((e: unknown) => e);

      expect(err).toBeInstanceOf(DriveAuthError);
      expect((err as Error).message).toMatch(/ENCRYPTION_KEY|reconnect/i);
      // The point: no token was ever sent to Google.
      expect(fetchImpl).not.toHaveBeenCalled();
    });
  });

  describe('quota', () => {
    it('reports the live figure Drive returns', async () => {
      // Read from Drive, not summed locally: the account's quota is shared with Gmail and Photos,
      // so an app-side sum would tell an operator deciding to buy storage the wrong thing.
      const fetchImpl = makeFetch({
        driveBody: { storageQuota: { limit: '16106127360', usage: '4294967296' } },
      });
      const client = makeClient(fetchImpl.impl);

      const quota = await client.quota();

      expect(quota.live).toBe(true);
      expect(quota.limitBytes).toBe(16106127360);
      expect(quota.usageBytes).toBe(4294967296);
      expect(quota.freeBytes).toBe(16106127360 - 4294967296);
      expect(quota.percentUsed).toBeCloseTo(26.7, 0);
    });

    it('says unavailable instead of inventing a number', async () => {
      // The removed browser quota code returned a hardcoded 5TB for one address and a fabricated
      // 15GB for everyone else. Never again.
      const fetchImpl = makeFetch({ driveStatus: 403, driveBody: {} });
      const client = makeClient(fetchImpl.impl);

      const quota = await client.quota();

      expect(quota.live).toBe(false);
      expect(quota.limitBytes).toBe(0);
    });

    it('treats a missing storageQuota as unavailable rather than zero real usage', async () => {
      const fetchImpl = makeFetch({ driveBody: { user: {} } });
      const client = makeClient(fetchImpl.impl);

      expect((await client.quota()).live).toBe(false);
    });

    it('never lets an auth failure escape as a thrown error from quota', async () => {
      const fetchImpl = makeFetch({ tokenStatus: 400, tokenBody: { error: 'invalid_grant' } });
      const client = makeClient(fetchImpl.impl);

      await expect(client.quota()).resolves.toMatchObject({ live: false });
    });
  });

  describe('upload', () => {
it('sends multipart metadata naming the folder', async () => {
      const fetchImpl = makeFetch({
        driveBody: { id: 'file-1', name: 'archive.json', size: '10' },
      });
      const client = makeClient(fetchImpl.impl);

      const file = await client.upload('archive.json', Buffer.from('{}'));

      expect(file.id).toBe('file-1');

      // Two calls: the token refresh, then the upload. The metadata must name the target folder, or
      // archives land loose in the Drive root instead of in the backup folder.
      const uploadCall = fetchImpl.calls.find(([url]) => String(url).includes('uploadType=multipart'));
      expect(uploadCall).toBeDefined();

      const body = String((uploadCall![1] as { body: Buffer }).body);
      expect(body).toContain('folder-123');
      expect(body).toContain('archive.json');
    });

    it('throws rather than reporting success when Drive returns no id', async () => {
      const fetchImpl = makeFetch({ driveBody: {} });
      const client = makeClient(fetchImpl.impl);

      await expect(client.upload('a.json', Buffer.from('{}'))).rejects.toThrow(/no file id/i);
    });

    it('names the folder problem when Drive reports insufficient permissions', async () => {
      // 403 is overloaded. "Cannot write to that folder" and "grant revoked" need different fixes,
      // so the operator should not be sent to the wrong one.
      const fetchImpl = makeFetch({
        driveStatus: 403,
        driveBody: { error: { message: 'Insufficient permissions for the specified parent.' } },
      });
      const client = makeClient(fetchImpl.impl);

      await expect(client.upload('a.json', Buffer.from('{}'))).rejects.toThrow(
        /cannot write to that folder/i,
      );
    });

    it('explains the no-quota case distinctly', async () => {
      const fetchImpl = makeFetch({
        driveStatus: 403,
        driveBody: {
          error: { message: 'Service Accounts do not have storage quota. Leverage shared drives.' },
        },
      });
      const client = makeClient(fetchImpl.impl);

      await expect(client.upload('a.json', Buffer.from('{}'))).rejects.toThrow(/no Drive storage quota/i);
    });
  });

  describe('verify', () => {
    it('names the account it is actually acting as', async () => {
      // The most valuable single fact: connecting the wrong Google account is otherwise invisible
      // until an archive fails to land where expected.
      const fetchImpl = makeFetch({
        driveBody: { user: { emailAddress: 'flyconnect.backups@gmail.com', displayName: 'Backups' } },
      });
      const client = makeClient(fetchImpl.impl);

      const result = await client.verify();

      expect(result.ok).toBe(true);
      expect(result.accountEmail).toBe('flyconnect.backups@gmail.com');
      expect(result.folderId).toBe('folder-123');
    });

    it('reports failure with the reason instead of a false ok', async () => {
      const fetchImpl = makeFetch({ driveStatus: 500, driveBody: {} });
      const client = makeClient(fetchImpl.impl);

      const result = await client.verify();

      expect(result.ok).toBe(false);
      expect(result.detail).not.toBe('');
    });

    it('explains an unconfigured destination', async () => {
      const client = makeClient(jest.fn() as unknown as typeof fetch, { folderId: null });

      const result = await client.verify();

      expect(result.ok).toBe(false);
      expect(result.detail).toMatch(/not connected|GOOGLE_DRIVE_CLIENT_ID/i);
    });
  });
});