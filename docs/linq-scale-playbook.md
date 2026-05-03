# Linq Scale Playbook (Working Draft)

## Status

Working strategy draft for internal planning. This is intentionally not final.

## Why This Exists

AFL has a real tension:

- We need to automate outreach at scale for insurance agents.
- The people who do not engage are often the exact people we still need to reach (for lapse saves, retention, rewrites, and referrals).
- Linq line performance still depends on conversational quality and reciprocity.

This playbook is built to hold both truths at once and guide practical decisions.

### Team Briefing Context

The core business problem is not simply "SMS is expensive" or "Linq has limits." The deeper issue is that AFL's value depends on reliable follow-through for clients who are easy to lose: missed payments, lapse risk, stalled referrals, and policy reviews that slip without repeated touchpoints. At the same time, iMessage line health declines when first-touch volume feels campaign-like or when reciprocity drops, which can reduce deliverability right when agents need the system most. In practice, that creates a multi-variable allocation problem across many agents sharing finite SMS capacity: we must preserve enough first-touch bandwidth for high-impact conversations, continue pursuing non-responders in a controlled way, and shift lower-urgency traffic to deferrable queues or alternate channels without breaking the promise of automation. This is why the playbook focuses on prioritization, pacing, and product packaging decisions (allowances/tiers/overages), not just buying more lines.

## Source Facts (Linq)

From Linq guidance:

- 50 unique new conversations per line per day is a recommended ceiling.
- Reciprocity is a core line-health signal:
  - target ratio: 1 reply per 2 sends
  - ideal first-message reply rate: 30-40%
  - minimum first-message reply rate: 15%
- First messages should be short, personal, easy to reply to, and avoid links/media.
- Give recipients time to respond before sending again.

## Core Strategy

Do not run first-touch SMS as an unlimited utility. Treat it as a scarce capacity that is allocated by business value, urgency, and likelihood of response.

## Priority Framework (Who Gets SMS First)

Use lane priority when daily pressure is high:

1. Referral conversion and active conversation continuity
2. High-risk retention/lapse cases
3. Policy review/rewrite opportunities (time-sensitive segments first)
4. Welcome/new-client intro
5. Beneficiary outreach (deferrable first, then staggered)

Notes:

- This matches current direction where beneficiary automation is already heavily constrained.
- Beneficiary outreach remains important, but it should be the most schedulable lane.

## Practical Levers to Scale Without Defaulting to New Lines

### 1) Lane Budgets + Queueing

- Allocate a daily first-touch budget by lane.
- Reserve capacity for high-value, high-urgency lanes.
- Queue lower-priority lanes automatically rather than blasting all cohorts the same day.

### 2) Agent-Level Fairness

- If lines are pooled across many agents, enforce per-agent allocation to avoid one agent consuming all available first-touch capacity.
- Allow controlled borrowing from a shared overflow pool when capacity exists.

### 3) Smart Staggering Windows

- Spread sends across local-time windows.
- Use backlog smoothing for spikes (book import, campaign launches, anniversaries).
- Separate "must-send-today" from "can-send-this-week."

### 4) Response-Aware Retry Cadence

- Continue attempts to non-responders, but with wider spacing and strict stop rules.
- Reserve aggressive cadence only for high-urgency, high-impact cases.

### 5) Message Quality Controls

- Keep first-touch copy short and conversational.
- Require personalization token and low-friction question.
- Ban links/media in openers unless prior engagement exists.

### 6) Triggered Slowdown, Not Full Stop

- When line health degrades, automatically reduce new first-touch volume.
- Preserve ongoing thread continuity and urgent exception lanes where possible.

## Product Model Options (Including New Ideas)

### Option A: Included SMS Allowance Per Agent (Monthly)

- Each agent gets a defined number of automated first-touch SMS attempts per month.
- Positioning: push-enabled mobile relationship is core; SMS is a fallback capacity.
- Benefits:
  - predictable cost control
  - explicit expectation-setting
  - easier scaling guardrails
- Tradeoffs:
  - requires clear UX on remaining allowance and prioritization

### Option B: Tiered Membership With Higher SMS Allowance

- Base tier: standard monthly automated SMS allowance.
- Higher tiers: more monthly SMS capacity and/or priority queue access.
- Benefits:
  - aligns costs with usage
  - supports power users without forcing everyone into higher base pricing
- Tradeoffs:
  - needs careful pricing and fairness policy
  - should avoid "pay to spam" behavior

### Option C: Hybrid Fair-Use + Overage Pack

- Include base allowance, then offer overage packs for peak months.
- Add quality gates before overage unlock (line health must be stable).
- Benefits:
  - flexible for seasonality
  - monetizes spikes without permanent tier jump

## Welcome/New-Client Alternatives (Reduce Linq Load)

### Option D: Agent-Owned Send for Welcome Intro (One-Tap)

- AFL generates welcome copy and opens native SMS on agent phone for one-tap send from their own number.
- Benefits:
  - less Linq first-touch load
  - can feel more authentic/personal
- Tradeoffs:
  - weaker automation consistency
  - requires agent action and compliance-safe UX

### Option E: Mobile App Flow for Agent One-Tap Send

- AFL mobile app (or lightweight companion flow) handles one-tap send with prefilled copy and logging.
- Benefits:
  - combines agent-authored authenticity with operational tracking
  - can improve app adoption habit for agents
- Tradeoffs:
  - product/engineering lift
  - mobile rollout complexity

### Option F: Channel Split for Welcome

- Push-first or email-first for welcome with SMS fallback triggered by non-engagement.
- Benefits:
  - lowers first-touch SMS pressure
- Tradeoffs:
  - depends on push permission and email quality
  - may slow first response in some cohorts

## Recommended Combined Model (Current Best Draft)

1. Keep beneficiary lane as staggered/deferrable by default.
2. Implement per-agent monthly SMS allowance (fair-use baseline).
3. Add paid tiers or overage packs for higher SMS capacity.
4. Use lane budgets so referral + high-risk retention are protected first.
5. Pilot one-tap agent-owned welcome send to reduce automated first-touch volume.
6. Preserve non-responder outreach, but with response-aware spacing.

This avoids the false choice of either:
- "only message people who already engaged," or
- "unbounded automated SMS volume."

## Decision Checklist (To Narrow Down)

1. Should monthly allowance be measured as:
   - first-touch only, or
   - all automated SMS sends?
2. Should allowance be per-agent fixed, or dynamic by active-client count?
3. Which lanes are protected from allowance exhaustion (if any)?
4. What happens at limit:
   - queue until next cycle,
   - fallback channel, or
   - paid overage unlock?
5. Do we want one-tap native send for welcome as an immediate experiment?
6. What KPI floor triggers automatic slowdown?

## 30-Day Pilot Plan

Week 1:

- Lock lane priority matrix and monthly allowance draft.
- Define KPI scoreboard and slowdown triggers.

Week 2:

- Run shadow scoring on current traffic (no behavior change yet).
- Validate how often caps would trigger per agent cohort.

Week 3:

- Enable queueing + lane budgeting for a pilot cohort.
- Keep beneficiary lane staggered and deprioritized.

Week 4:

- Review impact:
  - line health
  - response rates
  - conversion outcomes
  - queued backlog behavior
- Decide whether to add tier/overage packaging next.

## Open Risks to Watch

- Over-constraining outreach can reduce recovery wins for hard-to-reach clients.
- Under-constraining first-touch can damage line health and hurt everything.
- Tiered pricing can create fairness concerns unless lane priorities remain enforced.
- Agent-owned send options can drift from compliance and tracking unless tightly designed.

## References

- `docs/linq-messaging-safety-policy.md`
- `docs/linq-decision-record-2026-05.md`
- `CONTEXT.md`
