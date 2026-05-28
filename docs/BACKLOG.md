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

---

## 🔧 Small wins — under 2hr each

| Item | Effort | Owner | Notes |
|---|---|---|---|
| Update dial script with Daniel's actual sales script | 30–60 min | Daniel + Claude | Default lives in `web/lib/dial-script.ts`; per-agent override in Settings → Lead-mode. Daniel pastes script, Claude wires it in. |
| Integrate Yurp referral link | 30–60 min | Claude | Scope pending — Daniel to clarify what Yurp is + where the link belongs. |
| Founding-member approval email copy refresh | 15 min | Claude | Drops dead "no CC" line + dead `/signup` link from `web/app/api/admin/applications/approve/route.ts` email template. |
| Founding 34 → Pro $50 Stripe Coupon (`FOUNDING34_PRO`) | 5 min | Daniel (Stripe Dashboard) | $50/mo recurring forever. Required for Founding upgrade-to-Pro mechanic when Pro launches. |
| Verify failing e2e specs are actually fixed | 15 min | Claude | Old memory said 3 specs broken; recent CI green. Reconcile. |

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
| Email infrastructure cleanup (Resend centralization, bounce/complaint webhook, suppression list) | Phase 2 backlog. Overlaps with compliance Part 1/2 suppression pattern — design once, ship in two PRs (SMS first, email second). |
| Auto-throttle at KPI Tier 1 / Tier 2 | Phase 2 backlog. Deferred until 1–2 weeks of real reply-rate data confirms spec thresholds. |
| Phase 2 success metrics dashboard | Phase 2 backlog. Welcome-send compliance, activation rate, thumbs-up rate, retention reply rate. |
| Reach out to Jeff (Intelra) | Rob's call action item #11 — non-engineering |

---

## How to use this doc

- **Adding items:** drop into the right section with effort estimate + notes. If you don't know which section, "Backlog" is fine.
- **Shipping items:** mark with ✅ and move to a separate "Recently shipped" section at the bottom, OR just delete and add a one-line note to CONTEXT.md.
- **Re-prioritizing:** move rows between sections. Don't agonize about precise rank within a section — categories matter more than fine-grained ordering.
- **Open clarifications:** if an item needs more info, mark it explicitly (see Yurp row in Small wins).
