"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";

/* ── Toasts ──────────────────────────────────────────────── */
type ToastVariant = "success" | "error" | "info";
interface Toast {
  id: number;
  message: string;
  variant: ToastVariant;
}
const ToastContext = createContext<(message: string, variant?: ToastVariant) => void>(() => {});
export function useToast() {
  return useContext(ToastContext);
}

/* ── Confirm and prompt ──────────────────────────────────── */
interface ConfirmOptions {
  title: string;
  body?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  danger?: boolean;
  /**
   * Ask for a value rather than a yes or no.
   *
   * This variant exists because without it three call sites reached for the
   * browser's native prompt(), which is the single cheapest-looking element a
   * web app can render: an operating-system chrome box, unstyled, unbrandable,
   * and blocking. A missing variant does not stop anyone needing the thing, it
   * just decides where they get it from.
   */
  prompt?: {
    label: string;
    placeholder?: string;
    initialValue?: string;
    /** Return an error string to keep the dialog open, or null to accept. */
    validate?: (value: string) => string | null;
  };
}

const ConfirmContext = createContext<(opts: ConfirmOptions) => Promise<boolean>>(async () => false);
const PromptContext = createContext<(opts: ConfirmOptions & { prompt: NonNullable<ConfirmOptions["prompt"]> }) => Promise<string | null>>(
  async () => null
);

export function useConfirm() {
  return useContext(ConfirmContext);
}

/** Resolves to the entered value, or null if the person cancelled. */
export function usePrompt() {
  return useContext(PromptContext);
}

export function UIProviders({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const nextId = useRef(1);

  const showToast = useCallback((message: string, variant: ToastVariant = "info") => {
    const id = nextId.current++;
    setToasts((t) => [...t, { id, message, variant }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 4200);
  }, []);

  const [confirmState, setConfirmState] = useState<
    (ConfirmOptions & { resolve: (v: string | boolean | null) => void }) | null
  >(null);
  const [promptValue, setPromptValue] = useState("");
  const [promptError, setPromptError] = useState<string | null>(null);

  const confirm = useCallback(
    (opts: ConfirmOptions) =>
      new Promise<boolean>((resolve) => {
        setPromptValue("");
        setPromptError(null);
        setConfirmState({ ...opts, prompt: undefined, resolve: (v) => resolve(v === true) });
      }),
    []
  );

  const promptFor = useCallback(
    (opts: ConfirmOptions & { prompt: NonNullable<ConfirmOptions["prompt"]> }) =>
      new Promise<string | null>((resolve) => {
        setPromptValue(opts.prompt.initialValue ?? "");
        setPromptError(null);
        setConfirmState({
          ...opts,
          resolve: (v) => resolve(typeof v === "string" ? v : null),
        });
      }),
    []
  );

  const dialogRef = useRef<HTMLDivElement>(null);
  /** Where focus was before the dialog opened, so it can be given back. */
  const returnFocusTo = useRef<HTMLElement | null>(null);

  const closeConfirm = useCallback(
    (value: string | boolean | null) => {
      setConfirmState((current) => {
        current?.resolve(value);
        return null;
      });
    },
    []
  );

  function submitConfirm() {
    if (!confirmState) return;
    if (confirmState.prompt) {
      const error = confirmState.prompt.validate?.(promptValue) ?? null;
      if (error) {
        setPromptError(error);
        return;
      }
      closeConfirm(promptValue);
      return;
    }
    closeConfirm(true);
  }

  /**
   * The behaviour a dialog needs in order to be one.
   *
   * This markup already claimed `role="dialog"` and `aria-modal="true"`, and
   * did none of it: Escape did nothing, Tab walked straight out into the page
   * behind, the page kept scrolling, and focus was dropped on the floor when it
   * closed. Announcing yourself as a modal to a screen reader while behaving
   * like a div is worse than not claiming it, because the claim is what a
   * keyboard or screen-reader user acts on.
   */
  useEffect(() => {
    if (!confirmState) return;
    returnFocusTo.current = document.activeElement as HTMLElement | null;

    const { overflow } = document.body.style;
    document.body.style.overflow = "hidden";

    function focusables(): HTMLElement[] {
      if (!dialogRef.current) return [];
      return [
        ...dialogRef.current.querySelectorAll<HTMLElement>(
          'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
        ),
      ].filter((el) => !el.hasAttribute("disabled"));
    }

    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        event.preventDefault();
        closeConfirm(null);
        return;
      }
      if (event.key !== "Tab") return;
      const items = focusables();
      if (items.length === 0) return;
      const first = items[0];
      const last = items[items.length - 1];
      const active = document.activeElement;
      // Wrap at both ends, which is what makes it a trap rather than a hint.
      if (event.shiftKey && active === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && active === last) {
        event.preventDefault();
        first.focus();
      }
    }

    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      document.body.style.overflow = overflow;
      returnFocusTo.current?.focus?.();
    };
  }, [confirmState, closeConfirm]);

  return (
    <ConfirmContext.Provider value={confirm}>
      <PromptContext.Provider value={promptFor}>
      <ToastContext.Provider value={showToast}>
        {children}

        {/* Toast stack */}
        <div className="pointer-events-none fixed bottom-4 right-4 z-toast flex w-80 max-w-[calc(100vw-2rem)] flex-col gap-2">
          {toasts.map((t) => (
            <div
              key={t.id}
              role="status"
              className={`pointer-events-auto animate-rise rounded-lg border px-4 py-3 text-sm shadow-lg ${
                t.variant === "success"
                  ? "alert-success text-success"
                  : t.variant === "error"
                    ? "alert-danger text-danger"
                    : "alert-info text-info"
              }`}
            >
              {t.message}
            </div>
          ))}
        </div>

        {/* Confirm and prompt */}
        {confirmState && (
          <div className="fixed inset-0 z-modal flex items-center justify-center p-4">
            <div
              className="absolute inset-0 bg-overlay"
              onClick={() => closeConfirm(null)}
              aria-hidden
            />
            <div
              ref={dialogRef}
              role="dialog"
              aria-modal="true"
              aria-labelledby="ui-dialog-title"
              className="relative w-full max-w-md animate-rise rounded-2xl border border-border bg-surface p-6 shadow-xl"
            >
              <h2 id="ui-dialog-title" className="text-lg text-foreground">
                {confirmState.title}
              </h2>
              {confirmState.body && <p className="mt-2 text-muted">{confirmState.body}</p>}

              {confirmState.prompt && (
                <div className="mt-4">
                  <label htmlFor="ui-dialog-input" className="block font-medium text-foreground">
                    {confirmState.prompt.label}
                  </label>
                  <input
                    id="ui-dialog-input"
                    autoFocus
                    value={promptValue}
                    placeholder={confirmState.prompt.placeholder}
                    onChange={(e) => {
                      setPromptValue(e.target.value);
                      if (promptError) setPromptError(null);
                    }}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        e.preventDefault();
                        submitConfirm();
                      }
                    }}
                    aria-invalid={promptError ? true : undefined}
                    aria-describedby={promptError ? "ui-dialog-error" : undefined}
                    className="mt-1.5 w-full"
                  />
                  {promptError && (
                    <p id="ui-dialog-error" role="alert" className="mt-1.5 text-sm text-danger">
                      {promptError}
                    </p>
                  )}
                </div>
              )}

              <div className="mt-6 flex justify-end gap-2">
                <button onClick={() => closeConfirm(null)} className="btn-ghost px-4 py-2 text-sm">
                  {confirmState.cancelLabel ?? "Cancel"}
                </button>
                <button
                  onClick={submitConfirm}
                  autoFocus={!confirmState.prompt}
                  className={
                    confirmState.danger
                      ? "btn-danger px-4 py-2 text-sm font-semibold"
                      : "btn-primary px-4 py-2 text-sm"
                  }
                >
                  {confirmState.confirmLabel ?? "Confirm"}
                </button>
              </div>
            </div>
          </div>
        )}
      </ToastContext.Provider>
      </PromptContext.Provider>
    </ConfirmContext.Provider>
  );
}
