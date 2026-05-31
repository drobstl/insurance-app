# AFL Backlog

> **Living working list** of what's on tap, organized by category and risk. Update as items ship (move to Recently Shipped), get bumped (move between sections), or drop out of scope (remove with a one-line `> dropped because…` note).
>
> **Source of truth for deeper context:** `CONTEXT.md`. This doc is the short, scannable working list — not the full strategy.
>
> **Status conventions** (May 31, 2026):
> - 🟡 Open — not started
> - 🟢 In progress — a session is actively working on it; Notes column says which session / branch / PR
> - 🔴 Blocked — work paused with the reason in Notes
> - ✅ Shipped — moves to the "Recently shipped" section at the bottom with its PR #
>
> **Last reorganized:** May 31, 2026.

---

## 🚨 Acute — finish today/tonight

| Item | Effort | Owner | Notes |
|---|---|---|---|
| 🟡 Smoke-test live Growth signup end-to-end | ~30 min | Daniel (Stripe Checkout needs hands) | Test card 4242 first → walk full flow → verify Firestore + welcome email arrives. Real card live test after. |
| 🟢 Investigate: Activate-message reply not firing OR not being received by clients | TBD diagnosis first | Claude | **Currently in flight — spawned via FleetView chip May 31, 2026.** The load-bearing ritual is breaking somewhere. Diagnosis pyramid: handler → webhook routing → linq send → carrier delivery → client-side visibility. Affects every new client activation while broken. **High priority.** |

---

## 🔧 Small wins — under 2hr each

| Item | Effort | Owner | Notes |
|---|---|---|---|
| 🟡 Update dial script with Daniel's actual sales script | 30–60 min | Daniel + Claude | Default lives in `web/lib/dial-script.ts`; per-agent override in Settings → Lead-mode. Daniel pastes script, Claude wires it in. |
| 🟢 Integrate Yurp referral link | 30–60 min | Parallel session | **Currently in flight — parallel session May 31, 2026.** Affiliate / referral link integration. |
| 🟡 Founding-member approval email copy refresh | 15 min | Claude | Drops dead "no CC" line + dead `/signup` link from `web/app/api/admin/applications/approve/route.ts` email template. |
| 🟡 Founding 34 → Pro $50 Stripe Coupon (`FOUNDING34_PRO`) | 5 min | Daniel (Stripe Dashboard) | $50/mo recurring forever. Required for Founding upgrade-to-Pro mechanic when Pro launches. |
| 🟡 Verify failing e2e specs are actually fixed | 15 min | Claude | Old memory said 3 specs broken; recent CI green. Reconcile. |
| 🟡 Deep-link in activation reply that opens the AFL app back up | 30–60 min once activate-reply bug is fixed (see Acute) | Claude | Universal Links + App Links recommended. Bundle with activate-reply fix so both ship together. |

---

## ⚖️ Legal — protect the shared line

| Item | Effort | Notes |
|---|---|---|
| 🟢 **Compliance layer Part 1** (suppression gate + inbound STOP/natural-language detection + minimal consent log) | ~1 day | **Currently in flight — spawned via FleetView chip May 31, 2026.** Audit complete: outbound is 100% consolidated through `web/lib/linq.ts`. Decisions locked: typed-reason override modal, verbatim consent copy. See `docs/afl-compliance-layer-whatwhy.md`. |
| 🟡 Compliance Part 2 (full consent log: welcome opt-in capture + conservation contact-basis log) | ~1 day | After Part 1 ships |
| 🟡 Compliance Part 3 (richer-channel detection, FL-specific edge cases) | TBD | Optional refinement; see CONTEXT and spec Open section |

---

## 🚀 Pro tier — unlock the "Coming Soon" features

Pro is currently marked `comingSoon: true` in `web/lib/pricing.ts`. To launch Pro, the bullets below all need to be real, then remove the flag.

| Item | Effort | Notes |
|---|---|---|
| 🟡 **MIA lead extraction (handwritten Mail-In OCR)** ⬆️ *bumped per Daniel May 26* | 1–2 days | Use Claude vision for handwritten Mail-In Application PDFs → structured fields. Volume question resolved (Daniel wants it). Rob's call action item #2. |
| 🟡 **Performance page MVP (call scoring + AI coaching)** | 3–5 days | THE headline Pro feature. Paste call transcript → Claude scores against ideal script → render coaching feedback (rapport, discovery, closing, objection handling). |
| 🟡 **SME / FIF tracking** | 2–3 days | Appointment + APV-split tagging for mortgage-protection → IUL specialist referrals. CONTEXT backlog. |
| 🟢 **BunnyStream video integration for mobile lead-home (intro + FAQs + case studies)** | Multi-day | **Currently in flight — parallel session May 31, 2026.** Replaces / supplements the current per-agent video manifest in `agentProfile.leadContent` with BunnyStream as the video CDN. Affects mobile lead-home rendering (`mobile/app/lead-home.tsx`) and the upload + manifest endpoints. |
| 🟡 Virtual-number dialing from the lead queue (investigation) | TBD — needs scoping | An AFL agent uses a state-matched virtual number; today's `tel:` URL only dials from the primary cell. Investigation: which platforms, integration shape, BYO vs provisioned, per-state matching. See [#61](https://github.com/drobstl/insurance-app/pull/61) for the full scoping notes. |
| 🟡 **Flip Pro live** | 5 min | Once above ship: `NEXT_PUBLIC_LEAD_MODE_ADMIN_ONLY=false` in Vercel + remove `comingSoon: true` on pro in `web/lib/pricing.ts`. Buy CTA + Checkout re-enable instantly. |

---

## 🏢 Agency tier — unlock the "Coming Soon" features

Agency is currently `comingSoon: true` + sales-led mailto. To launch Agency, finish below + remove the flag.

| Item | Effort | Notes |
|---|---|---|
| 🟡 **Agency band pricing decisions** (9 open Qs in CONTEXT § Pricing band parking lot) | 30 min | Decision-only — sets band sizes + floor + how agent count is measured. **Unblocks everything below.** |
| 🟡 Team Performance dashboard (leaderboards + coaching priorities widget) | 2–3 days | Sits on top of individual Performance (Pro). Rob's call action item. |
| 🟡 Team admin tools + per-agent dashboards | 3–5 days | |
| 🟡 Pooled conversation budget across all seats | 1–2 days | Depends on conversation counter (infrastructure below) |
| 🟡 Mentor calendar | 2–3 days | CONTEXT backlog. |
| 🟡 Chargeback comparison vs Symmetry average | 1–2 days | Single manual number until a Symmetry data feed exists. Rob's call action item #10. |
| 🟡 ROI calculator for agency dashboard | 1–2 days | Real-time ROI across team production. Rob's call action item #9. |

---

## 💰 Infrastructure — Phase 3 enablers

| Item | Effort | Notes |
|---|---|---|
| 🟡 Conversation counter + overage enforcement | ~1 week | Per-agent monthly counter + dashboard widget + 80%/100% notifications + Stripe metered SKU + cap-aware send logic. **Policy locked May 26:** auto-prompt upgrade at 80% + auto-bill overage at $0.50/conv. Unlocks Agency pooled budget. |
| 🟡 Pricing rollout validation with first 5–10 agent cohort | Ongoing | Watch real signups, fix what breaks |

---

## 📦 Backlog (not yet phased)

Strategic items captured so they don't get lost — pull into a tier section above when their phase opens.

| Item | Notes |
|---|---|
| 🟡 Agency Rocket partnership discovery call | Rob's call action item #3 — non-engineering, Daniel-led |
| 🟡 LettrLabs direct mail integration | Automated postcards + robotic handwritten letters via their API (direct or Zapier; 7,000+ Zapier integrations). Fits AFL's branded-touchpoint pitch — physical retention/anniversary/holiday/birthday cards from the agent. Implementation thoughts: variable per-send cost → likely a Pro+ add-on with usage billing, OR a feature gate ("X cards/year included"). Daniel flagged May 29 as worth exploring. URL: https://www.lettrlabs.com |
| 🟡 Email infrastructure cleanup (Resend centralization, bounce/complaint webhook, suppression list) | Phase 2 backlog. Overlaps with compliance Part 1/2 suppression pattern — design once, ship in two PRs (SMS first, email second). |
| 🟡 Auto-throttle at KPI Tier 1 / Tier 2 | Phase 2 backlog. Deferred until 1–2 weeks of real reply-rate data confirms spec thresholds. |
| 🟡 Phase 2 success metrics dashboard | Phase 2 backlog. Welcome-send compliance, activation rate, thumbs-up rate, retention reply rate. |
| 🟡 Reach out to Jeff (Intelra) | Rob's call action item #11 — non-engineering |
| 🟡 Configurable production-month boundary for Activity APV lifecycle | Pro-tier follow-on. Today `web/lib/activity-stats.ts` → `resolveRange()` treats "month" as calendar month; IMOs run on commission month (Symmetry = 28th → 28th). Agent-level `productionMonthStartDay` setting + IMO presets. Triggered when an agent complains numbers don't match their commission statement. |
| 🟡 Mobile client onboarding redesign: split Activate screen + add notification pre-prompt | Multi-day mobile EAS. Notification pre-prompt (X-app pattern with pulsating blue ring on Allow) → separate Activate screen with compliance verbatim consent copy. Seven open design decisions captured in the May 31 chat sketch — flesh out into a design doc when this gets pulled into a phase. Bundles naturally with compliance Part 1 since both touch the Activate screen. |

---

## ✅ Recently shipped

When a backlog item ships, move it here with its PR # and date. Keeps the working tier sections clean. Older items can be pruned monthly into CONTEXT.md.

| Item | PR | Shipped |
|---|---|---|
| *(Older ships are captured in CONTEXT.md's recent-activity timeline — start populating this section as Part-1 / activate-reply / Yurp / BunnyStream sessions land.)* | — | — |

---

## How to use this doc

- **Status conventions:** 🟡 Open / 🟢 In progress / 🔴 Blocked / ✅ Shipped (move to Recently Shipped). Default emoji is 🟡 if unset.
- **Adding items:** drop into the right section with effort estimate + notes. If you don't know which section, "Backlog" is fine. Mark 🟢 immediately if you've already spawned a session for it.
- **Starting work:** if you spawn a parallel session for an item, tell the organizing session ("I just kicked off X for Y"). The organizing session marks the row 🟢 and tracks PR state by polling `gh pr list`.
- **Shipping items:** the orchestrator moves the row to "Recently shipped" when its PR merges. Older shipped items get pruned into CONTEXT.md's timeline monthly.
- **Re-prioritizing:** move rows between sections. Don't agonize about precise rank within a section — categories matter more than fine-grained ordering.
- **Open clarifications:** if an item needs more info, mark it explicitly (e.g., "*scope pending — Daniel to clarify*").
