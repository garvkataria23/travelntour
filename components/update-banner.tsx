"use client";

import { useEffect, useState } from "react";
import { Sparkles, RefreshCw, X } from "lucide-react";

export function UpdateBanner() {
  const [initialDeploymentId, setInitialDeploymentId] = useState<string | null>(null);
  const [updateAvailable, setUpdateAvailable] = useState(false);
  const [updating, setUpdating] = useState(false);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    let isMounted = true;

    async function checkVersion() {
      try {
        const res = await fetch(`/api/version?_t=${Date.now()}`, {
          cache: "no-store",
          headers: { "Cache-Control": "no-cache" },
        });
        if (!res.ok) return;
        const data = await res.json();
        const serverId = data.deploymentId;

        if (!serverId || !isMounted) return;

        setInitialDeploymentId((prev) => {
          if (!prev) {
            // First run, save initial deployment ID
            return serverId;
          }
          if (prev !== serverId) {
            // Server deployment changed! Show update button
            setUpdateAvailable(true);
          }
          return prev;
        });
      } catch {
        // Silently ignore network failure / offline
      }
    }

    // Initial check
    checkVersion();

    // Re-check periodically every 30 seconds
    const interval = setInterval(checkVersion, 30000);

    // Also re-check when the user focuses or returns to the window
    const handleFocus = () => checkVersion();
    window.addEventListener("focus", handleFocus);

    return () => {
      isMounted = false;
      clearInterval(interval);
      window.removeEventListener("focus", handleFocus);
    };
  }, []);

  const handleUpdate = () => {
    setUpdating(true);
    // Clear runtime cache if supported
    if ("caches" in window) {
      caches.keys().then((keys) => {
        keys.forEach((key) => caches.delete(key));
      });
    }
    // Hard reload the window to apply latest build assets
    setTimeout(() => {
      window.location.reload();
    }, 350);
  };

  if (!updateAvailable || dismissed) return null;

  return (
    <div
      className="fixed top-3 left-1/2 -translate-x-1/2 z-[99999] animate-in fade-in slide-in-from-top-4 duration-300 pointer-events-auto"
      role="alert"
    >
      <div className="flex items-center gap-3 rounded-full bg-slate-900/95 text-white pl-4 pr-1.5 py-1.5 shadow-[0_12px_30px_rgba(0,0,0,0.4)] border border-sky-400/40 backdrop-blur-md">
        {/* Pulsing indicator */}
        <span className="relative flex h-2.5 w-2.5 shrink-0">
          <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-sky-400 opacity-75" />
          <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-sky-500" />
        </span>

        {/* Text description */}
        <span className="text-xs font-semibold text-slate-100 flex items-center gap-1.5 select-none">
          <Sparkles className="h-3.5 w-3.5 text-amber-300" />
          Update available
        </span>

        {/* Update Now Action Button */}
        <button
          onClick={handleUpdate}
          disabled={updating}
          type="button"
          className="flex items-center gap-1.5 rounded-full bg-gradient-to-r from-blue-600 via-indigo-600 to-blue-500 hover:from-blue-500 hover:to-indigo-500 px-3.5 py-1 text-xs font-bold text-white shadow-sm transition active:scale-95 disabled:opacity-70 cursor-pointer"
        >
          <RefreshCw className={`h-3 w-3 ${updating ? "animate-spin" : ""}`} />
          <span>{updating ? "Updating..." : "Update Now"}</span>
        </button>

        {/* Dismiss Button */}
        <button
          onClick={() => setDismissed(true)}
          type="button"
          title="Dismiss for now"
          className="text-slate-400 hover:text-white p-1 rounded-full hover:bg-slate-800 transition"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      </div>
    </div>
  );
}
