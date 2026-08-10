import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { handleApiErrors } from "@/lib/api";
import { requireOperator, requireStepUp } from "@/lib/auth/requireOperator";
import { revokeAllSessionsQuietly } from "@/lib/auth/sessions";
import { firestore } from "@/lib/firebase/admin";
import { PLAN_IDS } from "@/lib/billing/plans";
import { SignupModeSchema, SuspensionReasonSchema } from "@/schemas/platform";
import {
  banIdentity,
  clearPlanOverride,
  effectiveSignupMode,
  getPlatformSettings,
  listBans,
  listPlanOverrides,
  listPlatformAudit,
  listSuspensions,
  recordPlatformAudit,
  setPlanOverride,
  suspendWorkspace,
  unbanIdentity,
  unsuspendWorkspace,
  writePlatformSettings,
} from "@/lib/platform/state";

/**
 * The owner portal's API.
 *
 * One route with an explicit action, rather than a REST surface spread across a
 * dozen files. That is a deliberate choice for this particular endpoint: every
 * action here is privileged, so having exactly one place where the guard is
 * applied makes it impossible to add a platform action that forgets it. The
 * route-guard sweep in tests checks for `requireOperator` here, and a second
 * owner route would have to earn its own line in that test.
 *
 * Reads need an operator. Anything that changes state needs a recent sign-in as
 * well, because a five-day cookie should not be enough to suspend a customer.
 */

const ActionSchema = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("signup.mode"),
    mode: SignupModeSchema.nullable(),
  }),
  z.object({ action: z.literal("readonly.mode"), enabled: z.boolean() }),
  z.object({
    action: z.literal("sending.halted"),
    enabled: z.boolean(),
    reason: z.string().max(200).default(""),
  }),
  z.object({
    action: z.literal("notice.banner"),
    text: z.string().max(280).default(""),
    severity: z.enum(["INFO", "WARNING"]).default("INFO"),
  }),
  z.object({
    action: z.literal("workspace.suspend"),
    organizationId: z.string().min(1),
    reason: SuspensionReasonSchema,
    message: z.string().max(400).default(""),
    note: z.string().max(1000).default(""),
  }),
  z.object({
    action: z.literal("workspace.unsuspend"),
    organizationId: z.string().min(1),
  }),
  z.object({
    action: z.literal("identity.ban"),
    email: z.string().trim().email(),
    reason: SuspensionReasonSchema,
    note: z.string().max(1000).default(""),
  }),
  z.object({ action: z.literal("identity.unban"), email: z.string().trim().email() }),
  z.object({
    action: z.literal("plan.override"),
    organizationId: z.string().min(1),
    plan: z.enum(PLAN_IDS as [string, ...string[]]),
    // Required, because an override with no explanation is indistinguishable
    // from a mistake six months later.
    note: z.string().trim().min(1).max(400),
  }),
  z.object({
    action: z.literal("plan.override_cleared"),
    organizationId: z.string().min(1),
  }),
]);

export const GET = handleApiErrors(async () => {
  await requireOperator();
  const [settings, signupMode, suspensions, bans, overrides, audit] = await Promise.all([
    getPlatformSettings(),
    effectiveSignupMode(),
    listSuspensions(),
    listBans(),
    listPlanOverrides(),
    listPlatformAudit(50),
  ]);
  return NextResponse.json({
    settings,
    // The mode actually in force, which is the stored value or the deployment's
    // env fallback. Showing only the stored value would leave an operator
    // guessing on a deployment nobody has configured yet.
    signupMode,
    suspensions,
    bans,
    overrides,
    audit,
    plans: PLAN_IDS,
  });
});

export const POST = handleApiErrors(async (req: NextRequest) => {
  const input = ActionSchema.parse(await req.json());
  // Every action in this union is a state change, so every one of them steps up.
  const ctx = await requireStepUp(input.action);
  const by = ctx.email;

  switch (input.action) {
    case "signup.mode": {
      await writePlatformSettings({ signupMode: input.mode }, by);
      await recordPlatformAudit({
        action: "signup.mode",
        operatorEmail: by,
        subject: input.mode ?? "default",
        summary:
          input.mode === null
            ? `${by} returned signup to the deployment default.`
            : `${by} set signup to ${input.mode}.`,
        details: { mode: input.mode },
      });
      return NextResponse.json({ ok: true, signupMode: await effectiveSignupMode() });
    }

    case "readonly.mode": {
      await writePlatformSettings({ readOnlyMode: input.enabled }, by);
      await recordPlatformAudit({
        action: "readonly.mode",
        operatorEmail: by,
        summary: `${by} turned read-only mode ${input.enabled ? "on" : "off"}.`,
        details: { enabled: input.enabled },
      });
      return NextResponse.json({ ok: true });
    }

    case "sending.halted": {
      await writePlatformSettings(
        { sendingHalted: input.enabled, haltReason: input.reason },
        by
      );
      await recordPlatformAudit({
        action: "sending.halted",
        operatorEmail: by,
        summary: input.enabled
          ? `${by} halted all outbound sending across every workspace.`
          : `${by} resumed outbound sending.`,
        details: { enabled: input.enabled, reason: input.reason },
      });
      return NextResponse.json({ ok: true });
    }

    case "notice.banner": {
      await writePlatformSettings(
        { noticeBanner: input.text, noticeSeverity: input.severity },
        by
      );
      await recordPlatformAudit({
        action: "notice.banner",
        operatorEmail: by,
        summary:
          input.text === ""
            ? `${by} cleared the service notice.`
            : `${by} published a service notice.`,
        details: { severity: input.severity },
      });
      return NextResponse.json({ ok: true });
    }

    case "workspace.suspend": {
      await suspendWorkspace({
        organizationId: input.organizationId,
        reason: input.reason,
        message: input.message,
        note: input.note,
        suspendedByEmail: by,
      });
      // Sessions are revoked for every member, not just locked out on the next
      // request: a suspension that leaves live cookies working means whoever is
      // mid-session keeps going until their page reloads.
      const members = await firestore()
        .collection("organizations")
        .doc(input.organizationId)
        .collection("members")
        .limit(200)
        .get();
      for (const member of members.docs) {
        await revokeAllSessionsQuietly(member.id);
      }
      await recordPlatformAudit({
        action: "workspace.suspend",
        operatorEmail: by,
        subject: input.organizationId,
        summary: `${by} suspended workspace ${input.organizationId} (${input.reason}).`,
        details: { reason: input.reason, membersSignedOut: members.size },
      });
      return NextResponse.json({ ok: true, membersSignedOut: members.size });
    }

    case "workspace.unsuspend": {
      const lifted = await unsuspendWorkspace(input.organizationId);
      if (!lifted) {
        return NextResponse.json({ error: "That workspace is not suspended." }, { status: 404 });
      }
      await recordPlatformAudit({
        action: "workspace.unsuspend",
        operatorEmail: by,
        subject: input.organizationId,
        summary: `${by} lifted the suspension on workspace ${input.organizationId}.`,
      });
      return NextResponse.json({ ok: true });
    }

    case "identity.ban": {
      await banIdentity({
        email: input.email,
        reason: input.reason,
        note: input.note,
        bannedByEmail: by,
      });
      // The uid is not known from an email alone, so the live-session kill is
      // best effort via the user document. The ban itself is enforced in
      // requireUser on every request regardless, so a session that survives this
      // still fails on its next call.
      const user = await firestore()
        .collection("users")
        .where("email", "==", input.email.toLowerCase())
        .limit(1)
        .get();
      const uid = user.docs[0]?.id;
      if (uid) await revokeAllSessionsQuietly(uid);
      await recordPlatformAudit({
        action: "identity.ban",
        operatorEmail: by,
        subject: input.email,
        summary: `${by} banned ${input.email} (${input.reason}).`,
        details: { reason: input.reason, sessionRevoked: Boolean(uid) },
      });
      return NextResponse.json({ ok: true });
    }

    case "identity.unban": {
      const lifted = await unbanIdentity(input.email);
      if (!lifted) {
        return NextResponse.json({ error: "That address is not banned." }, { status: 404 });
      }
      await recordPlatformAudit({
        action: "identity.unban",
        operatorEmail: by,
        subject: input.email,
        summary: `${by} unbanned ${input.email}.`,
      });
      return NextResponse.json({ ok: true });
    }

    case "plan.override": {
      await setPlanOverride({
        organizationId: input.organizationId,
        plan: input.plan,
        note: input.note,
        setByEmail: by,
      });
      await recordPlatformAudit({
        action: "plan.override",
        operatorEmail: by,
        subject: input.organizationId,
        summary: `${by} put workspace ${input.organizationId} on ${input.plan}: ${input.note}`,
        details: { plan: input.plan },
      });
      return NextResponse.json({ ok: true });
    }

    case "plan.override_cleared": {
      const cleared = await clearPlanOverride(input.organizationId);
      if (!cleared) {
        return NextResponse.json({ error: "There is no override to clear." }, { status: 404 });
      }
      await recordPlatformAudit({
        action: "plan.override_cleared",
        operatorEmail: by,
        subject: input.organizationId,
        summary: `${by} cleared the plan override on workspace ${input.organizationId}.`,
      });
      return NextResponse.json({ ok: true });
    }
  }
});
