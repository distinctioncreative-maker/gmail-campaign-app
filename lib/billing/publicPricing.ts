import { PLANS, type PlanId } from "@/lib/billing/plans";

export interface PublicPricingTier {
  id: PlanId;
  name: string;
  eyebrow: string;
  description: string;
  cta: string;
  featured: boolean;
  features: readonly string[];
}

/**
 * Public plan messaging shared by the landing page and in-product billing.
 * Stripe remains the billing source of truth; this file prevents public and
 * authenticated surfaces from drifting on prices or minimum quantities.
 */
export const PUBLIC_PRICING: readonly PublicPricingTier[] = [
  {
    id: "STARTER",
    name: PLANS.STARTER.name,
    eyebrow: "For one focused sender",
    description: "Build a repeatable Gmail outreach workflow that turns preparation, sending, and replies into one clear process.",
    cta: "Get started",
    featured: false,
    features: [
      "1 user and 1 connected inbox",
      "Up to 150 scheduled sends per day",
      "AI writing, brand voice, and variants",
      "Campaign reporting and reply workspace",
    ],
  },
  {
    id: "TEAM",
    name: PLANS.TEAM.name,
    eyebrow: "For collaborative outreach",
    description: "Give a small team one operating view for campaigns, permissions, reusable messages, reporting, and next steps.",
    cta: "Get started",
    featured: true,
    features: [
      "2-user minimum, priced per user",
      "Up to 400 scheduled sends per workspace per day",
      "Shared templates, reporting, and controls",
      "Role-based workspace access",
    ],
  },
  {
    id: "ENTERPRISE",
    name: PLANS.ENTERPRISE.name,
    eyebrow: "For agencies and larger teams",
    description: "Plan a controlled rollout around your team structure, inboxes, usage, security review, and onboarding needs.",
    cta: "Talk to sales",
    featured: false,
    features: [
      "Custom users, inboxes, and usage limits",
      "Rollout and deliverability planning",
      "Security and architecture review",
      "Priority implementation support",
    ],
  },
] as const;

export function publicPriceLabel(planId: PlanId): string {
  const price = PLANS[planId].priceMonthly;
  return price === null ? "Custom" : price === 0 ? "$0" : `$${price}`;
}

export function publicPriceQualifier(planId: PlanId): string {
  if (planId === "ENTERPRISE") return "planned around your rollout";
  return planId === "TEAM" ? "per user / month, 2-user minimum" : "per month";
}
