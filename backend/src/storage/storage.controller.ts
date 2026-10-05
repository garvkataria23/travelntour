import { Controller, Get, Post, Query, Res } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Response } from 'express';
import { AuthUser, CurrentUser } from '../common/current-user.decorator';
import { Permission } from '../common/permissions';
import { RequirePermissions } from '../common/permissions.decorator';
import { StorageService } from './storage.service';

@ApiTags('storage')
@ApiBearerAuth()
@Controller('storage')
export class StorageController {
  constructor(private readonly storage: StorageService) {}

  /**
   * Bytes on disk per table, plus the compression ratio actually achieved on stored
   * invoice documents.
   *
   * `pg_total_relation_size` is a property of a database, not of a row, so `databaseBytes` and
   * `tables` describe the whole deployment. That is exactly why this endpoint is restricted to the
   * platform owner: it reports every table's row count, which discloses other tenants' volumes to
   * whoever can read it. Previously it had no check at all, so any authenticated user could see it.
   */
  @Get('usage')
  @RequirePermissions(Permission.STORAGE_VIEW_USAGE)
  usage(@CurrentUser() user: AuthUser) {
    return this.storage.usage(user.businessId);
  }

  /**
   * Ad-hoc JSON export of the caller's tenant.
   *
   * This streams and forgets. It is a convenience for a human, not a backup: nothing is retained
   * server-side, there is no scheduler behind it, and there is nothing to restore from. Scheduled,
   * retained, restorable backups live in the platform backup module.
   */
  @Get('backup/export')
  @RequirePermissions(Permission.BACKUP_DOWNLOAD)
  async exportBackup(@CurrentUser() user: AuthUser, @Res() res: Response) {
    const backup = await this.storage.exportBusinessBackup(user.businessId);
    const dateStr = new Date().toISOString().split('T')[0];
    const filename = `flyconnect-backup-${dateStr}.json`;

    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.send(JSON.stringify(backup, null, 2));
  }

  /**
   * Retention sweep. Destructive, therefore admin-gated, and scoped to the caller's own tenant.
   */
  @Post('sweep')
  @RequirePermissions(Permission.STORAGE_SWEEP)
  sweep(
    @CurrentUser() user: AuthUser,
    @Query('tokenMaxAgeDays') tokenMaxAgeDays?: string,
    @Query('invoicePruneAfterDays') invoicePruneAfterDays?: string,
  ) {
    const token = Number(tokenMaxAgeDays);
    const invoice = Number(invoicePruneAfterDays);

    return this.storage.sweep(user.businessId, {
      // Ignore NaN rather than silently falling back, so a typo cannot quietly prune nothing.
      // The service also rejects values below 1 day.
      ...(Number.isFinite(token) && token > 0 ? { tokenMaxAgeDays: token } : {}),
      ...(Number.isFinite(invoice) && invoice > 0 ? { invoicePruneAfterDays: invoice } : {}),
    });
  }
}