import { z } from "zod";
import { EpochMillis, RoleSchema } from "./common";

/** WORKSPACE = a shared, team-based org keyed by a custom email domain
 * (Enterprise mode). CONSUMER = a single-person private workspace for a
 * generic provider account like gmail.com (Solo mode). Defaults to WORKSPACE
 * so pre-existing docs stay valid. */
export const TenantTypeSchema = z.enum(["WORKSPACE", "CONSUMER"]).default("WORKSPACE");
export type TenantType = z.infer<typeof TenantTypeSchema>;

export const OnboardingStatusSchema = z.enum([
  "NEW",
  "GMAIL_CONNECTED",
  "PROFILE_COMPLETE",
  "DEFAULTS_SET",
  "TEST_PASSED",
  "COMPLETE",
]);

export const WorkspaceProfileSchema = z.object({
  industry: z.string().trim().max(80).default(""),
  teamSize: z
    .enum(["JUST_ME", "2_5", "6_20", "21_50", "51_PLUS"])
    .default("JUST_ME"),
  monthlyEmailGoal: z
    .enum(["UNDER_500", "500_2000", "2001_10000", "10000_PLUS", "NOT_SURE"])
    .default("NOT_SURE"),
  primaryUseCase: z
    .enum([
      "SALES",
      "AGENCY",
      "RECRUITING",
      "FUNDRAISING",
      "PARTNERSHIPS",
      "CUSTOMER_SUCCESS",
      "OTHER",
    ])
    .default("SALES"),
  configuredAt: EpochMillis.nullable().default(null),
});
export type WorkspaceProfile = z.infer<typeof WorkspaceProfileSchema>;

/** Workspace-defined role names map to one of the three audited permission
 * levels. The name is customizable; the security boundary is not. */
export const CustomRoleDefinitionSchema = z.object({
  id: z.string().min(1).max(100),
  name: z.string().trim().min(2).max(40),
  description: z.string().trim().max(160).default(""),
  baseRole: RoleSchema,
});
export type CustomRoleDefinition = z.infer<typeof CustomRoleDefinitionSchema>;

export const UserSchema = z.object({
  userId: z.string().min(1),
  organizationId: z.string().min(1),
  email: z.string().email(),
  displayName: z.string(),
  role: RoleSchema,
  roleLabel: z.string().trim().max(40).nullable().default(null),
  active: z.boolean(),
  tenantType: TenantTypeSchema,
  onboardingStatus: OnboardingStatusSchema,
  timezone: z.string().default("America/New_York"),
  createdAt: EpochMillis,
  updatedAt: EpochMillis,
  lastLoginAt: EpochMillis.nullable(),
});
export type User = z.infer<typeof UserSchema>;

export const MemberSchema = z.object({
  userId: z.string().min(1),
  organizationId: z.string().min(1),
  email: z.string().email(),
  role: RoleSchema,
  customRoleId: z.string().max(100).nullable().default(null),
  roleLabel: z.string().trim().max(40).nullable().default(null),
  active: z.boolean(),
  /** Team this member belongs to (null = unassigned). Team Leads manage
   * membership of their own team; admins manage all. */
  teamId: z.string().nullable().default(null),
  createdAt: EpochMillis,
  updatedAt: EpochMillis,
});
export type Member = z.infer<typeof MemberSchema>;

export const TeamSchema = z.object({
  teamId: z.string().min(1),
  organizationId: z.string().min(1),
  name: z.string().min(1).max(80),
  /** The MANAGER who leads this team. */
  leadUserId: z.string().nullable().default(null),
  /** Optional parent for a workspace org chart. Parent-team leads inherit
   * visibility and roster management for descendant teams. */
  parentTeamId: z.string().nullable().default(null),
  createdAt: EpochMillis,
  updatedAt: EpochMillis,
});
export type Team = z.infer<typeof TeamSchema>;

export const OrganizationSchema = z.object({
  organizationId: z.string().min(1),
  name: z.string().min(1),
  tenantType: TenantTypeSchema,
  allowedDomain: z.string().min(1),
  collisionPolicy: z
    .enum(["OFF", "PRIVATE_WARNING", "MANAGER_VISIBLE", "BLOCK_RECENT_TEAM_CONTACT"])
    .default("OFF"),
  collisionBlockDays: z.number().int().positive().default(30),
  createdAt: EpochMillis,
  updatedAt: EpochMillis,
});
export type Organization = z.infer<typeof OrganizationSchema>;
