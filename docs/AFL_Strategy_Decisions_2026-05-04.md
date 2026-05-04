# AFL Strategy Decisions — 2026-05-04

**Prepared for:** Daniel Roberts, Brainstorm Labs LLC
**Companion to:** `AFL_Messaging_Operating_Model_v3.1.md` and `AFL_Pricing_Packaging_Playbook_v3.md`
**Purpose:** Capture the operating decisions made in the May 4, 2026 strategy session that either diverge from or extend the two source-of-truth specs above. When this document conflicts with v3.1 or v3, this document wins.
**Status:** Locked. Reflects decisions made after reviewing the Phase 1 audit response from Cursor.

---

## 1. Anniversary, Holiday, and Birthday Lanes — Push Only, No Fallback

**Decision:** Anniversary, holiday cards, and birthday cards are push notification only. There is no fallback channel.

If the client does not have push notifications enabled, the cycle ends silently for that client until the next scheduled cycle (next anniversary, next holiday, next birthday). No SMS fallback. No email fallback. No outreach attempt at all.

**Rationale:** These are soft touchpoints, not save-attempts. If the client has not enabled push, they have signaled they do not want lifecycle nudges from AFL — sending alternative-channel outreach to that client just adds noise and consumes line capacity for low-value sends. Aligns these three lanes with how holiday and birthday cards already operate in production today.

**Divergence from v3.1:** The v3.1 spec §4.2 and §3.2 allowed email fallback for anniversary when push is unavailable. This decision overrides that and removes the email fallback entirely.

**Implementation note:** Holiday cards and birthday cards already operate this way in code (`web/app/api/cron/holiday-check/route.ts` and `web/app/api/cron/birthday-check/route.ts` skip clients without a push token). Anniversary requires the hotfix described in §6 below.

---

## 2. Beneficiary Lane — Channel Flexibility Preserved

**Decision:** The beneficiary lane is *not* locked to push-only. Push is the primary channel for cold contact (consistent with v3.1 §4.5), but SMS and email touches to *activated* beneficiaries remain available as future tools.

**Rationale:** The push-only rule for anniversary, holiday, and birthday lanes makes sense because those are low-stakes recurring touches. Beneficiary outreach is fundamentally different — it includes claim-time scenarios where reaching the beneficiary matters more than minimizing channel friction. Locking the lane to push-only forecloses optionality we may want later (occasional check-ins via SMS once the beneficiary has activated, email reminders for annual verification when push isn't available, etc.).

**What stays unchanged from v3.1 §4.5:**
- No cold beneficiary outreach via any channel — beneficiaries enter the AFL contact graph only via policyholder invite and self-activation.
- Beneficiary holiday outreach today is push-only (per the May 2, 2026 update in CONTEXT.md). That stays as the current default.
- Auto-reply default off for the beneficiary lane (`BENEFICIARY_AUTO_REPLY_ENABLED=false`).

**What's open:** SMS and email touches to activated beneficiaries are available in principle and may be tested in Phase 2 or Phase 3 once the invite mechanic ships. No specific cadence committed here.

---

## 3. Provider Abstraction — Deferred to Phase 4

**Decision:** Do not build the `MessagingProvider` interface or any provider abstraction layer in Phase 1 or Phase 2. Defer to Phase 4 when Twilio is being seriously considered as a redundancy provider.

**Rationale:** v3.1 §10.2 and §14.3 call for the abstraction to land in Phase 1 as cheap insurance. At one Linq line, one provider, and zero current pressure to switch, the value of the abstraction is entirely latent. Building it now is engineering effort that does not move toward shipping the welcome flow or pricing tiers — the two changes that actually matter for Phase 1–3.

If a Linq outage or pricing dispute forces a provider switch before Phase 4, AFL will absorb the refactor cost at that time. The expected probability of that scenario inside the next 6 months is low enough not to justify pre-building the abstraction.

**Divergence from v3.1:** The spec puts provider abstraction in Phase 1 ("implemented in code before any Phase 2 work begins" — §14.3). This decision moves it to Phase 4.

---

## 4. Push Permission Model — Folded into Welcome Flow Work

**Decision:** Implement proper push token lifecycle management as part of the welcome flow build (Phase 1–2), not as a separate workstream.

Today, AFL's push routing logic checks `if (pushToken !== undefined)` to decide whether a client allows push. This conflates "user ever opted in" with "user currently still allows notifications." When a user revokes notifications in iOS settings, the token stays in our database and we keep "sending" pushes that never deliver — and we don't fall back to any other channel because our code thinks push is still working.

**Required behavior:**
- When Expo's response indicates a token is invalid (`DeviceNotRegistered` or similar), AFL invalidates the token in Firestore.
- A separate field (`pushPermissionRevokedAt` or equivalent) records when the token was invalidated, so we don't conflate "never opted in" with "opted in then revoked."
- Routing logic checks for a *valid, non-revoked* token, not just token presence.
- For lanes with a fallback (welcome, retention, beneficiary), routing falls back to the next channel automatically. For lanes without a fallback (anniversary, holiday, birthday — see §1), the cycle ends silently.

**Rationale:** Without this fix, the push-only rule for anniversary/holiday/birthday is broken for any client who ever revoked notifications — those clients fall into a silent-failure state where AFL thinks push works but it doesn't, and there's no fallback. This must land alongside (or before) the anniversary push-only enforcement.

---

## 5. Phased Sequence — What Gets Built When

**Decision:** AFL's near-term roadmap is sequenced as follows. This sequence overrides the more elaborate Phase 1 plan in v3.1 §11.1, which assumed a separate instrumentation phase before the welcome flow ships.

### Phase 0 — Anniversary hotfix (this week)
- Remove SMS from `REVIEW_STAGE_FALLBACK_ORDER` for all anniversary stages. Anniversary is push-only with no fallback per §1 above.

### Phase 1 — Welcome flow + new pricing (next 6 weeks)
- New welcome flow (agent personal-phone one-tap + in-app Activate + Linq line vCard response + thumbs-up reciprocity ask)
- Push permission lifecycle management (per §4 above)
- vCard generation pipeline (server-side per agent)
- Welcome flow analytics in PostHog
- New conversation-based pricing tiers in Stripe (Starter $29 / Growth $59 / Pro $119 / Agency $199 + $39/seat)
- Conversation counter (per-agent monthly bucket)
- Founding 34 grandfathered at Growth-equivalent
- Pricing page rebuild

### Phase 2 — KPI tiers, beneficiary, retention, supporting infrastructure (months 3–4)
- KPI tier system (5 tiers, 7-day rolling, line-level)
- Line-health dashboard widget
- Auto-throttle at Tier 1 and Tier 2 (provisional — may downgrade to manual triage if Tier 1 events are rare)
- Beneficiary invite mechanic (parallel to client activation, three invite prompts)
- Bulk import onboarding ceremony (re-enable UI, drip release rules)
- Lapse/retention cadence rewrite (push first, max 2 SMS / 30 days, mandatory email at third touch, 60-day quiet)
- Email infrastructure cleanup (centralize 13 Resend usages, Resend bounce/complaint webhook, suppression list)

### Phase 3 — Concierge, multi-line groundwork (months 5–6)
- Concierge add-on (operator dashboard role, $1,500 / $2,500 SKUs)
- Pricing rollout completion and overage billing validation

### Phase 4 — Provider abstraction, multi-line, contingencies (months 7–12)
- Provider abstraction layer (`MessagingProvider` interface, `LinqProvider` adapter)
- Twilio as warm-standby
- Multi-line provisioning
- AMB evaluated as direct-Apple registration if branded sender becomes strategically important
- Number replacement playbook activated only if a second Limited episode occurs under the new operating model

**Divergence from v3.1:** The spec's Phase 1 (Months 1–2) bundled instrumentation, KPI dashboards, and provider abstraction together as preconditions for Phase 2. This decision instead ships the welcome flow and pricing first (the changes that actually move the deliverability and revenue needles), and folds instrumentation/KPI work into Phase 2 alongside other supporting infrastructure.

---

## 6. Anniversary Hotfix — Specific Implementation

**Decision:** The anniversary hotfix is the immediate next engineering action.

**Scope:**
- Edit `REVIEW_STAGE_FALLBACK_ORDER` in `web/lib/conservation-types.ts` to remove `'sms'` from all four stages (`initial`, `followup_3d`, `followup_7d`, `followup_14d`).
- Result: the only acceptable anniversary channel is `'push'`. If push is unavailable, the stage skips silently. No email fallback per §1.
- Verify `policy-review-drip` cron behavior matches: when push fails or is unavailable, the cron must mark the stage as skipped, not fall through to any other channel.
- Update CONTEXT.md to reflect anniversary-as-push-only-with-no-fallback as a documented architectural rule.

**Effort:** Half day, including verification and CONTEXT.md update.

**Why this is Phase 0 (urgent), not Phase 1:** Today's `REVIEW_STAGE_FALLBACK_ORDER` lists SMS as the *primary* channel on the day-3 and day-14 anniversary stages, and as the secondary on the other two stages. Every anniversary check-in for a client without push permission is currently being routed through the Linq line — the line we're trying to keep healthy. This is the single largest active bleed point on line reputation and must be stopped before any further work.

---

## 7. CONTEXT.md Reconciliation — Required Before Any Code Change

**Decision:** Before the anniversary hotfix lands or any Phase 1 work begins, `CONTEXT.md` is updated to reflect:

- The two new source-of-truth documents (this strategy decisions doc, the v3.1 messaging spec, the v3 pricing playbook) are in `docs/` and are authoritative.
- The architectural decisions in v3.1 §14.1 are appended to the Key Decisions Made section.
- The lane channel rules in §1 and §2 of this document are added as a new top-level Channel Rules section.
- The Phase 0 → Phase 4 sequence in §5 of this document supersedes any prior phasing references.
- Open Questions that are now answered by v3.1 / v3 / this doc are struck or moved to Decisions.
- The legacy standalone tier table ($25 / $35 / $49) is replaced with the v3 tier structure ($29 / $59 / $119 / $199 + $39/seat).

The CONTEXT.md update is best done by Cursor, reading these three documents and reconciling. Do not hand-edit CONTEXT.md.

---

## Summary — Five Things to Remember

1. **Anniversary, holiday cards, birthday cards = push only, no fallback.** Cycle ends silently if push unavailable.
2. **Beneficiary lane stays channel-flexible.** Push primary for cold contact; SMS/email available for activated beneficiaries.
3. **Provider abstraction → Phase 4.** Not built in Phase 1 or Phase 2.
4. **Push permission lifecycle management ships with welcome flow.** Token invalidation + lane-aware fallback handling.
5. **Sequence is hotfix → welcome flow + pricing → KPI tiers + beneficiary + retention → multi-line.** Not v3.1's instrumentation-first phasing.

*End of strategy decisions document.*
