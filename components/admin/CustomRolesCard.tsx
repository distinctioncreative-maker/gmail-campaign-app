"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { fetchJson } from "@/lib/fetchJson";
import { useConfirm, useToast } from "@/components/ui/UIProviders";
import type { CustomRoleDefinition } from "@/schemas/user";
import type { Role } from "@/schemas/common";

const ACCESS_LABELS: Record<Role, string> = {
  SALES_REP: "Member access",
  MANAGER: "Manager access",
  ADMIN: "Administrator access",
};

const field =
  "min-h-11 rounded-xl border border-border bg-surface px-3 py-2 text-sm text-foreground focus:border-primary focus:outline-none focus:ring-2 focus:ring-border";

export function CustomRolesCard({ roles }: { roles: CustomRoleDefinition[] }) {
  const router = useRouter();
  const toast = useToast();
  const confirm = useConfirm();
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [baseRole, setBaseRole] = useState<Role>("SALES_REP");
  const [busy, setBusy] = useState(false);

  async function createRole() {
    if (name.trim().length < 2) return;
    setBusy(true);
    try {
      const result = await fetchJson<{ message?: string }>("/api/admin/custom-roles", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: name.trim(), description: description.trim(), baseRole }),
      });
      toast(result.message ?? "Custom role created.", "success");
      setName("");
      setDescription("");
      setBaseRole("SALES_REP");
      router.refresh();
    } catch (error) {
      toast(error instanceof Error ? error.message : "Could not create the role.", "error");
    } finally {
      setBusy(false);
    }
  }

  async function deleteRole(role: CustomRoleDefinition) {
    const approved = await confirm({
      title: `Delete ${role.name}?`,
      body: "This works only after every member has been reassigned. Access permissions are never deleted implicitly.",
      confirmLabel: "Delete role",
      danger: true,
    });
    if (!approved) return;
    setBusy(true);
    try {
      const result = await fetchJson<{ message?: string }>("/api/admin/custom-roles", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: role.id }),
      });
      toast(result.message ?? "Custom role deleted.", "success");
      router.refresh();
    } catch (error) {
      toast(error instanceof Error ? error.message : "Could not delete the role.", "error");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="card p-6 sm:p-7" aria-labelledby="custom-roles-heading">
      <h2 id="custom-roles-heading" className="font-medium">Custom roles</h2>
      <p className="mt-1 max-w-3xl text-sm leading-6 text-muted">
        Create role names that match your organization. Each role maps to a tested access level,
        so a title can be customized without quietly granting new permissions.
      </p>

      {roles.length > 0 && (
        <ul className="mt-4 grid gap-3 lg:grid-cols-2">
          {roles.map((role) => (
            <li key={role.id} className="rounded-xl border border-border bg-surface-2 p-4">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="font-medium text-foreground">{role.name}</p>
                  <p className="mt-1 text-xs font-semibold uppercase tracking-wide text-info">
                    {ACCESS_LABELS[role.baseRole]}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => void deleteRole(role)}
                  disabled={busy}
                  className="min-h-11 rounded-lg px-3 text-xs font-medium text-danger hover:bg-danger-soft disabled:opacity-50"
                >
                  Delete
                </button>
              </div>
              {role.description && <p className="mt-2 text-sm text-muted">{role.description}</p>}
            </li>
          ))}
        </ul>
      )}

      <div className="mt-5 grid gap-3 lg:grid-cols-[minmax(0,0.8fr)_minmax(0,1.3fr)_minmax(12rem,0.7fr)_auto]">
        <label className="text-sm font-medium text-foreground">
          Role name
          <input
            value={name}
            onChange={(event) => setName(event.target.value)}
            maxLength={40}
            placeholder="Account strategist"
            className={`mt-1 w-full ${field}`}
          />
        </label>
        <label className="text-sm font-medium text-foreground">
          Description
          <input
            value={description}
            onChange={(event) => setDescription(event.target.value)}
            maxLength={160}
            placeholder="Owns outreach strategy and reporting"
            className={`mt-1 w-full ${field}`}
          />
        </label>
        <label className="text-sm font-medium text-foreground">
          Permission level
          <select
            value={baseRole}
            onChange={(event) => setBaseRole(event.target.value as Role)}
            className={`mt-1 w-full ${field}`}
          >
            {(Object.keys(ACCESS_LABELS) as Role[]).map((role) => (
              <option key={role} value={role}>{ACCESS_LABELS[role]}</option>
            ))}
          </select>
        </label>
        <button
          type="button"
          onClick={() => void createRole()}
          disabled={busy || name.trim().length < 2}
          className="btn-secondary min-h-11 self-end px-4 py-2 text-sm disabled:opacity-50"
        >
          {busy ? "Saving..." : "Create role"}
        </button>
      </div>
    </section>
  );
}
