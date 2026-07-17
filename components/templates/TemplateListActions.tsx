"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export function TemplateListActions({
  templateId,
  archived,
}: {
  templateId: string;
  archived: boolean;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  async function act(action: "duplicate" | "archive" | "restore") {
    setBusy(true);
    await fetch(`/api/templates/${templateId}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action }),
    });
    setBusy(false);
    router.refresh();
  }

  return (
    <div className="flex gap-3 text-xs">
      {archived ? (
        <button onClick={() => act("restore")} disabled={busy} className="text-primary hover:underline disabled:opacity-50">
          Restore
        </button>
      ) : (
        <>
          <button onClick={() => act("duplicate")} disabled={busy} className="text-primary hover:underline disabled:opacity-50">
            Duplicate
          </button>
          <button onClick={() => act("archive")} disabled={busy} className="text-slate-500 hover:underline disabled:opacity-50">
            Archive
          </button>
        </>
      )}
    </div>
  );
}
