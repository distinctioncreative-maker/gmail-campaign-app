"use client";

import { createContext, useCallback, useContext, useRef, useState, type ReactNode } from "react";

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

/* ── Confirm dialog ──────────────────────────────────────── */
interface ConfirmOptions {
  title: string;
  body?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  danger?: boolean;
}
const ConfirmContext = createContext<(opts: ConfirmOptions) => Promise<boolean>>(async () => false);
export function useConfirm() {
  return useContext(ConfirmContext);
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
    (ConfirmOptions & { resolve: (v: boolean) => void }) | null
  >(null);

  const confirm = useCallback(
    (opts: ConfirmOptions) => new Promise<boolean>((resolve) => setConfirmState({ ...opts, resolve })),
    []
  );

  function closeConfirm(value: boolean) {
    confirmState?.resolve(value);
    setConfirmState(null);
  }

  return (
    <ConfirmContext.Provider value={confirm}>
      <ToastContext.Provider value={showToast}>
        {children}

        {/* Toast stack */}
        <div className="pointer-events-none fixed bottom-4 right-4 z-[60] flex w-80 max-w-[calc(100vw-2rem)] flex-col gap-2">
          {toasts.map((t) => (
            <div
              key={t.id}
              role="status"
              className={`pointer-events-auto animate-rise rounded-xl border px-4 py-3 text-sm shadow-lg ${
                t.variant === "success"
                  ? "border-green-200 bg-green-50 text-green-800"
                  : t.variant === "error"
                    ? "border-red-200 bg-red-50 text-red-800"
                    : "border-slate-200 bg-white text-slate-800"
              }`}
            >
              {t.message}
            </div>
          ))}
        </div>

        {/* Confirm modal */}
        {confirmState && (
          <div className="fixed inset-0 z-[70] flex items-center justify-center p-4">
            <div className="absolute inset-0 bg-slate-900/40" onClick={() => closeConfirm(false)} aria-hidden />
            <div
              role="dialog"
              aria-modal="true"
              className="relative w-full max-w-md animate-rise rounded-2xl bg-white p-6 shadow-2xl"
            >
              <h2 className="text-lg font-semibold text-slate-900">{confirmState.title}</h2>
              {confirmState.body && <p className="mt-2 text-sm text-slate-600">{confirmState.body}</p>}
              <div className="mt-5 flex justify-end gap-2">
                <button onClick={() => closeConfirm(false)} className="btn-ghost px-4 py-2 text-sm">
                  {confirmState.cancelLabel ?? "Cancel"}
                </button>
                <button
                  onClick={() => closeConfirm(true)}
                  autoFocus
                  className={
                    confirmState.danger
                      ? "rounded-xl bg-red-600 px-4 py-2 text-sm font-semibold text-white hover:bg-red-700"
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
    </ConfirmContext.Provider>
  );
}
