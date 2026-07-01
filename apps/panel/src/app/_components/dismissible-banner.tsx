"use client";

// ============================================================================
// DismissibleBanner — Steve 2026-07-01.
//
// Wraps a server-rendered banner (e.g. "credenciales creadas" flash on
// /admin/users) with:
//   - Auto-dismiss after `timeoutMs` (default 5s so the operator has
//     time to copy the password before it fades).
//   - Manual close (×) button in the top-right corner.
//
// Renders children as-is; only adds the fade/hide behavior + the close
// affordance. Once dismissed the client hides the whole banner — the
// underlying cookie flash was already consumed server-side so there's
// no re-appearance on refresh.
// ============================================================================

import { useEffect, useState, type ReactNode } from "react";

type Props = {
  children: ReactNode;
  /** Milliseconds before auto-dismiss. Steve 2026-07-01: default 3000. */
  timeoutMs?: number;
  /** Aria label for the close button. */
  closeLabel?: string;
};

export function DismissibleBanner({
  children,
  timeoutMs = 3000,
  closeLabel = "Cerrar",
}: Props) {
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    if (dismissed) return;
    const timer = setTimeout(() => setDismissed(true), timeoutMs);
    return () => clearTimeout(timer);
  }, [dismissed, timeoutMs]);

  if (dismissed) return null;

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setDismissed(true)}
        aria-label={closeLabel}
        className="absolute right-2 top-2 z-10 flex h-6 w-6 items-center justify-center rounded-full text-ink-500 transition hover:bg-ink-200/40 hover:text-ink-900"
      >
        <svg viewBox="0 0 20 20" fill="none" className="h-3.5 w-3.5">
          <path
            d="M5 5l10 10M15 5L5 15"
            stroke="currentColor"
            strokeWidth="1.6"
            strokeLinecap="round"
          />
        </svg>
      </button>
      {children}
    </div>
  );
}
