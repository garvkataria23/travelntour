/** Wire types shared by the restore panel and the API. Kept separate so the server's union is
 *  mirrored in one obvious place rather than re-declared inline in every component. */

export const ALL_RESTORE_SCOPES = [
  "customers",
  "bookings",
  "expenses",
  "income",
  "templates",
  "automation",
  "messages",
  "documents",
  "audit",
] as const;

export type RestoreScope = (typeof ALL_RESTORE_SCOPES)[number];

export interface RestorePlan {
  runId: string;
  tenantId: string;
  tenantName: string | null;
  archiveExportedAt: string | null;
  archiveVersion: string | null;
  checksumMatches: boolean;
  scopes: RestoreScope[];
  /** Row counts that will be deleted, per table. */
  willDelete: Record<string, number>;
  /** Row counts that will be written, per table, from the archive. */
  willInsert: Record<string, number>;
  /** Non-fatal problems the operator should know about. */
  warnings: string[];
  /** Problems that make a restore unsafe. Any entry blocks it. */
  blockers: string[];
  usersNeedingPasswordReset: Array<{ id: string; email: string }>;
  /**
   * The `BackupRun` holding the tenant's state immediately before this restore overwrote it. Use it
   * to undo the restore.
   */
  safetyBackupRunId: string | null;
}

/** Invoice PDFs the export could not fit inside its size budget. */
export interface InvoiceBlobTally {
  included: number;
  skippedForBudget: number;
  budgetBytes: number;
}