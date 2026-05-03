# Linq Decision Record (May 2026)

## Purpose

Lock the remaining Linq operating decisions so AgentForLife can scale outbound messaging without triggering line limitations, while staying aligned with product voice, compliance posture, and unit economics.

## Scope

Applies to all Linq-powered outbound lanes in AFL:
- welcome/invite
- referral
- conservation and policy review
- beneficiary outreach

## Decisions Already Locked

1. **Threaded routing foundation is in place** (conversation thread registry + lane-based webhook routing controls).
2. **Beneficiary lane is hard-fenced by default** (auto-reply remains feature-flagged and off unless explicitly enabled).
3. **Beneficiary follow-up automation is currently disabled** (queued follow-ups are marked skipped).
4. **Beneficiary holiday outreach is push-only** (no SMS/email fallback for this touchpoint).
5. **Welcome and invite SMS include a conversational confirmation prompt** to improve early reciprocity.

## Decisions Required (Current)

### 1) Sender Identity Standard
**Decision to make:** Default AI sender framing in outbound SMS.

Options:
- **Agent voice default:** message reads as the agent directly.
- **Assistant voice default:** named assistant messaging on behalf of agent.
- **Hybrid by lane:** assistant framing for operational lanes, agent framing for high-trust conversational lanes.

Default recommendation:
- Use **hybrid by lane** with explicit policy by use case.
- Keep referral + relationship-conversion lanes in agent voice.
- Use assistant framing for operational reminders/coordination where that reduces risk and ambiguity.

### 2) Disclosure and Consent Standard
**Decision to make:** What explicit disclosure language is required and where.

Default recommendation:
- Define a single approved disclosure matrix by lane (required, optional, prohibited language).
- Ensure first-touch templates include identity-safe phrasing and reply-oriented confirmation.

### 3) Routing Strictness Rollout
**Decision to make:** Production posture for thread resolver strictness.

Default recommendation:
- Roll out `THREAD_ROUTER_ENABLED` in staged cohorts.
- Enable strict fallback posture (`PHONE_FALLBACK_STRICT_MODE`) after backfill validation and unresolved-inbound monitoring are stable.
- Keep beneficiary auto-reply off by default until lane-level KPI targets are met.

### 4) Line Capacity Operating Policy
**Decision to make:** Safe pooled-line send budget and bulk-import controls.

Default recommendation:
- Adopt pooled-line daily/hourly first-touch caps consistent with Linq safety policy.
- Require warm-up schedule for newly added lines.
- Add bulk-import throttle windows so spikes cannot consume entire line budget.

### 5) KPI Contract for Linq Health
**Decision to make:** Required metrics and threshold actions.

Default recommendation:
- Track and review at minimum:
  - first-message reply rate,
  - reply:send ratio,
  - unique new conversations per line per day,
  - failed/undelivered rate,
  - line status changes (`Limited`/flagged).
- Attach auto-pause and escalation rules to threshold breaches.

## Proposed Lane Policy (Interim)

- **Referral, conservation, policy review:** Linq allowed with strict pacing and thread-lane governance.
- **Welcome/invite:** Linq allowed with confirmation-prompt requirement.
- **Beneficiary:** intro only; follow-ups disabled; holiday outreach push-only; auto-reply off by default.
- **Unresolved inbound:** route to lead inbox/manual triage path, not automatic AI response.

## 14-Day Execution Checklist

1. Finalize sender identity + disclosure matrix.
2. Confirm production rollout sequence for routing strictness flags.
3. Publish pooled-line capacity budget and warm-up SOP.
4. Lock KPI thresholds + incident triggers in ops runbook.
5. Review outcomes with Linq contact (Ben) and adjust quotas if needed.

## Owners

- Product/Strategy: AFL leadership
- Messaging policy: AFL leadership + compliance counsel
- Engineering enforcement: Web/API team
- Operations monitoring: Growth/ops owner for Linq line health

## References

- `CONTEXT.md`
- `docs/linq-messaging-safety-policy.md`
