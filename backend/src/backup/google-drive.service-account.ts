import { createHash, createSign } from 'crypto';
import { readFileSync } from 'fs';

/**
 * Google service-account authentication for Drive access.
 *
 * WHY A SERVICE ACCOUNT AND NOT A USER'S OAUTH TOKEN
 *
 * The previous implementation had the browser hold a Google OAuth access token and POST the backup
 * straight from the client. That design has three fatal problems:
 *
 *   1. The token lives in the browser. Anyone with an XSS, or anyone who opens DevTools, can read
 *      it and read or write the folder that holds every tenant's data.
 *   2. It only runs when a human clicks a button. There is no schedule, so "we have backups" is a
 *      matter of someone remembering.
 *   3. It is the *user's personal* Drive. If that account is closed, suspended, or loses 2FA, the
 *      backups go with it.
 *
 * With a service account the credentials never leave the server, the schedule runs unattended, and
 * the archive survives any individual person leaving the company.
 *
 * The service account's key is shared with the target Drive folder (or the whole Drive via
 * "Domain-wide sharing" for a Workspace domain). Google then treats it as a real member of that
 * folder and a normal `files.create` works — no domain-wide delegation required.
 */

export interface ServiceAccountKey {
  client_email: string;
  private_key: string;
  project_id?: string;
  /** Numeric Drive folder id that archives are written into. */
  root_folder_id?: string;
}

const SCOPE = 'https://www.googleapis.com/auth/drive.file';
const TOKEN_URI = 'https://oauth2.googleapis.com/token';
const DRIVE_API = 'https://www.googleapis.com/drive/v3';

/** JWT lifetime. Google caps self-signed assertions at 1 hour; 45 minutes is the usual choice. */
const ASSERTION_LIFETIME_SECONDS = 45 * 60;

function base64Url(input: string | Buffer): string {
  const buf = typeof input === 'string' ? Buffer.from(input, 'utf8') : input;
  return buf.toString('base64').replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_');
}

/**
 * Builds the RS256-signed JWT that Google exchanges for an access token.
 *
 * The `aud` claim must be the token endpoint and the `scope` must be Drive-only: this credential
 * should not be able to reach Gmail, Calendar or anything else.
 */
function buildAssertion(key: ServiceAccountKey, now: number): string {
  const header = base64Url(JSON.stringify({ alg: 'RS256', typ: 'JWT' }));
  const claims = base64Url(
    JSON.stringify({
      iss: key.client_email,
      scope: SCOPE,
      aud: TOKEN_URI,
      iat: now,
      exp: now + ASSERTION_LIFETIME_SECONDS,
    }),
  );
  const signature = createSign('RSA-SHA256')
    .update(`${header}.${claims}`)
    .sign(key.private_key);
  return `${header}.${claims}.${base64Url(signature)}`;
}

export function sha256Hex(input: Buffer | string): string {
  return createHash('sha256').update(input).digest('hex');
}

/**
 * Minimal Drive client bound to one service account.
 *
 * Deliberately hand-rolled rather than pulling in googleapis: the surface needed is four calls
 * (ensure folder, upload, list, download, delete) and the whole Drive SDK is several megabytes.
 */
export class GoogleDriveServiceAccount {
  private cachedToken: { value: string; expiresAt: number } | null = null;

  constructor(
    private readonly key: ServiceAccountKey,
    private readonly fetchImpl: typeof fetch = fetch,
  ) {}

  get email(): string {
    return this.key.client_email;
  }

  get folderId(): string | undefined {
    return this.key.root_folder_id;
  }

  isConfigured(): boolean {
    return Boolean(this.key.client_email && this.key.private_key);
  }

  /**
   * Exchanges the signed assertion for a short-lived access token.
   *
   * Cached until shortly before expiry: a backup run makes several Drive calls, and minting a token
   * per call would triple the traffic and risk Google's rate limiter.
   */
  async accessToken(): Promise<string> {
    const now = Math.floor(Date.now() / 1000);
    if (this.cachedToken && this.cachedToken.expiresAt > now + 60) {
      return this.cachedToken.value;
    }

    const response = await this.fetchImpl(TOKEN_URI, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
        assertion: buildAssertion(this.key, now),
      }).toString(),
    });

    if (!response.ok) {
      const detail = await response.text().catch(() => '');
      throw new Error(`Google token exchange failed (${response.status}): ${detail.slice(0, 300)}`);
    }

    const json = (await response.json()) as { access_token?: string; expires_in?: number };
    if (!json.access_token) {
      throw new Error('Google token exchange returned no access_token');
    }

    this.cachedToken = {
      value: json.access_token,
      expiresAt: now + (json.expires_in ?? 3600),
    };
    return this.cachedToken.value;
  }

  private async request(path: string, init: RequestInit = {}): Promise<Response> {
    const token = await this.accessToken();
    const response = await this.fetchImpl(`${DRIVE_API}${path}`, {
      ...init,
      headers: {
        Authorization: `Bearer ${token}`,
        ...(init.headers ?? {}),
      },
    });
    if (response.status === 401) {
      // Token revoked or the key rotated underneath us; drop the cache and let the caller retry.
      this.cachedToken = null;
    }
    return response;
  }

  /** Confirms the credential really works. Used by the admin UI instead of assuming it does. */
  async verifyAccess(): Promise<{ ok: boolean; email: string; folderId?: string; detail?: string }> {
    if (!this.isConfigured()) {
      return { ok: false, email: '', detail: 'No service account key configured' };
    }
    try {
      const about = await this.request('/about?fields=user(emailAddress)');
      if (!about.ok) {
        return { ok: false, email: this.email, detail: `Drive rejected the credential (${about.status})` };
      }
      return { ok: true, email: this.email, folderId: this.folderId };
    } catch (err) {
      return { ok: false, email: this.email, detail: err instanceof Error ? err.message : String(err) };
    }
  }

  /**
   * Multipart upload of one archive into the configured folder.
   *
   * Returns the Drive file id, which is the only handle we need later: the archive itself is never
   * copied into the database, so a restore is a download by id.
   */
  async upload(fileName: string, body: Buffer, mimeType = 'application/json'): Promise<{
    id: string;
    name: string;
    size: number;
    md5?: string;
    webViewLink?: string;
  }> {
    const boundary = `flyconnect-${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;

    const metadata = {
      name: fileName,
      mimeType,
      // Binary at rest would make a corrupt archive harder to inspect; JSON is the format the
      // restore path reads, and the archive is already compressed at the JSON level if needed.
      parents: this.folderId ? [this.folderId] : undefined,
    };

    const preamble =
      `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n` +
      `${JSON.stringify(metadata)}\r\n` +
      `--${boundary}\r\nContent-Type: ${mimeType}\r\n` +
      `Content-Transfer-Encoding: base64\r\n\r\n` +
      `${body.toString('base64')}\r\n` +
      `--${boundary}--`;

    const response = await this.request(
      `/files?uploadType=multipart&fields=id,name,size,md5Checksum,webViewLink`,
      {
        method: 'POST',
        headers: { 'Content-Type': `multipart/related; boundary=${boundary}` },
        body: Buffer.from(preamble, 'utf8'),
      },
    );

    if (!response.ok) {
      const detail = await response.text().catch(() => '');
      throw new Error(`Drive upload failed (${response.status}): ${detail.slice(0, 300)}`);
    }

    const json = (await response.json()) as {
      id?: string;
      name?: string;
      size?: string;
      md5Checksum?: string;
      webViewLink?: string;
    };

    // A 200 with no id is not a successful upload. Without this check the caller would record a
    // SUCCEEDED run with no handle to the archive, and the failure would only surface much later
    // as an unusable backup.
    if (!json.id) {
      throw new Error('Drive upload reported success but returned no file id');
    }

    return {
      id: json.id,
      name: json.name ?? fileName,
      size: Number(json.size ?? body.length),
      md5: json.md5Checksum,
      webViewLink: json.webViewLink,
    };
  }

  /** Lists archive files in the configured folder, newest first. */
  async list(prefix: string, limit = 50): Promise<Array<{
    id: string;
    name: string;
    size: number;
    modifiedTime: string;
    md5?: string;
  }>> {
    const query = [
      `name contains '${prefix.replace(/'/g, "\\'")}'`,
      'trashed = false',
      this.folderId ? `'${this.folderId}' in parents` : '',
    ]
      .filter(Boolean)
      .join(' and ');

    const params = new URLSearchParams({
      q: query,
      orderBy: 'modifiedTime desc',
      pageSize: String(Math.min(100, Math.max(1, limit))),
      fields: 'files(id,name,size,modifiedTime,md5Checksum)',
    });

    const response = await this.request(`/files?${params.toString()}`);
    if (!response.ok) {
      const detail = await response.text().catch(() => '');
      throw new Error(`Drive list failed (${response.status}): ${detail.slice(0, 300)}`);
    }

    const json = (await response.json()) as {
      files?: Array<{ id: string; name: string; size?: string; modifiedTime: string; md5Checksum?: string }>;
    };
    return (json.files ?? []).map((f) => ({
      id: f.id,
      name: f.name,
      size: Number(f.size ?? 0),
      modifiedTime: f.modifiedTime,
      md5: f.md5Checksum,
    }));
  }

  /**
   * Downloads a file by id.
   *
   * Fetches through Drive's `files.get?alt=media` rather than guessing a share link, so it works
   * for a private folder shared with the service account.
   */
  async download(fileId: string): Promise<Buffer> {
    const response = await this.request(`/files/${encodeURIComponent(fileId)}?alt=media`);
    if (!response.ok) {
      const detail = await response.text().catch(() => '');
      throw new Error(`Drive download failed (${response.status}): ${detail.slice(0, 300)}`);
    }
    return Buffer.from(await response.arrayBuffer());
  }

  async remove(fileId: string): Promise<void> {
    const response = await this.request(`/files/${encodeURIComponent(fileId)}`, { method: 'DELETE' });
    // 404 means it is already gone, which is the desired end state.
    if (!response.ok && response.status !== 404) {
      const detail = await response.text().catch(() => '');
      throw new Error(`Drive delete failed (${response.status}): ${detail.slice(0, 300)}`);
    }
  }
}

/**
 * Builds the client from environment configuration.
 *
 * The key may be supplied inline (handy for Render secrets) or as a path to the JSON key file. Only
 * `drive.file` is requested, so this credential cannot read anything else in the Drive.
 */
export function createDriveClientFromEnv(env: NodeJS.ProcessEnv = process.env): GoogleDriveServiceAccount {
  const inline = env.GOOGLE_SERVICE_ACCOUNT_JSON;
  let key: Partial<ServiceAccountKey> = {};

  if (inline) {
    try {
      key = JSON.parse(inline) as Partial<ServiceAccountKey>;
    } catch {
      throw new Error('GOOGLE_SERVICE_ACCOUNT_JSON is set but is not valid JSON');
    }
  } else if (env.GOOGLE_SERVICE_ACCOUNT_KEY_PATH) {
    // Reading the key from a file is how the credential is usually mounted in a container, and it
    // keeps the private key out of the process environment where it would be visible to anything
    // that can read /proc/<pid>/environ.
    //
    // Failures here are swallowed rather than thrown: a missing file must not stop the API from
    // booting. `isConfigured()` then reports the truth and backup runs refuse with a clear code
    // rather than silently archiving nothing.
    try {
      const raw = readFileSync(env.GOOGLE_SERVICE_ACCOUNT_KEY_PATH, 'utf8');
      key = JSON.parse(raw) as Partial<ServiceAccountKey>;
    } catch {
      // Intentionally silent: a missing or unreadable key file is reported through
      // isConfigured() and surfaced to the operator by the backup console, rather than by crashing
      // module construction and taking the whole API down.
      key = {};
    }
  }

  const folderId = env.GOOGLE_DRIVE_FOLDER_ID || key.root_folder_id;

  return new GoogleDriveServiceAccount({
    client_email: key.client_email ?? env.GOOGLE_SERVICE_ACCOUNT_EMAIL ?? '',
    // Keys copied out of the JSON file often arrive with escaped newlines.
    private_key: (key.private_key ?? '').replace(/\\n/g, '\n'),
    project_id: key.project_id ?? env.GOOGLE_PROJECT_ID,
    root_folder_id: folderId,
  });
}