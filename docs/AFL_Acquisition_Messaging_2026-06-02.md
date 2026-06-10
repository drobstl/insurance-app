# AFL Acquisition Messaging & Positioning — 2026-06-02

> Working doc for the funnel rewrite (homepage `/v5` + `/pricing`). Captures the
> chosen wedge, the message hierarchy, the trial-first page structure, a copy
> library (including candidate lines to test), and a red-team / open-questions
> section so we don't lock copy on the first thing we found.
>
> Status: **DRAFT — red-team resolved (2026-06-02).** Wedge holds but must be
> *forward-framed* (see §5); two cited red-team passes are integrated in §5 +
> §7; candidate-line verdicts in §4 are now firm. Open: pull AFL's own PostHog
> funnel (§6) and get Daniel's go before rewriting `/pricing`.

## Source / provenance

Strategy session 2026-06-02 (Daniel). Reconciles with:
- `AFL_Growth_Distribution_Lock_2026-05-30.md` (no-card 14-day full-Pro entry; permanent capped Free tier; FFL/IMO distribution priority; FirstPromoter affiliates).
- Marketing-narrative rule: lead with agent business outcomes (more book, more referrals, fewer losses, more rewrites), never platform mechanics.
- Live homepage `/v5` hero, which already leads with the chargeback wedge.

---

## 1. The decision: one wedge — "Found money in the book you already have"

**Lead promise:** stop chargebacks (clawed-back commissions) and turn clients you've
already sold into referrals and rewrites — revenue you're leaking *right now*, with
no new prospecting.

**Why this one (vs. the app, the workflow tool, or the analytics):**
- The audience is money-motivated. Chargebacks are the most visceral money pain in
  the business — it's cash taken *back out* of the agent's pocket.
- It's already the live homepage wedge ("Chargebacks happen when clients forget you
  exist"), so the funnel stays coherent.
- It frames the whole product as *found* money / a plugged leak — the
  highest-converting frame for this buyer.

**The core principle behind the rewrite:** "too much at once" is a *ranking*
problem, not a feature problem. Best-in-class multi-feature companies (Ramp —
"Time is money. Save both."; Gusto — "Payroll, HR, Benefits. Simplified.";
Superhuman — "the fastest email experience ever made.") all commit the hero to
ONE outcome and demote the rest to "and it also." We rank, we don't list, and we
don't amputate features.

---

## 2. The message hierarchy (the ranking ladder)

One promise per scroll-depth. This is the answer to "our story is about too much at once."

1. **The hook (one promise):** the money in the book you already have — found revenue, zero new prospecting.
2. **The believable "how":** your clients get *your* branded app; the engine runs every touchpoint (retention, birthdays, anniversaries, rewrites) while you sleep.
3. **The speed dividend (the close-of-sale ritual, locked May 11):** you're remote, on the phone closing. You already pulled the application PDF to submit to the carrier — drop *that* PDF into AFL before you hang up; it builds the client record (policy, beneficiaries, contact). Same call: welcome text from your own number + walk them into the app, live. You don't hang up until they're in. **No photos / in-person / paper-scan framing — agents are 100% remote.**
4. **The "and it also" (the trial's grow-the-book half, NOT a headline):** the pre-sale pipeline you already get during the trial — **Leads** (run prospects before they close) + the **Activity** numbers (booked, sold, APV, net-placed) — *both already built, behind flags*. AI call-coaching (the Performance page) is the not-yet-wired piece — tease as "coming to Pro," don't claim it live.

> Counterintuitive but load-bearing: the stuff we're most tempted to show off (call
> scoring, KPI tracking, the "Pro" sophistication) is *exactly* what makes the story
> feel like too much. It's the reward you unlock once hooked — never the lead.

---

## 3. The trial-first `/pricing` page structure (Daniel: "trial-first, minimal")

Stops being a four-tier comparison; becomes a one-offer page.

1. **Hero:** one promise + the offer. Single dominant CTA.
2. **Risk-killer microcopy** directly under the CTA (no card / no auto-charge).
3. **Proof above the fold:** a real agent quote / a real number (social proof is the
   biggest trust lever for skeptics).
4. **The ladder (§2) as a progressive reveal** — one promise per scroll.
5. **The after-trial choice** (keep everything / Growth / Free), framed with the
   agent's *own* trial numbers + loss aversion, so it never feels like a trap.
6. **Minimal FAQ** (2–3 only).

**Revenue lever (resolves the deferred Pro question):** make "keep everything"
(Pro $99) actually bookable. The reverse-trial math only works if there's a premium
to keep, and the May 30 lock already names full-Pro as the trial tier with a "keep
Pro" button at day 12 — a `comingSoon` flag is just lagging a decision already made.
Flipping it costs zero signups and is the "balance with revenue" piece.

---

## 4. Copy library

### Wedge hero — CHOSEN (2026-06-02, Daniel)
**Lead hero for `/pricing` (gain track, forward-framed):**
> **"Every client you close should pay you twice."**

- *Why this one:* gain-framed (should over-index with the promotion-focused
  new-recruit majority in the FFL/IMO channel — §5 finding #2); forward-compatible
  (works at 5 clients or 500); plain-English, passes the 5-second test; money-forward.
  "Should" keeps it honest — it promises the *mechanism* (referrals + rewrites +
  retention), not a guarantee.
- **Funnel split (decided):** `/pricing` leads GAIN (this line); homepage `/v5` keeps
  the LOSS frame ("chargebacks happen when clients forget you exist"). Homepage
  agitates the pain → conversion page sells the win + kills the risk. This *is* the
  loss-vs-gain A/B — measure both, swap to test.

**Loss-track challenger (held for A/B, lives on `/v5` today):**
- "The clients you earned shouldn't cost you money."
- "Never get a commission clawed back." (sharpest; 'chargeback' language)

**Retired drafts:** "Put the book you already have back to work…" /  "Stop losing the
clients you already earned." — both tilt *established* (backward-framed); replaced by
the forward-framed line above per the red-team's #1 fix.

### Subhead
- "AgentForLife keeps your clients close, stops chargebacks before they start, and
  turns the people you've already sold into referrals and rewrites. Full access, no
  credit card."

### CTA + microcopy
- CTA: "Start free — no card needed"
- Microcopy: "14 days of everything · No credit card · We never charge you without your say-so."
  - For this audience, **"no auto-charge ever without your say-so" is the single highest-value phrase** we can add.

### After-trial choice
- "When your 14 days are up, you choose: keep everything, scale back to Growth, or
  stay Free. Your whole book stays put either way."

### Candidate lines — red-team verdicts (2026-06-02, evidence-backed)
- **"You've got a CRM. Your competition's got a BRM — Book Relationship Management."**
  Category-creation play. **Verdict: KEEP OFF the conversion page. Use only in the
  IMO deck / sales narrative / a homepage story section.** The red-team firmed this
  from "tentative" to firm: category creation has a brutal base rate (**47%
  first-mover failure vs 8% fast-follower**), and it only works with multi-year,
  well-funded evangelism *after* you already lead a category — Gong ran "conversation
  intelligence" for **3 years** before renaming it "revenue intelligence"; Drift
  coined "conversational marketing," couldn't sustain it, and **shut down March
  2026**. A coined acronym nobody searches for is a demand-*education* cost, not a
  demand-*capture* asset, and it collides head-on with the best-documented landing-page
  rule ("clarity beats cleverness," ~11% median conversion for plain-outcome heroes).
  Powerful as a differentiator in a deck where you have time to teach it; fatal on a
  page whose job is "start in 5 seconds."
- **"The only platform you'll ever need — stop paying for tools that cost more and do less."**
  Consolidation / money-savings angle. **Verdict: KEEP OFF the hero. Use as a
  secondary "consolidation/ROI" line lower on the page, framed as money saved.** Two
  evidenced reasons: (1) it *contradicts* the single-wedge play — you cannot
  simultaneously lead with one sharp outcome AND "we do everything"; mixed messages
  dilute both; (2) "only platform you'll ever need" triggers the "jack of all trades,
  master of none" reflex (buyers feel exposed consolidating onto one vendor). BUT the
  consolidation *pain* is real and quantified (SMBs run 7–12 tools, waste $1,000+/
  employee/yr, lose 3–5 hrs/week to context-switching) — so framed as **cost savings**
  ("replaces the stack you already pay for") rather than a capability brag, it
  reinforces "found money." Lead with the wedge; *close* with consolidation.
- **"The technology you wish your IMO built for you."**
  Identity / channel line. **Verdict: Support / sub-hook — and it belongs on the
  IMO/upline surface, not (mainly) the agent page.** The red-team sharpened the §5.5
  point into a rule: the economic buyer in an upline-distributed motion is the IMO
  leader, not the agent (end users carry top decision weight in only ~16% of B2B
  deals). This line lands hardest where the distributor sees it. On the agent page it
  requires some IMO-longing to land; newer recruits may not feel it. **Test on the
  agent page; lead with it on the IMO pitch.**

---

## 5. Red-team / critical review (do NOT skip before locking copy)

### My own pushback (Daniel asked for it — steelmanning against my own recommendation)

1. **ICP vs. channel mismatch — the sharpest risk.** Stated ICP is the *established*
   producer ("keep the book you have"). But the #1 channel (FFL/IMO downline, ~50k)
   skews toward *newer* agents with little book to "retain." "Found money in your
   book" can fall flat for a 5-client rookie.
   - *Counter (why the wedge still holds):* chargebacks hit new agents **hardest** —
     advance-commission clawbacks devastate someone with no cash buffer. So "never get
     a commission clawed back" resonates *more* for them, if we frame it
     **forward-looking** ("every client you close keeps paying you and never claws
     back") rather than backward ("your big existing book"). This is a copy nuance,
     not a wedge change.
   - *Open question for Daniel:* are we optimizing this page for the established ICP or
     the new FFL recruit? It shifts the emphasis.

2. **We're reasoning from principle + other companies' case studies, not AFL's own
   funnel data.** The homepage wedge is *shipped*, not *proven* — I haven't seen the
   real `/pricing` → signup conversion. **Strongest validation available = our own
   PostHog funnel.** Recommend pulling it before hard-coding copy (we have the access).
   "Validate with data we own" beats "validate with someone else's anecdote."

3. **The no-card stats I led with were a bit convenient.** "Doesn't apply to your
   funnel" is partly hope; the reverse-trial-beats-both claim leaned on thin anecdote
   (Stockpress n=1). Decision is already locked and signups are the priority, so this
   is eyes-open tradeoff, not a reopening — but worth stating honestly. (Evidence
   audit in flight.)

4. **Loss/fear framing risk.** Leading with "chargebacks / you're leaking money" is
   loss-framed — powerful, but can read accusatory/doom-y. Worth A/B testing a
   positive gain variant ("turn every client into your next two sales"). (Neg-vs-pos
   framing evidence in flight.)

5. **End-user hero ≠ channel-partner hero.** I demoted analytics/call-scoring to "and
   it also" for the *agent* page — correct for the agent. But the **IMO leader (the
   distributor / economic buyer)** may care most about downline performance
   visibility. The agent page leads with the money wedge; the IMO/affiliate pitch
   (separate surface) may lead with team analytics. Don't conflate the two.

### External evidence & evidence-quality audit (two red-team passes, 2026-06-02)

**Headline finding: the wedge and the page structure survive; some of the *evidence
I originally cited* did not, and one framing assumption flipped.** Both red teams,
working independently, landed on the *same* structural critique I'd already named as
my sharpest risk (§5.1) — the established-ICP-vs-new-channel mismatch. That
convergence is the most important signal in this whole pass: it's no longer my
intuition, it's the load-bearing issue.

#### What survived scrutiny
- **Single-wedge / "rank don't list" hero.** Holds. Plain-outcome heroes convert
  best (~11% median); the 2,000-page test confirms a single clear hero beats a busy
  one. (Caveat below: that stat is about hero *design*, not trial structure.)
- **Plain-English hero; cleverness off the conversion page.** Strongly reinforced —
  this is what kills BRM/all-in-one as hero candidates.
- **No-card to maximize top-of-funnel signups.** The signup-lift half is real and
  well-supported (Firstsales +71% trial starts on dropping the card). Given signups
  are Daniel's stated #1 priority and the no-card 14-day → Free entry is already
  *locked* (May 30 / Jun 1), this stays — eyes open on the tradeoff below.

#### What changed (must-fix before copy locks)
1. **Forward-frame the wedge so it doesn't exclude new agents.** Both passes: "found
   money in your *existing* book" structurally excludes the new/IMO-recruit majority
   in the #1 channel — you can't retain what you haven't sold. Fix is the §5.1 counter,
   now evidence-backed: frame the chargeback wedge **forward** ("every client you
   close keeps paying you — and never claws back") so it lands for 5 clients or 500.
2. **Loss-vs-gain is an A/B test, not a law.** New finding that flips an assumption:
   loss-framing superiority is *moderated by regulatory focus* — loss wins with
   prevention-focused (protect-an-asset) audiences; **gain wins with promotion-focused
   audiences**, and money-motivated *new* agents chasing upside are textbook
   promotion-focused. The famous 300% loss-frame lift was homeowners protecting an
   asset (a *retention* situation). So: ship a gain-framed hero variant and test it;
   don't assume the loss frame wins for the new-recruit segment.
3. **BRM and all-in-one are confirmed OFF the hero** (see §4 verdicts).
4. **Two front doors confirmed:** agent page demotes analytics; IMO/upline pitch
   *leads* with downline performance visibility (the economic buyer cares about it).

#### Evidence-quality scorecard (the stats I'd been leaning on)
- **(a) "No-card 4–6% vs card 25–35%" → MEDIUM, and I'd mislabeled it.** The real
  ChartMogul/Poyar Jan-2026 study (200 products) measured **8.9% no-card vs 31.4%
  card (~5x)**. The "4–6% / 25–35%" figures are ChartMogul's *advice bands*, not the
  study's medians — I conflated two artifacts. Directionally solid (card converts far
  better per signup); the specific pairing was wrong. Also vendor-co-published
  (ChartMogul + ProductLed sell the tooling).
- **(b) "Reverse trials roughly double free-to-paid; Stockpress 10%→25%" → THIN.**
  Single anecdote, no sample size, no timeframe, no control. The broader 2026 data
  actually puts reverse trials *between* freemium and card-required trials (and
  *below* card trials), with the author himself flagging small sample (only 7% of 200
  products use a reverse trial). "Beats both" is **not** supported — it rests on
  essentially one uncontrolled anecdote.
- **(c) "2,000 pages, single-stat hero +18%" → SOLID but ORTHOGONAL.** Real,
  well-powered study (Oct 2025–Mar 2026, 95% significance) — but it measures hero
  *design*, not trial *structure*. Fine support for "single clear hero" (§2); a
  category error if cited as support for the no-card/reverse-trial mechanism. I'd been
  letting it borrow credibility across that line.

#### The one eyes-open tradeoff (NOT a reopening — decision is locked)
The closest real case *cuts against* "no-card maximizes signups without hurting
revenue": Outseta switched freemium → 7-day **card-required** trial, signups fell to
43% of prior volume but conversion ran 4–5x higher — netting **15 paying customers
per 100 signups vs 7**. Translation: no-card reliably wins *signups*; card-required
often wins *revenue per visitor*, especially for low-intent, low-switching-cost,
commission-driven SMB audiences — i.e., exactly this segment. Daniel has chosen
signups as the priority and the no-card entry is locked, so this is an honest tradeoff
to hold, not a decision to relitigate. Two concrete follow-ups it *does* justify:
- **A lightweight abuse guard.** No-card + a *permanent* free tier is the worst-case
  abuse surface (~33% of freemium signups use disposable email; permanent-free
  accounts never churn out). Largely mitigated here by AFL's hard **Activation gate**
  + the close-of-sale PDF-upload ritual (a tire-kicker who never activates never
  touches the expensive engine), but a simple email-verification step is cheap
  insurance against vanity-metric inflation.
- **A future A/B worth queuing:** keep no-card for reach, but test an *expiring* free
  (vs permanent) and/or a card-or-rep-assisted step *at activation* — capturing the
  upline-driven reach without fully conceding the revenue/abuse downside.

---

## 6. Open questions / next validation steps
- [ ] **Pull AFL's own PostHog funnel** (strongest validation we own): `/pricing` (and
      `/v5`) → signup-start → trial → day-12 choice. Where's the real drop-off? This
      beats every borrowed stat in §5 — we have the access.
- [x] Established-ICP vs new-recruit: which does the page optimize for? → **Both, via
      one forward-framed wedge** (§5). Don't pick; reframe so it lands for either. Both
      red teams independently confirmed this is the #1 issue.
- [ ] A/B: loss-framed vs gain-framed hero. **Now mandatory, not optional** — gain may
      win for the promotion-focused new-recruit segment (§5 finding #2).
- [ ] Confirm flipping Pro `comingSoon` → bookable (Stripe Pro price live in prod?).
- [x] Where BRM / all-in-one / IMO lines live → **resolved in §4**: all three OFF the
      agent conversion hero; BRM = IMO deck only, all-in-one = secondary ROI line,
      IMO line = IMO/upline surface.
- [ ] Add a lightweight email-verification step at signup (cheap abuse guard for
      no-card + permanent-free; §5 tradeoff).

## 7. Sources

### Positioning / wedge / framing
- April Dunford — Positioning with multiple products (the "lead product" rule)
- NFX — Finding your killer wedge
- [Influ2 — B2B buying committees / economic buyer vs end user (~16% end-user weight)](https://www.influ2.com/academy/buying-committees)
- [Freshcode — category creation base rate (47% first-mover vs 8% fast-follower failure)](https://www.freshcodeit.com/blog/startup-category-creation)
- [Gong — "revenue intelligence" (the 3-year sequence)](https://www.gong.io/blog/what-is-revenue-intelligence)
- [Warmly — Drift shutting down, March 2026 (category-creation cautionary case)](https://www.warmly.ai/p/blog/blogdrift-shutting-down-best-alternative-2026)
- [NIH — message framing × regulatory focus (loss vs gain is moderated)](https://www.ncbi.nlm.nih.gov/pmc/articles/PMC3793964/)
- [InsideBE — loss aversion (300% lift case; manipulation/backfire risk)](https://insidebe.com/reports/loss-aversion/)
- [Avoma — best-of-breed vs all-in-one](https://www.avoma.com/blog/best-of-breed-solutions-vs-all-in-one-software)
- [Business-in-a-Box — SMB tool-sprawl / consolidation pain stats](https://www.business-in-a-box.com/blog/the-all-in-one-platform-revolution-for-smbs/)

### Landing-page / hero design
- [Digital Applied — 2,000 landing pages tested, 2026 (single-outcome hero; SOLID but about design, not trials)](https://www.digitalapplied.com/blog/landing-page-conversion-study-2000-pages-tested-2026)
- [Convertri — clarity beats cleverness (~11.1% median plain-outcome)](https://blog.convertri.com/25-landing-page-tips-higher-sales-signups/)
- [Inbound Design Partners — the 5-second rule](https://www.inbounddesignpartners.com/blog/can-your-website-pass-the-five-second-rule-test)

### No-card / reverse-trial / conversion mechanics (audited in §5)
- [Growth Unhinged — 2026 free-to-paid conversion report (reverse trials sit *between*, small sample)](https://www.growthunhinged.com/p/free-to-paid-conversion-report)
- [ChartMogul — SaaS Conversion Report (real: 8.9% no-card vs 31.4% card; advice bands ≠ medians)](https://chartmogul.com/reports/saas-conversion-report/)
- [Kyle Poyar — Your guide to reverse trials](https://kylepoyar.substack.com/p/your-guide-to-reverse-trials)
- [GTM Strategist — Reverse trials / Stockpress (the THIN n=1 anecdote)](https://knowledge.gtmstrategist.com/p/reverse-trials-best-practices-for-saas-companies)
- [Outseta — the case for a 7-day card-required trial (15 vs 7 customers per 100 signups)](https://www.outseta.com/posts/the-case-for-the-7-day-credit-card-required-free-trial)
- [LeadSync — ditching credit cards (Firstsales +71% trial starts; vanity-metric caution)](https://leadsync.me/blog/ditching-credit-card-requirements-for-free-trials/)
- [ADV.me — SaaS free-trial conversion benchmarks 2026](https://adv.me/articles/conversion-optimization/saas-free-trial-conversion-rate-benchmarks-2025/)
- [myEmailVerifier — SaaS fake-signup prevention (disposable-email abuse surface)](https://myemailverifier.com/blog/saas-fake-signup-prevention/)
