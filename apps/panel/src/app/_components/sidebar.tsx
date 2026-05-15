"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

type NavItem = {
  href: string;
  label: string;
  icon: React.ReactNode;
  group: "live" | "config";
};

const NAV: NavItem[] = [
  {
    href: "/",
    label: "Dashboard",
    group: "live",
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
    href: "/prompts",
    label: "Prompts",
    group: "config",
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
    href: "/regression",
    label: "Regression",
    group: "config",
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

export function Sidebar() {
  const pathname = usePathname();
  const isActive = (href: string) =>
    href === "/" ? pathname === "/" : pathname.startsWith(href);

  const groups: { id: NavItem["group"]; label: string }[] = [
    { id: "live", label: "Operación" },
    { id: "config", label: "Configuración" },
  ];

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
        {groups.map((g) => (
          <div key={g.id} className="space-y-1">
            <div className="px-3 mb-1 text-[10px] font-semibold uppercase tracking-[0.16em] text-ink-500">
              {g.label}
            </div>
            {NAV.filter((n) => n.group === g.id).map((n) => {
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
        ))}
      </nav>

      {/* Footer — account access + pilot status */}
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
        <div className="flex items-center gap-2 px-3 text-[11px]">
          <span className="relative flex h-2 w-2">
            <span className="absolute inset-0 rounded-full bg-ok-500 animate-pulseSoft" />
            <span className="absolute inset-0 rounded-full bg-ok-500 blur-[3px] opacity-80" />
          </span>
          <span className="text-ink-600">piloto · </span>
          <span className="text-ink-800 font-medium">Gili Trawangan</span>
        </div>
      </div>
    </aside>
  );
}
