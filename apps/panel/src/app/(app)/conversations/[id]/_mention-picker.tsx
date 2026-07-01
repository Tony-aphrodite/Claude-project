"use client";

// ============================================================================
// MentionPicker — inline @-mention autocomplete for the internal-note
// composer (Steve 2026-07-01, "etiquetar a otro usuario ya sea oficina
// o remoto"). Mirrors the Respond.io comment-mention UX.
//
// How it works:
//   - Parent (ChatComposer) owns the textarea value + selection state.
//   - When the operator types `@`, ChatComposer computes the query
//     (letters after the @ up to whitespace) and passes it here.
//   - This component renders a floating dropdown of matching users
//     (email / role / sede), keyboard-navigable.
//   - Selecting a user calls back into the parent with the picked
//     user; the parent (a) inserts "@email " into the textarea,
//     (b) tracks the user's Supabase id in a state array so the
//     server action can persist it.
// ============================================================================

import { useEffect, useMemo, useRef, useState } from "react";

import type { MentionUser } from "~/app/actions/mentions";

type Props = {
  /** Substring after the "@" the operator is currently typing. */
  query: string;
  /** All panel users loaded server-side (pre-filtered upstream). */
  users: MentionUser[];
  /** Called when the operator picks a user (click or Enter). */
  onPick: (user: MentionUser) => void;
  /** Called when the user dismisses the picker (Escape). */
  onDismiss: () => void;
};

const MAX_RESULTS = 6;

export function MentionPicker({ query, users, onPick, onDismiss }: Props) {
  const [activeIdx, setActiveIdx] = useState(0);
  const containerRef = useRef<HTMLDivElement | null>(null);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (q.length === 0) return users.slice(0, MAX_RESULTS);
    return users
      .filter((u) => {
        if (u.email.toLowerCase().includes(q)) return true;
        if (u.sede && u.sede.toLowerCase().includes(q)) return true;
        return false;
      })
      .slice(0, MAX_RESULTS);
  }, [query, users]);

  // Reset the active row when the visible list changes so Arrow keys
  // never point off the end.
  useEffect(() => {
    setActiveIdx(0);
  }, [filtered.length]);

  // Global key handling — Escape closes; Arrow / Enter navigate.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") {
        onDismiss();
        return;
      }
      if (filtered.length === 0) return;
      if (e.key === "ArrowDown") {
        e.preventDefault();
        setActiveIdx((i) => (i + 1) % filtered.length);
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        setActiveIdx((i) => (i - 1 + filtered.length) % filtered.length);
      } else if (e.key === "Enter" || e.key === "Tab") {
        e.preventDefault();
        const picked = filtered[activeIdx];
        if (picked) onPick(picked);
      }
    }
    document.addEventListener("keydown", onKey, true);
    return () => document.removeEventListener("keydown", onKey, true);
  }, [filtered, activeIdx, onPick, onDismiss]);

  if (filtered.length === 0) {
    return (
      <div
        ref={containerRef}
        className="pointer-events-none absolute bottom-full left-3 mb-1 rounded-lg border border-ink-300/60 bg-ink-100/95 px-3 py-1.5 text-[11px] text-ink-500 shadow-lg backdrop-blur"
      >
        Ningún usuario coincide con "@{query}"
      </div>
    );
  }

  return (
    <div
      ref={containerRef}
      className="absolute bottom-full left-3 mb-1 w-72 overflow-hidden rounded-lg border border-ink-300/60 bg-ink-100/95 shadow-xl backdrop-blur"
      role="listbox"
      aria-label="Usuarios para mencionar"
    >
      <div className="border-b border-ink-300/40 px-2.5 py-1 text-[10px] uppercase tracking-wider text-ink-500">
        Mencionar usuario · Enter para elegir · Esc para cerrar
      </div>
      <ul>
        {filtered.map((u, i) => {
          const active = i === activeIdx;
          return (
            <li key={u.id}>
              <button
                type="button"
                onMouseEnter={() => setActiveIdx(i)}
                onClick={() => onPick(u)}
                className={`flex w-full items-center gap-2 px-2.5 py-1.5 text-left text-xs ${
                  active
                    ? "bg-brand-500/15 text-brand-300"
                    : "text-ink-800 hover:bg-ink-200/40"
                }`}
                role="option"
                aria-selected={active}
              >
                <span className="min-w-0 flex-1 truncate font-medium">
                  {u.email}
                </span>
                <span
                  className={`shrink-0 rounded px-1.5 py-0.5 text-[9px] uppercase tracking-wider ${
                    u.role === "admin"
                      ? "bg-brand-400/20 text-brand-300"
                      : "bg-ink-200/60 text-ink-600"
                  }`}
                >
                  {u.role}
                </span>
                {u.sede ? (
                  <span className="shrink-0 text-[10px] text-ink-500">
                    {u.sede}
                  </span>
                ) : u.role === "office" ? (
                  <span className="shrink-0 text-[10px] italic text-ink-500">
                    todas
                  </span>
                ) : null}
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
