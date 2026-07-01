"use client";

// ============================================================================
// CopyCodeButton — Miguel 2026-07-01 #8.
//
// Small "⧉" icon rendered next to every diver's ref code. Clicking copies
// the code to the clipboard and flashes "✓" for ~1.5 s. Lets Miguel
// re-use the same code when creating walk-in rows for subsequent days
// of the same person's multi-day program without hand-typing 15 chars.
//
// Kept as a tiny standalone client component so the roster/engine page
// stays a server component overall — only the button hydrates.
// ============================================================================

import { useState } from "react";

export function CopyCodeButton({ code }: { code: string }) {
  const [copied, setCopied] = useState(false);

  return (
    <button
      type="button"
      onClick={async (e) => {
        e.preventDefault();
        e.stopPropagation();
        try {
          await navigator.clipboard.writeText(code);
          setCopied(true);
          setTimeout(() => setCopied(false), 1500);
        } catch {
          // Older browsers / insecure context — fall back silently. The
          // operator can still select the text manually.
        }
      }}
      className={`ml-1 inline-flex h-4 w-4 items-center justify-center rounded text-[10px] leading-none transition ${
        copied
          ? "text-ok-500"
          : "text-ink-500 hover:text-brand-300"
      }`}
      title={copied ? "Copiado" : "Copiar código"}
      aria-label={copied ? "Código copiado" : "Copiar código"}
    >
      {copied ? "✓" : "⧉"}
    </button>
  );
}
