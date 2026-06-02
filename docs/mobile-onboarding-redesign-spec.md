# Mobile client onboarding redesign — spec

**Status:** Design, not built. No implementation code yet (Daniel: "Don't code yet").
**Provenance:** Sketched in the Daniel↔Claude session "To-do list review and planning" (2026-05-31). Reconstructed here 2026-06-01 so it isn't lost in chat history. Backlog row: `docs/BACKLOG.md` line ~139.
**Owner:** Claude (build) once pulled into a phase; Daniel (design-decision sign-off below).

---

## 1. What this is

Today the client-side **Activate** screen does two jobs on one screen: it fires the iOS push-permission dialog *and* it holds the Activate button + consent copy. Two-on-one feels jammed, and the push step deserves its own moment.

This redesign **splits Activate into two screens**:

1. **Screen 1 — Notification pre-prompt.** A branded screen that mimics the iOS permission dialog (white card on a dim backdrop), with a **pulsating blue ring on the "Allow" button** (the pattern Daniel liked from the X app). Tapping "Allow" here fires the *real* OS permission dialog.
2. **Screen 2 — Activate.** Single-purpose: AFL infinity icon, one big Activate button, and the verbatim compliance consent copy.

Plus two adjacent items captured in the same session:
- **Deep-link in the activation reply** so the client is taken back into the app instead of app-switching manually.
- **Brand fix:** the loading splash still says "My Insurance" — should read "AgentForLife".

---

## 2. What has shipped since the sketch (reconciliation — read before building)

The sketch was drawn 2026-05-31. Two things it referenced as "to come" have since shipped, which **changes the build plan**:

- **Activate-reply bug — FIXED (PR #69, merged May 31).** "Decouple vCard MMS, add diagnostic logs." The deep-link feature was originally gated on this fix; it is now **unblocked**.
- **Compliance layer Part 1 — SHIPPED (PR #70, merged May 31).** This includes the **verbatim Activate consent copy**, which already lives in the code at [`mobile/app/activate.tsx:478`](mobile/app/activate.tsx#L478). The sketch said the consent copy "belongs on Screen 2" — it now exists; Screen 2 **lifts the existing block as-is**, it does not need new copy.
- **Stale backlog note:** `BACKLOG.md:139` says this redesign "Bundles with Compliance Part 1 ship (both touch the Activate screen)." Compliance Part 1 has now shipped, so the bundle window has passed — **the redesign is now a standalone change.** Update that row when this is pulled into a phase.

Current screen for reference (the thing being split): [`mobile/app/activate.tsx`](mobile/app/activate.tsx) — auto-fires the OS dialog on mount (lines 203–259), shows numbered steps "1. Tap Allow ⤴ / 2. Then tap Activate ⤵", and uses only a **subtle scale pulse** (1.0→1.035, lines 264–286) on the Activate button — *not* the emanating ring this spec calls for.

---

## 3. Screen 1 — Notification pre-prompt

Mimics the iOS dialog look (white card on dim background). When the user taps the highlighted **Allow**, the real iOS system prompt fires.

```
┌─────────────────────────────────────┐
│                                     │
│                                     │
│          [dim dark backdrop]        │
│                                     │
│                                     │
│   ┌─────────────────────────────┐   │
│   │                             │   │
│   │  Stay in the loop with      │   │
│   │  {Agent first name}         │   │
│   │                             │   │
│   │  Push notifications keep    │   │
│   │  you on top of policy       │   │
│   │  updates, anniversary       │   │
│   │  reviews, and the           │   │
│   │  birthdays / holidays your  │   │
│   │  agent likes to mark.       │   │
│   │                             │   │
│   │ ┌─────────┐  ⦿─────────⦿   │   │
│   │ │Not now  │  ⦿  Allow   ⦿  │   │   ← pulsating ring
│   │ └─────────┘  ⦿─────────⦿   │   │
│   └─────────────────────────────┘   │
│                                     │
└─────────────────────────────────────┘
```

**Copy (Screen 1 card):**
- Title: `Stay in the loop with {Agent first name}` (fall back to "your agent" — see decision 5)
- Body: `Push notifications keep you on top of policy updates, anniversary reviews, and the birthdays / holidays your agent likes to mark.`
- Buttons: `Not now` (secondary) · `Allow` (primary, pulsating ring) — final wording of "Not now" is decision 7.

**Why a pre-prompt (implementation note):** the real iOS permission dialog **cannot be decorated** — you can't draw a ring on top of a system dialog. So Screen 1 is a *pre-prompt* that triggers the real OS dialog when "Allow" is tapped (`Notifications.requestPermissionsAsync()`). The pre-prompt is the standard pattern for maximizing OS-prompt acceptance — you've framed *why* before the system asks, so the OS "Allow" tap rate goes up.

> **⚠️ Build note (platform policy — see §7b):** build Screen 1 as a **clearly branded AFL screen** (teal, infinity icon, our fonts, the pulsing ring) — **not** a pixel-perfect clone of the iOS system alert with system-style buttons. Cloning the system dialog to deceive trips Apple's deceptive-UI rules + Google's deceptive-behavior policy. Drop the original sketch's "mimics the iOS dialog / white card on dim backdrop" framing; the pulsing ring already signals it isn't a system dialog (Apple's never animate).

**Ring animation:** React Native `Animated.loop` on a scaled-down/up View behind the Allow button with an opacity transition (ring grows + fades out, repeating). ~300ms cycle felt right in discussion; tune so it draws the eye without being seizure-inducing. Pure JS — no native dependency.

---

## 4. Screen 2 — Activate (separated)

Single-purpose. AFL infinity icon, one big button, verbatim consent copy underneath.

```
┌─────────────────────────────────────┐
│                                     │
│                                     │
│           ┌───┐                     │
│           │ ∞ │   AFL infinity      │
│           └───┘                     │
│                                     │
│        Tap Activate to              │
│       let {agent first              │
│       name OR "your                 │
│       agent"} know                  │
│       you're set up                 │
│                                     │
│                                     │
│   ┌─────────────────────────┐       │
│   │                         │       │
│   │       Activate          │       │
│   │                         │       │
│   └─────────────────────────┘       │
│                                     │
│                                     │
│   By tapping Activate, you agree    │
│   to receive account, policy, and   │
│   service text messages from        │
│   {Agent}. Msg & data rates may     │
│   apply. Reply STOP to opt out,     │
│   HELP for help. Terms · Privacy    │
│                                     │
└─────────────────────────────────────┘
```

**Consent copy = SHIPPED, lift verbatim.** Do **not** rewrite. Use the exact block already live at [`mobile/app/activate.tsx:478–500`](mobile/app/activate.tsx#L478), locked by `docs/afl-compliance-layer-whatwhy.md` §"Activate consent copy (ship verbatim)":

> By tapping **Activate**, you agree to receive account, policy, and service text messages — including automated messages — from **{agentName}** at this number. Msg & data rates may apply. Message frequency varies. Reply **STOP** to opt out, **HELP** for help. See **Terms** & **Privacy**.

**Behavior carried over unchanged from today's Activate screen:**
- Activate fires the `sms:` URL (`buildSmsUrl` / `buildActivationBody`) → composes the client's pre-filled inbound to the Linq line (`+14046453010` platform default). Body: `Activate my account — code {CODE}. Yes, I'd like to receive policy updates, reminders, and service texts from {agent}.`
- **Hard gate, no Skip** (Daniel's May 6 lock; see `[[feedback_no_client_activate_skip]]` and the activate.tsx header comment).
- AppState listener auto-advances to `/agent-profile` on return from Messages.
- Defensive fallbacks (no SMS-capable device, `canOpenURL` false) still forward through — config/hardware limits, not user choice.

---

## 5. Flow change

**Today** (May 8 inversion → May 25 login-first refactor):
```
login (code entry) → activate (push ask + Activate combined) → agent-profile
```

**Proposed:**
```
login (code entry)
   → Screen 1: Notification pre-prompt → triggers iOS dialog → granted/denied
   → Screen 2: Activate (consent copy) → fires sms: → client texts the line
   → agent-profile
```

Routing today goes through `navigateToProfile()` in [`mobile/app/index.tsx`](mobile/app/index.tsx) (unactivated client → `/activate`). The split adds one route. Two clean options — pick during build:
- **(a)** New `/notify` (or `/activate/notify`) screen rendered *before* `/activate`; `/activate` loses its on-mount permission logic and becomes Activate-only.
- **(b)** Single `/activate` route with a two-step internal state machine (step `notify` → step `activate`). Less router churn; keeps the param-passing in one place.

Recommendation: (a) — two real screens give cleaner back-stack behavior and match the "two screens" intent, and let Screen 1 be skipped wholesale (decision 3) without branching inside Activate.

---

## 6. Brand fix — "My Insurance" → "AgentForLife"

Single occurrence in the app: the loading splash title at [`mobile/app/index.tsx:351`](mobile/app/index.tsx#L351):

```tsx
<Text style={styles.loadingTitle}>My Insurance</Text>
```

Change to `AgentForLife`. The app name in `app.json` is already "AgentForLife" — this is the only user-visible "My Insurance" string left. One-line JS change; bundle it with the redesign. (Pure JS → OTA-eligible.)

---

## 7. Design decisions

These are the seven captured in the 05-31 session. **#1 and #7 are LOCKED by Daniel (Jun 1)** — see rows below. #2–#6 carry my read; confirm or override during build (my reads are all low-risk defaults).

| # | Decision | Options / my read |
|---|----------|-------------------|
| 1 | **Notification denial path** | **🔒 LOCKED (Jun 1): soft-gate, never block — but maximize allows.** Rules: (1) "Maybe later" on the pre-prompt does **NOT** fire the real OS dialog — it just lets the client through to Activate. This preserves the iOS one-shot system prompt (see §7b) so we can ask again. (2) Only "Allow" fires the OS dialog. (3) If the OS dialog itself is denied → show the existing "Notifications are off → Open Settings" recovery row and proceed. (4) Never block forward progress. (5) Bias the visual hierarchy hard toward Allow — big pulsing button, small low-contrast "Maybe later" text link. (6) Re-surface the pre-prompt **once** on a later launch if they deferred (the OS prompt isn't burned, so it's a free second at-bat); cap at one to avoid nagware. Rationale: push can't be *required* (Apple 4.5.4), and the **live agent-guided moment is the real conversion lever** — the agent says "tap the glowing button" — not a forced gate. |
| 2 | **Order** | Notifications-first then Activate (proposed), or Activate-first then Notifications. *Notifications-first matches the X-app pattern and the spec's "three reinforcements" framing (text, verbal, app), and gets the high-friction OS permission out of the way before the SMS step.* **My read: notifications-first.** |
| 3 | **Show Screen 1 only on first install?** | If the user has already granted (or hard-denied, `canAskAgain:false`) push, skip Screen 1 and go straight to Activate. **My read: yes — don't re-ask every login.** Mirror today's on-mount permission check to decide whether to render Screen 1. |
| 4 | **Android handling** | Android 13+ fires a system prompt automatically the first time push is needed; the pre-prompt still helps. Show Screen 1 on Android too; "Allow" → call the Android request API. Older Android = auto-granted, skip Screen 1. *Today's code already handles the Android-13 `denied`+`canAskAgain:true` "not yet asked" quirk — reuse that logic.* **Treat iOS + Android as equals** (`[[feedback_dual_platform_first_class]]`). |
| 5 | **Personalization on Screen 1** | Use agent first name if known, else "your agent" (the depersonalized-fallback lock). *By this point in the flow the client has logged in via code, so agent context should be present in route params (`agentName`).* |
| 6 | **Pulsating ring animation** | `Animated.loop` on a scaled View + opacity transition behind the Allow button, ~300ms cycle. Cheap; time it to draw the eye without being seizure-inducing. |
| 7 | **Decline-button wording** | **🔒 LOCKED (Jun 1): "Maybe later."** Not "Don't Allow." On the pre-prompt the decline is genuinely a deferral (nothing is burned — see #1), and the real iOS dialog fires its *own* "Don't Allow" half a second later, so reusing that label would make our screen and Apple's indistinguishable. "Maybe later" keeps them distinct and keeps the door open. |

---

## 7b. Platform policy (Apple / Google) — cleared

Checked against the App Store Review Guidelines + Google Play policy before locking (Jun 1). **Nothing here is prohibited.** Two guardrails to respect during build:

- **Push can't be required to use the app** — Apple **Guideline 4.5.4**, Google's equivalent. Our soft-gate (#1) satisfies this *by design*; notifications are never a hard block. (The Activate SMS step *is* a hard gate, but that's account activation, not a push gate, and it already shipped + passed review in 1.6.x, so 4.5.4 doesn't touch it.)
- **Don't clone the system alert to deceive** — Apple's deceptive-UI provisions + Google's deceptive-behavior policy. A *branded* pre-prompt is the standard, approved pattern; a pixel-perfect fake of the OS dialog is not. → **Build Screen 1 as a full branded AFL screen, not a system-alert lookalike** (see the build note in §3). The pulsing ring helps prove it isn't a system dialog.
- **Re-asking once (#1) is fine.** Showing our own pre-prompt again is our UI, not the system API (iOS allows only one real prompt regardless). One re-ask cap is taste, not a rule.
- **Deep links (Universal Links / App Links): zero policy risk.** Platform-sanctioned mechanism; only requirement is hosting the association files on agentforlife.app (§9).

---

## 8. Deep-link in the activation reply (related, separate work)

**Goal:** when the activation reply text goes to the client, include a tappable link that **reopens the AFL app** so the client doesn't have to manually app-switch back. Backlog row: `BACKLOG.md:69`. **Now unblocked** (the activate-reply bug it was gated on was fixed in PR #69).

**Two ways to build it — they differ sharply on ship cost:**

- **Custom scheme `agentforlife://…`** — already declared in `app.json` (`"scheme": "agentforlife"`). A link like `agentforlife://activate` works from the SMS *today, no native change*. **Downside:** custom-scheme links in an SMS often render as **plain non-tappable text** on iOS (iOS only auto-links `http(s)` and a few known schemes), and tapping an unknown scheme can show a scary "Open in AgentForLife?" interstitial. Unreliable as the primary affordance.
- **Universal Links (iOS) + App Links (Android)** — a normal `https://agentforlife.app/...` link that the OS routes straight into the app. This is the right UX (taps reliably open the app, no interstitial). **Requires a native build** (see §9): iOS `associatedDomains` entitlement + a hosted `apple-app-site-association` file; Android `autoVerify` intent filters + a hosted `assetlinks.json`. Neither entitlement is in `app.json` today.

**Recommendation:** go Universal Links + App Links for the real feature, and fold it into the same native build as the screen split so we only cut one build. The hosted association files (`/.well-known/apple-app-site-association` and `/.well-known/assetlinks.json` on agentforlife.app, served by the `web` project) need to land **before** the build ships.

---

## 9. Build & ship classification — OTA vs native build

**Short answer: the screen split, ring animation, copy, and brand fix are all OTA-eligible JS. The deep-link (done right) needs a new native build for both stores. Because we want the deep-link, plan on cutting a new iOS + Android build and shipping the whole bundle through the stores.**

| Work item | OTA-eligible? | Why |
|---|---|---|
| Split Activate into 2 screens | ✅ OTA | Pure JS/expo-router — no native module, no entitlement, no `app.json` change. |
| Notification pre-prompt screen + copy | ✅ OTA | UI + existing `expo-notifications` JS API (already in the build). |
| Pulsating ring animation | ✅ OTA | `Animated` is JS. |
| Lift verbatim consent copy to Screen 2 | ✅ OTA | Copy already shipped; just relocating it. |
| Brand fix "My Insurance" → "AgentForLife" | ✅ OTA | One-line JS string. |
| Deep-link via **custom scheme** `agentforlife://` | ✅ OTA | Scheme already declared in the current build. *(But unreliable in SMS — see §8.)* |
| Deep-link via **Universal Links / App Links** | ❌ **Native build** | Needs iOS `associatedDomains` entitlement + Android `autoVerify` intent filters in `app.json`, which **bake at native build time**, plus hosted `apple-app-site-association` / `assetlinks.json`. |

**Two caveats that make a native build the practical path regardless:**

1. **OTA only reaches matching `runtimeVersion`.** `app.json` sets `runtimeVersion.policy = "appVersion"` at `version 1.6.6`. An OTA update reaches only installs already on **1.6.6**. The **public stores are still on 1.6.1** (per `[[feedback_dual_platform_first_class]]`) — 1.6.6 is the build currently being *submitted*, not yet released. So an OTA push of the UI today would reach essentially no public users until 1.6.6 (or later) is live in both stores anyway.
2. **Apple closes a version "train" once approved.** Bump `version` in `app.json` (not just `buildNumber`/`versionCode`) before the next submission (`[[reference_apple_version_train]]`).

**Recommended ship sequence (one bundle):**
1. Land the OTA-eligible UI work (screens, ring, copy, brand fix) in JS.
2. Add `associatedDomains` (iOS) + App Links intent filters (Android) to `app.json` for the deep-link; bump `version`.
3. Host `apple-app-site-association` + `assetlinks.json` on agentforlife.app (`web` project) — must be live before the build ships.
4. Cut a new EAS build for **both** iOS and Android (canonical working dir; verify the printed Commit — `[[feedback_eas_uses_canonical_working_dir]]`).
5. Daniel submits manually (iOS = Transporter, Android = `eas submit`).
6. Optional: once that store version is live, the UI half *can* be hot-fixed via `eas update` to that runtime version without a new build — but the deep-link cannot.

---

## 10. Build checklist (when pulled into a phase)

- [ ] Daniel signs off on the 7 decisions in §7 (esp. #1 denial path, #7 "Not now" wording).
- [ ] Screen 1 `/notify` screen (pre-prompt card, dim backdrop, pulsating-ring Allow).
- [ ] Screen 2 `/activate` reduced to Activate-only (move on-mount permission logic to Screen 1; keep consent copy + sms: behavior + hard gate).
- [ ] First-install gate: skip Screen 1 if push already granted/hard-denied (decision 3).
- [ ] Android parity verified on a real device (decision 4).
- [ ] Brand fix `index.tsx:351`.
- [ ] Deep-link: `app.json` entitlements/intent-filters + `version` bump + hosted association files; `https://agentforlife.app/...` link in the activation reply (server side, in the Linq webhook reply path).
- [ ] New EAS build iOS + Android; verify Commit; Daniel submits to both stores.
- [ ] Update `BACKLOG.md` rows 69 + 139 (remove stale "bundle with Compliance Part 1" note).
```
