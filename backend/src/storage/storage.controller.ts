import { Controller, ForbiddenException, Get, Post, Query, Res } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Role } from '@prisma/client';
import { Response } from 'express';
import { AuthUser, CurrentUser } from '../common/current-user.decorator';
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
   * Only `invoices` is tenant-scoped. `pg_total_relation_size` is a property of a
   * database, not of a row, so `databaseBytes` and `tables` necessarily describe the
   * whole deployment and are reported as such rather than dressed up as per-business.
   */
  @Get('usage')
  usage(@CurrentUser() user: AuthUser) {
    return this.storage.usage(user.businessId);
  }

  /**
   * One-click full data export for tenant backup.
   * Generates a complete JSON backup of all business data.
   */
  @Get('backup/export')
  async exportBackup(@CurrentUser() user: AuthUser, @Res() res: Response) {
    if (user.role !== Role.ADMIN && user.role !== Role.SUPER_ADMIN) {
      throw new ForbiddenException({ message: 'Only an administrator can export business backups' });
    }

    const backup = await this.storage.exportBusinessBackup(user.businessId);
    const dateStr = new Date().toISOString().split('T')[0];
    const filename = `flyconnect-backup-${dateStr}.json`;

    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.send(JSON.stringify(backup, null, 2));
  }

  /**
   * Run the retention sweep.
   *
   * Admin-only and non-destructive by design: it deletes refresh tokens that are long
   * expired, and empties the PDF bytes of long-issued invoices while keeping their
   * row, number and payload. The audit trail survives either way.
   */
  @Post('sweep')
  sweep(
    @CurrentUser() user: AuthUser,
    @Query('tokenMaxAgeDays') tokenMaxAgeDays?: string,
    @Query('invoicePruneAfterDays') invoicePruneAfterDays?: string,
  ) {
    if (user.role !== Role.ADMIN && user.role !== Role.SUPER_ADMIN) {
      throw new ForbiddenException({ message: 'Only an administrator can run the storage sweep' });
    }

    const token = Number(tokenMaxAgeDays);
    const invoice = Number(invoicePruneAfterDays);

    return this.storage.sweep({
      // Ignore NaN and out-of-range input rather than falling back silently to the
      // default, so a typo in the query cannot quietly prune nothing.
      ...(Number.isFinite(token) && token > 0 ? { tokenMaxAgeDays: token } : {}),
      ...(Number.isFinite(invoice) && invoice > 0 ? { invoicePruneAfterDays: invoice } : {}),
    });
  }
}

