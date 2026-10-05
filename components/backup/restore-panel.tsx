"use client";

import { useCallback, useRef, useState } from "react";
import { AlertTriangle, FileUp, Loader2, RotateCcw, ShieldAlert } from "lucide-react";
import { api } from "@/lib/api";
import { hasPermission } from "@/lib/permissions";
import { ALL_RESTORE_SCOPES, type RestorePlan, type RestoreScope } from "./restore-types";

/**
 * Restore an archive.
 *
 * THIS WIDGET IS DELIBERATELY AWKWARD TO USE.
 *
 * A restore permanently replaces a tenant's live data. The friction is the feature:
 *
 *   1. Pick an archive file.
 *   2. Read the plan the server computes — exactly what will be deleted, what will be written,
 *      and anything that blocks it. Nothing has happened yet.
 *   3. Choose which parts to restore. Dependencies are pulled in automatically by the server.
 *   4. Type RESTORE to confirm. The server independently refuses without that phrase.
 *
 * The server also takes a safety archive of the current state immediately before restoring, and
 * aborts if that fails. A restore with no way back is not an allowed state.
 */

const SCOPE_LABELS: Array<{ scope: RestoreScope; label: string; hint: string }> = [
  { scope: "customers", label: "Customers", hint: "People and their contact records" },
  { scope: "bookings", label: "Bookings", hint: "Bookings and their invoice line items" },
  { scope: "expenses", label: "Expenses", hint: "Recorded expenses" },
  { scope: "income", label: "Income", hint: "Recorded income" },
  { scope: "templates", label: "Message templates", hint: "WhatsApp templates" },
  { scope: "automation", label: "Automation rules", hint: "Journey reminder rules" },
  { scope: "messages", label: "Message history", hint: "Scheduled and sent messages" },
  { scope: "documents", label: "Invoice documents", hint: "Checksums and frozen payloads" },
  { scope: "audit", label: "Audit trail", hint: "Compliance log entries" },
];

export function RestorePanel() {
  const [file, setFile] = useState<File | null>(null);
  const [scopes, setScopes] = useState<RestoreScope[]>([...ALL_RESTORE_SCOPES]);
  const [plan, setPlan] = useState<RestorePlan | null>(null);
  const [phase, setPhase] = useState<"idle" | "previewing" | "restoring" | "done">("idle");
  const [phrase, setPhrase] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<{
    deleted: Record<string, number>;
    inserted: Record<string, number>;
    usersNeedingPasswordReset: Array<{ id: string; email: string }>;
    durationMs: number;
    safetyBackupRunId: string | null;
  } | null>(null);

  const inputRef = useRef<HTMLInputElement>(null);
  const canRestore = hasPermission("backup:restore");

  const reset = useCallback(() => {
    setFile(null);
    setPlan(null);
    setResult(null);
    setPhrase("");
    setError(null);
    setPhase("idle");
    if (inputRef.current) inputRef.current.value = "";
  }, []);

  function toggleScope(scope: RestoreScope) {
    setScopes((prev) =>
      prev.includes(scope) ? prev.filter((s) => s !== scope) : [...prev, scope],
    );
    // Any change to the selection invalidates the plan; showing a stale one would be dangerous.
    setPlan(null);
    setPhase("idle");
    setPhrase("");
  }

  async function preview() {
    if (!file) return;
    setPhase("previewing");
    setError(null);
    setResult(null);
    try {
      const form = new FormData();
      form.append("file", file);
      form.append("scopes", scopes.join(","));
      const data = await api<RestorePlan>("/backups/restore/preview", { method: "POST", body: form });
      setPlan(data);
      setPhase("idle");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not read that archive");
      setPhase("idle");
    }
  }

  async function execute() {
    if (!file || !plan) return;
    setPhase("restoring");
    setError(null);
    try {
      const form = new FormData();
      form.append("file", file);
      form.append("scopes", scopes.join(","));
      form.append("confirmation", phrase);
      // The server takes its own safety archive. There is deliberately no "skip" switch here:
      // an operator who wants to skip it can call the API directly, which is a decision worth
      // having a log line for rather than a checkbox in a panel.
      const data = await api<{
        deleted: Record<string, number>;
        inserted: Record<string, number>;
        usersNeedingPasswordReset: Array<{ id: string; email: string }>;
        durationMs: number;
        safetyBackupRunId: string | null;
      }>("/backups/restore/execute", { method: "POST", body: form });

      setResult(data);
      setPhase("done");
      setPlan(null);
      setPhrase("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Restore failed");
      setPhase("idle");
    }
  }

  if (!canRestore) return null;

  const blocked = plan?.blockers.length ? plan.blockers : [];
  const canExecute = Boolean(plan) && blocked.length === 0 && phrase.trim().toUpperCase() === "RESTORE";

  return (
    <section className="rounded-2xl border border-rose-200 bg-white">
      <header className="flex items-start gap-3 border-b border-rose-100 px-5 py-4">
        <span className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-rose-50">
          <RotateCcw className="h-4.5 w-4.5 text-rose-600" />
        </span>
        <div>
          <h3 className="text-sm font-extrabold text-slate-800">Restore from an archive</h3>
          <p className="mt-0.5 text-xs text-slate-500">
            Replaces live data for one tenant with the contents of a backup file. A safety archive of
            the current state is taken first.
          </p>
        </div>
      </header>

      <div className="space-y-5 px-5 py-4">
        {/* 1. File */}
        <div>
          <label htmlFor="restore-file" className="mb-1.5 block text-xs font-bold text-slate-700">
            Backup archive (.json)
          </label>
          <input
            id="restore-file"
            ref={inputRef}
            type="file"
            accept="application/json,.json"
            onChange={(e) => {
              setFile(e.target.files?.[0] ?? null);
              setPlan(null);
              setResult(null);
              setPhase("idle");
              setError(null);
            }}
            className="block w-full text-xs text-slate-600 file:mr-3 file:rounded-lg file:border-0 file:bg-slate-100 file:px-3 file:py-2 file:text-xs file:font-semibold file:text-slate-700 hover:file:bg-slate-200"
          />
        </div>

        {/* 2. Scopes */}
        <fieldset>
          <legend className="mb-1.5 text-xs font-bold text-slate-700">What to restore</legend>
          <p className="mb-2 text-[11px] text-slate-500">
            Anything left out is left untouched. The server adds whatever the selection depends on,
            so you cannot end up with bookings whose customers are missing.
          </p>
          <div className="grid gap-1.5 sm:grid-cols-2">
            {SCOPE_LABELS.map(({ scope, label, hint }) => (
              <label
                key={scope}
                className="flex cursor-pointer items-start gap-2 rounded-lg border border-slate-200 px-3 py-2 transition hover:bg-slate-50"
              >
                <input
                  type="checkbox"
                  checked={scopes.includes(scope)}
                  onChange={() => toggleScope(scope)}
                  className="mt-0.5 h-3.5 w-3.5 rounded border-slate-300"
                />
                <span>
                  <span className="block text-xs font-semibold text-slate-700">{label}</span>
                  <span className="block text-[10px] text-slate-400">{hint}</span>
                </span>
              </label>
            ))}
          </div>
        </fieldset>

        <button
          type="button"
          onClick={preview}
          disabled={!file || phase === "previewing"}
          className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 px-4 py-2 text-xs font-bold text-slate-700 transition hover:bg-slate-50 disabled:opacity-50"
        >
          {phase === "previewing" ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : (
            <FileUp className="h-3.5 w-3.5" />
          )}
          Check what this would do
        </button>

        {/* 3. Plan */}
        {plan ? (
          <div className="space-y-3 rounded-xl border border-slate-200 bg-slate-50 p-4">
            <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px] text-slate-500">
              <span>
                Tenant: <strong className="text-slate-800">{plan.tenantName ?? plan.tenantId}</strong>
              </span>
              <span>
                Taken: <strong className="text-slate-800">{formatWhen(plan.archiveExportedAt)}</strong>
              </span>
              <span>
                Format: <strong className="text-slate-800">v{plan.archiveVersion}</strong>
              </span>
            </div>

            {blocked.length > 0 ? (
              <div className="rounded-lg border border-rose-200 bg-rose-50 p-3">
                <p className="flex items-center gap-1.5 text-xs font-bold text-rose-900">
                  <ShieldAlert className="h-3.5 w-3.5" /> This cannot be restored safely
                </p>
                <ul className="mt-1.5 list-disc space-y-1 pl-4 text-[11px] text-rose-800">
                  {blocked.map((b) => (
                    <li key={b}>{b}</li>
                  ))}
                </ul>
              </div>
            ) : null}

            {plan.warnings.length > 0 ? (
              <div className="rounded-lg border border-amber-200 bg-amber-50 p-3">
                <p className="flex items-center gap-1.5 text-xs font-bold text-amber-900">
                  <AlertTriangle className="h-3.5 w-3.5" /> Before you continue
                </p>
                <ul className="mt-1.5 list-disc space-y-1 pl-4 text-[11px] text-amber-800">
                  {plan.warnings.map((w) => (
                    <li key={w}>{w}</li>
                  ))}
                </ul>
              </div>
            ) : null}

            <div className="grid gap-3 sm:grid-cols-2">
              <CountTable title="Will be deleted" counts={plan.willDelete} tone="danger" />
              <CountTable title="Will be written" counts={plan.willInsert} tone="good" />
            </div>

            {!blocked.length ? (
              <div className="flex flex-wrap items-end gap-3 border-t border-slate-200 pt-3">
                <div>
                  <label htmlFor="restore-confirm" className="mb-1 block text-xs font-bold text-slate-700">
                    Type <code className="rounded bg-slate-200 px-1">RESTORE</code> to confirm
                  </label>
                  <input
                    id="restore-confirm"
                    value={phrase}
                    onChange={(e) => setPhrase(e.target.value)}
                    autoComplete="off"
                    spellCheck={false}
                    placeholder="RESTORE"
                    className="w-40 rounded-lg border border-slate-300 px-3 py-2 text-xs font-bold uppercase tracking-wide outline-none focus:border-rose-400 focus:ring-2 focus:ring-rose-100"
                  />
                </div>
                <button
                  type="button"
                  onClick={execute}
                  disabled={!canExecute || phase === "restoring"}
                  className="inline-flex items-center gap-1.5 rounded-lg bg-rose-600 px-4 py-2 text-xs font-bold text-white transition hover:bg-rose-700 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {phase === "restoring" ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <RotateCcw className="h-3.5 w-3.5" />
                  )}
                  {phase === "restoring" ? "Restoring…" : "Restore now"}
                </button>
                <p className="text-[11px] text-slate-500">
                  {phase === "restoring"
                    ? "A safety archive is being taken first. Do not close this page."
                    : "This permanently replaces the data listed above."}
                </p>
              </div>
            ) : null}
          </div>
        ) : null}

        {/* 4. Result */}
        {result ? (
          <div className="space-y-3 rounded-xl border border-emerald-200 bg-emerald-50 p-4">
            <p className="text-xs font-bold text-emerald-900">
              Restore completed in {(result.durationMs / 1000).toFixed(1)}s.
            </p>
            {result.safetyBackupRunId ? (
              <p className="text-[11px] text-emerald-800">
                The state this restore replaced is archived as run{" "}
                <code className="rounded bg-emerald-100 px-1 font-mono">{result.safetyBackupRunId}</code>
                , so this can be undone by restoring that file.
              </p>
            ) : null}

            <div className="grid gap-3 sm:grid-cols-2">
              <CountTable title="Deleted" counts={result.deleted} tone="danger" />
              <CountTable title="Written" counts={result.inserted} tone="good" />
            </div>

            {result.usersNeedingPasswordReset.length > 0 ? (
              <div className="rounded-lg border border-amber-300 bg-amber-50 p-3">
                <p className="text-xs font-bold text-amber-900">
                  {result.usersNeedingPasswordReset.length} account(s) need a password reset
                </p>
                <p className="mt-1 text-[11px] text-amber-800">
                  These were recreated from the archive with a password nobody knows, and are
                  inactive until an administrator resets them.
                </p>
                <ul className="mt-1.5 list-disc space-y-0.5 pl-4 text-[11px] text-amber-800">
                  {result.usersNeedingPasswordReset.map((u) => (
                    <li key={u.id}>{u.email}</li>
                  ))}
                </ul>
              </div>
            ) : null}

            <button
              type="button"
              onClick={reset}
              className="rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-semibold text-slate-700 transition hover:bg-white"
            >
              Done
            </button>
          </div>
        ) : null}

        {error ? (
          <div className="flex items-start gap-2 rounded-xl border border-rose-200 bg-rose-50 p-3 text-xs text-rose-900">
            <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
            <span>{error}</span>
          </div>
        ) : null}
      </div>
    </section>
  );
}

function CountTable({
  title,
  counts,
  tone,
}: {
  title: string;
  counts: Record<string, number>;
  tone: "danger" | "good";
}) {
  const entries = Object.entries(counts).filter(([, n]) => n > 0);
  const total = entries.reduce((a, [, n]) => a + n, 0);

  return (
    <div className="rounded-lg border border-slate-200 bg-white p-3">
      <p className="mb-1.5 text-[10px] font-black uppercase tracking-wide text-slate-400">
        {title} · {total.toLocaleString()}
      </p>
      {entries.length === 0 ? (
        <p className="text-[11px] text-slate-400">Nothing</p>
      ) : (
        <ul className="space-y-0.5">
          {entries.map(([key, n]) => (
            <li key={key} className="flex justify-between text-[11px]">
              <span className="text-slate-600">{key}</span>
              <span className={tone === "danger" ? "font-bold text-rose-600" : "font-bold text-emerald-600"}>
                {n.toLocaleString()}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function formatWhen(iso: string | null): string {
  if (!iso) return "unknown";
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? "unknown" : d.toLocaleString();
}