"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import { signOut } from "~/app/actions/auth";
import type { UserContext } from "~/lib/auth-context";

type NavItem = {
  href: string;
  label: string;
  icon: React.ReactNode;
  group: "live" | "config" | "admin";
  // Visible only to admins. Used for the user-management surface
  // (/admin/users) — office staff don't see the link at all.
  adminOnly?: boolean;
};

const NAV: NavItem[] = [
  {
    href: "/",
    label: "Dashboard",
    group: "live",
    adminOnly: true,
    icon: (
      <svg viewBox="0 0 20 20" fill="none" className="h-4 w-4">
        <path
          d="M3 11l7-7 7 7M5 9v8h4v-5h2v5h4V9"
          stroke="currentColor"
          strokeWidth="1.6"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    ),
  },
  {
    href: "/pipeline",
    label: "Pipeline",
    group: "live",
    icon: (
      <svg viewBox="0 0 20 20" fill="none" className="h-4 w-4">
        <rect x="2.5" y="3.5" width="3.5" height="13" rx="1" stroke="currentColor" strokeWidth="1.6" />
        <rect x="8.25" y="3.5" width="3.5" height="9" rx="1" stroke="currentColor" strokeWidth="1.6" />
        <rect x="14" y="3.5" width="3.5" height="6" rx="1" stroke="currentColor" strokeWidth="1.6" />
      </svg>
    ),
  },
  {
    href: "/payments",
    label: "Depósitos",
    group: "live",
    icon: (
      <svg viewBox="0 0 20 20" fill="none" className="h-4 w-4">
        <rect x="2.5" y="5" width="15" height="11" rx="2" stroke="currentColor" strokeWidth="1.6" />
        <path d="M2.5 8.5h15" stroke="currentColor" strokeWidth="1.6" />
        <path d="M6 12.5h2.5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
      </svg>
    ),
  },
  {
    href: "/depositos-auto",
    label: "Auto-confirmados",
    group: "live",
    icon: (
      <svg viewBox="0 0 20 20" fill="none" className="h-4 w-4">
        <circle cx="10" cy="10" r="7" stroke="currentColor" strokeWidth="1.6" />
        <path
          d="M6.5 10.2l2.5 2.5 4.5-5"
          stroke="currentColor"
          strokeWidth="1.6"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    ),
  },
  {
    href: "/simulator",
    label: "Simulador",
    group: "live",
    adminOnly: true,
    icon: (
      <svg viewBox="0 0 20 20" fill="none" className="h-4 w-4">
        <path
          d="M3 5.5h14v8a2 2 0 01-2 2H8.5L5 18.5V15.5H5a2 2 0 01-2-2v-8z"
          stroke="currentColor"
          strokeWidth="1.6"
          strokeLinejoin="round"
        />
        <path d="M7 9h6M7 12h4" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
      </svg>
    ),
  },
  {
    href: "/conversations",
    label: "Conversaciones",
    group: "live",
    icon: (
      <svg viewBox="0 0 20 20" fill="none" className="h-4 w-4">
        <path
          d="M3 4.5h11A2.5 2.5 0 0116.5 7v4A2.5 2.5 0 0114 13.5H8L4.5 16.5V13H3.5A.5.5 0 013 12.5v-8z"
          stroke="currentColor"
          strokeWidth="1.6"
          strokeLinejoin="round"
        />
      </svg>
    ),
  },
  {
    href: "/follow-ups",
    label: "Follow-ups",
    group: "live",
    icon: (
      <svg viewBox="0 0 20 20" fill="none" className="h-4 w-4">
        <circle cx="10" cy="10" r="6.5" stroke="currentColor" strokeWidth="1.6" />
        <path d="M10 6.5V10l2.5 1.5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
      </svg>
    ),
  },
  {
    href: "/roster",
    label: "Roster",
    group: "live",
    icon: (
      <svg viewBox="0 0 20 20" fill="none" className="h-4 w-4">
        <rect x="3" y="4" width="14" height="13" rx="1.5" stroke="currentColor" strokeWidth="1.6" />
        <path d="M3 8h14M7 4V2.5M13 4V2.5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
        <circle cx="7" cy="12" r="1" fill="currentColor" />
        <circle cx="10" cy="12" r="1" fill="currentColor" />
        <circle cx="13" cy="12" r="1" fill="currentColor" />
      </svg>
    ),
  },
  // Roster engine v2.1 (Miguel 2026-06-24) panel UI — phased rollout.
  // Both pages are visible to admin AND office (office is scoped to
  // their assigned sede by the page-level filter). Linking them here
  // so they show up under "Operación" alongside the legacy /roster.
  {
    href: "/roster/instructors",
    label: "Instructores",
    group: "live",
    icon: (
      <svg viewBox="0 0 20 20" fill="none" className="h-4 w-4">
        <circle cx="10" cy="6.5" r="2.8" stroke="currentColor" strokeWidth="1.6" />
        <path
          d="M3.5 17.5c.7-3 3.2-5 6.5-5s5.8 2 6.5 5"
          stroke="currentColor"
          strokeWidth="1.6"
          strokeLinecap="round"
        />
        <path d="M14.5 5.5l1.5-1.5M15 9h2" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
      </svg>
    ),
  },
  {
    href: "/roster/engine",
    label: "Roster (engine)",
    group: "live",
    icon: (
      <svg viewBox="0 0 20 20" fill="none" className="h-4 w-4">
        <rect x="2.5" y="3.5" width="15" height="13" rx="1.5" stroke="currentColor" strokeWidth="1.6" />
        <path d="M2.5 7.5h15M7 3.5v13M12.5 3.5v13" stroke="currentColor" strokeWidth="1.4" />
        <circle cx="4.75" cy="10" r="0.8" fill="currentColor" />
        <circle cx="9.75" cy="10" r="0.8" fill="currentColor" />
        <circle cx="14.75" cy="10" r="0.8" fill="currentColor" />
        <circle cx="4.75" cy="13" r="0.8" fill="currentColor" />
        <circle cx="9.75" cy="13" r="0.8" fill="currentColor" />
      </svg>
    ),
  },
  {
    href: "/prompts",
    label: "Prompts",
    group: "config",
    adminOnly: true,
    icon: (
      <svg viewBox="0 0 20 20" fill="none" className="h-4 w-4">
        <path
          d="M5 4.5h7l3.5 3.5v8a1 1 0 01-1 1h-9.5a1 1 0 01-1-1v-10.5a1 1 0 011-1z"
          stroke="currentColor"
          strokeWidth="1.6"
          strokeLinejoin="round"
        />
        <path d="M11.5 4.5V8H15" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" />
      </svg>
    ),
  },
  {
    href: "/kb",
    label: "Knowledge Base",
    group: "config",
    adminOnly: true,
    icon: (
      <svg viewBox="0 0 20 20" fill="none" className="h-4 w-4">
        <path
          d="M4 4.5h9a2 2 0 012 2v9a1 1 0 01-1 1H6a2 2 0 01-2-2V4.5z"
          stroke="currentColor"
          strokeWidth="1.6"
          strokeLinejoin="round"
        />
        <path d="M4 14.5h11" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
        <path d="M7.5 8h5M7.5 11h3" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
      </svg>
    ),
  },
  {
    href: "/admin/users",
    label: "Usuarios",
    group: "admin",
    adminOnly: true,
    icon: (
      <svg viewBox="0 0 20 20" fill="none" className="h-4 w-4">
        <circle cx="7.5" cy="7" r="2.8" stroke="currentColor" strokeWidth="1.6" />
        <circle cx="14" cy="8" r="2" stroke="currentColor" strokeWidth="1.6" />
        <path
          d="M2.5 16c.7-2.5 2.7-4 5-4s4.3 1.5 5 4M12.5 16c.5-1.8 2-3 4-3s3.5 1.2 4 3"
          stroke="currentColor"
          strokeWidth="1.6"
          strokeLinecap="round"
        />
      </svg>
    ),
  },
  {
    href: "/regression",
    label: "Regression",
    group: "config",
    adminOnly: true,
    icon: (
      <svg viewBox="0 0 20 20" fill="none" className="h-4 w-4">
        <path
          d="M3 16.5L6.5 12l3 2.5L13.5 9l3.5 4.5"
          stroke="currentColor"
          strokeWidth="1.6"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <circle cx="6.5" cy="12" r="1" fill="currentColor" />
        <circle cx="9.5" cy="14.5" r="1" fill="currentColor" />
        <circle cx="13.5" cy="9" r="1" fill="currentColor" />
      </svg>
    ),
  },
];

export function Sidebar({ user }: { user: UserContext | null }) {
  const pathname = usePathname();
  // Active matching — exact for "/", and for sub-routes (e.g. /roster has
  // /roster/instructors and /roster/engine below it) the deepest matching
  // item wins. Without the "no more-specific item also matches" guard,
  // visiting /roster/engine lit BOTH the Roster row and the Roster (engine)
  // row at the same time (Miguel 2026-06-26).
  const isActive = (href: string) => {
    if (href === "/") return pathname === "/";
    if (pathname !== href && !pathname.startsWith(href + "/")) return false;
    // Item matches the current path; check whether a more specific NAV
    // entry also matches — if so, defer to it.
    const moreSpecificMatches = NAV.some(
      (n) =>
        n.href !== href &&
        n.href.startsWith(href + "/") &&
        (pathname === n.href || pathname.startsWith(n.href + "/")),
    );
    return !moreSpecificMatches;
  };

  const groups: { id: NavItem["group"]; label: string }[] = [
    { id: "live", label: "Operación" },
    { id: "config", label: "Configuración" },
    // The "Administración" group renders only when the visible nav (after
    // adminOnly filtering) actually has items — keeps office sidebars
    // clean instead of showing an empty section header.
    { id: "admin", label: "Administración" },
  ];

  // Hide adminOnly items from non-admin users. Server-side route gates
  // (notFound() in /admin/users/page.tsx) are the real protection — this
  // is just UX so office staff don't see links they can't follow.
  const visibleNav = NAV.filter(
    (n) => !n.adminOnly || user?.role === "admin",
  );

  return (
    <aside className="hidden md:flex w-60 shrink-0 flex-col bg-abyss-rail border-r border-ink-200/70 text-ink-700 sticky top-0 h-screen self-start">
      {/* Brand block — DPM Diving official logo (transparent PNG). No
          background box / border / glow ring; the logo lives on the sidebar
          surface directly so the cyan stays cyan instead of bleeding into
          a tinted container. */}
      <div className="px-5 pt-6 pb-5 border-b border-ink-200/70">
        <Link href="/" className="flex items-center gap-2.5 group">
          {/* Plain <img>: icon.png is auto-served by Next.js metadata at the
              root URL `/icon.png`. object-contain preserves aspect ratio
              within the 40×40 box even though the source PNG is 115×141. */}
          <img
            src="/icon.png"
            alt="DPM Diving"
            width={40}
            height={40}
            className="h-10 w-10 object-contain transition-transform group-hover:scale-105"
          />
          <div className="leading-tight">
            <div className="text-sm font-semibold text-ink-900">DPM Diving</div>
            <div className="text-[10px] uppercase tracking-[0.14em] text-ink-500">
              Command Center
            </div>
          </div>
        </Link>
      </div>

      <nav className="flex-1 overflow-y-auto px-3 py-5 space-y-6 scrollbar-thin">
        {groups.map((g) => {
          const items = visibleNav.filter((n) => n.group === g.id);
          if (items.length === 0) return null;
          return (
          <div key={g.id} className="space-y-1">
            <div className="px-3 mb-1 text-[10px] font-semibold uppercase tracking-[0.16em] text-ink-500">
              {g.label}
            </div>
            {items.map((n) => {
              const active = isActive(n.href);
              return (
                <Link
                  key={n.href}
                  href={n.href}
                  className={[
                    "relative flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm transition-all",
                    active
                      ? "bg-brand-400/10 text-ink-900 shadow-[inset_0_0_0_1px_rgba(34,211,238,0.20)]"
                      : "text-ink-700 hover:bg-ink-200/50 hover:text-ink-900",
                  ].join(" ")}
                >
                  {/* Active rail — vertical neon bar on the left edge */}
                  {active && (
                    <span
                      className="absolute left-0 top-1.5 bottom-1.5 w-0.5 rounded-r bg-brand-400 shadow-[0_0_8px_0_rgba(34,211,238,0.7)]"
                      aria-hidden
                    />
                  )}
                  <span className={active ? "text-brand-300" : "text-ink-500"}>
                    {n.icon}
                  </span>
                  {n.label}
                </Link>
              );
            })}
          </div>
          );
        })}
      </nav>

      {/* Footer — account info, sign out, and pilot scope.
          Shows the current user's email + role/sede so each office staff
          member can see at a glance which account they're in. Sign-out is
          a POST form so it survives a hard refresh and can't be triggered
          by a malicious link. */}
      <div className="border-t border-ink-200/70 px-3 py-3 space-y-2">
        <Link
          href="/account"
          className={[
            "flex items-center gap-2 rounded-lg px-3 py-2 text-sm transition-all",
            isActive("/account")
              ? "bg-brand-400/10 text-ink-900 shadow-[inset_0_0_0_1px_rgba(34,211,238,0.20)]"
              : "text-ink-700 hover:bg-ink-200/50 hover:text-ink-900",
          ].join(" ")}
        >
          <svg viewBox="0 0 20 20" fill="none" className="h-4 w-4">
            <circle cx="10" cy="7" r="3" stroke="currentColor" strokeWidth="1.6" />
            <path
              d="M3.5 17c1.5-3 4-4.5 6.5-4.5s5 1.5 6.5 4.5"
              stroke="currentColor"
              strokeWidth="1.6"
              strokeLinecap="round"
            />
          </svg>
          Mi cuenta
        </Link>

        {user && (
          <div className="px-3 py-1 space-y-1">
            <div
              className="text-[11px] text-ink-600 truncate"
              title={user.email}
            >
              {user.email}
            </div>
            <div className="flex items-center gap-2 text-[11px]">
              <span className="relative flex h-2 w-2">
                <span className="absolute inset-0 rounded-full bg-ok-500 animate-pulseSoft" />
                <span className="absolute inset-0 rounded-full bg-ok-500 blur-[3px] opacity-80" />
              </span>
              {user.role === "admin" ? (
                <span className="text-ink-800 font-medium">
                  admin · todas las sedes
                </span>
              ) : user.sedeId === null ? (
                // Miguel 2026-07-01 #7 — cross-sede oficina cohort
                // (role=office + sedeId=null). Show a clear label so
                // the operator knows they can see every sede, not
                // "sede no encontrada" which reads like a bug.
                <span className="text-ink-800 font-medium">
                  oficina · todas las sedes
                </span>
              ) : (
                <>
                  <span className="text-ink-600">oficina ·</span>
                  <span className="text-ink-800 font-medium">
                    {user.sedeName ?? "(sede no encontrada)"}
                  </span>
                </>
              )}
            </div>
          </div>
        )}

        <form action={signOut}>
          <button
            type="submit"
            className="w-full flex items-center gap-2 rounded-lg px-3 py-2 text-sm text-ink-700 hover:bg-bad-500/10 hover:text-bad-700 transition-colors"
          >
            <svg viewBox="0 0 20 20" fill="none" className="h-4 w-4">
              <path
                d="M12 4.5h3a1.5 1.5 0 011.5 1.5v8a1.5 1.5 0 01-1.5 1.5h-3"
                stroke="currentColor"
                strokeWidth="1.6"
                strokeLinecap="round"
              />
              <path
                d="M9 13l3-3-3-3M3 10h9"
                stroke="currentColor"
                strokeWidth="1.6"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
            Cerrar sesión
          </button>
        </form>
      </div>
    </aside>
  );
}
