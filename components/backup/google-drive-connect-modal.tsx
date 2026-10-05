"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { getApps, initializeApp } from "firebase/app";
import { getAuth, GoogleAuthProvider, signInWithPopup } from "firebase/auth";
import {
  AlertTriangle,
  CheckCircle2,
  Cloud,
  ExternalLink,
  FolderOpen,
  HardDrive,
  Loader2,
  Play,
  RefreshCw,
  ShieldCheck,
  Unlink,
  X,
} from "lucide-react";
import { api } from "@/lib/api";
import { firebaseConfig } from "@/lib/firebase";

export const DRIVE_OAUTH_POPUP_NAME = "flyconnect_google_drive_popup";
export const DRIVE_OAUTH_STORAGE_KEY = "fc_drive_oauth_result";
export const DRIVE_OAUTH_CHANNEL = "fc_drive_oauth";

export interface DriveOAuthPopupMessage {
  type: "FC_DRIVE_OAUTH_RESULT";
  connected?: string | null;
  driveError?: string | null;
  code?: string | null;
  ts: number;
}

export interface DriveQuota {
  limitBytes: number;
  usageBytes: number;
  freeBytes: number;
  percentUsed: number;
  live: boolean;
}

export interface FlyConnectUsage {
  totalBytes: number;
  archiveCount: number;
  liveArchiveCount: number;
  lastSuccessAt: string | null;
}

export interface Destination {
  accountEmail: string;
  folderId: string | null;
  folderUrl: string | null;
  connectedAt: string;
  lastUsedAt: string | null;
  broken: boolean;
  errorMessage: string | null;
}

export interface StorageResponse {
  drive: DriveQuota | null;
  flyconnect: FlyConnectUsage;
  destination: Destination | null;
}

interface VerifyResponse {
  ok: boolean;
  accountEmail?: string;
  folderId?: string;
  folderUrl?: string | null;
  quota?: DriveQuota | null;
  error?: string;
}

export function broadcastDriveOAuthResult(result: Omit<DriveOAuthPopupMessage, "type" | "ts">) {
  if (typeof window === "undefined") return;
  const payload: DriveOAuthPopupMessage = {
    type: "FC_DRIVE_OAUTH_RESULT",
    ...result,
    ts: Date.now(),
  };
  try {
    window.localStorage.setItem(DRIVE_OAUTH_STORAGE_KEY, JSON.stringify(payload));
  } catch {
    // Ignore storage quota / privacy errors
  }
  try {
    if ("BroadcastChannel" in window) {
      const bc = new BroadcastChannel(DRIVE_OAUTH_CHANNEL);
      bc.postMessage(payload);
      bc.close();
    }
  } catch {
    // Ignore BroadcastChannel errors
  }
  try {
    if (window.opener && !window.opener.closed) {
      window.opener.postMessage(payload, window.location.origin);
    }
  } catch {
    // Ignore cross-origin opener errors
  }
}

export function openGoogleDriveOAuthPopup(authorizationUrl: string): Window | null {
  if (typeof window === "undefined") return null;
  const width = 540;
  const height = 680;
  const left = Math.max(0, Math.round(window.screenX + (window.outerWidth - width) / 2));
  const top = Math.max(0, Math.round(window.screenY + (window.outerHeight - height) / 2));
  const features = [
    `width=${width}`,
    `height=${height}`,
    `left=${left}`,
    `top=${top}`,
    "resizable=yes",
    "scrollbars=yes",
    "status=yes",
  ].join(",");

  const popup = window.open(authorizationUrl, DRIVE_OAUTH_POPUP_NAME, features);
  if (popup) {
    try {
      popup.focus();
    } catch {
      // Ignore focus errors
    }
  }
  return popup;
}

/**
 * Opens the Google OAuth consent screen in a centered popup window using the project's
 * pre-authorized OAuth handler (`https://traveltourism-32d7d.firebaseapp.com/__/auth/handler`),
 * captures the one-time authorization `code` before Identity Toolkit consumes it, and exchanges
 * it on the FlyConnect backend (`POST /api/backups/destination/google/exchange`) so the refresh
 * token is encrypted at rest on the server and never exposed to browser JS.
 */
export async function connectGoogleDriveViaPopup(): Promise<{
  accountEmail: string;
  folderId: string;
}> {
  if (typeof window === "undefined") {
    throw new Error("Popup sign-in can only run in the browser.");
  }

  const appName = "fc-drive-oauth-helper";
  const driveApp =
    getApps().find((a) => a.name === appName) ?? initializeApp(firebaseConfig, appName);
  const driveAuth = getAuth(driveApp);

  const provider = new GoogleAuthProvider();
  provider.addScope("https://www.googleapis.com/auth/drive.file");
  provider.addScope("https://www.googleapis.com/auth/drive.appdata");
  provider.addScope("https://www.googleapis.com/auth/userinfo.email");
  provider.setCustomParameters({
    access_type: "offline",
    prompt: "consent",
    include_granted_scopes: "true",
  });

  let capturedCode: string | null = null;
  let capturedRedirectUri: string | null = null;
  let oauthError: string | null = null;

  const originalFetch = window.fetch.bind(window);
  window.fetch = async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    const urlStr =
      typeof input === "string"
        ? input
        : input instanceof URL
          ? input.toString()
          : input.url;

    if (urlStr.includes("accounts:signInWithIdp") && init?.body) {
      try {
        const parsed = JSON.parse(String(init.body)) as { requestUri?: string };
        if (parsed.requestUri) {
          const cbUrl = new URL(parsed.requestUri);
          const code = cbUrl.searchParams.get("code");
          const err = cbUrl.searchParams.get("error");
          if (err) {
            oauthError = err;
          }
          if (code) {
            capturedCode = code;
            capturedRedirectUri = `${cbUrl.origin}${cbUrl.pathname}`;
          }
        }
      } catch {
        // Ignore parse error
      }
      throw new Error("FC_DRIVE_CODE_CAPTURED");
    }

    return originalFetch(input, init);
  };

  try {
    await signInWithPopup(driveAuth, provider);
  } catch (err) {
    if (!capturedCode) {
      if (oauthError === "access_denied") {
        throw new Error("Google sign-in was cancelled or declined.");
      }
      const msg = err instanceof Error ? err.message : String(err);
      if (
        msg.includes("auth/popup-closed-by-user") ||
        msg.includes("auth/cancelled-popup-request")
      ) {
        throw new Error("Google Sign-In popup was closed before completing authorization.");
      }
      throw err instanceof Error ? err : new Error("Google Sign-In failed.");
    }
  } finally {
    window.fetch = originalFetch;
  }

  if (!capturedCode) {
    throw new Error("Google did not return an authorization code. Please try again.");
  }

  const connected = await api<{ accountEmail: string; folderId: string }>(
    "/backups/destination/google/exchange",
    {
      method: "POST",
      body: {
        code: capturedCode,
        redirectUri:
          capturedRedirectUri || `https://${firebaseConfig.authDomain}/__/auth/handler`,
      },
    },
  );

  broadcastDriveOAuthResult({ connected: connected.accountEmail });
  return connected;
}

export function GoogleGLogo({ className = "h-4 w-4" }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" aria-hidden="true">
      <path
        fill="#4285F4"
        d="M23.49 12.27c0-.79-.07-1.54-.19-2.27H12v4.51h6.47c-.29 1.48-1.14 2.73-2.4 3.58v3h3.86c2.26-2.09 3.56-5.17 3.56-8.82Z"
      />
      <path
        fill="#34A853"
        d="M12 24c3.24 0 5.95-1.08 7.93-2.91l-3.86-3c-1.08.72-2.45 1.16-4.07 1.16-3.13 0-5.78-2.11-6.73-4.96H1.29v3.09C3.26 21.3 7.31 24 12 24Z"
      />
      <path
        fill="#FBBC05"
        d="M5.27 14.29c-.25-.72-.38-1.49-.38-2.29s.13-1.57.38-2.29V6.62H1.29C.47 8.24 0 10.06 0 12s.47 3.76 1.29 5.38l3.98-3.09Z"
      />
      <path
        fill="#EA4335"
        d="M12 4.75c1.77 0 3.35.61 4.6 1.8l3.42-3.42C17.95 1.19 15.24 0 12 0 7.31 0 3.26 2.7 1.29 6.62l3.98 3.09c.95-2.85 3.6-4.96 6.73-4.96Z"
      />
    </svg>
  );
}

interface GoogleDriveConnectModalProps {
  open: boolean;
  onClose: () => void;
  onStatusChange?: (data: StorageResponse | null) => void;
}

export function GoogleDriveConnectModal({
  open,
  onClose,
  onStatusChange,
}: GoogleDriveConnectModalProps) {
  const [data, setData] = useState<StorageResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [connecting, setConnecting] = useState(false);
  const [waitingForPopup, setWaitingForPopup] = useState(false);
  const [disconnecting, setDisconnecting] = useState(false);
  const [verifying, setVerifying] = useState(false);
  const [runningBackup, setRunningBackup] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const popupRef = useRef<Window | null>(null);

  const load = useCallback(
    async (silent = false) => {
      if (!silent) {
        setLoading(true);
      }
      try {
        const res = await api<StorageResponse>("/backups/storage", { skipCache: true });
        setData(res);
        onStatusChange?.(res);
        return res;
      } catch (err) {
        if (!silent) {
          setError(err instanceof Error ? err.message : "Could not read Google Drive status");
        }
        return null;
      } finally {
        if (!silent) {
          setLoading(false);
        }
      }
    },
    [onStatusChange],
  );

  useEffect(() => {
    if (!open) return;
    void load();
  }, [open, load]);

  const handleOAuthOutcome = useCallback(
    (msg: DriveOAuthPopupMessage) => {
      setWaitingForPopup(false);
      setConnecting(false);
      if (popupRef.current && !popupRef.current.closed) {
        try {
          popupRef.current.close();
        } catch {
          // Ignore
        }
      }
      popupRef.current = null;

      if (msg.connected) {
        setError(null);
        setNotice(`Google account connected as ${msg.connected}. Backups will upload to its Drive.`);
        void load();
      } else if (msg.driveError) {
        setError(msg.driveError);
      } else if (msg.code === "DENIED") {
        setError("Google sign-in was cancelled or declined.");
      }
    },
    [load],
  );

  // Listen for popup completion via postMessage, BroadcastChannel, and localStorage
  useEffect(() => {
    if (!open) return;

    const onWindowMessage = (event: MessageEvent) => {
      if (event.origin !== window.location.origin) return;
      const payload = event.data as DriveOAuthPopupMessage | undefined;
      if (payload?.type === "FC_DRIVE_OAUTH_RESULT") {
        handleOAuthOutcome(payload);
      }
    };

    const onStorage = (event: StorageEvent) => {
      if (event.key !== DRIVE_OAUTH_STORAGE_KEY || !event.newValue) return;
      try {
        const payload = JSON.parse(event.newValue) as DriveOAuthPopupMessage;
        if (payload?.type === "FC_DRIVE_OAUTH_RESULT") {
          handleOAuthOutcome(payload);
        }
      } catch {
        // Ignore malformed JSON
      }
    };

    window.addEventListener("message", onWindowMessage);
    window.addEventListener("storage", onStorage);

    let bc: BroadcastChannel | null = null;
    if (typeof window !== "undefined" && "BroadcastChannel" in window) {
      try {
        bc = new BroadcastChannel(DRIVE_OAUTH_CHANNEL);
        bc.onmessage = (event) => {
          const payload = event.data as DriveOAuthPopupMessage | undefined;
          if (payload?.type === "FC_DRIVE_OAUTH_RESULT") {
            handleOAuthOutcome(payload);
          }
        };
      } catch {
        bc = null;
      }
    }

    return () => {
      window.removeEventListener("message", onWindowMessage);
      window.removeEventListener("storage", onStorage);
      bc?.close();
    };
  }, [open, handleOAuthOutcome]);

  async function startPopupSignIn() {
    setConnecting(true);
    setWaitingForPopup(true);
    setError(null);
    setNotice(null);

    try {
      const connected = await connectGoogleDriveViaPopup();
      setNotice(
        `Google account connected as ${connected.accountEmail}. "FlyConnect Backups" folder is ready in Drive.`,
      );
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not complete Google Sign-In");
    } finally {
      setConnecting(false);
      setWaitingForPopup(false);
    }
  }

  async function disconnectAccount() {
    setDisconnecting(true);
    setError(null);
    setNotice(null);
    try {
      await api("/backups/destination/google", { method: "DELETE" });
      setNotice("Google account disconnected. Existing backup archives in Google Drive were kept intact.");
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not disconnect Google account");
    } finally {
      setDisconnecting(false);
    }
  }

  async function verifyConnection() {
    setVerifying(true);
    setError(null);
    setNotice(null);
    try {
      const res = await api<VerifyResponse>("/backups/destination/verify", { method: "POST" });
      if (res.ok) {
        setNotice(
          `Verified with Google Drive (${res.accountEmail || "connected account"}). Folder & upload token are healthy.`,
        );
      } else {
        setError(res.error || "Google Drive verification failed.");
      }
      await load(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not verify Google Drive connection");
    } finally {
      setVerifying(false);
    }
  }

  async function runBackupNow() {
    setRunningBackup(true);
    setError(null);
    setNotice(null);
    try {
      await api("/backups/run", { method: "POST", body: {} });
      setNotice("Backup completed and uploaded to Google Drive!");
      await load(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Backup run failed");
    } finally {
      setRunningBackup(false);
    }
  }

  if (!open) return null;

  const drive = data?.drive;
  const fc = data?.flyconnect;
  const dest = data?.destination;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-4 backdrop-blur-sm">
      <div className="relative w-full max-w-2xl overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl">
        {/* Modal Header */}
        <div className="flex items-center justify-between border-b border-slate-100 bg-gradient-to-r from-slate-50 via-white to-blue-50/50 px-6 py-4">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl border border-slate-200 bg-white shadow-sm">
              <GoogleGLogo className="h-5 w-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-base font-extrabold text-slate-900">
                  Google Account Backup Connect
                </h2>
                <span className="rounded-full border border-blue-200 bg-blue-50 px-2 py-0.5 text-[10px] font-black uppercase text-blue-700">
                  SUPER_ADMIN
                </span>
              </div>
              <p className="text-xs text-slate-500">
                Sign in via popup to connect your Google Drive for automated FlyConnect backups
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => void load()}
              disabled={loading}
              className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-semibold text-slate-600 transition hover:bg-slate-50 disabled:opacity-50"
              title="Refresh status"
            >
              {loading ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <RefreshCw className="h-3.5 w-3.5" />
              )}
              Refresh
            </button>
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg p-1.5 text-slate-400 transition hover:bg-slate-100 hover:text-slate-700"
              aria-label="Close modal"
            >
              <X className="h-5 w-5" />
            </button>
          </div>
        </div>

        {/* Modal Body */}
        <div className="max-h-[80vh] space-y-4 overflow-y-auto px-6 py-5">
          {/* Primary Google Sign-In / Connected Account Card */}
          {dest && !dest.broken ? (
            <div className="rounded-2xl border border-emerald-200 bg-emerald-50/40 p-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="flex items-start gap-3">
                  <div className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-emerald-600 text-white shadow-sm">
                    <CheckCircle2 className="h-5 w-5" />
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="text-[10px] font-black uppercase tracking-wider text-emerald-700">
                        Connected Google Account
                      </span>
                      <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-bold text-emerald-800">
                        <ShieldCheck className="h-3 w-3" /> Active
                      </span>
                    </div>
                    <p className="mt-0.5 text-sm font-extrabold text-slate-900">
                      {dest.accountEmail}
                    </p>
                    <p className="mt-0.5 text-[11px] text-slate-500">
                      Connected {formatWhen(dest.connectedAt)}
                      {dest.lastUsedAt ? ` · Last upload ${formatWhen(dest.lastUsedAt)}` : ""}
                    </p>
                  </div>
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  {dest.folderUrl ? (
                    <a
                      href={dest.folderUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-bold text-slate-700 shadow-xs transition hover:bg-slate-50"
                    >
                      <FolderOpen className="h-3.5 w-3.5 text-blue-600" />
                      Open Drive Folder
                      <ExternalLink className="h-3 w-3 text-slate-400" />
                    </a>
                  ) : null}

                  <button
                    type="button"
                    onClick={() => void verifyConnection()}
                    disabled={verifying}
                    className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-bold text-slate-700 transition hover:bg-slate-50 disabled:opacity-50"
                  >
                    {verifying ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    ) : (
                      <ShieldCheck className="h-3.5 w-3.5 text-emerald-600" />
                    )}
                    Verify Live
                  </button>

                  <button
                    type="button"
                    onClick={() => void runBackupNow()}
                    disabled={runningBackup}
                    className="inline-flex items-center gap-1.5 rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-bold text-white shadow-xs transition hover:bg-blue-700 disabled:opacity-50"
                  >
                    {runningBackup ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    ) : (
                      <Play className="h-3.5 w-3.5" />
                    )}
                    Run Backup Now
                  </button>
                </div>
              </div>

              <div className="mt-3 flex flex-wrap items-center justify-between gap-2 border-t border-emerald-200/60 pt-3 text-[11px] text-slate-600">
                <span>Want to switch to another Google Drive account?</span>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => void startPopupSignIn()}
                    disabled={connecting}
                    className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-2.5 py-1 text-xs font-bold text-slate-700 transition hover:bg-slate-50 disabled:opacity-50"
                  >
                    <GoogleGLogo className="h-3.5 w-3.5" />
                    Switch Google Account
                  </button>
                  <button
                    type="button"
                    onClick={() => void disconnectAccount()}
                    disabled={disconnecting}
                    className="inline-flex items-center gap-1 rounded-lg border border-rose-200 bg-rose-50 px-2.5 py-1 text-xs font-bold text-rose-700 transition hover:bg-rose-100 disabled:opacity-50"
                  >
                    {disconnecting ? (
                      <Loader2 className="h-3 w-3 animate-spin" />
                    ) : (
                      <Unlink className="h-3 w-3" />
                    )}
                    Disconnect
                  </button>
                </div>
              </div>
            </div>
          ) : (
            <div className="rounded-2xl border-2 border-dashed border-blue-200 bg-gradient-to-br from-blue-50/50 via-white to-indigo-50/30 p-5">
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                <div className="space-y-1">
                  <div className="inline-flex items-center gap-1.5 rounded-full bg-amber-100 px-2.5 py-0.5 text-[10px] font-extrabold uppercase text-amber-800">
                    {dest?.broken ? "Re-Authentication Needed" : "Not Connected"}
                  </div>
                  <h3 className="text-sm font-extrabold text-slate-900">
                    {dest?.broken
                      ? `Reconnect ${dest.accountEmail}`
                      : "Sign in with Google to enable Drive Backups"}
                  </h3>
                  <p className="text-xs text-slate-600 leading-relaxed">
                    Opens a secure Google Sign-In popup window. Once authorized, FlyConnect automatically
                    creates a <span className="font-semibold text-slate-800">FlyConnect Backups</span> folder in
                    your Google Drive and stores encrypted refresh credentials in the database vault.
                  </p>
                </div>

                <div className="shrink-0">
                  <button
                    type="button"
                    onClick={() => void startPopupSignIn()}
                    disabled={connecting}
                    className="inline-flex w-full sm:w-auto items-center justify-center gap-2.5 rounded-xl border border-slate-300 bg-white px-5 py-3 text-sm font-extrabold text-slate-800 shadow-md transition hover:border-blue-400 hover:bg-blue-50/30 hover:shadow-lg disabled:opacity-60"
                  >
                    {connecting ? (
                      <Loader2 className="h-4 w-4 animate-spin text-blue-600" />
                    ) : (
                      <GoogleGLogo className="h-5 w-5" />
                    )}
                    <span>{connecting ? "Signing in via Popup…" : "Sign in with Google"}</span>
                  </button>
                </div>
              </div>

              {dest?.broken && dest.errorMessage ? (
                <div className="mt-3 rounded-xl border border-rose-200 bg-rose-50 p-3 text-xs text-rose-800">
                  <strong>Last Drive Error:</strong> {dest.errorMessage}
                </div>
              ) : null}

              {waitingForPopup ? (
                <div className="mt-4 flex flex-wrap items-center justify-between gap-2 rounded-xl border border-blue-200 bg-blue-50/80 px-3.5 py-2.5 text-xs text-blue-900">
                  <span className="flex items-center gap-2 font-semibold">
                    <Loader2 className="h-4 w-4 animate-spin text-blue-600" />
                    Complete Google Sign-In in the popup window…
                  </span>
                </div>
              ) : null}
            </div>
          )}

          {/* Storage & Archive Metrics */}
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="rounded-xl border border-slate-200 bg-slate-50/50 p-4">
              <p className="flex items-center gap-1.5 text-[10px] font-black uppercase tracking-wide text-slate-400">
                <Cloud className="h-3.5 w-3.5 text-blue-500" /> Google Drive Quota (Whole Account)
              </p>
              {drive?.live ? (
                <>
                  <p className="mt-1.5 text-xl font-extrabold text-slate-800">
                    {formatBytes(drive.usageBytes)}
                    <span className="text-xs font-semibold text-slate-400">
                      {" "}
                      / {formatBytes(drive.limitBytes)}
                    </span>
                  </p>
                  <div className="mt-2 h-2 w-full overflow-hidden rounded-full bg-slate-200">
                    <div
                      className={`h-full rounded-full transition-all ${
                        drive.percentUsed >= 90
                          ? "bg-rose-500"
                          : drive.percentUsed >= 75
                            ? "bg-amber-500"
                            : "bg-emerald-500"
                      }`}
                      style={{ width: `${Math.max(2, Math.min(100, drive.percentUsed))}%` }}
                    />
                  </div>
                  <p className="mt-1.5 text-[11px] text-slate-500">
                    {formatBytes(drive.freeBytes)} free ({drive.percentUsed.toFixed(1)}% used)
                  </p>
                </>
              ) : (
                <p className="mt-2 text-xs text-slate-500">
                  {dest
                    ? "Quota unavailable until Google responds."
                    : "Connect a Google account above to view live Drive storage quota."}
                </p>
              )}
            </div>

            <div className="rounded-xl border border-slate-200 bg-slate-50/50 p-4">
              <p className="flex items-center gap-1.5 text-[10px] font-black uppercase tracking-wide text-slate-400">
                <HardDrive className="h-3.5 w-3.5 text-indigo-500" /> FlyConnect Backup Archives
              </p>
              {fc ? (
                <>
                  <p className="mt-1.5 text-xl font-extrabold text-slate-800">
                    {formatBytes(fc.totalBytes)}
                  </p>
                  <p className="mt-1.5 text-[11px] text-slate-600">
                    <strong>{fc.archiveCount.toLocaleString()}</strong> total archive
                    {fc.archiveCount === 1 ? "" : "s"} ·{" "}
                    <strong>{fc.liveArchiveCount.toLocaleString()}</strong> verified in Drive
                  </p>
                  <p className="mt-0.5 text-[11px] text-slate-500">
                    Last backup: {fc.lastSuccessAt ? formatWhen(fc.lastSuccessAt) : "Never run"}
                  </p>
                </>
              ) : (
                <p className="mt-2 text-xs text-slate-500">Loading archive statistics…</p>
              )}
            </div>
          </div>

          {/* Notices & Errors */}
          {notice ? (
            <div className="flex items-start gap-2 rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-xs font-medium text-emerald-900">
              <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" />
              <span>{notice}</span>
            </div>
          ) : null}

          {error ? (
            <div className="space-y-2 rounded-xl border border-rose-200 bg-rose-50 p-3.5 text-xs text-rose-900">
              <div className="flex items-start gap-2 font-semibold">
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-rose-600" />
                <span>{error}</span>
              </div>
            </div>
          ) : null}
        </div>

        {/* Modal Footer */}
        <div className="flex items-center justify-between border-t border-slate-100 bg-slate-50 px-6 py-3">
          <span className="text-[11px] text-slate-500">
            Scope: <code className="font-mono text-[10px]">drive.file</code> +{" "}
            <code className="font-mono text-[10px]">drive.appdata</code> · AES-256-GCM encrypted vault
          </span>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg border border-slate-300 bg-white px-4 py-1.5 text-xs font-bold text-slate-700 transition hover:bg-slate-100"
          >
            Done
          </button>
        </div>
      </div>
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
