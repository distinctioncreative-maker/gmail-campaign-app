"use client";

export function RestoreDraftBanner({
  onRestore,
  onDiscard,
  what = "draft",
}: {
  onRestore: () => void;
  onDiscard: () => void;
  what?: string;
}) {
  return (
    <div className="alert-warning mb-4 flex flex-wrap items-center justify-between gap-2 rounded-lg border p-3">
      <p className="text-sm text-warning">
        💾 You have an unsaved {what} from before. Restore it?
      </p>
      <div className="flex gap-2">
        <button
          onClick={onRestore}
          className="rounded-lg bg-warning px-3 py-1.5 text-sm font-medium text-warning-contrast hover:brightness-95"
        >
          Restore
        </button>
        <button
          onClick={onDiscard}
          className="rounded-lg px-3 py-1.5 text-sm font-medium text-warning hover:bg-warning-soft"
        >
          Discard
        </button>
      </div>
    </div>
  );
}
