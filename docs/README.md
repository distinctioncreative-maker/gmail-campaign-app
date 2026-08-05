# Cadence documentation

Start at the repo [README](../README.md) for what Cadence is and how to run it.
Everything below is the deeper reference.

## Reference

| Doc | What it covers |
|---|---|
| [architecture.md](architecture.md) | Routes, modules, components, and how a send actually travels through the system |
| [data-model.md](data-model.md) | Firestore collections, ownership scoping, and index requirements |
| [features.md](features.md) | Every feature and its status. **Generated** from `lib/features/registry.ts` by `npm run docs:features` — never hand-edit |
| [brand.md](brand.md) | Audience, voice rules, typography, colour, radius, motion. Read before touching UI or copy |
| [brand-primary-options.md](brand-primary-options.md) | Superseded decision record for an earlier primary action colour. History only: brand.md is current |
| [security.md](security.md) | Auth model, token encryption, tenant isolation, and the deny-by-default rules |
| [campaign-safety.md](campaign-safety.md) | Suppression, bounce handling, pacing limits, and the guards that stop a bad send |
| [salesforce-parser.md](salesforce-parser.md) | How pasted Salesforce text is parsed into leads |

## Operations

| Doc | What it covers |
|---|---|
| [operations/go-live.md](operations/go-live.md) | **The ordered checklist from closed allowlist to taking payments.** Start here for launch |
| [operations/setup.md](operations/setup.md) | First-time local and cloud setup |
| [operations/deployment.md](operations/deployment.md) | Deploying to Cloud Run, plus queues, scheduler, and KMS |
| [operations/runbook.md](operations/runbook.md) | Day-to-day operational tasks |
| [operations/incident-response.md](operations/incident-response.md) | What to do when sending goes wrong |
| [operations/google-oauth.md](operations/google-oauth.md) | OAuth consent screen, scopes, and verification |
| [operations/testing.md](operations/testing.md) | The quality gate and how to run it |
| [operations/add-a-company.md](operations/add-a-company.md) | Onboarding another workspace tenant |

## Product

| Doc | What it covers |
|---|---|
| [product/strategy.md](product/strategy.md) | Positioning, pricing, and what has to be true before opening signups |
| [product/user-guide.md](product/user-guide.md) | The customer-facing walkthrough |
| [product/roadmap-infra-migration.md](product/roadmap-infra-migration.md) | Moving infra off the Alpine Google account once the Cadence domain is bought |

## History

[history/](history/) holds point-in-time snapshots: audits, handoffs, and
readiness reviews. They are useful for understanding why something is the way
it is, and they are **not** kept current. When a snapshot disagrees with a
reference doc above, the reference doc wins.
