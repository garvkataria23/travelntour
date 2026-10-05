import { Logger } from '@nestjs/common';
import { CredentialVaultError, decryptSecret } from './credential-vault';

/**
 * Drive client backed by a normal Google account's OAuth refresh token.
 *
 * WHY THIS EXISTS ALONGSIDE THE SERVICE ACCOUNT
 *
 * A service account has no Drive storage quota. Verified against the live API:
 *
 *   POST /upload/drive/v3/files  ->  403 "Service Accounts do not have storage quota.
 *                                        Leverage shared drives, or use OAuth delegation."
 *
 * It can still create file metadata, which is why the failure is easy to miss: a check that asks
 * "can this credential create a file?" passes, and the real problem appears only when bytes are
 * uploaded. A Shared Drive resolves it, but Shared Drives require a paid Workspace org.
 *
 * Connecting an operator's own Google account sidesteps both: the account's own Drive quota
 * applies, so this works on a free consumer account.
 *
 * THE TRADE-OFF, STATED PLAINLY
 *
 * This ties backups to one human Google account. If it is deleted, suspended, or the grant is
 * revoked, backups stop. That is a real reduction in robustness against the service account model,
 * and it is the right trade for an install that cannot use Workspace. `verify()` and
 * `describeFailure()` exist so that situation surfaces in the console instead of as a silent gap
 * in the backup history.
 *
 * SCOPE
 *
 * `drive.file` only, same as the service account. This credential can read and write the files
 * FlyConnect creates and nothing else in the account - it cannot see the operator's mail, other
 * folders, or shared files.
 */

const TOKEN_URI = 'https://oauth2.googleapis.com/token';
const AUTH_URI = 'https://accounts.google.com/o/oauth2/v2/auth';
const DRIVE_API = 'https://www.googleapis.com/drive/v3';

/**
 * Only what FlyConnect needs, and nothing broader.
 *
 * `drive.file` is deliberately not `drive` or `drive.readonly`. With `drive.file` the credential
 * is scoped to files this app created, so a leak of the token cannot be used to read the
 * operator's existing documents.
 */
export const DRIVE_FILE_SCOPE = 'https://www.googleapis.com/auth/drive.file';

/**
 * Added so the console can show real storage figures.
 *
 * `drive.appdata` is the narrow, purpose-built scope for an app's own metadata and does NOT widen
 * access to user files. It is what allows reading the account's `storageQuota` without asking for
 * access to the user's documents - the alternative, the full `drive` scope, would be a far larger
 * grant than backups justify.
 */
export const DRIVE_APPDATA_SCOPE = 'https://www.googleapis.com/auth/drive.appdata';

export const DEFAULT_SCOPES = [DRIVE_FILE_SCOPE, DRIVE_APPDATA_SCOPE];

export interface DriveQuota {
  limitBytes: number;
  usageBytes: number;
  freeBytes: number;
  percentUsed: number;
  /** True when the figure came from Drive rather than being estimated. */
  live: boolean;
}

export interface OAuthTokens {
  accessToken: string;
  refreshToken: string;
  expiresAt: number;
  scope: string;
}

export interface DriveFile {
  id: string;
  name: string;
  sizeBytes: number;
  modifiedTime?: string;
  webViewLink?: string;
}

/**
 * Thrown when the credential no longer works. Distinguished from a transport error because the
 * operator action differs: a revoked grant needs reconnecting, a timeout does not.
 */
export class DriveAuthError extends Error {
  constructor(
    message: string,
    readonly reason:
      | 'INVALID_GRANT'
      | 'ACCESS_DENIED'
      | 'INVALID_CLIENT'
      | 'UNREACHABLE',
    readonly detail?: string,
  ) {
    super(message);
    this.name = 'DriveAuthError';
  }
}

export class GoogleDriveOAuth {
  private readonly logger = new Logger(GoogleDriveOAuth.name);
  private cached: { accessToken: string; expiresAt: number } | null = null;

  constructor(
    private readonly clientId: string,
    private readonly clientSecret: string,
    private readonly encryptedRefreshToken: string,
    private readonly folderId: string | undefined,
    private readonly redirectUri: string,
    private readonly fetchImpl: typeof fetch = fetch,
    private readonly env: NodeJS.ProcessEnv = process.env,
  ) {}

  get hasClient(): boolean {
    return Boolean(this.clientId && this.clientSecret);
  }

  isConfigured(): boolean {
    return this.hasClient && Boolean(this.encryptedRefreshToken) && Boolean(this.folderId);
  }

  /**
   * The URL the operator is sent to in order to grant access.
   *
   * `state` must be an unguessable value the caller verifies on return; it is the only thing
   * preventing a third party from completing a connect flow with the operator's browser.
   */
  authorizationUrl(state: string, scopes: string[] = DEFAULT_SCOPES): string {
    const params = new URLSearchParams({
      client_id: this.clientId,
      redirect_uri: this.redirectUri,
      response_type: 'code',
      scope: scopes.join(' '),
      // Forces the consent screen every time, so an operator changing destination is never silently
      // re-signed-in as a previous account.
      prompt: 'consent',
      access_type: 'offline',
      // Without this Google may return an access token but no refresh token, which looks like a
      // successful connect and then fails the first scheduled backup.
      include_granted_scopes: 'true',
      state,
    });
    return `${AUTH_URI}?${params.toString()}`;
  }

  /** Exchanges a one-time authorization code for a refresh token. */
  async exchangeCode(code: string): Promise<OAuthTokens> {
    const response = await this.fetchImpl(TOKEN_URI, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        code,
        client_id: this.clientId,
        client_secret: this.clientSecret,
        redirect_uri: this.redirectUri,
        grant_type: 'authorization_code',
      }),
    });
    const payload = (await response.json().catch(() => ({}))) as {
      access_token?: string;
      refresh_token?: string;
      expires_in?: number;
      scope?: string;
      error?: string;
      error_description?: string;
    };

    if (!response.ok || !payload.access_token) {
      throw this.authErrorFrom(payload.error, payload.error_description, 'code exchange');
    }
    if (!payload.refresh_token) {
      throw new DriveAuthError(
        'Google did not return a refresh token. Revoke the app in your Google account and reconnect.',
        'ACCESS_DENIED',
        'no refresh_token in response',
      );
    }

    return {
      accessToken: payload.access_token,
      refreshToken: payload.refresh_token,
      expiresAt: Date.now() + (payload.expires_in ?? 3600) * 1000,
      scope: payload.scope ?? '',
    };
  }

  /**
   * A short-lived access token, refreshed as needed.
   *
   * Cached with a margin so a token cannot expire between being fetched and being used.
   */
  async accessToken(): Promise<string> {
    if (this.cached && this.cached.expiresAt > Date.now() + 60_000) {
      return this.cached.accessToken;
    }

    let refreshToken: string;
    try {
      refreshToken = decryptSecret(this.encryptedRefreshToken, this.env);
    } catch (err) {
      // A decryption failure is an operator problem (rotated or missing key), not a transient
      // Google one, so it must not be reported as "try again later".
      const detail = err instanceof CredentialVaultError ? err.code : 'unknown';
      throw new DriveAuthError(
        `The stored Drive credential could not be decrypted (${detail}). Check BACKUP_TOKEN_ENCRYPTION_KEY, then reconnect the destination.`,
        'INVALID_GRANT',
        detail,
      );
    }

    const response = await this.fetchImpl(TOKEN_URI, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: this.clientId,
        client_secret: this.clientSecret,
        refresh_token: refreshToken,
        grant_type: 'refresh_token',
      }),
    });
    const payload = (await response.json().catch(() => ({}))) as {
      access_token?: string;
      expires_in?: number;
      error?: string;
      error_description?: string;
    };

    if (!response.ok || !payload.access_token) {
      throw this.authErrorFrom(payload.error, payload.error_description, 'token refresh');
    }

    this.cached = {
      accessToken: payload.access_token,
      expiresAt: Date.now() + (payload.expires_in ?? 3600) * 1000,
    };
    return this.cached.accessToken;
  }

  /**
   * Real storage figures for the connected account.
   *
   * Read from Drive's `about` endpoint rather than computed locally, because the account's quota is
   * shared with Gmail and Photos: an app-side sum of its own archives would understate how full the
   * Drive actually is, and an operator watching that number to decide when to buy more storage would
   * be misled.
   *
   * Returns `live: false` rather than throwing when Drive will not say, so the console can show
   * "unavailable" instead of a fabricated figure.
   */
  async quota(): Promise<DriveQuota> {
    try {
      const token = await this.accessToken();
      const response = await this.fetchImpl(
        `${DRIVE_API}/about?fields=storageQuota,user(displayName,emailAddress)`,
        { headers: { Authorization: `Bearer ${token}` } },
      );
      if (!response.ok) {
        this.logger.warn(`Drive about returned ${response.status}; quota unavailable.`);
        return { limitBytes: 0, usageBytes: 0, freeBytes: 0, percentUsed: 0, live: false };
      }

      const payload = (await response.json()) as {
        storageQuota?: { limit?: string; usage?: string };
      };
      const limit = Number(payload.storageQuota?.limit ?? 0);
      const usage = Number(payload.storageQuota?.usage ?? 0);
      if (!Number.isFinite(limit) || limit <= 0) {
        return { limitBytes: 0, usageBytes: 0, freeBytes: 0, percentUsed: 0, live: false };
      }

      return {
        limitBytes: limit,
        usageBytes: usage,
        freeBytes: Math.max(0, limit - usage),
        percentUsed: Math.min(100, Number(((usage / limit) * 100).toFixed(1))),
        live: true,
      };
    } catch (err) {
      this.logger.warn(`Could not read Drive quota: ${(err as Error).message}`);
      return { limitBytes: 0, usageBytes: 0, freeBytes: 0, percentUsed: 0, live: false };
    }
  }

  /** The signed-in Google account, used to confirm which account holds the archives. */
  async whoAmI(): Promise<{ email: string; displayName: string }> {
    const token = await this.accessToken();
    const response = await this.fetchImpl(`${DRIVE_API}/about?fields=user(displayName,emailAddress)`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!response.ok) {
      throw new DriveAuthError(`Drive about returned ${response.status}`, 'UNREACHABLE');
    }
    const payload = (await response.json()) as {
      user?: { emailAddress?: string; displayName?: string };
    };
    return {
      email: payload.user?.emailAddress ?? '',
      displayName: payload.user?.displayName ?? '',
    };
  }

  async upload(fileName: string, body: Buffer, mimeType = 'application/json'): Promise<DriveFile> {
    const token = await this.accessToken();
    const boundary = `flyconnect-${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
    const metadata: Record<string, unknown> = { name: fileName, mimeType };
    if (this.folderId) metadata['parents'] = [this.folderId];

    const preamble =
      `--${boundary}\r\n` +
      'Content-Type: application/json; charset=UTF-8\r\n\r\n' +
      `${JSON.stringify(metadata)}\r\n` +
      `--${boundary}\r\n` +
      `Content-Type: ${mimeType}\r\n\r\n` +
      `${body.toString('base64')}\r\n` +
      `--${boundary}--`;

    const response = await this.fetchImpl(
      `${DRIVE_API}/files?uploadType=multipart&fields=id,name,size,webViewLink`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': `multipart/related; boundary=${boundary}`,
        },
        body: Buffer.from(preamble, 'utf8'),
      },
    );

    if (!response.ok) {
      const detail = await response.text().catch(() => '');
      throw this.errorFrom(response.status, detail, 'upload');
    }
    const json = (await response.json()) as { id?: string; name?: string; size?: string };
    if (!json.id) {
      // Never treat a 2xx without an id as success: without an id there is nothing to record and
      // nothing to delete later.
      throw new Error('Drive upload reported success but returned no file id');
    }
    return {
      id: json.id,
      name: json.name ?? fileName,
      sizeBytes: Number(json.size ?? body.length),
    };
  }

  async list(prefix = '', limit = 50): Promise<DriveFile[]> {
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
      fields: 'files(id,name,size,modifiedTime,webViewLink)',
    });

    const response = await this.raw(`/files?${params.toString()}`, 'list');
    const payload = (await response.json()) as {
      files?: Array<{ id: string; name: string; size?: string; modifiedTime?: string; webViewLink?: string }>;
    };
    return (payload.files ?? []).map((f) => ({
      id: f.id,
      name: f.name,
      sizeBytes: Number(f.size ?? 0),
      modifiedTime: f.modifiedTime,
      webViewLink: f.webViewLink,
    }));
  }

  async download(fileId: string): Promise<Buffer> {
    const token = await this.accessToken();
    const response = await this.fetchImpl(
      `${DRIVE_API}/files/${fileId}?alt=media`,
      { headers: { Authorization: `Bearer ${token}` } },
    );
    if (!response.ok) {
      const detail = await response.text().catch(() => '');
      throw this.errorFrom(response.status, detail, 'download');
    }
    return Buffer.from(await response.arrayBuffer());
  }

  async remove(fileId: string): Promise<void> {
    await this.raw(`/files/${fileId}`, 'delete', 'DELETE');
  }

  /**
   * Live credential check, used by the console's "Verify with Google" button.
   *
   * Reports the account it is actually acting as. That is the single most useful thing to show,
   * because the common failure is connecting the wrong Google account and only noticing when no
   * backup lands.
   */
  async verify(): Promise<{
    ok: boolean;
    accountEmail: string;
    folderId: string | null;
    detail: string;
  }> {
    if (!this.isConfigured()) {
      return {
        ok: false,
        accountEmail: '',
        folderId: null,
        detail:
          'No Drive destination is connected. Set GOOGLE_DRIVE_CLIENT_ID and GOOGLE_DRIVE_CLIENT_SECRET, then connect a Google account.',
      };
    }
    try {
      const me = await this.whoAmI();
      return {
        ok: true,
        accountEmail: me.email,
        folderId: this.folderId ?? null,
        detail: `Authenticated as ${me.email}.`,
      };
    } catch (err) {
      return {
        ok: false,
        accountEmail: '',
        folderId: this.folderId ?? null,
        detail: err instanceof Error ? err.message : 'Drive verification failed',
      };
    }
  }

  private async raw(path: string, action: string, method = 'GET'): Promise<Response> {
    const token = await this.accessToken();
    const response = await this.fetchImpl(`${DRIVE_API}${path}`, {
      method,
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!response.ok) {
      const detail = await response.text().catch(() => '');
      throw this.errorFrom(response.status, detail, action);
    }
    return response;
  }

  private authErrorFrom(
    error: string | undefined,
    description: string | undefined,
    context: string,
  ): DriveAuthError {
    const detail = [error, description].filter(Boolean).join(': ');

    if (error === 'invalid_grant') {
      // The refresh token was revoked, or the consent was taken back. Retrying cannot help.
      return new DriveAuthError(
        'The Google authorisation is no longer valid. Reconnect the Drive destination from Settings.',
        'INVALID_GRANT',
        detail,
      );
    }
    if (error === 'access_denied' || error === 'unauthorized_client') {
      return new DriveAuthError(
        'Google refused the authorisation. Check that the OAuth client is published (not in Testing) and the scopes match.',
        'ACCESS_DENIED',
        detail,
      );
    }
    if (error === 'invalid_client') {
      return new DriveAuthError(
        'Google rejected the OAuth client id or secret. Check GOOGLE_DRIVE_CLIENT_ID / GOOGLE_DRIVE_CLIENT_SECRET.',
        'INVALID_CLIENT',
        detail,
      );
    }
    return new DriveAuthError(`Drive ${context} failed: ${error ?? 'unknown error'}`, 'UNREACHABLE', detail);
  }

  private errorFrom(status: number, detail: string, action: string): Error {
    if (status === 401 || status === 403) {
      // 403 also covers "this account cannot write to that folder", which is a permission problem
      // the operator fixes by sharing the folder - worth calling out distinctly from a revoked
      // token, because the remedy is different.
      if (/storage quota/i.test(detail)) {
        return new DriveAuthError(
          'This Google account has no Drive storage quota. Use a personal Google account with free Drive space.',
          'ACCESS_DENIED',
          detail,
        );
      }
      if (/insufficient permissions|insufficientFilePermissions|parent/i.test(detail)) {
        return new Error(
          `Drive refused the ${action}: the connected Google account cannot write to that folder. Share the folder with ${this.folderId ?? 'the target folder'}. (${detail.slice(0, 200)})`,
        );
      }
      return new DriveAuthError(
        `Drive refused the ${action} (403). The grant may have been revoked, or the folder is not shared with this account.`,
        'INVALID_GRANT',
        detail,
      );
    }
    if (status === 404) {
      return new Error(`Drive could not find the file or folder (404) during ${action}.`);
    }
    return new Error(`Drive ${action} failed (${status}): ${detail.slice(0, 200)}`);
  }
}