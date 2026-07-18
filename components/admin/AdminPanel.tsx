"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

interface MemberRow {
  userId: string;
  email: string;
  role: string;
  active: boolean;
}

interface Settings {
  collisionPolicy: string;
  collisionBlockDays: number;
  sendConfirmThreshold: number;
}

export function AdminPanel({
  currentUserId,
  members,
  settings: initialSettings,
}: {
  currentUserId: string;
  members: MemberRow[];
  settings: Settings;
}) {
  const router = useRouter();
  const [settings, setSettings] = useState(initialSettings);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  async function updateMember(userId: string, patch: { role?: string; active?: boolean }) {
    setBusy(true);
    const res = await fetch("/api/admin/members", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ userId, ...patch }),
    });
    setBusy(false);
    if (!res.ok) {
      const b = await res.json();
      setNotice(b.error ?? "Could not update.");
      return;
    }
    router.refresh();
  }

  async function saveSettings() {
    setBusy(true);
    setNotice(null);
    const res = await fetch("/api/admin/settings", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(settings),
    });
    setBusy(false);
    setNotice(res.ok ? "Settings saved." : "Could not save settings.");
  }

  const input = "rounded-xl border border-slate-200 px-3 py-2 text-sm";

  return (
    <div className="space-y-6">
      {notice && <p className="rounded-lg bg-blue-50 p-3 text-sm text-blue-700">{notice}</p>}

      <div className="rounded-2xl bg-white p-6 shadow-sm">
        <h2 className="font-medium">Team members</h2>
        <div className="mt-4 overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="border-b border-slate-200 text-xs uppercase text-slate-500">
              <tr>
                <th className="px-3 py-2">Email</th>
                <th className="px-3 py-2">Role</th>
                <th className="px-3 py-2">Status</th>
              </tr>
            </thead>
            <tbody>
              {members.map((m) => (
                <tr key={m.userId} className="border-b border-slate-100 last:border-0">
                  <td className="px-3 py-2 font-medium">{m.email}</td>
                  <td className="px-3 py-2">
                    <select
                      value={m.role}
                      disabled={busy || m.userId === currentUserId}
                      onChange={(e) => updateMember(m.userId, { role: e.target.value })}
                      className={input}
                    >
                      <option value="SALES_REP">Sales rep</option>
                      <option value="MANAGER">Manager</option>
                      <option value="ADMIN">Admin</option>
                    </select>
                  </td>
                  <td className="px-3 py-2">
                    {m.userId === currentUserId ? (
                      <span className="text-xs text-slate-400">You</span>
                    ) : (
                      <button
                        onClick={() => updateMember(m.userId, { active: !m.active })}
                        disabled={busy}
                        className={`text-xs hover:underline ${m.active ? "text-red-600" : "text-green-600"}`}
                      >
                        {m.active ? "Disable" : "Enable"}
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div className="rounded-2xl bg-white p-6 shadow-sm">
        <h2 className="font-medium">Organization policies</h2>

        <label className="mt-4 block text-sm font-medium text-slate-700">
          Prevent two reps emailing the same merchant
          <select
            value={settings.collisionPolicy}
            onChange={(e) => setSettings((s) => ({ ...s, collisionPolicy: e.target.value }))}
            className={`mt-1 block w-full ${input}`}
          >
            <option value="OFF">Off — each rep only sees their own history</option>
            <option value="PRIVATE_WARNING">Warn privately (no names revealed)</option>
            <option value="MANAGER_VISIBLE">Warn reps; managers can see who contacted</option>
            <option value="BLOCK_RECENT_TEAM_CONTACT">Block recently team-contacted leads</option>
          </select>
        </label>

        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          <label className="text-sm font-medium text-slate-700">
            Block window (days)
            <input
              type="number"
              min={1}
              max={365}
              value={settings.collisionBlockDays}
              onChange={(e) => setSettings((s) => ({ ...s, collisionBlockDays: Number(e.target.value) }))}
              className={`mt-1 block w-full ${input}`}
            />
          </label>
          <label className="text-sm font-medium text-slate-700">
            Require typing SEND above this many recipients
            <input
              type="number"
              min={1}
              value={settings.sendConfirmThreshold}
              onChange={(e) => setSettings((s) => ({ ...s, sendConfirmThreshold: Number(e.target.value) }))}
              className={`mt-1 block w-full ${input}`}
            />
          </label>
        </div>

        <button
          onClick={saveSettings}
          disabled={busy}
          className="mt-5 rounded-xl bg-primary px-5 py-2.5 font-medium text-white hover:bg-primary-hover disabled:opacity-50"
        >
          {busy ? "Saving…" : "Save policies"}
        </button>
      </div>
    </div>
  );
}
