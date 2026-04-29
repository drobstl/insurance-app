# Linq Messaging Safety Policy (v1)

## Purpose

Protect outbound deliverability and prevent `Limited` or flagged number states while running insurance-agent outreach at scale.

## Scope

This policy applies to all outbound Linq traffic from AgentForLife, including:
- client welcome/intros
- beneficiary intros
- drips and follow-ups
- manual sends triggered from dashboard workflows

## 1) Non-Negotiable Limits

- Per-line new conversation cap: **50/day max**
- Per-line first-touch cap: **6/hour max**
- Burst guardrail: no more than **2 first-touch** sends in any **60-second** window per line
- Keep **25% daily headroom** per line (do not operate at maximum capacity)

## 2) First-Message Content Rules

- First message must not include:
  - links (unless prior engagement/context exists)
  - attachments
  - sales-heavy copy
- First message should be:
  - short and conversational
  - personalized (name/context token)
  - reply-oriented (light question)
- Template anti-repetition:
  - at least 5 rotating variants per campaign
  - avoid identical copy sent repeatedly in short windows

## 3) Traffic Shaping Rules

- Distribute sends across recipient-local daytime hours
- Add jitter between sends (20-120 seconds)
- Avoid overnight cold first-touch
- Prioritize warm/contextual recipients over low-context recipients

## 4) Number Pooling Strategy

- Use a minimum of **2 active lines** (primary + secondary)
- Route recipients by stable shard key (avoid random thread switching)
- Maintain one spare line for failover/warm-up
- Never run production on a single line

## 5) New Number Warm-Up

- Day 1-2: up to 20 new conversations/day
- Day 3-4: up to 30/day
- Day 5-7: up to 40/day
- Day 8-14: up to 50/day

Ramp only when all conditions hold:
- no line status degradation (`Limited`/flagged)
- stable `message.failed` rate
- healthy send-to-delivery progression

## 6) Automated Guardrails (Required)

Pre-send checks:
- line health is acceptable
- line is below hourly/daily cap
- first-message content passes policy checks

Auto-pause triggers (per line):
- status changes to `Limited` or flagged
- `message.failed` exceeds 5% over last 50 outbound
- unsent backlog rises (`sent_at` remains null abnormally)

Fallback behavior:
- reroute to healthy line when available
- otherwise queue and/or send via approved fallback channel

## 7) Incident Procedure

When any line becomes `Limited`/flagged:
- immediately pause first-touch sends on that line
- keep inbound handling active when possible
- shift only essential outbound to healthy lines at reduced rate
- open Linq support incident with number, timestamps, message IDs, event IDs, trace IDs
- do not resume until recovery is confirmed

## 8) Monitoring Requirements

Track daily, per line:
- new conversations started
- total outbound volume
- `message.failed` count/rate
- unsent count (`sent_at` null)
- delivered count/rate
- line status

Review weekly:
- at-risk lines
- campaigns causing most failures
- template variants with worst outcomes
- capacity plan (add/remove/re-balance lines)

## 9) Product UX Requirements

- Replace optimistic "Sent by SMS" status with staged delivery states:
  - `Queued`
  - `Accepted`
  - `Sent`
  - `Delivered` / `Failed`
- Display line health warnings in admin views
- Block launches when projected traffic exceeds safe per-line limits

## 10) Implementation Checklist

Engineering:
- [ ] Add line health check before every Linq send
- [ ] Enforce per-line hourly and daily caps in API layer
- [ ] Add send jitter and burst controls
- [ ] Add template variant rotation + first-message linting (no link/attachment)
- [ ] Ingest and persist `message.failed` and `phone_number.status_updated` events
- [ ] Add auto-pause kill switch for degraded lines
- [ ] Add reroute/fallback strategy to healthy line or fallback channel
- [ ] Update dashboard statuses from optimistic send to delivery lifecycle

Operations:
- [ ] Define line ownership and escalation contacts
- [ ] Create daily deliverability check routine
- [ ] Create incident response runbook template for Linq tickets
- [ ] Review ramp plan before enabling any new line

## 11) Enforcement

Any feature that bypasses this policy is blocked from release until compliant.
