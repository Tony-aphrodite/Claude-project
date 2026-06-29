"use client";

// Generic client-side form wrapper. Three jobs in one component:
//
//   1) Error capture — turns the action's thrown Errors into an inline
//      red banner inside the form instead of Vercel's "Application
//      error" full-page bailout. The wrapper catches every throw
//      using a try/catch wrapped server-action call, exposed via
//      useActionState.
//
//   2) Auto-refresh — after a successful action, calls
//      `router.refresh()` so server components re-fetch and the new
//      data appears without a manual reload. revalidatePath inside the
//      action already invalidates the cache; router.refresh() is the
//      explicit client-side trigger that pulls the new payload.
//
//   3) Reset on success — clears the form fields after a successful
//      submission so the operator can immediately load another row
//      without re-typing or seeing stale values.
//
// Why: Miguel feedback 2026-06-29.
//   - "Cargar walk-in 단추를 눌렀을 때 사이트 전체가 파괴된 것처럼 현시" →
//     error capture path.
//   - "Marcar todo 단추를 눌렀을 때 수동으로 reload 를 해야 합니다" →
//     auto-refresh path.

import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { FormEvent, ReactNode } from "react";

type ActionFormProps = {
  /** Server action receiving FormData. Throw on validation failure. */
  action: (formData: FormData) => Promise<unknown> | unknown;
  /** Inputs + buttons. Same shape as a native <form>. */
  children: ReactNode;
  className?: string;
  /** Reset the form fields after a successful submit. Default: false. */
  resetOnSuccess?: boolean;
  /** Optional success message shown briefly above the form. */
  successMessage?: string;
  /** Where the banner appears: 'top' (default) or 'bottom'. */
  errorPosition?: "top" | "bottom";
};

export function ActionForm({
  action,
  children,
  className,
  resetOnSuccess = false,
  successMessage,
  errorPosition = "top",
}: ActionFormProps) {
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [showSuccess, setShowSuccess] = useState(false);
  const [isPending, startTransition] = useTransition();
  const router = useRouter();
  const formRef = useRef<HTMLFormElement>(null);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setErrorMessage(null);
    setShowSuccess(false);
    const formData = new FormData(event.currentTarget);
    const formEl = event.currentTarget;

    startTransition(async () => {
      try {
        await action(formData);
        // Refresh server components so the table / list under the form
        // shows the new row immediately.
        router.refresh();
        if (resetOnSuccess) {
          formEl.reset();
        }
        if (successMessage) {
          setShowSuccess(true);
          // Auto-dismiss after 2.5s — non-blocking confirmation.
          setTimeout(() => setShowSuccess(false), 2500);
        }
      } catch (err) {
        const message =
          err instanceof Error ? err.message : "Algo salió mal. Reintentá.";
        setErrorMessage(message);
      }
    });
  }

  // Auto-dismiss errors when the user starts typing again — they're
  // probably fixing the input that triggered it.
  useEffect(() => {
    if (!errorMessage) return;
    const form = formRef.current;
    if (!form) return;
    const onInput = () => setErrorMessage(null);
    form.addEventListener("input", onInput);
    return () => form.removeEventListener("input", onInput);
  }, [errorMessage]);

  return (
    <form ref={formRef} onSubmit={onSubmit} className={className} noValidate>
      {errorPosition === "top" && errorMessage ? (
        <ErrorBanner message={errorMessage} onDismiss={() => setErrorMessage(null)} />
      ) : null}
      {showSuccess && successMessage ? (
        <div className="mb-3 rounded-lg border border-ok-500/40 bg-ok-500/10 px-3 py-2 text-xs text-ok-700">
          ✓ {successMessage}
        </div>
      ) : null}
      <fieldset
        disabled={isPending}
        className="contents disabled:cursor-wait"
      >
        {children}
      </fieldset>
      {errorPosition === "bottom" && errorMessage ? (
        <ErrorBanner message={errorMessage} onDismiss={() => setErrorMessage(null)} />
      ) : null}
    </form>
  );
}

function ErrorBanner({
  message,
  onDismiss,
}: {
  message: string;
  onDismiss: () => void;
}) {
  return (
    <div
      role="alert"
      className="mb-3 flex items-start gap-2 rounded-lg border border-bad-500/40 bg-bad-500/10 px-3 py-2 text-xs text-bad-700"
    >
      <span aria-hidden="true" className="mt-0.5 font-bold">
        ⚠
      </span>
      <p className="flex-1 whitespace-pre-wrap">{message}</p>
      <button
        type="button"
        onClick={onDismiss}
        className="text-bad-700/70 hover:text-bad-700"
        aria-label="Cerrar mensaje de error"
      >
        ×
      </button>
    </div>
  );
}
