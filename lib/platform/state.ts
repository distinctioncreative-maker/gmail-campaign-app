import "server-only";
import crypto from "node:crypto";
import { firestore } from "@/lib/firebase/admin";
import { env } from "@/lib/env";
import { reportError } from "@/lib/observability/report";
import {
  IdentityBanSchema,
  PlanOverrideSchema,
  PlatformAuditEntrySchema,
  PlatformSettingsSchema,
  SignupModeSchema,
  WorkspaceSuspensionSchema,
  type IdentityBan,
  type PlanOverride,
  type PlatformAuditAction,
  type PlatformAuditEntry,
  type PlatformSettings,
  type SignupMode,
  type SuspensionReason,
  type WorkspaceSuspension,
} from "@/schemas/platform";

/**
 * Reading and writing platform state.
 *
 * Everything here lives in top-level collections, outside every tenant. A
 * workspace purge recursively deletes its organization document, so a suspension
 * or an operator's audit entry filed inside it would be destroyed by the customer
 * it describes.
 *
 * **The settings and ban reads are cached, and that is a correctness requirement
 * rather than an optimization.** They are consulted on the authentication path of
 * every request and on every send. Without a cache, adding a platform control
 * would put two extra document reads in front of the entire product.
 *
 * The cache is per instance and short. A suspension therefore takes up to the TTL
 * to bite on an already-running instance, which is the deliberate trade: a
 * fifteen-second delay on a ban against two reads on every request forever. The
 * write path invalidates locally, so the operator's own view is immediate.
 */

const TTL_MS = 15_000;

const settingsDoc = () => firestore().collection("platform").doc("settings");
const suspensionsRef = () => firestore().collection("platformSuspensions");
const bansRef = () => firestore().collection("platformBans");
const overridesRef = () => firestore().collection("platformPlanOverrides");
const auditRef = () => firestore().collection("platformAuditLog");

let settingsCache: { at: number; value: PlatformSettings } | null = null;
let suspensionCache: { at: number; ids: Set<string> } | null = null;
let banCache: { at: number; emails: Set<string> } | null = null;
let overrideCache: { at: number; map: Map<string, string> } | null = null;

export function invalidatePlatformCache(): void {
  settingsCache = null;
  suspensionCache = null;
  banCache = null;
  overrideCache = null;
}

function defaults(): PlatformSettings {
  return PlatformSettingsSchema.parse({ updatedAt: 0, updatedByEmail: "" });
}

export async function getPlatformSettings(): Promise<PlatformSettings> {
  if (settingsCache && Date.now() - settingsCache.at < TTL_MS) return settingsCache.value;
  try {
    const snap = await settingsDoc().get();
    const value = snap.exists ? PlatformSettingsSchema.parse(snap.data()) : defaults();
    settingsCache = { at: Date.now(), value };
    return value;
  } catch (err) {
    // Fails open to the defaults rather than throwing. This is read on the
    // authentication path, and a Firestore blip must not lock everybody out of
    // the product; the defaults are the least surprising behaviour, not the most
    // permissive one, because readOnlyMode and sendingHalted both default off and
    // signupMode falls back to the deployment's env setting.
    reportError(err, { scope: "platform.settings" });
    return defaults();
  }
}

/**
 * The signup mode in force.
 *
 * Stored value wins; an unset stored value falls back to the deployment's env
 * var, which is why the field is nullable rather than defaulted. An unrecognised
 * env value reads as `allowlist`, the closed-by-default option: a typo in
 * configuration must not open public signup.
 */
export async function effectiveSignupMode(): Promise<SignupMode> {
  const settings = await getPlatformSettings();
  if (settings.signupMode !== null) return settings.signupMode;
  const parsed = SignupModeSchema.safeParse(String(env.SIGNUP_MODE ?? "").toLowerCase());
  return parsed.success ? parsed.data : "allowlist";
}

export async function writePlatformSettings(
  patch: Partial<Omit<PlatformSettings, "updatedAt" | "updatedByEmail">>,
  operatorEmail: string
): Promise<PlatformSettings> {
  const current = await getPlatformSettings();
  const next = PlatformSettingsSchema.parse({
    ...current,
    ...patch,
    updatedAt: Date.now(),
    updatedByEmail: operatorEmail,
  });
  await settingsDoc().set(next);
  invalidatePlatformCache();
  return next;
}

/* ------------------------------------------------------------------ bans */

function banKey(email: string): string {
  return String(email ?? "").trim().toLowerCase();
}

/**
 * The full ban list, cached as a set.
 *
 * Loaded whole rather than point-read per sign-in because the list is small by
 * nature and a set membership test costs nothing, while a document read per
 * authenticated request costs on every page of every session. If this ever grows
 * past a few hundred, it becomes a point read with its own cache.
 */
export async function bannedEmails(): Promise<Set<string>> {
  if (banCache && Date.now() - banCache.at < TTL_MS) return banCache.emails;
  try {
    const snap = await bansRef().limit(500).get();
    const emails = new Set(snap.docs.map((doc) => banKey(String(doc.data()?.email ?? ""))));
    banCache = { at: Date.now(), emails };
    return emails;
  } catch (err) {
    reportError(err, { scope: "platform.bans" });
    // Fails open. A ban that stops applying during an outage is bad; locking
    // every customer out of the product because the ban list could not be read is
    // worse, and the audit trail makes the former recoverable.
    return banCache?.emails ?? new Set();
  }
}

export async function isEmailBanned(email: string): Promise<boolean> {
  const key = banKey(email);
  if (key === "") return false;
  return (await bannedEmails()).has(key);
}

export async function banIdentity(input: {
  email: string;
  reason: SuspensionReason;
  note: string;
  bannedByEmail: string;
}): Promise<IdentityBan> {
  const key = banKey(input.email);
  const record: IdentityBan = IdentityBanSchema.parse({
    email: key,
    reason: input.reason,
    note: input.note,
    bannedByEmail: input.bannedByEmail,
    bannedAt: Date.now(),
  });
  await bansRef().doc(key).set(record);
  invalidatePlatformCache();
  return record;
}

export async function unbanIdentity(email: string): Promise<boolean> {
  const key = banKey(email);
  const ref = bansRef().doc(key);
  if (!(await ref.get()).exists) return false;
  await ref.delete();
  invalidatePlatformCache();
  return true;
}

export async function listBans(): Promise<IdentityBan[]> {
  const snap = await bansRef().limit(200).get();
  return snap.docs
    .map((doc) => IdentityBanSchema.parse(doc.data()))
    .sort((a, b) => b.bannedAt - a.bannedAt);
}

/* ----------------------------------------------------------- suspensions */

export async function suspendedOrganizationIds(): Promise<Set<string>> {
  if (suspensionCache && Date.now() - suspensionCache.at < TTL_MS) return suspensionCache.ids;
  try {
    const snap = await suspensionsRef().limit(500).get();
    const ids = new Set(snap.docs.map((doc) => doc.id));
    suspensionCache = { at: Date.now(), ids };
    return ids;
  } catch (err) {
    reportError(err, { scope: "platform.suspensions" });
    return suspensionCache?.ids ?? new Set();
  }
}

export async function isOrganizationSuspended(organizationId: string): Promise<boolean> {
  if (!organizationId) return false;
  return (await suspendedOrganizationIds()).has(organizationId);
}

export async function getSuspension(
  organizationId: string
): Promise<WorkspaceSuspension | null> {
  const snap = await suspensionsRef().doc(organizationId).get();
  return snap.exists ? WorkspaceSuspensionSchema.parse(snap.data()) : null;
}

export async function suspendWorkspace(input: {
  organizationId: string;
  reason: SuspensionReason;
  message: string;
  note: string;
  suspendedByEmail: string;
}): Promise<WorkspaceSuspension> {
  const record: WorkspaceSuspension = WorkspaceSuspensionSchema.parse({
    organizationId: input.organizationId,
    reason: input.reason,
    message: input.message,
    note: input.note,
    suspendedByEmail: input.suspendedByEmail,
    suspendedAt: Date.now(),
  });
  await suspensionsRef().doc(input.organizationId).set(record);
  invalidatePlatformCache();
  return record;
}

export async function unsuspendWorkspace(organizationId: string): Promise<boolean> {
  const ref = suspensionsRef().doc(organizationId);
  if (!(await ref.get()).exists) return false;
  await ref.delete();
  invalidatePlatformCache();
  return true;
}

export async function listSuspensions(): Promise<WorkspaceSuspension[]> {
  const snap = await suspensionsRef().limit(200).get();
  return snap.docs
    .map((doc) => WorkspaceSuspensionSchema.parse(doc.data()))
    .sort((a, b) => b.suspendedAt - a.suspendedAt);
}

/* -------------------------------------------------------- plan overrides */

/**
 * Every override as a map, cached.
 *
 * Read wherever a plan is resolved, which is on most authenticated pages, so a
 * document read per call would tax the whole product for a feature that applies
 * to a handful of workspaces. Overrides are rare and small by nature.
 */
export async function planOverrideMap(): Promise<Map<string, string>> {
  if (overrideCache && Date.now() - overrideCache.at < TTL_MS) return overrideCache.map;
  try {
    const snap = await overridesRef().limit(500).get();
    const map = new Map<string, string>(
      snap.docs.map((doc) => [doc.id, String(doc.data()?.plan ?? "")])
    );
    overrideCache = { at: Date.now(), map };
    return map;
  } catch (err) {
    reportError(err, { scope: "platform.overrides" });
    return overrideCache?.map ?? new Map();
  }
}

export async function getPlanOverride(organizationId: string): Promise<PlanOverride | null> {
  const snap = await overridesRef().doc(organizationId).get();
  return snap.exists ? PlanOverrideSchema.parse(snap.data()) : null;
}

export async function setPlanOverride(input: {
  organizationId: string;
  plan: string;
  note: string;
  setByEmail: string;
}): Promise<PlanOverride> {
  const record: PlanOverride = PlanOverrideSchema.parse({
    organizationId: input.organizationId,
    plan: input.plan,
    note: input.note,
    setByEmail: input.setByEmail,
    setAt: Date.now(),
  });
  await overridesRef().doc(input.organizationId).set(record);
  invalidatePlatformCache();
  return record;
}

export async function clearPlanOverride(organizationId: string): Promise<boolean> {
  const ref = overridesRef().doc(organizationId);
  if (!(await ref.get()).exists) return false;
  await ref.delete();
  invalidatePlatformCache();
  return true;
}

export async function listPlanOverrides(): Promise<PlanOverride[]> {
  const snap = await overridesRef().limit(200).get();
  return snap.docs
    .map((doc) => PlanOverrideSchema.parse(doc.data()))
    .sort((a, b) => b.setAt - a.setAt);
}

/* ---------------------------------------------------------------- audit */

/**
 * Record an operator action.
 *
 * Unlike the per-workspace audit log, a failure here is reported *and* raised to
 * the caller's attention through the return value, because the actions this
 * records are the ones where "we cannot prove who did that" is the actual
 * problem. The route still completes: refusing to suspend a spamming workspace
 * because the log write failed would be the wrong way round.
 */
export async function recordPlatformAudit(input: {
  action: PlatformAuditAction;
  operatorEmail: string;
  subject?: string;
  summary: string;
  details?: Record<string, string | number | boolean | null>;
}): Promise<boolean> {
  try {
    const entry: PlatformAuditEntry = PlatformAuditEntrySchema.parse({
      entryId: crypto.randomUUID(),
      action: input.action,
      operatorEmail: input.operatorEmail,
      subject: input.subject ?? "",
      summary: input.summary,
      details: input.details ?? {},
      at: Date.now(),
    });
    await auditRef().doc(entry.entryId).set(entry);
    return true;
  } catch (err) {
    reportError(err, { scope: "platform.audit", kind: input.action });
    return false;
  }
}

export async function listPlatformAudit(limit = 100): Promise<PlatformAuditEntry[]> {
  const snap = await auditRef().orderBy("at", "desc").limit(Math.min(limit, 250)).get();
  return snap.docs.map((doc) => PlatformAuditEntrySchema.parse(doc.data()));
}
