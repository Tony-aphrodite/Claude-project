import Link from "next/link";

const links = [
  { href: "/", label: "Dashboard" },
  { href: "/conversations", label: "Conversaciones" },
  { href: "/prompts", label: "Prompts" },
  { href: "/follow-ups", label: "Follow-ups" },
  { href: "/regression", label: "Regression" },
];

export function Sidebar() {
  return (
    <aside className="w-56 border-r border-ink-200 bg-white p-4 flex flex-col gap-1">
      <div className="px-2 pb-4 mb-2 border-b border-ink-100">
        <div className="font-semibold text-ink-900">DPM Diving</div>
        <div className="text-xs text-ink-500">Claude integration</div>
      </div>
      {links.map((l) => (
        <Link
          key={l.href}
          href={l.href}
          className="rounded px-3 py-2 text-sm text-ink-700 hover:bg-ink-50 hover:text-ink-900"
        >
          {l.label}
        </Link>
      ))}
    </aside>
  );
}
