"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { fetchJson } from "@/lib/fetchJson";
import { useConfirm, useToast } from "@/components/ui/UIProviders";
import { orderTeamsByHierarchy } from "@/lib/teams/hierarchy";

export interface MemberOption {
  userId: string;
  email: string;
  role: string;
  teamId: string | null;
}

const field =
  "rounded-xl border border-border px-3 py-2 text-sm focus:border-primary focus:outline-none";

/** Admin panel: create teams, rename, pick leads, delete. */
export function TeamManager({
  teams,
  members,
}: {
  teams: Array<{
    teamId: string;
    name: string;
    leadUserId: string | null;
    parentTeamId: string | null;
  }>;
  members: MemberOption[];
}) {
  const router = useRouter();
  const toast = useToast();
  const confirm = useConfirm();
  const [busy, setBusy] = useState(false);
  const [newName, setNewName] = useState("");
  const [newLead, setNewLead] = useState("");
  const [newParent, setNewParent] = useState("");

  const leadCandidates = members.filter((m) => m.role === "MANAGER" || m.role === "ADMIN");

  async function call(path: string, init: RequestInit, done?: () => void) {
    setBusy(true);
    try {
      const res = await fetchJson<{ message?: string }>(path, init);
      toast(res.message ?? "Done.", "success");
      done?.();
      router.refresh();
    } catch (err) {
      toast(err instanceof Error ? err.message : "That didn't work: try again.", "error");
    } finally {
      setBusy(false);
    }
  }

  function createTeam() {
    if (!newName.trim()) return;
    void call(
      "/api/teams",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: newName.trim(),
          leadUserId: newLead || null,
          parentTeamId: newParent || null,
        }),
      },
      () => {
        setNewName("");
        setNewLead("");
        setNewParent("");
      }
    );
  }

  function setLead(teamId: string, leadUserId: string) {
    void call(`/api/teams/${teamId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ leadUserId: leadUserId || null }),
    });
  }

  function setParent(teamId: string, parentTeamId: string) {
    void call(`/api/teams/${teamId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ parentTeamId: parentTeamId || null }),
    });
  }

  async function removeTeam(teamId: string, name: string) {
    const ok = await confirm({
      title: `Delete team "${name}"?`,
      body: "Its members become unassigned. No campaigns or data are deleted.",
      danger: true,
      confirmLabel: "Delete team",
    });
    if (ok) void call(`/api/teams/${teamId}`, { method: "DELETE" });
  }

  return (
    <div className="card p-6 sm:p-7">
      <h2 className="font-medium">Teams</h2>
      <p className="mt-1 text-xs text-muted">
        Build your organization chart, choose each team&apos;s manager, and place members below.
        Managers inherit visibility and roster control for descendant teams.
      </p>

      {teams.length > 0 && (
        <div className="mt-4 space-y-2">
          {orderTeamsByHierarchy(teams).map(({ team: t, depth }) => (
            <div key={t.teamId} className="flex flex-wrap items-center gap-2 rounded-xl bg-surface-2 p-2.5">
              <span className="min-w-40 flex-1 text-sm font-medium" style={{ paddingLeft: `${depth * 18}px` }}>
                {depth > 0 && <span aria-hidden className="mr-2 text-muted">↳</span>}
                {t.name}
              </span>
              <label className="flex items-center gap-1.5 text-xs text-muted">
                Reports under
                <select
                  value={t.parentTeamId ?? ""}
                  onChange={(e) => setParent(t.teamId, e.target.value)}
                  disabled={busy}
                  className={field}
                >
                  <option value="">Top level</option>
                  {teams.filter((candidate) => candidate.teamId !== t.teamId).map((candidate) => (
                    <option key={candidate.teamId} value={candidate.teamId}>
                      {candidate.name}
                    </option>
                  ))}
                </select>
              </label>
              <label className="flex items-center gap-1.5 text-xs text-muted">
                Lead
                <select
                  value={t.leadUserId ?? ""}
                  onChange={(e) => setLead(t.teamId, e.target.value)}
                  disabled={busy}
                  className={field}
                >
                  <option value="">No lead</option>
                  {leadCandidates.map((m) => (
                    <option key={m.userId} value={m.userId}>
                      {m.email}
                    </option>
                  ))}
                </select>
              </label>
              <button
                onClick={() => void removeTeam(t.teamId, t.name)}
                disabled={busy}
                className="text-xs font-medium text-danger hover:underline disabled:opacity-50"
              >
                Delete
              </button>
            </div>
          ))}
        </div>
      )}

      <div className="mt-4 flex flex-wrap items-center gap-2">
        <input
          value={newName}
          onChange={(e) => setNewName(e.target.value)}
          placeholder="New team name"
          className={`${field} w-44`}
        />
        <select value={newLead} onChange={(e) => setNewLead(e.target.value)} className={field}>
          <option value="">Pick a lead (optional)</option>
          {leadCandidates.map((m) => (
            <option key={m.userId} value={m.userId}>
              {m.email}
            </option>
          ))}
        </select>
        <select value={newParent} onChange={(e) => setNewParent(e.target.value)} className={field}>
          <option value="">Top-level team</option>
          {teams.map((team) => (
            <option key={team.teamId} value={team.teamId}>
              Under {team.name}
            </option>
          ))}
        </select>
        <button onClick={createTeam} disabled={busy || !newName.trim()} className="btn-primary px-4 py-2 text-sm">
          Create team
        </button>
      </div>
      <p className="mt-2 text-xs text-muted">
        Team managers need Manager or Administrator access. Custom role names can map to either level in Administration.
      </p>
    </div>
  );
}

/** Add/remove reps on one team: shown to that team's lead and admins. */
export function RosterActions({
  teamId,
  assignable,
}: {
  teamId: string;
  assignable: MemberOption[];
}) {
  const router = useRouter();
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  const [pick, setPick] = useState("");

  async function add() {
    if (!pick) return;
    setBusy(true);
    try {
      const res = await fetchJson<{ message?: string }>(`/api/teams/${teamId}/members`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId: pick, action: "add" }),
      });
      toast(res.message ?? "Added.", "success");
      setPick("");
      router.refresh();
    } catch (err) {
      toast(err instanceof Error ? err.message : "Could not add them.", "error");
    } finally {
      setBusy(false);
    }
  }

  if (assignable.length === 0) return null;
  return (
    <div className="flex items-center gap-2">
      <select value={pick} onChange={(e) => setPick(e.target.value)} className={field}>
        <option value="">Add a rep…</option>
        {assignable.map((m) => (
          <option key={m.userId} value={m.userId}>
            {m.email}
            {m.teamId ? " (on another team)" : ""}
          </option>
        ))}
      </select>
      <button onClick={() => void add()} disabled={busy || !pick} className="btn-secondary px-3 py-2 text-sm">
        Add
      </button>
    </div>
  );
}

/** Remove one rep from a team (lead of that team or admin). */
export function RemoveFromTeamButton({
  teamId,
  userId,
  email,
}: {
  teamId: string;
  userId: string;
  email: string;
}) {
  const router = useRouter();
  const toast = useToast();
  const confirm = useConfirm();
  const [busy, setBusy] = useState(false);

  async function remove() {
    const ok = await confirm({
      title: "Remove from team?",
      body: `${email} keeps all their campaigns and data: they just leave this team.`,
      confirmLabel: "Remove",
    });
    if (!ok) return;
    setBusy(true);
    try {
      const res = await fetchJson<{ message?: string }>(`/api/teams/${teamId}/members`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId, action: "remove" }),
      });
      toast(res.message ?? "Removed.", "success");
      router.refresh();
    } catch (err) {
      toast(err instanceof Error ? err.message : "Could not remove them.", "error");
    } finally {
      setBusy(false);
    }
  }

  return (
    <button
      onClick={() => void remove()}
      disabled={busy}
      className="text-xs font-medium text-danger hover:underline disabled:opacity-50"
    >
      Remove
    </button>
  );
}
