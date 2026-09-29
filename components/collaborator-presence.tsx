"use client";

import { useState, useRef, useEffect } from "react";
import { usePathname } from "next/navigation";
import {
  useCollaboratorPresence,
  useLiveSync,
  LiveSyncEvent,
  CollaboratorUser,
  broadcastLiveSync,
} from "@/lib/sync";
import { invalidateCache } from "@/lib/api";
import { Users, Wifi, RefreshCw, Zap, CheckCircle2, ChevronDown, Clock, ShieldCheck } from "lucide-react";

function getInitials(name: string): string {
  if (!name) return "U";
  const parts = name.trim().split(/\s+/);
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

function formatPageName(path: string): string {
  if (!path || path === "/") return "Dashboard";
  const clean = path.replace(/^\//, "").split("/")[0];
  return clean.charAt(0).toUpperCase() + clean.slice(1);
}

function formatActionText(event: LiveSyncEvent): string {
  const entitySingular = event.entity.endsWith("s")
    ? event.entity.slice(0, -1)
    : event.entity;
  const capitalizedEntity =
    entitySingular.charAt(0).toUpperCase() + entitySingular.slice(1);

  const titleOrId = event.entityTitle || (event.entityId ? `#${event.entityId.slice(-5)}` : "");

  switch (event.action) {
    case "CREATE":
      return `created ${capitalizedEntity} ${titleOrId}`.trim();
    case "UPDATE":
      return `updated ${capitalizedEntity} ${titleOrId}`.trim();
    case "DELETE":
      return `deleted ${capitalizedEntity} ${titleOrId}`.trim();
    case "STATUS_CHANGE":
      return `changed status on ${capitalizedEntity} ${titleOrId}`.trim();
    default:
      return `modified ${capitalizedEntity} ${titleOrId}`.trim();
  }
}

export function CollaboratorPresence() {
  const pathname = usePathname();
  const { collaborators, isConnected, totalOnline } = useCollaboratorPresence(pathname || "/");
  const [open, setOpen] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [recentEvents, setRecentEvents] = useState<LiveSyncEvent[]>([]);
  const [activeToast, setActiveToast] = useState<{ event: LiveSyncEvent; id: string } | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const toastTimerRef = useRef<NodeJS.Timeout | null>(null);

  // Listen to live events across the platform
  useLiveSync(undefined, (event) => {
    // Add to recent activity log (max 8)
    setRecentEvents((prev) => [event, ...prev.slice(0, 7)]);

    // Trigger toast notification if the change came from another collaborator
    if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
    const toastId = Math.random().toString(36).slice(2);
    setActiveToast({ event, id: toastId });

    toastTimerRef.current = setTimeout(() => {
      setActiveToast((current) => (current?.id === toastId ? null : current));
    }, 4500);
  });

  // Close dropdown on outside click or escape
  useEffect(() => {
    if (!open) return;
    const handleDown = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", handleDown);
    document.addEventListener("keydown", handleKey);
    return () => {
      document.removeEventListener("mousedown", handleDown);
      document.removeEventListener("keydown", handleKey);
    };
  }, [open]);

  // Clean up toast timer
  useEffect(() => {
    return () => {
      if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
    };
  }, []);

  const handleManualSync = async () => {
    setIsRefreshing(true);
    invalidateCache();
    window.dispatchEvent(new CustomEvent("flyconnect-cache-cleared"));
    // Broadcast ping
    await broadcastLiveSync({
      entity: "general",
      action: "UPDATE",
      entityTitle: "Manual Sync Triggered",
    });
    setTimeout(() => {
      setIsRefreshing(false);
    }, 600);
  };

  const displayAvatars = collaborators.slice(0, 3);
  const extraCount = Math.max(0, collaborators.length - 3);

  return (
    <div className="relative flex items-center" ref={containerRef}>
      {/* Topbar Clickable Pill */}
      <button
        type="button"
        onClick={() => setOpen((prev) => !prev)}
        aria-label="Multiplayer presence and live sync status"
        className={`group flex h-[38px] items-center gap-2 rounded-xl border px-2.5 transition-all select-none ${
          open
            ? "border-emerald-500 bg-emerald-50/70 shadow-sm"
            : "border-[#dde7f3] bg-[#f8fafc] hover:border-emerald-400 hover:bg-white"
        }`}
        title="Real-time multi-user live sync active"
      >
        {/* Real-time connection pulse indicator */}
        <div className="relative flex h-2.5 w-2.5 items-center justify-center">
          <span
            className={`absolute inline-flex h-full w-full rounded-full ${
              isConnected ? "bg-emerald-400 animate-ping opacity-75" : "bg-amber-400"
            }`}
          />
          <span
            className={`relative inline-flex h-2 w-2 rounded-full ${
              isConnected ? "bg-emerald-500" : "bg-amber-500"
            }`}
          />
        </div>

        {/* Text Pill (Desktop / Tablet) */}
        <span className="hidden sm:inline-flex items-center gap-1 text-[12px] font-semibold text-slate-700">
          <Zap className="h-3.5 w-3.5 text-emerald-600 fill-emerald-500/30" />
          <span>Live Sync</span>
        </span>

        {/* Stacked Avatars (Google Sheets multiplayer style) */}
        <div className="flex items-center -space-x-2 overflow-hidden py-0.5 pl-0.5">
          {displayAvatars.map((collab) => (
            <div
              key={collab.userId}
              style={{ backgroundColor: collab.color }}
              className="relative inline-flex h-6 w-6 items-center justify-center rounded-full text-[10px] font-bold text-white ring-2 ring-white shadow-xs transition-transform group-hover:scale-105"
              title={`${collab.name} (${collab.role}) • on ${formatPageName(collab.currentPage)}${
                collab.isSelf ? " (You)" : ""
              }`}
            >
              {getInitials(collab.name)}
            </div>
          ))}

          {extraCount > 0 && (
            <div className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-slate-200 text-[10px] font-bold text-slate-700 ring-2 ring-white">
              +{extraCount}
            </div>
          )}
        </div>

        <ChevronDown
          className={`h-3.5 w-3.5 text-slate-400 transition-transform duration-200 ${
            open ? "rotate-180 text-emerald-600" : "group-hover:text-slate-600"
          }`}
        />
      </button>

      {/* Floating Dropdown Dialog */}
      {open && (
        <div className="absolute right-0 top-[48px] z-50 w-[340px] overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl animate-in fade-in-50 zoom-in-95 duration-150">
          {/* Header */}
          <div className="flex items-center justify-between border-b border-slate-100 bg-slate-50/80 px-4 py-3">
            <div className="flex items-center gap-2">
              <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-emerald-100 text-emerald-600">
                <Wifi className="h-4 w-4" />
              </div>
              <div>
                <h4 className="text-[13px] font-bold text-slate-800 flex items-center gap-1.5">
                  Live Collaboration
                  <span className="inline-flex items-center rounded-full bg-emerald-100 px-1.5 py-0.2 text-[10px] font-extrabold text-emerald-700">
                    REALTIME
                  </span>
                </h4>
                <p className="text-[11px] text-slate-500">
                  {totalOnline} user{totalOnline > 1 ? "s" : ""} currently active
                </p>
              </div>
            </div>

            {/* Quick sync button */}
            <button
              type="button"
              onClick={handleManualSync}
              disabled={isRefreshing}
              title="Force sync data across all windows"
              className="flex h-7 items-center gap-1 rounded-lg border border-slate-200 bg-white px-2 text-[11px] font-medium text-slate-600 hover:bg-slate-50 transition active:scale-95 disabled:opacity-60"
            >
              <RefreshCw className={`h-3 w-3 ${isRefreshing ? "animate-spin text-emerald-600" : ""}`} />
              <span>{isRefreshing ? "Syncing..." : "Sync"}</span>
            </button>
          </div>

          {/* Active Collaborators List */}
          <div className="p-3">
            <div className="px-1 pb-2 text-[11px] font-semibold uppercase tracking-wider text-slate-400">
              Active Team Members
            </div>
            <div className="space-y-1.5 max-h-[160px] overflow-y-auto pr-1">
              {collaborators.map((collab) => (
                <div
                  key={collab.userId}
                  className="flex items-center justify-between rounded-xl px-2.5 py-1.5 transition hover:bg-slate-50"
                >
                  <div className="flex items-center gap-2.5 min-w-0">
                    <div
                      style={{ backgroundColor: collab.color }}
                      className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-[11px] font-bold text-white shadow-xs"
                    >
                      {getInitials(collab.name)}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-1.5">
                        <span className="truncate text-[12px] font-semibold text-slate-800">
                          {collab.name}
                        </span>
                        {collab.isSelf && (
                          <span className="rounded bg-slate-100 px-1 py-0.5 text-[9px] font-bold text-slate-500">
                            YOU
                          </span>
                        )}
                        <span className="rounded bg-emerald-50 px-1.5 py-0.5 text-[9px] font-semibold text-emerald-700">
                          {collab.role}
                        </span>
                      </div>
                      <p className="truncate text-[11px] text-slate-400">
                        Viewing <span className="font-medium text-slate-600">{formatPageName(collab.currentPage)}</span>
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center gap-1 shrink-0">
                    <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse" />
                    <span className="text-[10px] font-medium text-emerald-600">Online</span>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Recent Live Activity Stream */}
          <div className="border-t border-slate-100 bg-slate-50/50 p-3">
            <div className="flex items-center justify-between px-1 pb-1.5">
              <span className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">
                Recent Live Activity
              </span>
              <span className="text-[10px] text-slate-400 flex items-center gap-1">
                <Clock className="h-2.5 w-2.5" /> Live feed
              </span>
            </div>

            {recentEvents.length === 0 ? (
              <div className="rounded-xl border border-dashed border-slate-200 p-3 text-center text-[11px] text-slate-400">
                No recent edits yet. Changes made by your team will appear here live.
              </div>
            ) : (
              <div className="space-y-1.5 max-h-[140px] overflow-y-auto pr-1">
                {recentEvents.map((evt) => (
                  <div
                    key={evt.id}
                    className="flex items-start gap-2 rounded-lg bg-white p-2 border border-slate-100 shadow-2xs text-[11px]"
                  >
                    <div
                      style={{ backgroundColor: evt.author?.color || "#10b981" }}
                      className="mt-0.5 h-4 w-4 shrink-0 rounded-full flex items-center justify-center text-[8px] font-bold text-white"
                    >
                      {getInitials(evt.author?.name || "U")}
                    </div>
                    <div className="min-w-0 flex-1 leading-tight">
                      <span className="font-semibold text-slate-800">
                        {evt.author?.name || "Colleague"}{" "}
                      </span>
                      <span className="text-slate-600">{formatActionText(evt)}</span>
                    </div>
                    <span className="shrink-0 text-[9px] text-slate-400 font-mono">
                      {Math.max(0, Math.floor((Date.now() - evt.timestamp) / 1000))}s ago
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Footer Explainer */}
          <div className="border-t border-slate-100 bg-white px-4 py-2.5 text-center text-[11px] text-slate-500 flex items-center justify-center gap-1.5">
            <ShieldCheck className="h-3.5 w-3.5 text-emerald-600" />
            <span>Multi-device synchronized with instant broadcast</span>
          </div>
        </div>
      )}

      {/* Floating Real-time Toast (Excel / Google Sheets style pop-up) */}
      {activeToast && (
        <div
          role="status"
          aria-live="polite"
          className="fixed bottom-5 right-5 z-50 flex max-w-sm items-center gap-3 rounded-2xl border border-emerald-200 bg-white/95 px-4 py-3 shadow-2xl backdrop-blur-md animate-in slide-in-from-bottom-5 duration-300"
        >
          <div
            style={{ backgroundColor: activeToast.event.author?.color || "#10b981" }}
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-[11px] font-bold text-white shadow-xs ring-2 ring-emerald-100"
          >
            {getInitials(activeToast.event.author?.name || "U")}
          </div>

          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-1.5">
              <span className="text-[12px] font-bold text-slate-800 truncate">
                {activeToast.event.author?.name || "Colleague"}
              </span>
              <span className="inline-flex items-center gap-0.5 rounded-full bg-emerald-50 px-1.5 py-0.2 text-[9px] font-bold text-emerald-700">
                <Zap className="h-2.5 w-2.5 fill-emerald-500 text-emerald-600" />
                LIVE
              </span>
            </div>
            <p className="text-[11px] text-slate-600 truncate">
              {formatActionText(activeToast.event)}
            </p>
          </div>

          <button
            type="button"
            onClick={() => setActiveToast(null)}
            className="text-slate-400 hover:text-slate-600 p-1"
          >
            ✕
          </button>
        </div>
      )}
    </div>
  );
}
