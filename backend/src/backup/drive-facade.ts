import { GoogleDriveServiceAccount } from './google-drive.service-account';
import { GoogleDriveOAuth, DriveQuota } from './google-drive-oauth';

/**
 * One shape over two Drive credential types.
 *
 * `BackupService` was written against the service-account client and its 33 tests depend on that
 * surface. Rather than widen both classes until they satisfy each other's quirks, each backend is
 * wrapped to the same small interface here. Adding a second credential type is then a change in one
 * file rather than an edit scattered through the backup service.
 *
 * The surface is deliberately just what backup actually uses.
 */
export interface DriveFacade {
  isConfigured(): boolean;
  /** Which account the credential acts as. Empty when unknown until verified. */
  readonly email: string;
  readonly folderId: string | undefined;
  verifyAccess(): Promise<{ ok: boolean; email: string; detail: string }>;
  upload(fileName: string, body: Buffer, mimeType?: string): Promise<{ id: string; size: number; webViewLink?: string }>;
  list(prefix?: string, limit?: number): Promise<Array<{ id: string; name: string; size: number }>>;
  download(fileId: string): Promise<Buffer>;
  remove(fileId: string): Promise<void>;
  /**
   * Real Drive storage figures for the connected account.
   *
   * `null` for a service account, which has no quota of its own to report. The console renders that
   * as "not available" rather than showing a zero, which would read as an empty Drive.
   */
  quota(): Promise<DriveQuota | null>;
}

class ServiceAccountFacade implements DriveFacade {
  constructor(private readonly client: GoogleDriveServiceAccount) {}

  isConfigured(): boolean {
    return this.client.isConfigured();
  }

  get email(): string {
    return this.client.email;
  }

  get folderId(): string | undefined {
    return this.client.folderId;
  }

  async verifyAccess(): Promise<{ ok: boolean; email: string; detail: string }> {
    const r = await this.client.verifyAccess();
    return { ok: r.ok, email: r.email ?? '', detail: r.detail ?? '' };
  }

  async upload(fileName: string, body: Buffer, mimeType = 'application/json'): Promise<{ id: string; size: number; webViewLink?: string }> {
    const f = await this.client.upload(fileName, body, mimeType);
    // Drive omits webViewLink for files it cannot share-link (e.g. files created by a service
    // account), so it is genuinely optional rather than a modelling mistake.
    return { id: f.id, size: f.size, webViewLink: f.webViewLink ?? undefined };
  }

  async list(prefix = '', limit = 50) {
    const files = await this.client.list(prefix, limit);
    return files.map((f) => ({ id: f.id, name: f.name, size: f.size }));
  }

  download(fileId: string): Promise<Buffer> {
    return this.client.download(fileId);
  }

  remove(fileId: string): Promise<void> {
    return this.client.remove(fileId);
  }

  async quota(): Promise<DriveQuota | null> {
    // A service account has no Drive storage quota. Returning zeros here would be a lie the console
    // would render as "0 bytes used" for an account that can store nothing at all.
    return null;
  }
}

class OAuthFacade implements DriveFacade {
  constructor(
    private readonly client: GoogleDriveOAuth,
    private readonly accountEmail: string,
  ) {}

  isConfigured(): boolean {
    return this.client.isConfigured();
  }

  get email(): string {
    // Recorded at connect time. Reading it live would mean a Drive call on every status render.
    return this.accountEmail;
  }

  get folderId(): string | undefined {
    // Not exposed by the client; the console takes the folder from the destination summary.
    return undefined;
  }

  async verifyAccess(): Promise<{ ok: boolean; email: string; detail: string }> {
    const r = await this.client.verify();
    return { ok: r.ok, email: r.accountEmail || this.accountEmail, detail: r.detail };
  }

  async upload(fileName: string, body: Buffer, mimeType = 'application/json'): Promise<{ id: string; size: number; webViewLink?: string }> {
    const f = await this.client.upload(fileName, body, mimeType);
    return { id: f.id, size: f.sizeBytes, webViewLink: f.webViewLink };
  }

  async list(prefix = '', limit = 50) {
    const files = await this.client.list(prefix, limit);
    return files.map((f) => ({ id: f.id, name: f.name, size: f.sizeBytes }));
  }

  download(fileId: string): Promise<Buffer> {
    return this.client.download(fileId);
  }

  remove(fileId: string): Promise<void> {
    return this.client.remove(fileId);
  }

  async quota(): Promise<DriveQuota | null> {
    return this.client.quota();
  }
}

export function facadeForServiceAccount(client: GoogleDriveServiceAccount): DriveFacade {
  return new ServiceAccountFacade(client);
}

export function facadeForOAuth(client: GoogleDriveOAuth, accountEmail: string): DriveFacade {
  return new OAuthFacade(client, accountEmail);
}