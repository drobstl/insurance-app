# Linq Messaging Safety Policy (v2)

## Purpose

Protect outbound deliverability and prevent `Limited` or flagged number states while running insurance-agent outreach at scale, using Linq's published guidance as the source of truth.

## Scope

This policy applies to all outbound Linq traffic from AgentForLife, including:
- client welcome/intros
- beneficiary intros
- drips and follow-ups
- manual sends triggered from dashboard workflows

## 1) Linq-Provided Guidance (Source Facts)

From Linq Partner Guide screenshots shared May 2, 2026:

- **50 unique new conversations per line per day** is the **recommended ceiling** (not stated as a hard cap).
- Reciprocity targets:
  - target ratio: **1 reply for every 2 sends** (`1:2`)
  - ideal first-message reply rate: **30-40%**
  - minimum first-message reply rate to maintain line performance: **15%**
- First-touch quality guidance:
  - lead with short, conversational text
  - personalize and use recipient name when possible
  - end with an easy, low-friction reply question
  - avoid links/attachments/media in the opener
  - give recipients time to respond before sending again
- Keep call and text numbers separate to avoid "Spam Likely" risk from mixed usage.
- Linq frames this as a **partnership calibration process**, not a rigid one-size-fits-all policy.

## 2) AFL Policy Interpretation (Internal)

The following are AFL operating rules built from Linq guidance plus risk tolerance:

- Treat **50 new conversations/line/day** as a planning threshold for steady-state operations unless Linq approves higher limits for our traffic profile.
- Do not represent any hourly first-touch value as a Linq requirement unless documented by Linq in writing.
- Maintain opener rules:
  - no links/media/attachments in first message
  - conversational tone (not campaign tone)
  - clear personalization + easy reply ask
- Avoid stacked follow-ups to non-responders; enforce waiting windows between attempts.

## 3) Message Types Not Meant for iMessage (Per Linq)

Avoid using iMessage first-touch for:

- long, cold-email-style paragraphs
- links in opener (not clickable until reply)
- images/PDFs/videos as first message
- mass-marketing-first language
- templated automated-feeling copy
- "big news" promotional blasts
- generic openers that do not name the recipient

## 4) Number Pooling Strategy (AFL)

- Use a minimum of **2 active lines** (primary + secondary)
- Route recipients by stable shard key (avoid random thread switching)
- Maintain one spare line for failover/warm-up
- Never run production on a single line

## 5) New Number Warm-Up (AFL; Adjustable with Linq)

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
- line is below daily planning threshold and current warm-up allowance
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
- [ ] Enforce per-line daily planning threshold in API layer
- [ ] Add send pacing controls (timing + non-responder wait windows)
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

## 12) Source-of-Truth Notes

- If this document conflicts with direct Linq guidance, Linq guidance wins.
- Any numeric threshold must be labeled as one of:
  - `Linq-provided recommendation`, or
  - `AFL internal conservative guardrail`.
