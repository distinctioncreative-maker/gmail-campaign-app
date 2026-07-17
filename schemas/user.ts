import { z } from "zod";
import { EpochMillis, RoleSchema } from "./common";

export const OnboardingStatusSchema = z.enum([
  "NEW",
  "GMAIL_CONNECTED",
  "PROFILE_COMPLETE",
  "DEFAULTS_SET",
  "TEST_PASSED",
  "COMPLETE",
]);

export const UserSchema = z.object({
  userId: z.string().min(1),
  organizationId: z.string().min(1),
  email: z.string().email(),
  displayName: z.string(),
  role: RoleSchema,
  active: z.boolean(),
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
  active: z.boolean(),
  createdAt: EpochMillis,
  updatedAt: EpochMillis,
});
export type Member = z.infer<typeof MemberSchema>;

export const OrganizationSchema = z.object({
  organizationId: z.string().min(1),
  name: z.string().min(1),
  allowedDomain: z.string().min(1),
  collisionPolicy: z
    .enum(["OFF", "PRIVATE_WARNING", "MANAGER_VISIBLE", "BLOCK_RECENT_TEAM_CONTACT"])
    .default("OFF"),
  collisionBlockDays: z.number().int().positive().default(30),
  createdAt: EpochMillis,
  updatedAt: EpochMillis,
});
export type Organization = z.infer<typeof OrganizationSchema>;
