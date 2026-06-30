"use client";

// ============================================================================
// Messenger-style sidebar (Steve 2026-06-30) — left rail of the
// /conversations 3-pane layout. Replaces the old table-style list page.
//
// Inputs come pre-loaded from the layout (server component) so the
// client side just renders + filters in-memory. Filters:
//
//   • Tab — Unread / Recents / Starred / All
//   • Search — case-insensitive substring on contact name or phone,
//     applied client-side over the loaded set (~200 rows max)
//
// Star toggle is wired to the toggleConversationStar server action via
// a tiny inline ActionForm — the row optimistically flips the icon, the
// action persists, the next router.refresh() reconciles.
// ============================================================================

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  useMemo,
  useState,
  useTransition,
} from "react";

import type { SidebarConversationRow } from "~/lib/conversation-sidebar-queries";
import { toggleConversationStar } from "~/app/actions/conversation-tracking";

type Tab = "unread" | "recents" | "starred" | "all";

const TABS: Array<{ key: Tab; label: string }> = [
  { key: "unread", label: "Unread" },
  { key: "recents", label: "Recents" },
  { key: "starred", label: "Starred" },
  { key: "all", label: "All" },
];

type Props = {
  conversations: SidebarConversationRow[];
  /** Admins see the sede on each row; office users have only one sede so hide it. */
  showSede: boolean;
};

export function ConversationSidebar({ conversations, showSede }: Props) {
  const pathname = usePathname();
  const [tab, setTab] = useState<Tab>("recents");
  const [query, setQuery] = useState("");

  // Selected id = the segment after /conversations/. usePathname returns
  // "/conversations" or "/conversations/<id>". Match on the prefix.
  const selectedId = useMemo(() => {
    if (!pathname) return null;
    const m = pathname.match(/^\/conversations\/([^/]+)/);
    return m ? (m[1] ?? null) : null;
  }, [pathname]);

  const filtered = useMemo(() => {
    let rows = conversations;
    // Tab filter.
    if (tab === "unread") rows = rows.filter((r) => r.isUnread);
    else if (tab === "starred") rows = rows.filter((r) => r.starred);
    else if (tab === "recents") rows = rows.slice(0, 50); // top 50 most recent
    // "all" is identity.

    // Search filter — case-insensitive contains on name or phone.
    const q = query.trim().toLowerCase();
    if (q.length > 0) {
      rows = rows.filter((r) => {
        if (r.contactName?.toLowerCase().includes(q)) return true;
        if (r.contactPhone?.toLowerCase().includes(q)) return true;
        return false;
      });
    }
    return rows;
  }, [conversations, tab, query]);

  const unreadCount = conversations.filter((c) => c.isUnread).length;

  return (
    <aside className="flex h-full w-[320px] flex-col border-r border-ink-300/40 bg-ink-100/30">
      {/* Tabs row */}
      <div className="flex border-b border-ink-300/40 text-[13px] font-medium">
        {TABS.map((t) => {
          const active = tab === t.key;
          const showBadge = t.key === "unread" && unreadCount > 0;
          return (
            <button
              key={t.key}
              type="button"
              onClick={() => setTab(t.key)}
              className={`relative flex-1 px-2 py-2.5 transition ${
                active
                  ? "text-brand-300 after:absolute after:bottom-0 after:left-0 after:right-0 after:h-0.5 after:bg-brand-400"
                  : "text-ink-500 hover:text-ink-700"
              }`}
            >
              {t.label}
              {showBadge ? (
                <span className="ml-1.5 inline-flex h-4 min-w-[16px] items-center justify-center rounded-full bg-brand-500 px-1 text-[10px] font-semibold leading-none text-white">
                  {unreadCount}
                </span>
              ) : null}
            </button>
          );
        })}
      </div>

      {/* Search */}
      <div className="border-b border-ink-300/40 p-3">
        <div className="relative">
          <svg
            viewBox="0 0 20 20"
            fill="none"
            className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-500"
            aria-hidden="true"
          >
            <circle cx="9" cy="9" r="6" stroke="currentColor" strokeWidth="1.6" />
            <path d="M14 14l3 3" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
          </svg>
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search"
            className="w-full rounded-lg border border-ink-300/60 bg-ink-100/80 py-1.5 pl-9 pr-3 text-sm text-ink-900 placeholder:text-ink-500 focus:border-brand-400 focus:outline-none focus:ring-2 focus:ring-brand-400/30"
          />
        </div>
      </div>

      {/* Result count */}
      <div className="flex items-baseline justify-between border-b border-ink-300/40 px-3 py-1.5 text-[11px] uppercase tracking-wider text-ink-500">
        <span>
          {filtered.length} resultado{filtered.length === 1 ? "" : "s"}
        </span>
        <span className="lowercase normal-case">Más reciente</span>
      </div>

      {/* List */}
      <div className="min-h-0 flex-1 overflow-y-auto">
        {filtered.length === 0 ? (
          <p className="px-3 py-6 text-center text-xs text-ink-500">
            {query ? `Sin resultados para "${query}"` : "Vacío."}
          </p>
        ) : (
          <ul>
            {filtered.map((c) => (
              <SidebarRow
                key={c.conversacionId}
                row={c}
                isSelected={c.conversacionId === selectedId}
                showSede={showSede}
              />
            ))}
          </ul>
        )}
      </div>
    </aside>
  );
}

// ── Row ─────────────────────────────────────────────────────────────────

function SidebarRow({
  row,
  isSelected,
  showSede,
}: {
  row: SidebarConversationRow;
  isSelected: boolean;
  showSede: boolean;
}) {
  const [optimisticStarred, setOptimisticStarred] = useState(row.starred);
  const [isPending, startTransition] = useTransition();

  function handleStarClick(e: React.MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
    const next = !optimisticStarred;
    setOptimisticStarred(next); // optimistic
    startTransition(async () => {
      const fd = new FormData();
      fd.append("conversacionId", row.conversacionId);
      const res = await toggleConversationStar(fd);
      if (!res.ok) {
        setOptimisticStarred(!next); // rollback
      }
    });
  }

  const initials = (row.contactName ?? "—")
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((s) => s[0]?.toUpperCase() ?? "")
    .join("");
  const preview = row.lastClienteText
    ? row.lastClienteText.slice(0, 80)
    : "Sin mensajes del cliente todavía.";
  const dateLabel = formatShortDate(row.lastActivityAt);

  return (
    <li
      className={`border-b border-ink-300/30 ${
        isSelected ? "bg-brand-400/10" : "hover:bg-ink-200/30"
      }`}
    >
      <Link
        href={`/conversations/${row.conversacionId}`}
        className="flex items-start gap-3 px-3 py-2.5"
      >
        {/* Avatar */}
        <div
          className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-xs font-semibold ${
            row.isUnread
              ? "bg-brand-500/20 text-brand-300 ring-2 ring-brand-400/40"
              : "bg-ink-200/60 text-ink-600"
          }`}
        >
          {initials || "·"}
        </div>

        {/* Middle: name + preview */}
        <div className="min-w-0 flex-1">
          <div className="flex items-baseline justify-between gap-2">
            <span
              className={`truncate text-sm ${
                row.isUnread
                  ? "font-semibold text-ink-900"
                  : "font-medium text-ink-700"
              }`}
            >
              {row.contactName ?? "—"}
            </span>
            <span className="shrink-0 text-[11px] text-ink-500 tabular-nums">
              {dateLabel}
            </span>
          </div>
          <p
            className={`mt-0.5 truncate text-xs ${
              row.isUnread ? "text-ink-700" : "text-ink-500"
            }`}
          >
            {preview}
          </p>
          {showSede && row.sedeName ? (
            <p className="mt-0.5 truncate text-[10px] uppercase tracking-wider text-ink-500">
              {row.sedeName}
            </p>
          ) : null}
        </div>

        {/* Right: star + unread dot */}
        <div className="flex shrink-0 flex-col items-end gap-1.5">
          <button
            type="button"
            onClick={handleStarClick}
            disabled={isPending}
            aria-label={optimisticStarred ? "Quitar estrella" : "Marcar con estrella"}
            className={`text-base leading-none ${
              optimisticStarred
                ? "text-warn-500"
                : "text-ink-400 hover:text-warn-500"
            }`}
          >
            {optimisticStarred ? "★" : "☆"}
          </button>
          {row.isUnread ? (
            <span
              aria-label="No leído"
              className="h-2 w-2 rounded-full bg-brand-500"
            />
          ) : null}
        </div>
      </Link>
    </li>
  );
}

// ── helpers ─────────────────────────────────────────────────────────────

function formatShortDate(d: Date): string {
  const now = new Date();
  const dt = d instanceof Date ? d : new Date(d);
  const diffMs = now.getTime() - dt.getTime();
  const diffMin = Math.floor(diffMs / 60000);
  if (diffMin < 1) return "ahora";
  if (diffMin < 60) return `${diffMin}m`;
  const diffHour = Math.floor(diffMin / 60);
  if (diffHour < 24) return `${diffHour}h`;
  // Same year → "MMM dd", different year → "MM/yy"
  const sameYear = dt.getFullYear() === now.getFullYear();
  return sameYear
    ? dt.toLocaleDateString("es-ES", { month: "short", day: "numeric" })
    : dt.toLocaleDateString("es-ES", { month: "2-digit", year: "2-digit" });
}
