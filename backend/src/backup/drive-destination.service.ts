import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { DriveAuthError, GoogleDriveOAuth } from './google-drive-oauth';
import { CredentialVaultError, encryptSecret } from './credential-vault';
import { PrismaService } from '../prisma/prisma.service';

/**
 * How the current Drive destination was obtained, and what it means operationally.
 */
export type DestinationKind = 'SERVICE_ACCOUNT' | 'USER_OAUTH';

export interface DestinationSummary {
  kind: DestinationKind;
  accountEmail: string;
  folderId: string | null;
  folderUrl: string | null;
  connectedAt: string;
  lastUsedAt: string | null;
  broken: boolean;
  errorMessage: string | null;
}

interface BackupDestinationRow {
  id: string;
  kind: string;
  accountEmail: string;
  refreshTokenCiphertext: string | null;
  folderId: string | null;
  status: string;
  connectedAt: Date;
  lastUsedAt: Date | null;
  errorMessage: string | null;
}

/**
 * Chooses and holds the active Drive destination.
 *
 * PREFERENCE ORDER
 *
 * A connected user account wins over the environment's service account when it is healthy. Rationale:
 * a service account cannot upload content to a personal Drive at all (no storage quota), so if one
 * is configured AND a real account is connected, using the service account would produce backups
 * that cannot succeed. When the user destination is broken it falls back, and the console says so,
 * because silently using a credential that will fail is the behaviour this whole system exists to
 * avoid.
 */
@Injectable()
export class DriveDestinationService implements OnModuleInit {
  private readonly logger = new Logger(DriveDestinationService.name);
  private cachedClient: GoogleDriveOAuth | null = null;
  private cachedFor: string | null = null;

  constructor(
    private readonly prisma: PrismaService,
    private readonly env: NodeJS.ProcessEnv = process.env,
  ) {}

  /**
   * Load the active destination at boot.
   *
   * Best-effort: a failure here must not stop the API from starting. If the table is missing the
   * console shows the problem, which is far more useful than a crash loop.
   */
  async onModuleInit(): Promise<void> {
    await this.load();
    const row = this.active;
    if (row) {
      this.logger.log(
        `Drive destination: Google account ${row.accountEmail}, folder ${row.folderId ?? '(none)'}`,
      );
    } else {
      this.logger.log(
        'No Google account connected. Backups will use the service account if one is configured.',
      );
    }
  }

  private clientId(): string {
    return this.env.GOOGLE_DRIVE_CLIENT_ID ?? '';
  }

  private clientSecret(): string {
    return this.env.GOOGLE_DRIVE_CLIENT_SECRET ?? '';
  }

  private redirectUri(): string {
    return (
      this.env.GOOGLE_DRIVE_REDIRECT_URI ??
      `${this.env.BACKEND_PUBLIC_URL ?? 'http://localhost:4000'}/api/backups/destination/google/callback`
    );
  }

  /**
   * The client to use for Drive operations, or null when nothing is usable.
   *
   * Never throws: an unreachable or half-configured destination must let the API boot so the
   * console can *show* the problem. `BackupService` turns a null client into a loud refusal.
   */
  client(): GoogleDriveOAuth | null {
    const row = this.active;
    if (row && row.kind === 'USER_OAUTH' && row.refreshTokenCiphertext) {
      const fingerprint = `oauth:${row.id}:${row.refreshTokenCiphertext.slice(0, 24)}`;
      if (this.cachedClient && this.cachedFor === fingerprint) {
        return this.cachedClient;
      }
      const client = new GoogleDriveOAuth(
        this.clientId(),
        this.clientSecret(),
        row.refreshTokenCiphertext,
        row.folderId ?? undefined,
        this.redirectUri(),
        fetch,
        this.env,
      );
      // Only cache a usable client. A half-configured one would be returned again next call and
      // fail in a way that looks transient.
      if (client.isConfigured()) {
        this.cachedClient = client;
        this.cachedFor = fingerprint;
        return client;
      }
      return null;
    }
    return null;
  }

  /**
   * The active destination, held in memory after `load()`.
   *
   * Cached rather than re-queried because `client()` is called synchronously from
   * `BackupService`'s constructor, which cannot await. A fresh install where the table does not
   * exist yet must still boot, so a failed read leaves this null and the service-account path
   * remains available.
   */
  private activeRow: BackupDestinationRow | null = null;

  private get active(): BackupDestinationRow | null {
    return this.activeRow;
  }

  /** Loads the active destination. Call at startup and after any connect. */
  async load(): Promise<void> {
    try {
      this.activeRow = await this.prisma.backupDestination.findFirst({
        where: { kind: 'USER_OAUTH', status: 'ACTIVE' },
        orderBy: { connectedAt: 'desc' },
      });
      this.cachedClient = null;
      this.cachedFor = null;
    } catch {
      // Table missing (migration not applied) or database down. Leave null; the service-account
      // path remains available and the console reports the problem.
      this.activeRow = null;
      this.cachedClient = null;
      this.cachedFor = null;
    }
  }

  /** The active destination, without a database round-trip. Null before `load()` has run. */
  summarySync(): { accountEmail: string; folderId: string | null } | null {
    const row = this.active;
    if (!row) return null;
    return { accountEmail: row.accountEmail, folderId: row.folderId };
  }

  /** Records that the destination was used, so the console can show it is alive. */
  async markUsed(): Promise<void> {
    const row = this.activeRow;
    if (!row) return;
    const id = row.id;
    try {
      await this.prisma.backupDestination.update({
        where: { id },
        data: { lastUsedAt: new Date() },
      });
      this.activeRow = { ...row, lastUsedAt: new Date() };
    } catch {
      // Cosmetic. Not worth failing a successful backup over.
    }
  }

  /** The URL the operator visits to grant access. */
  authorizationUrl(state: string): string {
    const probe = new GoogleDriveOAuth(
      this.clientId(),
      this.clientSecret(),
      '',
      undefined,
      this.redirectUri(),
      fetch,
      this.env,
    );
    return probe.authorizationUrl(state);
  }

  /** Whether the OAuth client is configured enough to start a connect flow. */
  canStartConnect(): boolean {
    return Boolean(this.clientId() && this.clientSecret());
  }

  /**
   * Completes a connect flow: exchanges the code, encrypts the refresh token, stores it.
   *
   * Any previous user destination is marked broken rather than deleted, so an operator can see that
   * one existed and what account it was.
   */
  async connect(
    code: string,
    redirectUriOverride?: string,
  ): Promise<{ accountEmail: string; folderId: string }> {
    const effectiveRedirectUri = redirectUriOverride?.trim() || this.redirectUri();
    const probe = new GoogleDriveOAuth(
      this.clientId(),
      this.clientSecret(),
      '',
      undefined,
      effectiveRedirectUri,
      fetch,
      this.env,
    );
    const tokens = await probe.exchangeCode(code);

    // Learn which account granted it, so the console can name it. A wrong account is otherwise
    // invisible until an archive fails to land where expected.
    const client = new GoogleDriveOAuth(
      this.clientId(),
      this.clientSecret(),
      '',
      undefined,
      effectiveRedirectUri,
      fetch,
      this.env,
    );
    (client as unknown as { cached: { accessToken: string; expiresAt: number } }).cached = {
      accessToken: tokens.accessToken,
      expiresAt: tokens.expiresAt,
    };
    const me = await client.whoAmI();

    const folderId = this.folderIdFromRequest() ?? (await this.discoverFolder(me.email, client));
    const ciphertext = encryptSecret(tokens.refreshToken, this.env);

    const row = await this.prisma.backupDestination.findFirst({
      where: { kind: 'USER_OAUTH', status: 'ACTIVE' },
      orderBy: { connectedAt: 'desc' },
    });
    if (row) {
      await this.prisma.backupDestination.update({
        where: { id: row.id },
        data: { status: 'BROKEN', errorMessage: 'Replaced by a newer connection' },
      });
    }

    await this.prisma.backupDestination.create({
      data: {
        kind: 'USER_OAUTH',
        accountEmail: me.email,
        refreshTokenCiphertext: ciphertext,
        folderId,
        status: 'ACTIVE',
        connectedAt: new Date(),
        errorMessage: null,
      },
    });
    await this.load();

    return { accountEmail: me.email, folderId };
  }

  /** Folder to archive into: an explicit configured id, else the account's own root. */
  private folderIdFromRequest(): string | null {
    return this.env.GOOGLE_DRIVE_FOLDER_ID?.trim() || null;
  }

  /**
   * With no explicit folder, find or create "FlyConnect Backups" in the account's root.
   *
   * Creating it is what makes the account usable without the operator having to create and share a
   * folder by hand - the shared-drive problem did not apply here, and asking someone to hand-share
   * a folder with a service account was precisely the step that could not work.
   */
  private async discoverFolder(accountEmail: string, client: GoogleDriveOAuth): Promise<string> {
    const FOLDER_NAME = 'FlyConnect Backups';
    const token = await client.accessToken();
    const DRIVE_API = 'https://www.googleapis.com/drive/v3';

    const listResponse = await fetch(
      `${DRIVE_API}/files?q=${encodeURIComponent(
        `name = '${FOLDER_NAME}' and mimeType = 'application/vnd.google-apps.folder' and trashed = false`,
      )}&fields=files(id,name)`,
      { headers: { Authorization: `Bearer ${token}` } },
    );
    if (listResponse.ok) {
      const payload = (await listResponse.json()) as { files?: Array<{ id: string }> };
      const existing = payload.files?.[0];
      if (existing?.id) return existing.id;
    }

    const createResponse = await fetch(
      `${DRIVE_API}/files?fields=id`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          name: FOLDER_NAME,
          mimeType: 'application/vnd.google-apps.folder',
        }),
      },
    );
    if (!createResponse.ok) {
      throw new Error(
        `Could not create the "${FOLDER_NAME}" folder in ${accountEmail}. Create a folder manually and set GOOGLE_DRIVE_FOLDER_ID.`,
      );
    }
    const created = (await createResponse.json()) as { id: string };
    return created.id;
  }

  /** Marks the destination broken so the console explains itself, then stops using it. */
  async markBroken(message: string): Promise<void> {
    const row = await this.prisma.backupDestination.findFirst({
      where: { kind: 'USER_OAUTH', status: 'ACTIVE' },
      orderBy: { connectedAt: 'desc' },
    });
    if (!row) return;
    await this.prisma.backupDestination.update({
      where: { id: row.id },
      data: { status: 'BROKEN', errorMessage: message.slice(0, 500) },
    });
    this.cachedClient = null;
    this.cachedFor = null;
    await this.load();
  }

  async summary(): Promise<DestinationSummary | null> {
    const row = await this.prisma.backupDestination.findFirst({
      where: { kind: 'USER_OAUTH', status: 'ACTIVE' },
      orderBy: { connectedAt: 'desc' },
    });
    if (!row) return null;
    return {
      kind: 'USER_OAUTH',
      accountEmail: row.accountEmail,
      folderId: row.folderId,
      folderUrl: row.folderId ? `https://drive.google.com/drive/folders/${row.folderId}` : null,
      connectedAt: row.connectedAt.toISOString(),
      lastUsedAt: row.lastUsedAt ? row.lastUsedAt.toISOString() : null,
      broken: row.status === 'BROKEN',
      errorMessage: row.errorMessage,
    };
  }
}

/**
 * True when a failure is the credential's fault rather than a transient problem.
 *
 * Used to decide whether to mark a destination broken (which makes the console explain itself)
 * rather than simply recording a failed backup.
 */
export function isCredentialFailure(err: unknown): boolean {
  return err instanceof DriveAuthError || err instanceof CredentialVaultError;
}
