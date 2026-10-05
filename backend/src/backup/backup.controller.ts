import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  ForbiddenException,
  Get,
  Logger,
  Param,
  Post,
  Query,
  Res,
  ServiceUnavailableException,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import type { Response } from 'express';
import { ApiBearerAuth, ApiConsumes, ApiTags } from '@nestjs/swagger';
import { FileInterceptor } from '@nestjs/platform-express';
import { randomBytes } from 'crypto';
import { BackupStatus, BackupTrigger } from '@prisma/client';
import { AuthUser, CurrentUser } from '../common/current-user.decorator';
import { Permission, roleHas, type PermissionKey } from '../common/permissions';
import { RequirePermissions } from '../common/permissions.decorator';
import { Public } from '../common/public.decorator';
import { BackupScheduler } from './backup.scheduler';
import { BackupService } from './backup.service';
import { DriveDestinationService } from './drive-destination.service';
import { sha256Hex } from './google-drive.service-account';
import { RestoreService, type RestoreScope } from './restore.service';

/**
 * How long a connect attempt stays valid.
 *
 * Long enough for a human to read a consent screen and pick an account, short enough that a nonce
 * captured from a log or a referrer header is useless by the time it could be replayed.
 */
const STATE_TTL_MS = 10 * 60 * 1000;

/**
 * Platform-owner backup console.
 *
 * Every route requires a `backup:*` permission, and only SUPER_ADMIN holds any of them — backups are
 * explicitly out of scope for tenant administrators. That is a product decision, and it is enforced
 * in the permission matrix rather than by a bespoke role check here.
 */
@ApiTags('backups')
@ApiBearerAuth()
@Controller('backups')
export class BackupController {
  /**
   * Single-use nonces for the Google connect flow.
   *
   * In memory on purpose: the flow is a human clicking through a consent screen, so a restart losing
   * an in-flight attempt is fine, whereas anything shared across instances would need coordination
   * for no benefit. Entries are dropped once used or expired, so a leaked nonce cannot be replayed.
   */
  private readonly pendingStates = new Map<string, { expiresAt: number }>();
  private readonly logger = new Logger(BackupController.name);

  constructor(
    private readonly backups: BackupService,
    private readonly scheduler: BackupScheduler,
    private readonly restoreService: RestoreService,
    private readonly destinations: DriveDestinationService,
  ) {}

  /** Consumes a state value, returning false unless it was issued, unused and unexpired. */
  private consumeState(state: string): boolean {
    // Opportunistic sweep. A connect attempt that is never completed would otherwise leave entries
    // behind forever.
    const now = Date.now();
    for (const [key, entry] of this.pendingStates) {
      if (entry.expiresAt <= now) this.pendingStates.delete(key);
    }
    const entry = this.pendingStates.get(state);
    if (!entry || entry.expiresAt <= now) return false;
    // Single use: a replayed callback with a valid nonce must not connect a second time.
    this.pendingStates.delete(state);
    return true;
  }

  private consoleUrl(): string {
    return process.env.FRONTEND_URL ?? 'http://localhost:3000';
  }

  private assertCan(user: AuthUser, permission: PermissionKey): void {
    if (!roleHas(user.role, permission)) {
      throw new ForbiddenException({
        message: 'Connecting a Drive destination requires a platform-owner role',
        code: 'INSUFFICIENT_PERMISSION',
      });
    }
  }

  private assertRestoreEnabled(): void {
    if (process.env.RESTORE_ENABLED !== 'true') {
      throw new ForbiddenException({
        message:
          'Destructive restore execution is disabled by default. Verify restore against a non-production database first, then set RESTORE_ENABLED=true on the server.',
        code: 'RESTORE_DISABLED',
      });
    }
  }

  @Get('destination')
  @RequirePermissions(Permission.BACKUP_VIEW)
  destination() {
    return this.backups.destinationStatus();
  }

  /**
   * Live storage figures for the console.
   *
   * Restricted to platform owners because the Drive quota belongs to the operator's own Google
   * account, not to any tenant. A tenant admin seeing how full someone else's personal Drive is
   * would be a disclosure, not a feature.
   */
  @Get('storage')
  @RequirePermissions(Permission.BACKUP_VIEW)
  async storage(@CurrentUser() user: AuthUser) {
    // Checked here as well as by the guard. The decorator is the primary enforcement, but this
    // endpoint discloses how full the operator's own personal Google account is, so it gets the
    // same belt-and-braces check as the connect endpoints rather than relying on one layer.
    this.assertCan(user, Permission.BACKUP_VIEW);

    const [usage, destination] = await Promise.all([
      this.backups.storageUsage(user),
      this.destinations.summary(),
    ]);
    return { ...usage, destination };
  }

  /**
   * Where the operator is sent to grant Drive access.
   *
   * Returns the URL rather than redirecting, so the console can show it and let a human click it
   * through the normal sign-in flow. Returning a URL also keeps this endpoint safe to call from a
   * frontend without an open redirect.
   */
  @Post('destination/google/connect')
  @RequirePermissions(Permission.BACKUP_CONFIGURE)
  async connectGoogle(@CurrentUser() user: AuthUser): Promise<{ authorizationUrl: string }> {
    this.assertCan(user, Permission.BACKUP_CONFIGURE);

    if (!this.destinations.canStartConnect()) {
      throw new ServiceUnavailableException({
        message:
          'Google Drive OAuth is not configured. Set GOOGLE_DRIVE_CLIENT_ID and GOOGLE_DRIVE_CLIENT_SECRET on the server, then try again.',
        code: 'OAUTH_CLIENT_NOT_CONFIGURED',
      });
    }

    // A fresh, single-use state per attempt. The callback rejects anything else, which is the only
    // thing preventing a third party from completing a connect flow with the operator's browser.
    const state = randomBytes(24).toString('base64url');
    this.pendingStates.set(state, { expiresAt: Date.now() + STATE_TTL_MS });

    return { authorizationUrl: this.destinations.authorizationUrl(state) };
  }

  /**
   * Google's redirect target. Public by necessity - the browser arrives here from Google without a
   * FlyConnect bearer token - so authorisation rests entirely on the `state` nonce and on this
   * endpoint being SUPER_ADMIN-gated by the connect call that minted the nonce.
   */
  @Public()
  @Get('destination/google/callback')
  async googleCallback(
    @Res() res: Response,
    @Query('code') code?: string,
    @Query('state') state?: string,
    @Query('error') error?: string,
  ) {
    const fail = (message: string, code2: string) =>
      res.redirect(`${this.consoleUrl()}?driveError=${encodeURIComponent(message)}&code=${code2}`);

    if (error) {
      this.logger.warn(`Google Drive connect refused: ${error}`);
      return fail('Google did not grant access. Nothing was changed.', 'DENIED');
    }
    if (!code || !state) {
      return fail('Google did not return an authorisation code.', 'NO_CODE');
    }
    if (!this.consumeState(state)) {
      // Either a replay or a forged callback. Either way, nothing is connected.
      return fail('The connect request expired or was not initiated by FlyConnect. Start again.', 'BAD_STATE');
    }

    try {
      const connected = await this.destinations.connect(code);
      // Re-read the destination so the next backup uses the new credential without a restart.
      await this.backups.reloadDriveClient();
      this.logger.log(`Drive destination connected: ${connected.accountEmail}`);
      return res.redirect(
        `${this.consoleUrl()}?driveConnected=${encodeURIComponent(connected.accountEmail)}`,
      );
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Could not connect the Google Drive destination.';
      this.logger.error(`Drive connect failed: ${message}`);
      return fail(message.slice(0, 200), 'CONNECT_FAILED');
    }
  }

  /**
   * Completes a popup-based Google OAuth flow where the browser receives a one-time authorization
   * code from the project's authorized OAuth handler and hands it to the server for token exchange.
   */
  @Post('destination/google/exchange')
  @RequirePermissions(Permission.BACKUP_CONFIGURE)
  async exchangeGoogleCode(
    @CurrentUser() user: AuthUser,
    @Body() body: { code?: string; redirectUri?: string },
  ): Promise<{ accountEmail: string; folderId: string }> {
    this.assertCan(user, Permission.BACKUP_CONFIGURE);

    if (!this.destinations.canStartConnect()) {
      throw new ServiceUnavailableException({
        message:
          'Google Drive OAuth is not configured. Set GOOGLE_DRIVE_CLIENT_ID and GOOGLE_DRIVE_CLIENT_SECRET on the server, then try again.',
        code: 'OAUTH_CLIENT_NOT_CONFIGURED',
      });
    }

    const code = body?.code?.trim();
    if (!code) {
      throw new ServiceUnavailableException('Google did not return an authorisation code.');
    }

    const connected = await this.destinations.connect(code, body?.redirectUri);
    await this.backups.reloadDriveClient();
    this.logger.log(`Drive destination connected via popup: ${connected.accountEmail}`);
    return connected;
  }

  /** Forgets the stored grant. Archives already in Drive are untouched. */
  @Delete('destination/google')
  @RequirePermissions(Permission.BACKUP_CONFIGURE)
  async disconnectGoogle(@CurrentUser() user: AuthUser) {
    this.assertCan(user, Permission.BACKUP_CONFIGURE);
    await this.destinations.markBroken('Disconnected by the platform owner');
    await this.backups.reloadDriveClient();
    return { disconnected: true };
  }

  /**
   * Asks Google whether the credential actually works.
   *
   * The old UI printed "Cloud Verification: Confirmed in Drive" without ever contacting Drive. This
   * is the real check, and it is the only honest way to tell an operator whether archives will
   * succeed before they need one.
   */
  @Post('destination/verify')
  @RequirePermissions(Permission.BACKUP_CONFIGURE)
  verify(@CurrentUser() user: AuthUser) {
    return this.backups.verifyDestination(user);
  }

  /** Post-backup-completion health signal for the admin dashboard. */
  @Get('coverage')
  @RequirePermissions(Permission.BACKUP_VIEW)
  coverage(@CurrentUser() user: AuthUser) {
    return this.backups.coverage(user);
  }

  @Get()
  @RequirePermissions(Permission.BACKUP_VIEW)
  list(
    @CurrentUser() user: AuthUser,
    @Query() query: { businessId?: string; status?: string; limit?: string },
  ) {
    const limit = Number(query.limit);
    return this.backups.listRuns(user, {
      businessId: query.businessId,
      status: query.status,
      ...(Number.isFinite(limit) ? { limit } : {}),
    });
  }

  @Get(':id')
  @RequirePermissions(Permission.BACKUP_VIEW)
  get(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.backups.getRun(user, id);
  }

  /**
   * Archives one tenant, or every tenant when `businessId` is omitted.
   *
   * The tenant loop runs in-process and returns per-tenant outcomes, so a partial failure is
   * visible rather than being averaged into one success flag.
   */
  @Post('run')
  @RequirePermissions(Permission.BACKUP_CREATE)
  run(@CurrentUser() user: AuthUser, @Query('businessId') businessId?: string) {
    return this.backups.runBackup(user, { ...(businessId ? { businessId } : {}) });
  }

  /**
   * Returns the archive as base64 inside the standard JSON envelope.
   *
   * Binary passthrough is not an option here: every API response goes through the
   * `{ success, data }` interceptor, and the frontend client parses JSON. This matches how invoice
   * PDFs are already returned, so there is one convention rather than two.
   */
  @Get(':id/download')
  @RequirePermissions(Permission.BACKUP_DOWNLOAD)
  async download(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    const { buffer, fileName } = await this.backups.downloadRun(user, id);
    return { fileName, sizeBytes: buffer.length, base64: buffer.toString('base64') };
  }

  @Post(':id/delete')
  @RequirePermissions(Permission.BACKUP_DELETE)
  remove(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.backups.deleteRun(user, id);
  }

  // ───────────────────────────────────────────────────────────────────────────
  // Restore
  //
  // Split into three deliberate steps so the destructive one is never a single click:
  //   1. preview  — read-only, returns the full plan and any blockers
  //   2. safety   — takes a PRE_RESTORE archive of the tenant as it is right now
  //   3. restore  — performs the rewrite, and takes the safety archive itself if skipped
  // ───────────────────────────────────────────────────────────────────────────

  /**
   * Upload an archive file and get back exactly what restoring it would do.
   *
   * Takes the file rather than a run id because an operator may hold an archive from elsewhere.
   * Nothing is written. The response includes blockers, and the restore endpoint refuses to run if
   * any are present.
   */
  @Post('restore/preview')
  @RequirePermissions(Permission.BACKUP_RESTORE)
  @UseInterceptors(FileInterceptor('file'))
  @ApiConsumes('multipart/form-data')
  async preview(
    @CurrentUser() user: AuthUser,
    @UploadedFile() file: Express.Multer.File | undefined,
    @Body() body: { scopes?: string; sha256?: string },
  ) {
    const { buffer, sha256 } = await readArchiveUpload(file);
    return this.restoreService.preview(user, buffer, sha256 ?? body.sha256 ?? null, parseScopes(body.scopes));
  }

  /**
   * Archives the tenant's *current* state before it is overwritten.
   *
   * Called by the UI between preview and restore. If the operator skips it, `restore()` still
   * takes one — a restore with no way back is not an acceptable state to allow.
   */
  @Post('restore/safety-backup')
  @RequirePermissions(Permission.BACKUP_RESTORE)
  async safetyBackup(@CurrentUser() user: AuthUser, @Body() body: { businessId: string }) {
    this.assertRestoreEnabled();
    if (!body?.businessId) {
      throw new BadRequestException({ message: 'businessId is required', code: 'BUSINESS_ID_REQUIRED' });
    }
    return this.backups.runBackup(user, { businessId: body.businessId, trigger: BackupTrigger.PRE_RESTORE });
  }

  /**
   * Performs the destructive rewrite.
   *
   * Deliberately re-previews rather than trusting a plan computed earlier in the UI: the file on
   * disk may have changed between the two requests, and the restore service independently refuses a
   * blocked plan anyway. The one thing the preview buys us here that we cannot get any other way is
   * the tenant the archive belongs to — without it the only thing we could archive is *every*
   * tenant, which is both slow and a privacy problem.
   *
   * There is no "skip the safety backup" option. Failing to archive aborts the restore.
   */
  @Post('restore/execute')
  @RequirePermissions(Permission.BACKUP_RESTORE)
  @UseInterceptors(FileInterceptor('file'))
  @ApiConsumes('multipart/form-data')
  async restore(
    @CurrentUser() user: AuthUser,
    @UploadedFile() file: Express.Multer.File | undefined,
    @Body() body: { scopes?: string; sha256?: string; confirmation?: string },
  ) {
    this.assertRestoreEnabled();
    const { buffer, sha256 } = await readArchiveUpload(file);
    const expectedSha = sha256 ?? body.sha256 ?? null;
    const scopes = parseScopes(body.scopes);

    // Read-only. Throws on checksum mismatch or a malformed file.
    const plan = await this.restoreService.preview(user, buffer, expectedSha, scopes);

    // `preview()` *reports* blockers rather than throwing, so they have to be checked here. Done
    // before archiving so a hopeless restore does not generate a pointless Drive upload first.
    if (plan.blockers.length > 0) {
      throw new BadRequestException({
        message: 'This archive cannot be restored safely.',
        code: 'RESTORE_BLOCKED',
        blockers: plan.blockers,
      });
    }

    // Exactly one tenant is affected, so exactly one tenant is archived first.
    const [safety] = await this.backups.runBackup(user, {
      businessId: plan.tenantId,
      trigger: BackupTrigger.PRE_RESTORE,
    });
    if (!safety || safety.status === BackupStatus.FAILED) {
      throw new BadRequestException({
        message:
          'Could not take the safety archive, so the restore was refused. Restore again once backups are working.',
        code: 'SAFETY_BACKUP_FAILED',
        businessId: plan.tenantId,
        error: safety?.errorMessage ?? 'the backup produced no result',
      });
    }

    return this.restoreService.restore(user, buffer, expectedSha, scopes, {
      confirmationPhrase: body.confirmation ?? '',
      // Surfaced so the operator can see where the way back is.
      safetyBackupRunId: safety.id,
    });
  }
}

const DEFAULT_SCOPES: RestoreScope[] = [
  'customers',
  'bookings',
  'expenses',
  'income',
  'templates',
  'automation',
  'messages',
  'documents',
  'audit',
];

function parseScopes(raw: string | undefined): RestoreScope[] {
  if (!raw || raw.trim() === '') return DEFAULT_SCOPES;
  const requested = raw
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean) as RestoreScope[];
  return requested.length > 0 ? requested : DEFAULT_SCOPES;
}

/**
 * Reads the uploaded archive, computes its SHA-256, and refuses anything implausibly large.
 *
 * The checksum is computed here rather than taken from the request. A client-supplied hash would
 * make the integrity check decorative: an attacker modifying an archive would simply send the hash
 * of the modified file and the "verification" would pass.
 */
async function readArchiveUpload(file: Express.Multer.File | undefined): Promise<{
  buffer: Buffer;
  sha256: string;
}> {
  if (!file?.buffer) {
    throw new BadRequestException({
      message: 'Attach the archive file (application/json)',
      code: 'ARCHIVE_FILE_REQUIRED',
    });
  }
  // An archive is a tenant's whole history. A ceiling keeps a mis-selected multi-gigabyte file
  // from being read into memory.
  const MAX_ARCHIVE_BYTES = 512 * 1024 * 1024;
  if (file.buffer.length > MAX_ARCHIVE_BYTES) {
    throw new BadRequestException({
      message: `Archive is larger than ${Math.round(MAX_ARCHIVE_BYTES / 1024 / 1024)} MB`,
      code: 'ARCHIVE_TOO_LARGE',
    });
  }
  return { buffer: file.buffer, sha256: sha256Hex(file.buffer) };
}