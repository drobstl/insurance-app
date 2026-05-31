# AFL Backlog

> **Living working list** of what's on tap, organized by category and risk. Update as items ship (mark ✅), get bumped (move them), or drop out of scope (remove with a one-line `> dropped because…` note).
>
> **Source of truth for deeper context:** `CONTEXT.md`. This doc is the short, scannable working list — not the full strategy.
>
> **Last reorganized:** May 26, 2026 evening.

---

## 🚨 Acute — finish today/tonight

| Item | Effort | Owner | Notes |
|---|---|---|---|
| Smoke-test live Growth signup end-to-end | ~30 min | Daniel (Stripe Checkout needs hands) | Test card 4242 first → walk full flow → verify Firestore + welcome email arrives. Real card live test after. |
| Update CONTEXT.md with today's 4 merged PRs (#43/#44/#45/#47) | ~10 min | Claude | Doc hygiene. Otherwise tomorrow's sessions cite stale state. |
| **Investigate: Activate-message reply not firing OR not being received by clients** | TBD — diagnosis first | Claude | The load-bearing ritual is breaking somewhere. The reply the AFL pooled line is supposed to send back to a newly-activated client (welcome confirmation + agent vCard + thumbs-up ask per CONTEXT § channel rules) is either not firing on the AFL side or not being delivered. Diagnosis pyramid: (a) is `web/lib/welcome-activation-handler.ts` running when an Activate SMS arrives at the webhook? (b) is `web/app/api/linq/webhook/route.ts` recognizing the inbound and routing to the handler (chatId lookup, `welcome_pending_{clientId}` placeholder thread match)? (c) is `web/lib/linq.ts` `sendMessage` / `createChat` returning a successful send? (d) is the carrier delivering it (Linq dashboard `delivery_status`)? (e) is the client seeing it but missing it (delayed, different thread, MMS attachment failure on vCard)? Daniel observed May 31, 2026 — affects **every new client activation** while broken. **High priority — fix before more clients onboard.** |

---

## 🔧 Small wins — under 2hr each

| Item | Effort | Owner | Notes |
|---|---|---|---|
| Update dial script with Daniel's actual sales script | 30–60 min | Daniel + Claude | Default lives in `web/lib/dial-script.ts`; per-agent override in Settings → Lead-mode. Daniel pastes script, Claude wires it in. |
| Integrate Yurp referral link | 30–60 min | Claude | Scope pending — Daniel to clarify what Yurp is + where the link belongs. |
| Founding-member approval email copy refresh | 15 min | Claude | Drops dead "no CC" line + dead `/signup` link from `web/app/api/admin/applications/approve/route.ts` email template. |
| Founding 34 → Pro $50 Stripe Coupon (`FOUNDING34_PRO`) | 5 min | Daniel (Stripe Dashboard) | $50/mo recurring forever. Required for Founding upgrade-to-Pro mechanic when Pro launches. |
| Verify failing e2e specs are actually fixed | 15 min | Claude | Old memory said 3 specs broken; recent CI green. Reconcile. |
| **Deep-link in activation reply that opens the AFL app back up** | 30–60 min once the activate-reply bug is fixed (see Acute) | Claude | Today after a client texts the activation SMS, the Linq line replies (vCard + thumbs-up ask) but the client has to **manually** switch back to the AFL app. Add a link in that reply that opens AFL directly. Options to evaluate: (a) **Universal Links (iOS) + App Links (Android)** via `apple-app-site-association` / `assetlinks.json` — most native feel, opens app if installed and falls back to a web URL if not. Recommended. (b) URL scheme like `agentforlife://return` — older pattern, less reliable on iMessage previews. (c) Server-side redirect URL like `https://agentforlife.app/app/return?from=activation` that detects mobile and forwards to a scheme. Bundle the implementation with the activate-reply fix in Acute so both ship together. |

---

## ⚖️ Legal — protect the shared line

| Item | Effort | Notes |
|---|---|---|
| **Compliance layer Part 1** (suppression gate + inbound STOP/natural-language detection + minimal consent log) | ~1 day | Audit-first per spec. Spec lives at `docs/afl-compliance-layer-whatwhy.md`. Highest legal risk — willful-violation pattern on the shared line is the single most expensive SMS-law mistake. |
| Compliance Part 2 (full consent log: welcome opt-in capture + conservation contact-basis log) | ~1 day | After Part 1 ships |
| Compliance Part 3 (richer-channel detection, FL-specific edge cases) | TBD | Optional refinement; see CONTEXT and spec Open section |

---

## 🚀 Pro tier — unlock the "Coming Soon" features

Pro is currently marked `comingSoon: true` in `web/lib/pricing.ts`. To launch Pro, the bullets below all need to be real, then remove the flag.

| Item | Effort | Notes |
|---|---|---|
| **MIA lead extraction (handwritten Mail-In OCR)** ⬆️ *bumped per Daniel May 26* | 1–2 days | Use Claude vision for handwritten Mail-In Application PDFs → structured fields. Volume question resolved (Daniel wants it). Rob's call action item #2. |
| **Performance page MVP (call scoring + AI coaching)** | 3–5 days | THE headline Pro feature. Paste call transcript → Claude scores against ideal script → render coaching feedback (rapport, discovery, closing, objection handling). |
| **SME / FIF tracking** | 2–3 days | Appointment + APV-split tagging for mortgage-protection → IUL specialist referrals. CONTEXT backlog. |
| **Flip Pro live** | 5 min | Once above ship: `NEXT_PUBLIC_LEAD_MODE_ADMIN_ONLY=false` in Vercel + remove `comingSoon: true` on pro in `web/lib/pricing.ts`. Buy CTA + Checkout re-enable instantly. |
| **Virtual-number dialing from the lead queue (investigation)** | TBD — needs scoping | An AFL agent doesn't dial from his own cell because he uses a virtual number with a state-matched area code (better answer rates). Funnel (the Symmetry/Quility CRM) supports this and several agents Daniel knows already use it there. **Today's lead-queue Call button fires a `tel:` URL → OS dialer → agent's primary cell.** No way to choose a virtual number. Investigation needs to cover: (a) which virtual-number platforms agents already use (OpenPhone, RingCentral, Twilio, JustCall, Skip Genie, etc.) and whether each supports a per-call deep-link / API; (b) the three integration shapes — browser-based softphone (WebRTC, Twilio Voice SDK), `tel:` deep-link to the agent's installed virtual-number app, or click-to-call API that bridges the agent's cell to the lead with the virtual number as caller ID; (c) BYO-number ("connect your existing virtual number") vs AFL-provisioned-number (revenue opportunity, but complexity around per-agent provisioning, A2P 10DLC registration, etc.); (d) per-state license / area-code matching auto-selection if multi-state agents have multiple virtual numbers. Likely Pro-tier feature once scoped. Tag this as a real customer need — at least one agent today, "quite a few" Daniel knows from Funnel ecosystem. |

---

## 🏢 Agency tier — unlock the "Coming Soon" features

Agency is currently `comingSoon: true` + sales-led mailto. To launch Agency, finish below + remove the flag.

| Item | Effort | Notes |
|---|---|---|
| **Agency band pricing decisions** (9 open Qs in CONTEXT § Pricing band parking lot) | 30 min | Decision-only — sets band sizes + floor + how agent count is measured. **Unblocks everything below.** |
| Team Performance dashboard (leaderboards + coaching priorities widget) | 2–3 days | Sits on top of individual Performance (Pro). Rob's call action item. |
| Team admin tools + per-agent dashboards | 3–5 days | |
| Pooled conversation budget across all seats | 1–2 days | Depends on conversation counter (infrastructure below) |
| Mentor calendar | 2–3 days | CONTEXT backlog. |
| Chargeback comparison vs Symmetry average | 1–2 days | Single manual number until a Symmetry data feed exists. Rob's call action item #10. |
| ROI calculator for agency dashboard | 1–2 days | Real-time ROI across team production. Rob's call action item #9. |

---

## 💰 Infrastructure — Phase 3 enablers

| Item | Effort | Notes |
|---|---|---|
| Conversation counter + overage enforcement | ~1 week | Per-agent monthly counter + dashboard widget + 80%/100% notifications + Stripe metered SKU + cap-aware send logic. **Policy locked May 26:** auto-prompt upgrade at 80% + auto-bill overage at $0.50/conv. Unlocks Agency pooled budget. |
| Pricing rollout validation with first 5–10 agent cohort | Ongoing | Watch real signups, fix what breaks |

---

## 📦 Backlog (not yet phased)

Strategic items captured so they don't get lost — pull into a tier section above when their phase opens.

| Item | Notes |
|---|---|
| Agency Rocket partnership discovery call | Rob's call action item #3 — non-engineering, Daniel-led |
| **LettrLabs direct mail integration** | Automated postcards + robotic handwritten letters via their API (direct or Zapier; 7,000+ Zapier integrations). Fits AFL's branded-touchpoint pitch — physical retention/anniversary/holiday/birthday cards from the agent. Implementation thoughts: variable per-send cost → likely a Pro+ add-on with usage billing, OR a feature gate ("X cards/year included"). Use cases: anniversary policy reviews (the rewrite pitch lands harder in a hand-addressed envelope), client-won wins (handwritten "welcome to AFL" card from the agent), beneficiary cards. Daniel flagged May 29 as worth exploring as an integration. URL: https://www.lettrlabs.com |
| Email infrastructure cleanup (Resend centralization, bounce/complaint webhook, suppression list) | Phase 2 backlog. Overlaps with compliance Part 1/2 suppression pattern — design once, ship in two PRs (SMS first, email second). |
| Auto-throttle at KPI Tier 1 / Tier 2 | Phase 2 backlog. Deferred until 1–2 weeks of real reply-rate data confirms spec thresholds. |
| Phase 2 success metrics dashboard | Phase 2 backlog. Welcome-send compliance, activation rate, thumbs-up rate, retention reply rate. |
| Reach out to Jeff (Intelra) | Rob's call action item #11 — non-engineering |
| **Configurable production-month boundary for Activity APV lifecycle** | Pro-tier follow-on (post-launch). Today `web/lib/activity-stats.ts` → `resolveRange()` treats "month" as the calendar month (1st → last day, UTC), and every lifecycle number (Submitted / Gross Issued / Chargebacks / Net Placed) plus the policy ledger derives its period window from that. **But IMOs run on a commission month, not the calendar — Symmetry's is the 28th → 28th, others differ.** So a policy "issued-paid within the month" should be attributed to the IMO's month, not the calendar. **Build:** an agent-level setting like `productionMonthStartDay` (default 1; Symmetry = 28), possibly exposed as named IMO presets ("Symmetry," "FFL," "Quility," "Custom day-of-month..."). **Decide before building:** (a) where it lives in Settings — likely Activity / Profile section; (b) the default — keep at 1 with explicit IMO chooser, or detect-from-license-IMO; (c) whether the boundary shift also applies to prior-period comparison + week + YTD ranges, or month only (probably ALL ranges so the deltas stay coherent); (d) Agency-tier cascade — IMO/agency-level default inherited by every downline agent, overridable per agent. Triggered when an agent files a "my numbers don't match Symmetry's commission statement" complaint. Until then, calendar month is acceptable. |
| **Mobile client onboarding redesign: split Activate screen + add notification pre-prompt** | Multi-day (mobile EAS) | Today the Activate screen tries to do two things on one view (Allow notifications + Activate SMS). Daniel May 31: split into two screens for cognitive cleanliness, matching the X-app pattern Daniel shared. **Screen 1 — Notification pre-prompt:** custom screen mimicking the iOS dialog visual (white card on dim backdrop, "Not now" / pulsating-blue-ring "Allow" buttons). Tapping "Allow" calls `Notifications.requestPermissionsAsync()` which triggers the **real** iOS dialog (can't decorate the system dialog itself per Apple HIG). Standard pre-prompt pattern → maximizes OS-prompt acceptance because we've framed the why before the system asks. **Screen 2 — Activate:** single big button + the compliance layer's verbatim consent copy from `docs/afl-compliance-layer-whatwhy.md`. AFL infinity icon and "your agent" fallbacks per the depersonalized lock. Tapping Activate fires `sms:` URL → client texts the pooled line. **Open decisions to lock before building** (Daniel deferred answering May 31): (1) notification denial path — hard gate / soft warn / let through? (anniversary, holiday, birthday lanes silently end without push per CONTEXT § channel rules, so denial has real product cost); (2) order — notifications-then-Activate (proposed) vs Activate-then-notifications; (3) show pre-prompt only on first install OR every login (probably first-install only); (4) Android handling (Android 13+ has its own system prompt; pre-prompt screen still helps); (5) personalization on Screen 1 — agent first name if we have context vs "your agent" fallback per the depersonalized lock; (6) pulsating-ring animation implementation (React Native Animated, ~300ms cycle, scale + opacity loop); (7) "Not now" vs "Don't Allow" vs "Maybe later" wording. Bundles naturally with the compliance layer Part 1 ship since both touch the Activate screen copy. **Sketch is in Daniel-Claude chat history May 31 — capture into a design doc when this gets pulled into a phase.** |

---

## How to use this doc

- **Adding items:** drop into the right section with effort estimate + notes. If you don't know which section, "Backlog" is fine.
- **Shipping items:** mark with ✅ and move to a separate "Recently shipped" section at the bottom, OR just delete and add a one-line note to CONTEXT.md.
- **Re-prioritizing:** move rows between sections. Don't agonize about precise rank within a section — categories matter more than fine-grained ordering.
- **Open clarifications:** if an item needs more info, mark it explicitly (see Yurp row in Small wins).
