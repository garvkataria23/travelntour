"use client";

import { useCallback, useEffect, useState } from "react";
import {
  AlertTriangle,
  CheckCircle2,
  Cloud,
  CloudOff,
  Download,
  HardDriveDownload,
  Loader2,
  PlayCircle,
  RefreshCw,
  ShieldCheck,
  Trash2,
  XCircle,
} from "lucide-react";
import { api, ApiError } from "@/lib/api";
import { PermissionGate } from "@/components/dashboard/can";
import { hasPermission, type Permission } from "@/lib/permissions";
import { formatBytes } from "@/lib/backup-console/format";

/**
 * Platform-owner backup console.
 *
 * WHAT THIS REPLACES
 *
 * The previous "Backup & Cloud" tab asked the *user's browser* to upload an archive to their
 * personal Google Drive, and on failure fell through to a local file download while rendering
 *
 *     "Actually Saved to Google Drive! ✓"
 *     "Verified"
 *     "Cloud Verification: Confirmed in Drive ✓"
 *
 * Nothing was verified and nothing was saved. There was also a "manual connect" that accepted any
 * email string typed into a field, wrote it to localStorage, and reported "Google Drive connected",
 * plus an editable "storage" form whose numbers were never sent to Google.
 *
 * WHAT THIS DOES
 *
 *   - Talks to the server, which archives through a Google *service account*. The credential never
 *     reaches the browser.
 *   - Shows the real destination status, and `Verify` actually calls Drive and reports what Google
 *     said. It says "failed" when it failed.
 *   - Lists every run — successes and failures — with size, checksum and per-collection row counts,
 *     so "is every tenant covered?" is answerable at a glance.
 *   - Requires a `backup:*` permission on every action. Only SUPER_ADMIN holds those, so backups
 *     are out of scope for tenant administrators by policy.
 *
 * Hiding these controls is a usability measure; the API enforces the same permissions server-side.
 */

interface BackupRun {
  id: string;
  businessId: string | null;
  businessName?: string | null;
  trigger: "MANUAL" | "SCHEDULED" | "PRE_RESTORE";
  status: "PENDING" | "RUNNING" | "SUCCEEDED" | "FAILED" | "SKIPPED";
  format: string;
  fileName: string | null;
  driveFileId: string | null;
  driveWebViewLink: string | null;
  sizeBytes: number | null;
  sha256: string | null;
  recordCounts: Record<string, number> | null;
  startedAt: string;
  finishedAt: string | null;
  errorMessage: string | null;
}

interface DestinationStatus {
  configured: boolean;
  reachable: boolean;
  serviceAccountEmail: string;
  folderId?: string;
  detail?: string;
}

interface Coverage {
  tenants: number;
  covered: number;
  uncovered: Array<{ businessId: string; name: string; lastSuccessAt: string | null }>;
  oldestSuccessAt: string | null;
}

const STATUS_STYLE: Record<BackupRun["status"], { cls: string; label: string }> = {
  SUCCEEDED: { cls: "bg-emerald-50 text-emerald-700 ring-emerald-200", label: "Succeeded" },
  FAILED: { cls: "bg-rose-50 text-rose-700 ring-rose-200", label: "Failed" },
  RUNNING: { cls: "bg-sky-50 text-sky-700 ring-sky-200", label: "Running" },
  PENDING: { cls: "bg-slate-50 text-slate-600 ring-slate-200", label: "Pending" },
  SKIPPED: { cls: "bg-amber-50 text-amber-700 ring-amber-200", label: "Removed" },
};

export function BackupConsole() {
  const [destination, setDestination] = useState<DestinationStatus | null>(null);
  const [runs, setRuns] = useState<BackupRun[]>([]);
  const [coverage, setCoverage] = useState<Coverage | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [verifying, setVerifying] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const canRun = hasPermission("backup:create");
  const canVerify = hasPermission("backup:configure");
  const canDownload = hasPermission("backup:download");
  const canDelete = hasPermission("backup:delete");

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [dest, list, cov] = await Promise.all([
        api<DestinationStatus>("/backups/destination", { skipCache: true }),
        api<{ items: BackupRun[] }>("/backups?limit=25", { skipCache: true }),
        api<Coverage>("/backups/coverage", { skipCache: true }),
      ]);
      setDestination(dest);
      setRuns(list.items ?? []);
      setCoverage(cov);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not load backup status");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function runNow() {
    setBusy("run");
    setError(null);
    setNotice(null);
    try {
      const results = await api<BackupRun[]>("/backups/run", { method: "POST", skipCache: true });
      const failed = results.filter((r) => r.status === "FAILED");
      if (failed.length === 0) {
        setNotice(`Archived ${results.length} tenant${results.length === 1 ? "" : "s"} successfully.`);
      } else {
        // A partial failure is reported as a partial failure, not averaged into success.
        setError(
          `${failed.length} of ${results.length} failed: ${failed
            .map((f) => `${f.businessName ?? f.businessId} — ${f.errorMessage ?? "unknown error"}`)
            .join("; ")}`,
        );
      }
      await load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Backup run failed");
    } finally {
      setBusy(null);
    }
  }

  async function verify() {
    setVerifying(true);
    setError(null);
    setNotice(null);
    try {
      const result = await api<DestinationStatus & { verifiedAt: string }>(
        "/backups/destination/verify",
        { method: "POST", skipCache: true },
      );
      setDestination(result);
      setNotice(
        result.reachable
          ? `Google confirmed the credential at ${new Date(result.verifiedAt).toLocaleString()}.`
          : `Google rejected the credential: ${result.detail ?? "unknown reason"}`,
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : "Verification failed");
    } finally {
      setVerifying(false);
    }
  }

  async function download(run: BackupRun) {
    setBusy(run.id);
    setError(null);
    try {
      const payload = await api<{ fileName: string; base64: string }>(`/backups/${run.id}/download`);
      // The API returns the archive base64-encoded inside the standard JSON envelope.
      const binary = atob(payload.base64);
      const bytes = new Uint8Array(binary.length);
      for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
      const url = URL.createObjectURL(new Blob([bytes], { type: "application/json" }));
      const link = document.createElement("a");
      link.href = url;
      link.download = payload.fileName ?? run.fileName ?? `backup-${run.id}.json`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Download failed");
    } finally {
      setBusy(null);
    }
  }

  async function remove(run: BackupRun) {
    setBusy(run.id);
    setError(null);
    try {
      await api(`/backups/${run.id}/delete`, { method: "POST", skipCache: true });
      setNotice(`Removed the archive for ${run.businessName ?? run.businessId}.`);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not remove the archive");
    } finally {
      setBusy(null);
    }
  }

  if (loading) {
    return (
      <div className="flex items-center gap-2 py-8 text-sm text-slate-500">
        <Loader2 className="h-4 w-4 animate-spin" /> Loading backup status…
      </div>
    );
  }

  const unconfigured = destination ? !destination.configured : true;

  return (
    <div className="space-y-5">
      {/* ── Destination ─────────────────────────────────────────────────────── */}
      <section className="rounded-2xl border border-slate-200 bg-white p-5">
        <header className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h3 className="text-sm font-extrabold text-slate-800">Backup destination</h3>
            <p className="mt-0.5 text-xs text-slate-500">
              Archives are written by the server through a Google service account. No browser token is
              involved, so no individual account has to stay signed in for backups to keep working.
            </p>
          </div>
          {canVerify ? (
            <button
              type="button"
              onClick={verify}
              disabled={verifying}
              className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-700 transition hover:bg-slate-50 disabled:opacity-60"
            >
              {verifying ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
              Verify with Google
            </button>
          ) : null}
        </header>

        {unconfigured ? (
          <div className="flex items-start gap-3 rounded-xl border border-amber-200 bg-amber-50 p-4">
            <CloudOff className="mt-0.5 h-5 w-5 shrink-0 text-amber-600" />
            <div className="text-xs text-amber-900">
              <p className="font-bold">No backup destination configured</p>
              <p className="mt-1">
                Set <code className="rounded bg-white/70 px-1">GOOGLE_SERVICE_ACCOUNT_JSON</code> and{" "}
                <code className="rounded bg-white/70 px-1">GOOGLE_DRIVE_FOLDER_ID</code> on the API, then verify.
              </p>
              <p className="mt-2">
                Backups will fail loudly rather than report a false success.{" "}
                {destination?.detail ? <span className="opacity-80">{destination.detail}</span> : null}
              </p>
            </div>
          </div>
        ) : (
          <dl className="grid gap-3 text-xs sm:grid-cols-3">
            <div>
              <dt className="text-slate-500">Service account</dt>
              <dd className="mt-0.5 font-semibold text-slate-800">{destination?.serviceAccountEmail}</dd>
            </div>
            <div>
              <dt className="text-slate-500">Drive folder</dt>
              <dd className="mt-0.5 font-semibold text-slate-800">{destination?.folderId ?? "My Drive root"}</dd>
            </div>
            <div>
              <dt className="text-slate-500">Credential check</dt>
              <dd className="mt-0.5 font-semibold text-slate-800">
                {destination?.reachable ? (
                  <span className="inline-flex items-center gap-1 text-emerald-600">
                    <CheckCircle2 className="h-3.5 w-3.5" /> Confirmed by Google
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1 text-amber-600">
                    <AlertTriangle className="h-3.5 w-3.5" /> Not verified yet
                  </span>
                )}
              </dd>
            </div>
          </dl>
        )}
      </section>

      {/* ── Coverage ────────────────────────────────────────────────────────── */}
      {coverage ? (
        <section className="rounded-2xl border border-slate-200 bg-white p-5">
          <h3 className="mb-3 text-sm font-extrabold text-slate-800">Coverage</h3>
          <div className="grid gap-3 sm:grid-cols-3">
            <Stat label="Tenants" value={String(coverage.tenants)} />
            <Stat
              label="With a successful archive"
              value={String(coverage.covered)}
              tone={coverage.covered === coverage.tenants ? "good" : coverage.covered === 0 ? "bad" : "warn"}
            />
            <Stat
              label="Oldest archive"
              value={coverage.oldestSuccessAt ? new Date(coverage.oldestSuccessAt).toLocaleDateString() : "—"}
            />
          </div>

          {coverage.uncovered.length > 0 ? (
            <div className="mt-4 rounded-xl border border-rose-200 bg-rose-50 p-3">
              <p className="text-xs font-bold text-rose-900">
                {coverage.uncovered.length} tenant{coverage.uncovered.length === 1 ? " has" : "s have"} no
                successful archive
              </p>
              <ul className="mt-1.5 space-y-0.5 text-xs text-rose-800">
                {coverage.uncovered.map((t) => (
                  <li key={t.businessId}>• {t.name}</li>
                ))}
              </ul>
            </div>
          ) : null}
        </section>
      ) : null}

      {/* ── Actions ─────────────────────────────────────────────────────────── */}
      <section className="rounded-2xl border border-slate-200 bg-white p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h3 className="text-sm font-extrabold text-slate-800">Run a backup</h3>
            <p className="mt-0.5 text-xs text-slate-500">
              Archives every tenant immediately. Scheduled runs archive all tenants automatically.
            </p>
          </div>
          {canRun ? (
            <button
              type="button"
              onClick={runNow}
              disabled={busy === "run"}
              className="inline-flex items-center gap-1.5 rounded-lg bg-[#0e2a5c] px-4 py-2 text-xs font-bold text-white transition hover:bg-[#12356f] disabled:opacity-60"
            >
              {busy === "run" ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <PlayCircle className="h-3.5 w-3.5" />
              )}
              Back up all tenants
            </button>
          ) : null}
        </div>
      </section>

      {notice ? (
        <div className="flex items-start gap-2 rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-xs text-emerald-900">
          <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0" />
          <span>{notice}</span>
        </div>
      ) : null}
      {error ? (
        <div className="flex items-start gap-2 rounded-xl border border-rose-200 bg-rose-50 p-3 text-xs text-rose-900">
          <XCircle className="mt-0.5 h-4 w-4 shrink-0" />
          <span>{error}</span>
        </div>
      ) : null}

      {/* ── History ─────────────────────────────────────────────────────────── */}
      <section className="rounded-2xl border border-slate-200 bg-white">
        <header className="flex items-center justify-between gap-3 border-b border-slate-100 px-5 py-3">
          <h3 className="text-sm font-extrabold text-slate-800">Backup history</h3>
          <button
            type="button"
            onClick={load}
            className="rounded-lg border border-slate-200 p-1.5 text-slate-500 transition hover:bg-slate-50"
            aria-label="Refresh backup history"
          >
            <RefreshCw className="h-3.5 w-3.5" />
          </button>
        </header>

        {runs.length === 0 ? (
          <p className="px-5 py-8 text-center text-sm text-slate-400">No backups have been run yet.</p>
        ) : (
          <ul className="divide-y divide-slate-100">
            {runs.map((run) => {
              const style = STATUS_STYLE[run.status];
              return (
                <li key={run.id} className="px-5 py-4">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <span
                          className={`inline-flex items-center rounded-md px-2 py-0.5 text-[10px] font-black uppercase tracking-wide ring-1 ${style.cls}`}
                        >
                          {style.label}
                        </span>
                        <span className="text-xs font-bold text-slate-800">
                          {run.businessName ?? run.businessId ?? "All tenants"}
                        </span>
                        <span className="text-[10px] uppercase tracking-wide text-slate-400">
                          {run.trigger.toLowerCase()}
                        </span>
                      </div>

                      <p className="mt-1 text-[11px] text-slate-500">
                        {new Date(run.startedAt).toLocaleString()}
                        {run.sizeBytes !== null ? ` · ${formatBytes(run.sizeBytes)}` : ""}
                        {run.sha256 ? ` · sha256 ${run.sha256.slice(0, 12)}…` : ""}
                      </p>

                      {run.errorMessage ? (
                        <p className="mt-1.5 rounded-lg bg-rose-50 px-2 py-1 text-[11px] text-rose-800">
                          {run.errorMessage}
                        </p>
                      ) : null}

                      {run.recordCounts ? (
                        <div className="mt-2 flex flex-wrap gap-1.5">
                          {Object.entries(run.recordCounts)
                            .filter(([, n]) => n > 0)
                            .slice(0, 8)
                            .map(([key, n]) => (
                              <span
                                key={key}
                                className="rounded-md bg-slate-50 px-1.5 py-0.5 text-[10px] font-semibold text-slate-600"
                              >
                                {key}: {n}
                              </span>
                            ))}
                        </div>
                      ) : null}
                    </div>

                    <div className="flex shrink-0 items-center gap-1.5">
                      {run.driveWebViewLink ? (
                        <a
                          href={run.driveWebViewLink}
                          target="_blank"
                          rel="noreferrer"
                          className="inline-flex items-center gap-1 rounded-lg border border-slate-200 px-2.5 py-1.5 text-[11px] font-semibold text-slate-700 transition hover:bg-slate-50"
                        >
                          <Cloud className="h-3.5 w-3.5" /> Drive
                        </a>
                      ) : null}
                      {canDownload && run.status === "SUCCEEDED" ? (
                        <button
                          type="button"
                          onClick={() => download(run)}
                          disabled={busy === run.id}
                          className="inline-flex items-center gap-1 rounded-lg border border-slate-200 px-2.5 py-1.5 text-[11px] font-semibold text-slate-700 transition hover:bg-slate-50 disabled:opacity-60"
                        >
                          <Download className="h-3.5 w-3.5" /> Download
                        </button>
                      ) : null}
                      {canDelete && run.status === "SUCCEEDED" ? (
                        <button
                          type="button"
                          onClick={() => remove(run)}
                          disabled={busy === run.id}
                          className="inline-flex items-center gap-1 rounded-lg border border-rose-200 px-2.5 py-1.5 text-[11px] font-semibold text-rose-600 transition hover:bg-rose-50 disabled:opacity-60"
                        >
                          <Trash2 className="h-3.5 w-3.5" /> Remove
                        </button>
                      ) : null}
                    </div>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </div>
  );
}

function Stat({ label, value, tone }: { label: string; value: string; tone?: "good" | "warn" | "bad" }) {
  const toneClass =
    tone === "good"
      ? "text-emerald-600"
      : tone === "bad"
        ? "text-rose-600"
        : tone === "warn"
          ? "text-amber-600"
          : "text-slate-800";
  return (
    <div className="rounded-xl border border-slate-100 bg-slate-50 px-3 py-2.5">
      <p className="text-[10px] font-bold uppercase tracking-wide text-slate-400">{label}</p>
      <p className={`mt-0.5 text-lg font-extrabold ${toneClass}`}>{value}</p>
    </div>
  );
}

/** Convenience wrapper so a page can drop the console in with its own access message. */
export function BackupConsoleForSuperAdmin() {
  return (
    <PermissionGate
      any={["backup:view" as Permission]}
      title="Backups are restricted to the platform owner"
      description="Tenant administrators cannot run, download or remove archives. Ask the platform owner if you need a backup."
    >
      <div className="rounded-2xl border border-slate-200 bg-slate-50/40 p-4">
        <BackupConsole />
      </div>
    </PermissionGate>
  );
}

export { HardDriveDownload };