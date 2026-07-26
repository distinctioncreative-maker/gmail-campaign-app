"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { fetchJson } from "@/lib/fetchJson";
import { useToast } from "@/components/ui/UIProviders";

interface Invite {
  email: string;
  role: string;
  status: "PENDING" | "ACCEPTED";
}

/**
 * Invite teammates by email. Works for team workspaces, and for a Solo
 * workspace it turns it into a team on the first invite. The invited person
 * joins automatically the next time they sign in.
 */
export function InviteTeamCard({ solo = false }: { solo?: boolean }) {
  const router = useRouter();
  const toast = useToast();
  const [invites, setInvites] = useState<Invite[]>([]);
  const [email, setEmail] = useState("");
  const [role, setRole] = useState("SALES_REP");
  const [busy, setBusy] = useState(false);

  async function load() {
    try {
      const res = await fetchJson<{ invites: Invite[] }>("/api/invites");
      setInvites(res.invites ?? []);
    } catch {
      /* Solo workspaces have none yet; ignore. */
    }
  }
  useEffect(() => {
    // Loads after the fetch resolves, not synchronously in the effect.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load();
  }, []);

  async function invite() {
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
      toast("Enter a valid email address.", "error");
      return;
    }
    setBusy(true);
    try {
      const res = await fetchJson<{ message?: string }>("/api/invites", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: email.trim(), role }),
      });
      toast(res.message ?? "Invitation ready.", "success");
      setEmail("");
      await load();
      router.refresh();
    } catch (err) {
      toast(err instanceof Error ? err.message : "Could not send the invite.", "error");
    } finally {
      setBusy(false);
    }
  }

  async function revoke(target: string) {
    try {
      await fetchJson("/api/invites", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: target }),
      });
      await load();
    } catch (err) {
      toast(err instanceof Error ? err.message : "Could not revoke.", "error");
    }
  }

  const pending = invites.filter((i) => i.status === "PENDING");

  return (
    <div className="card p-6">
      <h2 className="font-medium">{solo ? "Invite a teammate" : "Invite teammates"}</h2>
      <p className="mt-1 text-sm text-slate-600">
        {solo
          ? "Add someone by email to turn your workspace into a shared team. They join automatically when they sign in."
          : "Add teammates by email. They join your workspace automatically the next time they sign in."}
      </p>

      <div className="mt-4 flex flex-wrap items-center gap-2">
        <input
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="teammate@company.com"
          className="min-w-0 flex-1 rounded-xl border border-border bg-white px-3 py-2 text-sm"
        />
        <select
          value={role}
          onChange={(e) => setRole(e.target.value)}
          className="rounded-xl border border-border bg-white px-3 py-2 text-sm"
        >
          <option value="SALES_REP">Sales Rep</option>
          <option value="MANAGER">Team Lead</option>
          <option value="ADMIN">Admin</option>
        </select>
        <button onClick={() => void invite()} disabled={busy} className="btn-primary px-4 py-2 text-sm disabled:opacity-50">
          {busy ? "Sending…" : "Send invite"}
        </button>
      </div>

      {pending.length > 0 && (
        <ul className="mt-4 space-y-2">
          {pending.map((i) => (
            <li key={i.email} className="flex items-center justify-between rounded-lg bg-slate-50 px-3 py-2 text-sm">
              <span>
                <span className="font-medium">{i.email}</span>{" "}
                <span className="text-slate-500">· {i.role.toLowerCase().replace("_", " ")} · pending</span>
              </span>
              <button onClick={() => void revoke(i.email)} className="text-xs font-medium text-red-600 hover:underline">
                Revoke
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
