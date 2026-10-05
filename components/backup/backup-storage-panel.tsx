"use client";

import { useCallback, useEffect, useState } from "react";
import { AlertTriangle, Cloud, ExternalLink, FolderOpen, HardDrive, Link2Off, Loader2, RefreshCw, Unlink } from "lucide-react";
import { api } from "@/lib/api";
import { hasPermission } from "@/lib/permissions";
import {
  DRIVE_OAUTH_CHANNEL,
  DRIVE_OAUTH_STORAGE_KEY,
  GoogleGLogo,
  connectGoogleDriveViaPopup,
  type DriveOAuthPopupMessage,
} from "./google-drive-connect-modal";

/**
 * Live storage panel and Drive account management.
 *
 * WHAT THIS SHOWS, AND WHY IT IS NOT ONE NUMBER
 *
 * Two different figures that are easy to conflate and must not be:
 *
 *   - **Drive storage** is what Google reports for the connected account. It is SHARED with Gmail
 *     and Photos, so it is not FlyConnect's usage.
 *   - **FlyConnect backups** is the sum of what this application wrote, from `BackupRun.sizeBytes`.
 *
 * Someone deciding "do I need to buy more storage" is answering the first question. Someone
 * auditing whether backups are filling the Drive is answering the second. Showing either alone
 * answers the wrong one.
 *
 * When Drive will not report, the panel says "unavailable". It never invents a figure - the previous
 * browser-side implementation returned a hardcoded 5TB for one address and a fabricated 15GB for
 * everyone else, and the UI rendered that as a working quota.
 */

interface DriveQuota {
  limitBytes: number;
  usageBytes: number;
  freeBytes: number;
  percentUsed: number;
  live: boolean;
}

interface FlyConnectUsage {
  totalBytes: number;
  archiveCount: number;
  liveArchiveCount: number;
  lastSuccessAt: string | null;
}

interface Destination {
  accountEmail: string;
  folderId: string | null;
  folderUrl: string | null;
  connectedAt: string;
  lastUsedAt: string | null;
  broken: boolean;
  errorMessage: string | null;
}

interface StorageResponse {
  drive: DriveQuota | null;
  flyconnect: FlyConnectUsage;
  destination: Destination | null;
}

export function BackupStoragePanel() {
  const [data, setData] = useState<StorageResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [connecting, setConnecting] = useState(false);
  const [disconnecting, setDisconnecting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const canManage = hasPermission("backup:configure");

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setData(await api<StorageResponse>("/backups/storage", { skipCache: true }));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not read storage usage");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!hasPermission("backup:view")) return;
    void load();
  }, [load]);

  // Handle both direct URL query params and popup completion messages.
  useEffect(() => {
    const applyOutcome = (connected?: string | null, driveError?: string | null, code?: string | null) => {
      setConnecting(false);
      if (connected) {
        setError(null);
        setNotice(`Google Drive connected as ${connected}. Archives will be written there.`);
        void load();
      } else if (driveError) {
        setError(driveError);
      } else if (code === "DENIED") {
        setError("Google access was declined. Nothing was changed.");
      }
    };

    const params = new URLSearchParams(window.location.search);
    const connected = params.get("driveConnected");
    const driveError = params.get("driveError");
    const code = params.get("code");

    if (connected || driveError || code === "DENIED") {
      applyOutcome(connected, driveError, code);
      window.history.replaceState({}, "", window.location.pathname);
    }

    const onStorage = (event: StorageEvent) => {
      if (event.key !== DRIVE_OAUTH_STORAGE_KEY || !event.newValue) return;
      try {
        const msg = JSON.parse(event.newValue) as DriveOAuthPopupMessage;
        if (msg?.type === "FC_DRIVE_OAUTH_RESULT") {
          applyOutcome(msg.connected, msg.driveError, msg.code);
        }
      } catch {
        // Ignore
      }
    };

    const onMessage = (event: MessageEvent) => {
      if (event.origin !== window.location.origin) return;
      const msg = event.data as DriveOAuthPopupMessage | undefined;
      if (msg?.type === "FC_DRIVE_OAUTH_RESULT") {
        applyOutcome(msg.connected, msg.driveError, msg.code);
      }
    };

    window.addEventListener("storage", onStorage);
    window.addEventListener("message", onMessage);

    let bc: BroadcastChannel | null = null;
    if ("BroadcastChannel" in window) {
      try {
        bc = new BroadcastChannel(DRIVE_OAUTH_CHANNEL);
        bc.onmessage = (event) => {
          const msg = event.data as DriveOAuthPopupMessage | undefined;
          if (msg?.type === "FC_DRIVE_OAUTH_RESULT") {
            applyOutcome(msg.connected, msg.driveError, msg.code);
          }
        };
      } catch {
        bc = null;
      }
    }

    return () => {
      window.removeEventListener("storage", onStorage);
      window.removeEventListener("message", onMessage);
      bc?.close();
    };
  }, [load]);

  async function connect() {
    setConnecting(true);
    setError(null);
    setNotice(null);
    try {
      const connected = await connectGoogleDriveViaPopup();
      setNotice(`Google Drive connected as ${connected.accountEmail}. Archives will be written there.`);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not start the connect flow");
    } finally {
      setConnecting(false);
    }
  }

  async function disconnect() {
    setDisconnecting(true);
    setError(null);
    try {
      await api("/backups/destination/google", { method: "DELETE" });
      setNotice("Drive disconnected. Archives already in Drive were not touched.");
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not disconnect");
    } finally {
      setDisconnecting(false);
    }
  }

  if (!hasPermission("backup:view")) return null;

  const drive = data?.drive;
  const fc = data?.flyconnect;
  const dest = data?.destination;

  // Warn before storage becomes the reason backups start failing. Google rejects new uploads when
  // an account is full, so a full Drive does not slow backups down - it breaks them.
  const nearlyFull = drive?.live === true && drive.percentUsed >= 90;
  const noSpace = drive?.live === true && drive.freeBytes <= 0;

  return (
    <section className="rounded-2xl border border-slate-200 bg-white">
      <header className="flex flex-wrap items-start justify-between gap-3 border-b border-slate-100 px-5 py-4">
        <div>
          <h3 className="text-sm font-extrabold text-slate-800">Google Drive storage</h3>
          <p className="mt-0.5 text-xs text-slate-500">
            Real figures read from Google. Drive storage is shared with Gmail and Photos, so it is not
            all FlyConnect&apos;s.
          </p>
        </div>
        <button
          type="button"
          onClick={() => void load()}
          disabled={loading}
          className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-bold text-slate-700 transition hover:bg-slate-50 disabled:opacity-50"
        >
          {loading ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : (
            <RefreshCw className="h-3.5 w-3.5" />
          )}
          Refresh
        </button>
      </header>

      <div className="space-y-4 px-5 py-4">
        {/* Storage */}
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="rounded-xl border border-slate-200 p-4">
            <p className="flex items-center gap-1.5 text-[10px] font-black uppercase tracking-wide text-slate-400">
              <Cloud className="h-3.5 w-3.5" /> Google Drive (whole account)
            </p>
            {drive?.live ? (
              <>
                <p className="mt-1.5 text-2xl font-extrabold text-slate-800">
                  {formatBytes(drive.usageBytes)}
                  <span className="text-sm font-semibold text-slate-400">
                    {" "}
                    / {formatBytes(drive.limitBytes)}
                  </span>
                </p>
                <Meter percent={drive.percentUsed} tone={driveTone(drive.percentUsed)} />
                <p className="mt-1.5 text-[11px] text-slate-500">
                  {formatBytes(drive.freeBytes)} free · includes Gmail and Photos
                </p>
              </>
            ) : (
              // Never a number we did not get from Google.
              <p className="mt-1.5 text-xs text-slate-500">
                Unavailable. Google did not report a quota for this account.
              </p>
            )}
          </div>

          <div className="rounded-xl border border-slate-200 p-4">
            <p className="flex items-center gap-1.5 text-[10px] font-black uppercase tracking-wide text-slate-400">
              <HardDrive className="h-3.5 w-3.5" /> FlyConnect archives
            </p>
            {fc ? (
              <>
                <p className="mt-1.5 text-2xl font-extrabold text-slate-800">
                  {formatBytes(fc.totalBytes)}
                </p>
                <p className="mt-1.5 text-[11px] text-slate-500">
                  {fc.archiveCount.toLocaleString()} archive
                  {fc.archiveCount === 1 ? "" : "s"} ·{" "}
                  {fc.liveArchiveCount.toLocaleString()} present in Drive
                </p>
                <p className="mt-0.5 text-[11px] text-slate-500">
                  Last successful backup:{" "}
                  {fc.lastSuccessAt ? formatWhen(fc.lastSuccessAt) : "never"}
                </p>
              </>
            ) : (
              <p className="mt-1.5 text-xs text-slate-500">Loading…</p>
            )}
          </div>
        </div>

        {/* A full Drive does not degrade, it breaks. Say so before it happens. */}
        {noSpace ? (
          <Banner tone="danger">
            This Drive is full. Google will refuse new uploads, so the next backup will fail. Buy more
            storage or remove old archives.
          </Banner>
        ) : nearlyFull ? (
          <Banner tone="warn">
            Drive is {drive?.percentUsed.toFixed(0)}% full. Uploads start failing when it reaches 100%.
          </Banner>
        ) : null}

        {/* Account */}
        {dest ? (
          <div className="rounded-xl border border-slate-200 p-4">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="text-[10px] font-black uppercase tracking-wide text-slate-400">
                  Connected Google account
                </p>
                <p className="mt-1 truncate text-sm font-bold text-slate-800">{dest.accountEmail}</p>
                <p className="mt-0.5 text-[11px] text-slate-500">
                  Connected {formatWhen(dest.connectedAt)}
                  {dest.lastUsedAt ? ` · last used ${formatWhen(dest.lastUsedAt)}` : ""}
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                {dest.folderUrl ? (
                  <a
                    href={dest.folderUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-bold text-slate-700 transition hover:bg-slate-50"
                  >
                    <FolderOpen className="h-3.5 w-3.5" /> Open folder
                    <ExternalLink className="h-3 w-3" />
                  </a>
                ) : null}
                {canManage ? (
                  <button
                    type="button"
                    onClick={() => void disconnect()}
                    disabled={disconnecting}
                    className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-bold text-slate-700 transition hover:bg-slate-50 disabled:opacity-50"
                  >
                    {disconnecting ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    ) : (
                      <Unlink className="h-3.5 w-3.5" />
                    )}
                    Disconnect
                  </button>
                ) : null}
              </div>
            </div>

            {dest.broken && dest.errorMessage ? (
              <div className="mt-3">
                <Banner tone="danger">{dest.errorMessage}</Banner>
              </div>
            ) : null}

            {dest.broken && canManage ? (
              <p className="mt-3 flex items-start gap-1.5 text-[11px] text-slate-600">
                <Link2Off className="mt-0.5 h-3 w-3 shrink-0" />
                Backups will fail until a Google account is connected again.
              </p>
            ) : null}
          </div>
        ) : (
          <div className="rounded-xl border border-dashed border-slate-300 p-4">
            <p className="text-sm font-bold text-slate-800">No Google account connected</p>
            <p className="mt-1 text-xs text-slate-500">
              Backups need a Drive destination. A Google service account cannot store anything in a
              personal Drive - it has no storage quota - so connect a normal Google account, whose own
              Drive quota is used.
            </p>
            {canManage ? (
              <button
                type="button"
                onClick={() => void connect()}
                disabled={connecting}
                className="mt-3 inline-flex items-center gap-2 rounded-lg bg-[#1688f9] px-4 py-2 text-xs font-bold text-white transition hover:bg-[#0f74d6] disabled:opacity-50"
              >
                {connecting ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <span className="flex h-4 w-4 items-center justify-center rounded-xs bg-white p-0.5">
                    <GoogleGLogo className="h-3 w-3" />
                  </span>
                )}
                Connect Google Drive (Popup)
              </button>
            ) : null}
          </div>
        )}

        {dest && canManage ? (
          <p className="text-[11px] text-slate-500">
            Need to use a different account?{" "}
            <button
              type="button"
              onClick={() => void connect()}
              disabled={connecting}
              className="font-semibold text-[#1688f9] underline disabled:opacity-50"
            >
              Connect another
            </button>
            . Archives already in Drive are never deleted by FlyConnect.
          </p>
        ) : null}

        {notice ? <Banner tone="info">{notice}</Banner> : null}
        {error ? (
          <Banner tone="danger">
            <span className="flex items-start gap-1.5">
              <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
              {error}
            </span>
          </Banner>
        ) : null}
      </div>
    </section>
  );
}

function Banner({ tone, children }: { tone: "danger" | "warn" | "info"; children: React.ReactNode }) {
  const styles = {
    danger: "border-rose-200 bg-rose-50 text-rose-900",
    warn: "border-amber-200 bg-amber-50 text-amber-900",
    info: "border-sky-200 bg-sky-50 text-sky-900",
  } as const;
  return (
    <div className={`rounded-lg border p-3 text-[11px] ${styles[tone]}`}>{children}</div>
  );
}

function driveTone(percent: number): "ok" | "warn" | "danger" {
  if (percent >= 90) return "danger";
  if (percent >= 75) return "warn";
  return "ok";
}

function Meter({ percent, tone }: { percent: number; tone: "ok" | "warn" | "danger" }) {
  const colors = { ok: "bg-emerald-500", warn: "bg-amber-500", danger: "bg-rose-500" } as const;
  return (
    <div className="mt-2 h-2 w-full overflow-hidden rounded-full bg-slate-100">
      <div
        className={`h-full rounded-full transition-all ${colors[tone]}`}
        style={{ width: `${Math.max(2, Math.min(100, percent))}%` }}
      />
    </div>
  );
}

function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return "0 B";
  const units = ["B", "KB", "MB", "GB", "TB"];
  const i = Math.min(units.length - 1, Math.floor(Math.log(bytes) / Math.log(1024)));
  return `${(bytes / 1024 ** i).toFixed(i === 0 ? 0 : 1)} ${units[i]}`;
}

function formatWhen(iso: string): string {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? "unknown" : d.toLocaleString();
}