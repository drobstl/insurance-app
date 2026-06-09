# AFL TCPA Compliance Audit — outreach / cadence / drip

**Date:** 2026-06-04 · **Status:** living spec (coordination doc for the in-flight TCPA work) · **Author:** Claude session (audit), for Daniel.

**This doc is self-contained** — the sessions picking up the fixes have no shared conversation context, so everything needed is here.

## Why this matters
AFL's target agents (Symmetry/Quility) personally sign a **TCPA Liability Agreement** that indemnifies their IMO for any TCPA violation on leads not bought through the IMO marketplace — enforced via **offset against their commissions, with a 3-year tail**. So any AFL outreach feature that enables non-compliant contact creates **direct financial liability for our own users** (and exposure for AFL). The go-to-market intends to claim *"we keep you TCPA-compliant,"* so that claim has to be true.

## Sources reviewed (all on `origin/main` = production)
`web/lib/suppression.ts`, `web/lib/linq.ts`, `web/lib/inbound-opt-out-detection.ts`, `web/lib/compliance-intent-handler.ts`, `web/app/api/cron/conservation-outreach/route.ts`, `web/app/api/cron/referral-drip/route.ts`, `web/app/api/cron/policy-review-drip/route.ts`, `web/lib/bulk-import-drip.ts`, `web/lib/welcome-action-item-writer.ts`, `web/lib/welcome-activation-handler.ts`, `web/vercel.json`, `web/lib/tier-gating.ts`, `docs/afl-compliance-layer-whatwhy.md`.

## Status corrections (things that were stale)
- **PR #102 / `feat/outreach-hold` is MERGED and live** (commit `2a6614d`, ancestor of `origin/main`), as is the AFL compliance layer (`69a9d36`). Memory note `[project_kevin_book_cleanup]` calling it "unmerged" is out of date.
- The `automatedOutreachHold` per-agent flag (`tier-gating.ts:140 isClientOutreachPaused`) gates the six whole-book "care" crons (birthday, holiday, beneficiary, policy-review, policy-review-drip, conservation-outreach) but **deliberately not** `referral-drip` or `appointment-push-reminders`.

---

## TL;DR
The opt-**out** machinery is genuinely strong. The gaps are in **opt-in capture, quiet hours, DNC, and opt-out coverage across non-shared-line channels**. The honest near-term claim is *"built-in opt-out suppression + consent logging,"* **not** *"TCPA-compliant."* Earning the stronger claim is mostly **R1 + R3** (small, high-leverage, building blocks already exist), then **R5 + R2-email**, then a counsel call on **R4/R6**.

## What already exists (and is good)
- Single send-time enforcement point `assertNotSuppressed` (`suppression.ts:171`), called from all three shared-line send fns (`linq.ts:330, 447, 525`).
- Deterministic STOP/CANCEL/UNSUBSCRIBE/QUIT/END **plus** natural-language opt-out detection (`inbound-opt-out-detection.ts:56`), authoritative over the AI lane.
- **Global-per-number** suppression across all agents (correct for a shared line); append-only `consent_events` ledger.
- START/RESUME resubscribe; "yes" is not a resubscribe. Manual-send override modal with logged reason.
- `automatedOutreachHold` safety net for un-reviewed imported books.

---

## Ranked gap list

### 🔴 R1 — No quiet-hours enforcement on any automated send *(Critical)*
Zero time-of-day gating exists. Automated SMS lanes run on **UTC** crons with no recipient-local check (`vercel.json`): `conservation-outreach` = `*/30 * * * *` (around the clock); `referral-drip` & `policy-review-drip` = `0 */4 * * *` (the **08:00 UTC** run = **3 a.m. Eastern / 12 a.m. Pacific**). Federal rule (47 CFR 64.1200(c)(1)) + state mini-TCPAs bar solicitation texts before 8 a.m. / after 9 p.m. recipient-local. Strict-liability, per-message, trivially documented. **Building block exists:** `web/lib/state-timezone.ts` maps state→IANA zone; it's just never consulted before a send. **Live in prod now.**
**Fix:** `isWithinSendWindow(state/zip)` gate in front of every automated SMS/push send; **defer (don't drop)** out-of-window sends to the next allowed slot. 8 a.m.–8 p.m. where state law is stricter (FL).

### 🔴 R2 — "Opt-out stops everything" is not true across all send paths *(Critical)*
Spec promise: *"no outbound message reaches a number that has opted out… for every path that can send"* (`whatwhy.md:35`). Not met, because the gate only lives in `linq.ts` (shared line):
- **Welcome (Mode 1 & 2) + retention text/call stages are sent from the AGENT's personal phone via `sms:` URLs** (`bulk-import-drip.ts:26-28`) — AFL can't block these; suppression is only an advisory chip; the welcome queue runs no suppression check (`welcome-action-item-writer.ts:243`, only "has phone").
- **Conservation email (Resend) and push (Expo) are ungated** (`conservation-outreach/route.ts:192, 267`). A STOP on the line still lets conservation **emails** through (CAN-SPAM problem; undercuts "STOP means stop"). Push being out-of-scope is defensible.
- **A STOP typed to the agent's personal phone never reaches AFL** (never hits the Linq webhook → never added to `suppressed_numbers`).
- **Documented fail-open:** `sendMessage` allows the send when it can't resolve the recipient phone for a legacy chat (`linq.ts:451-455`).
**Fix:** gate the Resend lane on suppression; capture STOP replies that land on personal phones (route replies through the line, or one-tap "mark opted out"); close the lookup-miss fail-open once the thread registry is universal.

### 🔴 R3 — No durable record of *affirmative consent* *(Critical — most directly blocks the claim)*
Ledger captures opt-outs well, but the only opt-**in** writes are for **resubscribe** and **HELP** (`compliance-intent-handler.ts:222, 256`). Feature 3 spec items — opt-in at welcome activation (recording exact wording shown), at referral/beneficiary first reply, and a conservation **contact-basis** event (`whatwhy.md:70-77`) — are **not implemented**:
- Activate disclosure is shown and the client sends the pre-filled "Yes, I'd like to receive…" message, but `welcome-activation-handler.ts` only stamps `clientActivatedAt` (mutable, line 305) — never calls `recordConsentEvent`. Strongest opt-in artifact lives only in a mutable timestamp + Linq's third-party chat history (the exact dependency the spec says to avoid).
- No `contact_basis` event written anywhere.
**Fix:** append-only `opt_in` at Activate (exact disclosure text + ts + agent) and at referral/beneficiary first reply; `contact_basis` event on first conservation cold touch. Purely additive — `suppression.ts` comments already anticipate this as "Part 2."

### 🟠 R4 — Referral drip = automated cold texts to non-consented prospects *(High)*
`referral-drip` sends Day-0 + Day-2 automated SMS on the shared line (`referral-drip/route.ts:144`). A referral is a **new prospect with no prior relationship and no captured consent** — the established-business-relationship (EBR) basis used for conservation does **not** apply. Consent ("first reply") is captured, if at all, *after* the first automated marketing texts. Also excluded from the `automatedOutreachHold` net.
**Fix:** capture/require a consent or inquiry basis before the automated drip; at minimum scrub against DNC (see R5) and hold the drip until a basis exists.

### 🟠 R5 — No DNC scrubbing; internal "do not call" doesn't propagate *(High)* — **partially in flight**
- No national/state DNC registry scrub anywhere. Cold lanes (referrals, purchased/vendor-CSV leads) have no EBR/inquiry exemption to fall back on.
- Internal DNC is leaky: a lead `lastDialOutcome: 'do_not_call'` is filtered from the call queue but **not** added to `suppressed_numbers`, so that person can still get an automated **SMS** drip.
**Fix:** national DNC scrub for cold lanes; auto-propagate `do_not_call` → suppression; scrub vendor lists at import. *(See ownership map — `feat/tcpa-compliance-hardening` has started the agent-initiated do-not-contact toggle.)*

### 🟠 R6 — Conservation leans on EBR for solicitation-flavored texts; strict states don't honor it *(High in FL & peers)*
Conservation messages carry **booking CTAs / scheduling links** (`conservation-outreach/route.ts:423` `enforceOutreachBookingCta`), pushing them from service → telemarketing and raising the consent bar. **Florida's FTSA (and OK/WA peers)** don't honor EBR the way the federal rule does, impose their own quiet hours, require prior express **written** consent for automated sales texts, and carry a **private right of action**. The spec flags this and puts it out of scope (`whatwhy.md:119`). This is exactly where a commission-offset claim against an agent would originate.
**Fix:** counsel-led; likely geo-scope the claim and/or build FL-specific written-consent + 8 p.m. window before marketing into strict states.

### 🟡 R7 — Autodialer fine federally, weaker under state law; AI-voice is a latent landmine *(Medium / forward)*
Recipients come from the CRM (not random/sequential), and there is **no prerecorded/artificial voice** — "call" stages are action items telling the agent to dial manually; `web/lib/ai-voice.ts` is an unimplemented stub. So post-*Facebook v. Duguid* this is very likely **not a federal ATDS** and artificial/prerecorded-voice rules aren't implicated. Caveats: (1) several state mini-TCPAs define "autodialer" more broadly; (2) if `ai-voice.ts` ships, AI voice calls implicate the **stricter** prerecorded/artificial-voice consent + identification rules.
**Fix:** document the posture as written evidence; gate `ai-voice.ts` on consent before it can ship; don't market "not an autodialer" as a nationwide fact.

---

## 6-control matrix

| # | Control | Verdict | Owner |
|---|---|---|---|
| 1 | Prior express written consent captured & blocks non-consented sends | **Gap (R3)** — shown, not recorded; no pre-send gate | unowned (ledger) + `trust-page` (import) |
| 2 | National + internal DNC scrubbing | **Gap (R5)** | `tcpa-hardening` (started) |
| 3 | Opt-out honored immediately & across all cadences | **Partial (R2)** — strong on line, leaky off it | unowned |
| 4 | Quiet hours (8a–9p local) | **Gap (R1)** | unowned |
| 5 | Not an ATDS / no prerecorded voice | **OK federally, caveated (R7)** | document only |
| 6 | Durable audit trail (consent source/time + msg history) | **Partial (R3)** | unowned (ledger) |

---

## Ownership map (as of 2026-06-04 — reconcile before starting)
- **`feat/tcpa-compliance-hardening`** (worktree `insurance-app-tcpa`): agent-initiated do-not-contact toggle + `compliance/do-not-contact/route.ts`. → **R5 (started).**
- **`feat/trust-page-and-import-consent`** (worktree `insurance-app-trust-page`): public Trust page + lead-import consent gate. → **R3 (import side) + claim substantiation (started; commit `693e97c` was local/unpushed at audit time).**
- **`claude/lead-detail-B`**: also touches `do-not-contact/route.ts` (overlaps R5 — dedupe).
- **Unowned:** **R1 (quiet hours)**, **R2 (opt-out completeness off the shared line)**, **R3-ledger (consent events at activation/referral)**.

## Which gaps block a public "TCPA-compliant" claim
- **Block an unqualified nationwide claim today:** R1, R2, R3, R4, R5.
- **Blocks it for FL / strict states:** R6 (scope or build the FL path first).
- **Doesn't block, but don't overclaim:** R7.

## Recommended sequencing
1. **R1 (quiet hours)** — top unowned risk, live in prod, building blocks exist. Extend `feat/tcpa-compliance-hardening`.
2. **R3-ledger (consent events)** — safest possible change (additive, append-only, no behavior change).
3. **R5 finish** (national DNC + `do_not_call`→suppression propagation) on the hardening branch.
4. **R2-email** gate + personal-phone STOP capture.
5. **R4 / R6** — counsel-led decisions.

## Safety guardrails for whoever picks this up
- Work in a **fresh worktree off latest `origin/main`**; **don't** reuse stale worktrees.
- **Extend `feat/tcpa-compliance-hardening`** rather than opening a competing TCPA branch — keep all hardening in one place.
- Ship via **merge to main** only; **no hand-deploys, no flag flips**.
- **Stop-the-bleeding lever (business call):** per-agent `automatedOutreachHold` or `LINQ_OUTBOUND_DISABLED` drain already exist if R1 needs mitigating before the fix lands — both pause legitimate outreach too.

## Suggested BACKLOG rows
- `[TCPA] R1 quiet-hours send-window gate (8a–9p recipient-local) on all automated SMS/push — defer not drop` — **P0**
- `[TCPA] R3 consent-event ledger writes at Activate + referral first reply + conservation contact-basis` — **P0**
- `[TCPA] R5 national DNC scrub + auto-propagate lead do_not_call → suppression` — **P1**
- `[TCPA] R2 gate Resend email lane on suppression; capture personal-phone STOP replies; close linq lookup-miss fail-open` — **P1**
- `[TCPA] R4 require consent/inquiry basis before referral drip` — **P1**
- `[TCPA] R6 FL/strict-state written-consent + quiet-hours path; scope marketing claim w/ counsel` — **P2**
- `[TCPA] R7 gate ai-voice.ts on consent before ship; document non-ATDS posture` — **P2**

---

*Caveat: this is an engineering-grounded compliance gap analysis, not legal advice. The code facts (no quiet-hours gate, consent not recorded, channels not gated, no DNC scrub) are unambiguous. Calls that turn on legal judgment — EBR sufficiency, marketing-vs-transactional, state-autodialer scope — should be confirmed with TCPA/FTSA counsel, which is worth it given the indemnification-with-offset structure agents sign.*
