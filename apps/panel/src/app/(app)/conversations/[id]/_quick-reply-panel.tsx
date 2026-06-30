"use client";

// ============================================================================
// Quick-reply sidebar (Miguel 2026-06-12 resilience layer #6).
//
// Lists saved_responses scoped to this conversation's sede + general.
// Each row has:
//   - the short name + scope/language chips + a tag strip
//   - a preview of the response text (truncated)
//   - a "Usar" button that fills the composer textarea with the text
//
// Wiring to the composer:
//   The composer's textarea has id="composer-textarea". Clicking "Usar"
//   sets that textarea's value via a custom DOM event so we don't have
//   to lift state up — composer and quick-reply panel stay independent.
// ============================================================================

import { useMemo, useState } from "react";

import type { QuickReplyItem } from "~/lib/quick-replies";

const PREVIEW_MAX = 180;

type QuickReplyPanelProps = {
  items: QuickReplyItem[];
};

export function QuickReplyPanel({ items }: QuickReplyPanelProps) {
  const [query, setQuery] = useState("");

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return items;
    return items.filter((it) => {
      if (it.name.toLowerCase().includes(q)) return true;
      if (it.responseText.toLowerCase().includes(q)) return true;
      if (it.tags.some((t) => t.toLowerCase().includes(q))) return true;
      return false;
    });
  }, [items, query]);

  function handleUse(item: QuickReplyItem) {
    // Find the composer's textarea + set its value through the input
    // event so React's controlled state updates.
    const ta = document.getElementById(
      "composer-textarea",
    ) as HTMLTextAreaElement | null;
    if (!ta) return;
    const setter = Object.getOwnPropertyDescriptor(
      window.HTMLTextAreaElement.prototype,
      "value",
    )?.set;
    if (setter) {
      setter.call(ta, item.responseText);
      ta.dispatchEvent(new Event("input", { bubbles: true }));
    } else {
      ta.value = item.responseText;
    }
    ta.focus();
    // Hint to the operator that the replacement happened — scroll the
    // textarea into view, especially helpful when the sidebar is below
    // the fold on smaller screens.
    ta.scrollIntoView({ block: "nearest", behavior: "smooth" });
  }

  return (
    <section className="card flex flex-col gap-3" aria-label="Respuestas rápidas">
      <header className="flex items-baseline justify-between gap-3">
        <h2 className="h-section">Respuestas rápidas</h2>
        <span className="text-[11px] text-ink-500 tabular-nums">
          {filtered.length}/{items.length}
        </span>
      </header>
      <input
        type="search"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="Buscar por nombre, texto o tag…"
        className="w-full rounded-lg border border-ink-300/70 bg-ink-100/70 px-3 py-1.5 text-sm text-ink-900 placeholder:text-ink-500 focus:border-brand-400 focus:outline-none focus:ring-2 focus:ring-brand-400/30"
      />
      {items.length === 0 ? (
        <p className="text-xs text-ink-600">
          Todavía no guardaste ninguna respuesta. Hacé click en
          <strong className="text-ink-800"> "Guardar como respuesta rápida"</strong>
          {" "}debajo de un mensaje de la AI para empezar a llenar tu
          biblioteca.
        </p>
      ) : filtered.length === 0 ? (
        <p className="text-xs text-ink-600">
          Ninguna respuesta coincide con "{query}".
        </p>
      ) : (
        <ul className="flex flex-col gap-2">
          {filtered.map((it) => (
            <li
              key={it.id}
              className="rounded-lg border border-ink-200/70 bg-ink-100/50 p-3"
            >
              <div className="mb-1 flex flex-wrap items-baseline justify-between gap-2">
                <div className="flex items-baseline gap-2">
                  <span className="font-medium text-ink-900">{it.name}</span>
                  <span
                    className={`rounded px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wider ${
                      it.scope === "general"
                        ? "bg-brand-400/15 text-brand-300 ring-1 ring-inset ring-brand-400/30"
                        : "bg-warn-500/15 text-warn-700 ring-1 ring-inset ring-warn-500/30"
                    }`}
                  >
                    {it.scope === "general" ? "general" : "sede"}
                  </span>
                  <span className="text-[10px] uppercase text-ink-500">
                    {it.language}
                  </span>
                </div>
                <button
                  type="button"
                  onClick={() => handleUse(it)}
                  className="rounded-md bg-brand-500/15 px-2 py-0.5 text-[11px] font-semibold text-brand-300 ring-1 ring-inset ring-brand-400/40 hover:bg-brand-500/25"
                >
                  Usar →
                </button>
              </div>
              {it.tags.length > 0 ? (
                <div className="mb-1 flex flex-wrap gap-1">
                  {it.tags.map((t) => (
                    <span
                      key={t}
                      className="rounded bg-ink-200/40 px-1.5 py-0.5 text-[10px] text-ink-600"
                    >
                      {t}
                    </span>
                  ))}
                </div>
              ) : null}
              <p className="whitespace-pre-wrap text-xs text-ink-700">
                {it.responseText.length > PREVIEW_MAX
                  ? `${it.responseText.slice(0, PREVIEW_MAX)}…`
                  : it.responseText}
              </p>
              {it.timesUsed > 0 ? (
                <p className="mt-1 text-[10px] text-ink-500">
                  usada {it.timesUsed} {it.timesUsed === 1 ? "vez" : "veces"}
                </p>
              ) : null}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
