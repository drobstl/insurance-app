# Cohort relaunch email — May 12, 2026

**To:** founding 34 + any other active agents
**From:** Daniel
**Send:** May 12, 2026 morning, after maintenance lift
**Channel:** your preferred email client (not Resend — keep this personal)

---

## Subject line options (pick one)

1. AgentForLife is back — and the welcome flow finally works
2. We rebuilt AgentForLife. Here's what's different.
3. AFL relaunch — what changed and what to do

---

## Draft (under 250 words)

Subject: AgentForLife is back — and the welcome flow finally works

Hey {firstName},

We're back. Thanks for your patience while I rebuilt the messaging architecture from the ground up.

**What changed:**

The new client onboarding flow is dramatically simpler. When you create a client now, AFL gives you a one-tap **Send via iMessage** button right on screen — pre-filled welcome message, ready to go. No more "open AFL on your phone." Mac+iPhone Continuity, Windows+Phone Link, or any phone — it just works. Send, Copy, or scan a QR code with your phone, whichever is easiest.

The new client experience on the iPhone side is rebuilt too. They land on a clean **Activate** screen, allow notifications, tap one button, and they're in. The whole thing takes about a minute on a live call.

**What you need to do:**

1. **Update AgentForLife on your iPhone / Android** — version 1.6.1 is in the stores. Tell your clients to update too.
2. **The next time you add a client**, watch for the new inline send screen. It replaces the old "welcome will be sent" workflow.
3. **If you've customized your welcome SMS template in Settings**, take a quick look — we updated the default copy. Yours still works as-is, but the new default has the activation step built in.

**What I deliberately didn't change:**

Your client list, your retention alerts, your referrals, your saved policies. Everything you had before is exactly where you left it.

Thanks for sticking with me through the rebuild. This was the foundation that needed to be right before we ship the next round of stuff (deeper retention workflow, bulk import, line-health dashboard) — all coming over the next few weeks.

Reply if anything's broken or weird.

Daniel

---

## Notes for editing

- **Keep it under 250 words.** Personal, not corporate.
- **Don't promise dates** for Phase 2 work beyond "coming over the next few weeks" — gives breathing room.
- **Don't mention Mode 2 / bulk import drip engine** as something they can use TODAY unless it's actually shipped before May 12.
- **Adjust point 2** if the dashboard tour / onboarding overlay makes the new flow self-discoverable enough that they don't need explicit instruction.
- **Adjust point 3** if the welcome-template migration ran (clearing old templates) — would change to "we cleared old custom templates so you'll be on the new default automatically."
- **Spanish-preferring agents:** if any of your founding 34 are Spanish-first, send a translated version. None likely.

## Send mechanics

- **Send from your real email** (not Resend, not the dashboard) so it lands in their inbox as a personal note from Daniel, not a transactional email. Reply-to → your email so they actually reply.
- **BCC the cohort** so they don't see each other's addresses.
- **Send mid-morning Tuesday May 12** — after you've flipped MAINTENANCE_MODE_READONLY=false and LINQ_OUTBOUND_DISABLED=false in Vercel, given the deploy ~60s, and verified the dashboard renders cleanly without the maintenance banner.
