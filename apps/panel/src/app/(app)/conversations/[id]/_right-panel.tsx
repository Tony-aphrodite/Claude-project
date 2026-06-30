"use client";

// ============================================================================
// Right-side info/tools/replay panel for the redesigned conversation
// detail page (Steve 2026-06-30 messenger style).
//
// Three tabs:
//   • Info   — contact card, sede, language, lead stage, deposit ref_code,
//              stage history timeline
//   • Tools  — override stage, re-roll AI, quick-reply library
//   • Replay — the ReplaySection passed in from the server component
//
// The whole panel is a single client component so tab switches don't
// round-trip to the server.
// ============================================================================

import { useState, type ReactNode } from "react";

type Tab = "info" | "tools" | "replay";

const TABS: Array<{ key: Tab; label: string }> = [
  { key: "info", label: "Info" },
  { key: "tools", label: "Herramientas" },
  { key: "replay", label: "Replay" },
];

export function RightPanel({
  infoNode,
  toolsNode,
  replayNode,
}: {
  infoNode: ReactNode;
  toolsNode: ReactNode;
  replayNode: ReactNode;
}) {
  const [tab, setTab] = useState<Tab>("info");

  return (
    <aside className="flex h-full w-[340px] flex-col border-l border-ink-300/40 bg-ink-100/20">
      <div className="flex border-b border-ink-300/40 text-[13px] font-medium">
        {TABS.map((t) => {
          const active = tab === t.key;
          return (
            <button
              key={t.key}
              type="button"
              onClick={() => setTab(t.key)}
              className={`relative flex-1 px-3 py-2.5 transition ${
                active
                  ? "text-brand-300 after:absolute after:bottom-0 after:left-0 after:right-0 after:h-0.5 after:bg-brand-400"
                  : "text-ink-500 hover:text-ink-700"
              }`}
            >
              {t.label}
            </button>
          );
        })}
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto p-4">
        {tab === "info" ? infoNode : null}
        {tab === "tools" ? toolsNode : null}
        {tab === "replay" ? replayNode : null}
      </div>
    </aside>
  );
}
