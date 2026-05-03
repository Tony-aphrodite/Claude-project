// Reusable page header with title, eyebrow, and a slot for actions/filters.
// Centralizing this keeps the spacing rhythm consistent across pages without
// each page reinventing margins / typography.

import type { ReactNode } from "react";

export function PageHeader({
  eyebrow,
  title,
  description,
  actions,
}: {
  eyebrow?: string;
  title: string;
  description?: string;
  actions?: ReactNode;
}) {
  return (
    <header className="flex flex-wrap items-end justify-between gap-4 pb-4 border-b border-ink-200/60">
      <div className="space-y-1">
        {eyebrow && (
          <div className="text-[11px] font-semibold uppercase tracking-[0.12em] text-brand-600">
            {eyebrow}
          </div>
        )}
        <h1 className="h-page">{title}</h1>
        {description && (
          <p className="max-w-2xl text-sm text-ink-500 leading-relaxed">
            {description}
          </p>
        )}
      </div>
      {actions && <div className="flex items-end gap-2">{actions}</div>}
    </header>
  );
}
