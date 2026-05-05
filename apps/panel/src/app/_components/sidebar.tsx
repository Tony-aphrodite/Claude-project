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
    <aside className="hidden md:flex w-60 shrink-0 flex-col bg-ocean-gradient text-white">
      <div className="px-5 pt-6 pb-5 border-b border-white/10">
        <Link href="/" className="flex items-center gap-2.5">
          <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-white/10 ring-1 ring-inset ring-white/20">
            <svg viewBox="0 0 24 24" fill="none" className="h-5 w-5">
              <path
                d="M4 14c2.5-2 5.5-2 8 0s5.5 2 8 0M4 18c2.5-2 5.5-2 8 0s5.5 2 8 0"
                stroke="currentColor"
                strokeWidth="1.8"
                strokeLinecap="round"
              />
              <circle cx="12" cy="7" r="3" stroke="currentColor" strokeWidth="1.8" />
            </svg>
          </div>
          <div>
            <div className="text-sm font-semibold leading-tight">DPM Diving</div>
            <div className="text-[11px] text-white/60 leading-tight">Claude integration</div>
          </div>
        </Link>
      </div>

      <nav className="flex-1 overflow-y-auto px-3 py-4 space-y-6">
        {groups.map((g) => (
          <div key={g.id} className="space-y-1">
            <div className="px-3 text-[10px] font-semibold uppercase tracking-[0.12em] text-white/40">
              {g.label}
            </div>
            {NAV.filter((n) => n.group === g.id).map((n) => {
              const active = isActive(n.href);
              return (
                <Link
                  key={n.href}
                  href={n.href}
                  className={[
                    "flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm transition-all",
                    active
                      ? "bg-white/15 text-white shadow-inner"
                      : "text-white/75 hover:bg-white/8 hover:text-white",
                  ].join(" ")}
                >
                  <span
                    className={
                      active ? "text-brand-200" : "text-white/60"
                    }
                  >
                    {n.icon}
                  </span>
                  {n.label}
                  {active && (
                    <span className="ml-auto h-1.5 w-1.5 rounded-full bg-brand-300" />
                  )}
                </Link>
              );
            })}
          </div>
        ))}
      </nav>

      <div className="border-t border-white/10 px-5 py-4">
        <div className="flex items-center gap-2 text-[11px] text-white/60">
          <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulseSoft" />
          piloto: Gili Trawangan
        </div>
      </div>
    </aside>
  );
}
