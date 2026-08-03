"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { CustomRoleDefinition } from "@/schemas/user";

interface MemberRow {
  userId: string;
  email: string;
  role: string;
  customRoleId: string | null;
  roleLabel: string | null;
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
  customRoles,
}: {
  currentUserId: string;
  members: MemberRow[];
  settings: Settings;
  customRoles: CustomRoleDefinition[];
}) {
  const router = useRouter();
  const [settings, setSettings] = useState(initialSettings);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  async function updateMember(userId: string, patch: { accessRoleId?: string; active?: boolean }) {
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

  const input = "rounded-xl border border-border px-3 py-2 text-sm";

  return (
    <div className="space-y-6">
      {notice && <p className="rounded-lg bg-info-soft p-3 text-sm text-info">{notice}</p>}

      <div className="card p-6">
        <h2 className="font-medium">Team members</h2>
        <div className="mt-4 overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="border-b border-border text-xs uppercase text-muted">
              <tr>
                <th className="px-3 py-2">Email</th>
                <th className="px-3 py-2">Role</th>
                <th className="px-3 py-2">Status</th>
              </tr>
            </thead>
            <tbody>
              {members.map((m) => (
                <tr key={m.userId} className="border-b border-border last:border-0">
                  <td className="px-3 py-2 font-medium">{m.email}</td>
                  <td className="px-3 py-2">
                    <select
                      value={m.customRoleId ? `custom:${m.customRoleId}` : `builtin:${m.role}`}
                      disabled={busy || m.userId === currentUserId}
                      onChange={(e) => updateMember(m.userId, { accessRoleId: e.target.value })}
                      className={input}
                    >
                      <optgroup label="Built-in access">
                        <option value="builtin:SALES_REP">Member</option>
                        <option value="builtin:MANAGER">Manager</option>
                        <option value="builtin:ADMIN">Administrator</option>
                      </optgroup>
                      {customRoles.length > 0 && (
                        <optgroup label="Custom roles">
                          {customRoles.map((role) => (
                            <option key={role.id} value={`custom:${role.id}`}>
                              {role.name}
                            </option>
                          ))}
                        </optgroup>
                      )}
                    </select>
                  </td>
                  <td className="px-3 py-2">
                    {m.userId === currentUserId ? (
                      <span className="text-xs text-muted">You</span>
                    ) : (
                      <button
                        onClick={() => updateMember(m.userId, { active: !m.active })}
                        disabled={busy}
                        className={`text-xs hover:underline ${m.active ? "text-danger" : "text-success"}`}
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

      <div className="card p-6">
        <h2 className="font-medium">Organization policies</h2>

        <label className="mt-4 block text-sm font-medium text-foreground">
          Prevent two reps emailing the same merchant
          <select
            value={settings.collisionPolicy}
            onChange={(e) => setSettings((s) => ({ ...s, collisionPolicy: e.target.value }))}
            className={`mt-1 block w-full ${input}`}
          >
            <option value="OFF">Off: each rep only sees their own history</option>
            <option value="PRIVATE_WARNING">Warn privately (no names revealed)</option>
            <option value="MANAGER_VISIBLE">Warn reps; team leads can see who contacted</option>
            <option value="BLOCK_RECENT_TEAM_CONTACT">Block recently team-contacted leads</option>
          </select>
        </label>

        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          <label className="text-sm font-medium text-foreground">
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
          <label className="text-sm font-medium text-foreground">
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
          className="mt-5 btn-primary px-5 py-2.5"
        >
          {busy ? "Saving…" : "Save policies"}
        </button>
      </div>
    </div>
  );
}
