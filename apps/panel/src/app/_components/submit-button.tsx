"use client";

// Submit button with built-in loading state. Reads the parent form's
// `pending` flag via React's `useFormStatus`, disables the button while
// the action is in flight, and swaps the label for a spinner + custom
// loading text.
//
// Why: Miguel feedback 2026-06-29 — "no hay loading effect, no sé si el
// sitio responde o no". Native `<button type="submit">` looks identical
// during a multi-second server action; users click again or assume the
// page is dead. This component makes every form submission feel responsive.
//
// Usage: drop in place of `<button type="submit">` inside any form that
// posts to a server action. Works with both `<form action={...}>` (server
// action) and `<form action={...}>` driven by `useActionState`.

import { useFormStatus } from "react-dom";
import type { ReactNode } from "react";

type SubmitButtonProps = {
  children: ReactNode;
  /** Label rendered while the action is pending. Defaults to "Procesando…". */
  loadingLabel?: ReactNode;
  className?: string;
  /** Visual variant. Matches the panel's button utilities. */
  variant?: "primary" | "ghost" | "danger" | "warn" | "subtle";
  /** Optional override of the disabled state (e.g. validation gates). */
  disabled?: boolean;
};

// Steve 2026-07-01 — cursor class is applied by the component itself
// (see below) based on whether we're `pending` (in-flight action →
// cursor-wait) vs `disabled by prop` (empty input / invalid state →
// cursor-not-allowed). Without this split the composer's "empty
// textbox" disabled buttons showed cursor-wait, which looked like
// they were loading forever.
const VARIANT_CLASSES: Record<NonNullable<SubmitButtonProps["variant"]>, string> = {
  primary:
    "bg-brand-500 text-white shadow-glow-soft hover:bg-brand-400 hover:shadow-glow active:scale-[0.98] disabled:bg-brand-500/40 disabled:shadow-none",
  ghost:
    "text-ink-700 hover:bg-ink-200/60 hover:text-ink-900 disabled:opacity-60",
  danger:
    "bg-bad-500/15 text-bad-700 ring-1 ring-inset ring-bad-500/40 hover:bg-bad-500/25 disabled:opacity-60",
  warn:
    "bg-warn-500/15 text-warn-700 ring-1 ring-inset ring-warn-500/40 hover:bg-warn-500/25 disabled:opacity-60",
  subtle:
    "text-ink-500 hover:text-brand-300 disabled:opacity-60",
};

export function SubmitButton({
  children,
  loadingLabel = "Procesando…",
  className,
  variant = "primary",
  disabled,
}: SubmitButtonProps) {
  const { pending } = useFormStatus();
  const isDisabled = pending || disabled;
  const variantCls = VARIANT_CLASSES[variant];
  const base =
    variant === "subtle"
      ? "inline-flex items-center gap-1.5 text-xs font-medium transition-all"
      : "inline-flex items-center justify-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-medium transition-all";
  // Cursor communicates STATE, not just "not-clickable":
  //   pending  → cursor-wait (a spinner-ish cursor — "in flight")
  //   disabled → cursor-not-allowed (the ⊘ cursor — "you can't now")
  // Before this split, empty-input disabled buttons showed cursor-wait
  // and users thought the panel was stuck loading. Steve 2026-07-01.
  const cursorCls = pending
    ? "cursor-wait"
    : disabled
      ? "cursor-not-allowed"
      : "";

  return (
    <button
      type="submit"
      disabled={isDisabled}
      aria-busy={pending}
      className={`${base} ${variantCls} ${cursorCls} ${className ?? ""}`}
    >
      {pending ? (
        <>
          <Spinner />
          <span>{loadingLabel}</span>
        </>
      ) : (
        children
      )}
    </button>
  );
}

function Spinner() {
  return (
    <svg
      className="h-3.5 w-3.5 animate-spin"
      xmlns="http://www.w3.org/2000/svg"
      fill="none"
      viewBox="0 0 24 24"
      aria-hidden="true"
    >
      <circle
        className="opacity-25"
        cx="12"
        cy="12"
        r="10"
        stroke="currentColor"
        strokeWidth="4"
      />
      <path
        className="opacity-75"
        fill="currentColor"
        d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z"
      />
    </svg>
  );
}
