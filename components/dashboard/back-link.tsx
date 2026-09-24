"use client";

import { ArrowLeft } from "lucide-react";
import { useRouter } from "next/navigation";
import { ReactNode } from "react";

/**
 * Proper "Back" control: goes back to the page the user actually came from
 * (browser history), and only falls back to `href` when there is no history
 * (e.g. the page was opened directly).
 */
export function BackLink({ href, children, className }: { href: string; children: ReactNode; className?: string }) {
  const router = useRouter();
  return (
    <button
      type="button"
      onClick={() => {
        if (window.history.length > 1) {
          router.back();
        } else {
          router.push(href);
        }
      }}
      className={`flex cursor-pointer items-center gap-2 ${className ?? ""}`}
    >
      <ArrowLeft className="h-4 w-4" />
      {children}
    </button>
  );
}