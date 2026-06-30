"use client";

// ============================================================================
// Global navigation progress bar (Steve 2026-06-30).
//
// Renders a thin animated bar at the very top of the viewport whenever the
// user kicks off a navigation. The bar fills smoothly toward 90% while the
// next page is loading on the server, then snaps to 100% and fades out as
// soon as the new pathname commits.
//
// Why: Next.js App Router doesn't have a built-in "navigation pending"
// indicator. Without one, slow server components (DB roundtrip, AI call
// in the route handler) look like the click did nothing. Miguel + Steve
// flagged this 2026-06-29 — "no sé si el sitio responde".
//
// How it works:
//   - Listen for clicks on any internal `<a>` whose href changes the path.
//     Same-host, same-origin, NOT a download / new-tab / hash-only link.
//   - On a qualifying click, set `loading=true` and animate the bar from
//     0 → 90% over ~3s. (Cap at 90% so we never finish before the page does.)
//   - When `usePathname()` reports the path actually changed, finish the bar
//     to 100% and fade out.
//   - Also auto-clear after a 15s safety timeout in case the navigation
//     never completes (back/forward + cache hit etc.).
//
// No third-party deps. ~70 lines of code.
// ============================================================================

import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";

export function TopProgress() {
  const pathname = usePathname();
  const [progress, setProgress] = useState(0);
  const [visible, setVisible] = useState(false);
  const tickRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const safetyRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastPathRef = useRef(pathname);

  // Stop any in-flight animation tick/timeout.
  const cleanup = () => {
    if (tickRef.current) {
      clearInterval(tickRef.current);
      tickRef.current = null;
    }
    if (safetyRef.current) {
      clearTimeout(safetyRef.current);
      safetyRef.current = null;
    }
  };

  // Start an indeterminate climb to 90%. Easing slows as we approach the cap.
  const start = () => {
    cleanup();
    setVisible(true);
    setProgress(8);
    tickRef.current = setInterval(() => {
      setProgress((p) => {
        if (p >= 90) return p;
        const delta = (90 - p) * 0.06; // ease toward 90
        return Math.min(90, p + Math.max(0.4, delta));
      });
    }, 100);
    // Safety: if no commit in 15s, hide so we don't lock the bar visible.
    safetyRef.current = setTimeout(() => finish(), 15000);
  };

  // Snap to 100% then fade out.
  const finish = () => {
    cleanup();
    setProgress(100);
    setTimeout(() => {
      setVisible(false);
      setProgress(0);
    }, 220);
  };

  // Hook into <a> clicks at the document level. Easier than wrapping every Link.
  useEffect(() => {
    function onClick(e: MouseEvent) {
      // Only left-click without modifier keys triggers normal SPA nav.
      if (
        e.button !== 0 ||
        e.metaKey ||
        e.ctrlKey ||
        e.shiftKey ||
        e.altKey ||
        e.defaultPrevented
      ) {
        return;
      }
      const target = e.target as HTMLElement | null;
      const anchor = target?.closest("a") as HTMLAnchorElement | null;
      if (!anchor) return;
      if (anchor.target && anchor.target !== "_self") return;
      if (anchor.hasAttribute("download")) return;
      const href = anchor.getAttribute("href");
      if (!href || href.startsWith("#")) return;
      try {
        const url = new URL(anchor.href, window.location.href);
        if (url.origin !== window.location.origin) return;
        // No-op nav (same path + same query) → don't show bar.
        if (
          url.pathname === window.location.pathname &&
          url.search === window.location.search
        ) {
          return;
        }
      } catch {
        return;
      }
      start();
    }
    document.addEventListener("click", onClick, true);
    return () => document.removeEventListener("click", onClick, true);
  }, []);

  // When pathname actually changes, finish the bar.
  useEffect(() => {
    if (lastPathRef.current !== pathname) {
      lastPathRef.current = pathname;
      if (visible) finish();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pathname]);

  // Stop the tick on unmount.
  useEffect(() => cleanup, []);

  if (!visible) return null;

  return (
    <div
      aria-hidden="true"
      className="pointer-events-none fixed inset-x-0 top-0 z-[100] h-0.5"
    >
      <div
        className="h-full bg-gradient-to-r from-brand-400 via-brand-300 to-brand-400 shadow-[0_0_8px_rgba(34,211,238,0.6)] transition-[width] duration-200 ease-out"
        style={{ width: `${progress}%` }}
      />
    </div>
  );
}
