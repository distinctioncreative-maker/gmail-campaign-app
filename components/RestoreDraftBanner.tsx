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
    <div className="mb-4 flex flex-wrap items-center justify-between gap-2 rounded-xl border border-amber-200 bg-amber-50 p-3">
      <p className="text-sm text-amber-800">
        💾 You have an unsaved {what} from before. Restore it?
      </p>
      <div className="flex gap-2">
        <button
          onClick={onRestore}
          className="rounded-lg bg-amber-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-amber-700"
        >
          Restore
        </button>
        <button
          onClick={onDiscard}
          className="rounded-lg px-3 py-1.5 text-sm font-medium text-amber-700 hover:bg-amber-100"
        >
          Discard
        </button>
      </div>
    </div>
  );
}
