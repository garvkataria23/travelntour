import { generateKeyPairSync } from 'crypto';
import { GoogleDriveServiceAccount } from './google-drive.service-account';

/**
 * Drive archive client.
 *
 * The point of these tests is that a *failed* upload fails loudly. The flow this replaces caught
 * the error, fell through to a local file download, and then rendered "Actually Saved to Google
 * Drive! Verified / Cloud Verification: Confirmed in Drive". Anything that could silently succeed
 * is exactly the bug class being guarded here, so a fake fetch is used to force each failure mode.
 */

// A real RSA key pair, generated once per run. The client signs its JWT assertion before every
// call, so a placeholder key would fail at the crypto layer and none of the Drive behaviour under
// test would ever be reached.
const { privateKey } = generateKeyPairSync('rsa', {
  modulusLength: 2048,
  privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
  publicKeyEncoding: { type: 'spki', format: 'pem' },
});

const KEY = {
  client_email: 'archiver@project.iam.gserviceaccount.com',
  private_key: privateKey,
  root_folder_id: 'folder-abc',
};

/** Handler shape for the fake fetch: receives the URL and init, returns a Response. */
type ApiHandler = (url: string, init: RequestInit) => Response | Promise<Response>;

function fakeFetch(api?: ApiHandler) {
  return jest.fn(async (url: string, init: RequestInit = {}) => {
    if (String(url).includes('oauth2.googleapis.com')) {
      return new Response(JSON.stringify({ access_token: 'tok-1', expires_in: 3600 }), { status: 200 });
    }
    if (api) return api(String(url), init);
    return new Response('{}', { status: 200 });
  }) as unknown as typeof fetch;
}

function client(
  overrides: Partial<ConstructorParameters<typeof GoogleDriveServiceAccount>[0]> = {},
  api?: ApiHandler,
) {
  return new GoogleDriveServiceAccount({ ...KEY, ...overrides }, fakeFetch(api));
}

describe('GoogleDriveServiceAccount', () => {
  describe('configuration', () => {
    it('reports unconfigured when the key is absent', async () => {
      const svc = new GoogleDriveServiceAccount({ client_email: '', private_key: '' }, fakeFetch());
      expect(svc.isConfigured()).toBe(false);
      const result = await svc.verifyAccess();
      expect(result.ok).toBe(false);
      expect(result.detail).toMatch(/no service account key configured/i);
    });

    it('reports unconfigured rather than throwing when a token exchange is impossible', async () => {
      const svc = client({}, () => new Response('nope', { status: 401 }));
      const result = await svc.verifyAccess();
      expect(result.ok).toBe(false);
      expect(result.detail).toMatch(/401/);
    });
  });

  describe('upload', () => {
    it('parses the Drive response into a file handle', async () => {
      const api = jest.fn(async () =>
        new Response(
          JSON.stringify({
            id: 'file-123',
            name: 'archive.json',
            size: '2048',
            md5Checksum: 'abc',
            webViewLink: 'https://drive.google.com/file/d/file-123/view',
          }),
          { status: 200 },
        ),
      );
      const result = await client({}, api).upload('archive.json', Buffer.from('{}'));
      expect(result).toMatchObject({ id: 'file-123', name: 'archive.json', size: 2048 });
      expect(api).toHaveBeenCalledTimes(1);
    });

    it('throws on a 403 instead of reporting success', async () => {
      const api = jest.fn(async () => new Response('storageQuotaExceeded', { status: 403 }));
      await expect(
        client({}, api).upload('archive.json', Buffer.from('{}')),
      ).rejects.toThrow(/Drive upload failed \(403\)/);
    });

    it('throws when Drive returns no file id', async () => {
      const api: ApiHandler = async () => new Response(JSON.stringify({}), { status: 200 });
      await expect(
        client({}, api).upload('archive.json', Buffer.from('{}')),
      ).rejects.toThrow(/returned no file id/);
    });

    it('sends the folder as a parent so archives land in the configured folder', async () => {
      let sentBody = '';
      const api: ApiHandler = async (_url, init) => {
        sentBody = String(init.body ?? '');
        return new Response(JSON.stringify({ id: 'f', size: '1' }), { status: 200 });
      };
      await client({}, api).upload('a.json', Buffer.from('{}'));
      expect(sentBody).toContain('folder-abc');
      expect(sentBody).toContain('flyconnect-');
    });
  });

  describe('list', () => {
    it('returns parsed file metadata, newest first per Drive ordering', async () => {
      const api = jest.fn(async () =>
        new Response(
          JSON.stringify({
            files: [
              { id: 'f1', name: 'a.json', size: '10', modifiedTime: '2026-10-02T00:00:00Z' },
              { id: 'f2', name: 'b.json', size: '20', modifiedTime: '2026-10-01T00:00:00Z' },
            ],
          }),
          { status: 200 },
        ),
      );
      const result = await client({}, api).list('flyconnect-backup');
      expect(result).toHaveLength(2);
      expect(result[0]).toMatchObject({ id: 'f1', size: 10 });
    });

    it('escapes a quote in the search prefix rather than breaking the query', async () => {
      let requested = '';
      const api: ApiHandler = async (url) => {
        requested = url;
        return new Response(JSON.stringify({ files: [] }), { status: 200 });
      };
      await client({}, api).list("it's-a-test");
      // The query travels URL-encoded, so decode before asserting on the escaping.
      expect(decodeURIComponent(new URL(requested).searchParams.get('q') ?? '')).toContain(
        "name contains 'it\\'s-a-test'",
      );
    });

    it('throws on failure', async () => {
      const api = jest.fn(async () => new Response('boom', { status: 500 }));
      await expect(client({}, api).list('x')).rejects.toThrow(/Drive list failed \(500\)/);
    });
  });

  describe('download', () => {
    it('returns the file bytes', async () => {
      const payload = Buffer.from('{"appName":"FlyConnect"}');
      const api = jest.fn(async () => new Response(payload, { status: 200 }));
      const buffer = await client({}, api).download('file-123');
      expect(buffer.toString()).toBe('{"appName":"FlyConnect"}');
    });

    it('throws rather than returning empty bytes on a 404', async () => {
      const api = jest.fn(async () => new Response('not found', { status: 404 }));
      await expect(client({}, api).download('missing')).rejects.toThrow(/Drive download failed \(404\)/);
    });
  });

  describe('remove', () => {
    it('treats an already-deleted file as success', async () => {
      const api = jest.fn(async () => new Response('gone', { status: 404 }));
      await expect(client({}, api).remove('missing')).resolves.toBeUndefined();
    });

    it('throws on any other failure', async () => {
      const api = jest.fn(async () => new Response('denied', { status: 403 }));
      await expect(client({}, api).remove('f')).rejects.toThrow(/Drive delete failed \(403\)/);
    });
  });

  describe('token caching', () => {
    it('exchanges once and reuses the token across calls', async () => {
      const tokenFetch = jest.fn(async () =>
        new Response(JSON.stringify({ access_token: 'tok-1', expires_in: 3600 }), { status: 200 }),
      );
      const fetchImpl = jest.fn(async (url: string) => {
        if (String(url).includes('oauth2.googleapis.com')) return tokenFetch();
        return new Response(JSON.stringify({ id: 'f', size: '1' }), { status: 200 });
      }) as unknown as typeof fetch;

      const svc = new GoogleDriveServiceAccount(KEY, fetchImpl);
      await svc.upload('a.json', Buffer.from('{}'));
      await svc.upload('b.json', Buffer.from('{}'));
      await svc.list('x');

      const tokenCalls = (fetchImpl as unknown as jest.Mock).mock.calls.filter((c) =>
        String(c[0]).includes('oauth2.googleapis.com'),
      );
      expect(tokenCalls).toHaveLength(1);
    });

    it('clears the cached token after a 401 so the next call re-authenticates', async () => {
      let tokenCalls = 0;
      const fetchImpl = jest.fn(async (url: string) => {
        if (String(url).includes('oauth2.googleapis.com')) {
          tokenCalls += 1;
          return new Response(JSON.stringify({ access_token: `tok-${tokenCalls}`, expires_in: 3600 }), {
            status: 200,
          });
        }
        return new Response('expired', { status: 401 });
      }) as unknown as typeof fetch;

      const svc = new GoogleDriveServiceAccount(KEY, fetchImpl);
      await expect(svc.upload('a.json', Buffer.from('{}'))).rejects.toThrow(/401/);
      await expect(svc.upload('b.json', Buffer.from('{}'))).rejects.toThrow(/401/);
      expect(tokenCalls).toBe(2);
    });
  });
});