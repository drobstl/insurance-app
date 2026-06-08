/**
 * Coaching — R.E.A.L. framework + the default scoring playbook.
 *
 * Ported from Closr AI's call-scoring engine so AFL's Coaching surface
 * scores on the SAME framework Closr uses (Rapport / Emotion / Assumption
 * / Lock It Down). Source of truth for the framework: Closr's
 * `prompts/closr-ai-scoring-prompt.md` + `app/services/call_scorer.py`.
 *
 * Each agent scores against THEIR OWN playbook (stored at
 * `agents/{uid}.coachingPlaybook`). When they haven't set one, scoring
 * falls back to `DEFAULT_COACHING_PLAYBOOK` below — the Crosswinds/SFG
 * R.E.A.L. mortgage-protection presentation, which is the house standard
 * for the bulk of AFL's agents and a strong starting point to edit.
 */

export const REAL_CATEGORIES = [
  { key: 'rapport', letter: 'R', label: 'Rapport' },
  { key: 'emotion', letter: 'E', label: 'Emotion' },
  { key: 'assumption', letter: 'A', label: 'Assumption' },
  { key: 'lock_it_down', letter: 'L', label: 'Lock It Down' },
] as const;

export type RealCategoryKey = (typeof REAL_CATEGORIES)[number]['key'];

export const DEFAULT_COACHING_PLAYBOOK = `R.E.A.L. SALES PRESENTATION — Mortgage Protection (SFG / Crosswinds default)

NEW ROLE & PURPOSE (open the appointment)
"Just to let you know a little about my role today and the purpose of our meeting — I'm what's known as a field underwriter. I sit down with families who got the same postcard and ended up getting this kind of protection for their family. My main job is to shop around to 35 carriers and find the best deal on the amount and type of protection you can qualify for. Today we'll talk about what your family is facing and what you want them to be able to do when you're no longer here. I'll have detailed questions about the mortgage, finances, and your health so we can make sure this is even something you need. Believe it or not, not everyone I sit with actually needs this — and most who do need far less than they thought. We'll determine that together and I'll be clear where you land. If we determine it's a need, I'll put some options together; your job is to pick the one that makes the most sense and fits your budget. Once you pick something, we get you approved — about 10 minutes to fill out an application together. Final approval takes a day or two, then we get back together to review the policy. Does that all sound good?"

SECTION 1 — RAPPORT
- Build genuine connection for a few minutes; find commonality. Don't overdo it — avoid being a "professional visitor." Tone: friendly but in control.
- Topics: compliment them on connecting to Zoom; new home or refinance / how long in the area; occupation and how they got started; family nearby.
- Establish identity & credibility: show insurance license, driver's license, business card, picture of family.
- Show them the lead they mailed in. "Which one of you responded? What was your main concern?" (their surface "why"). Repeat it back in your own words and confirm. "How long have you been thinking about this kind of protection?"
- Explain what mortgage protection is: a life policy for homeowners that pays off / makes mortgage payments while the family is in transition; can also replace income on critical illness or disability. Not the old kind — the family is the beneficiary (not the lender), the death benefit doesn't decrease, and it's portable.
- Frame: most people already have some life insurance, a nest egg, savings. People get mortgage protection separately so the family doesn't have to drain the nest egg to cover the mortgage — they want the insurance company to pay off the debt and the nest egg to go to the family.

SECTION 2 — EMOTION (explore their situation)
- Verify health first (easiest, least emotional): run the medical questions, review prescriptions. Reassure: no nurse, blood, or urine for these programs.
- Financial Information Form (FIF) + Cash-flow analysis (required for every client). Get the client actively participating — pen and paper or shared whiteboard.
- Get the equity number: what's owed vs. what it would sell for = equity. Celebrate their equity; frame protecting it as the #1 job ("that equity should never walk out your front door").
- Quick budget: list mortgage payment, major debts, major monthly expenses → approximate monthly outflow.
- Uncover the cash-flow problem: two columns (one per spouse). For each: what's already in place that would pass to the survivor (other insurance, savings, retirement)? What income would STOP if each spouse passed? (Cover Social Security survivor mechanics.) Do the math together: income remaining without each spouse vs. expenses. Let the gap sink in.
- Quality questions (pick a few): How long could you stay in this house? Where would you go? Who would move in? What challenges would you have? How do you feel about that? (Single: which kid makes the payment? how long do houses take to sell here?)

SECTION 3 — ASSUMPTION (present, assume they want coverage)
- Sell on needs, not features. Price is only important in the absence of value.
- Pre-handle "think about it": "Sometimes people say 'I need to think about it' — usually that means the price isn't right. If what I show you doesn't fit the budget, can I count on you to be honest with me? We'll find something tonight that fits comfortably as a starting place."
- Explain the three ways to do mortgage protection: (1) Full payoff, (2) Partial payoff, (3) Critical Period / Equity Protection (covers the mortgage payments during the most critical period after a loss — buys time to grieve, plan, and sell for top dollar without coming out of pocket).
- "Of these three, which should we begin pricing?" Show options anchored by the 10% rule (above / at / below 10% of the monthly mortgage payment), or for critical period start with the number of months they give you.
- Pre-answer common questions before they arise (term vs whole, premiums won't increase, death benefit won't decrease, lump sum to beneficiary, riders).

SECTION 4 — LOCK IT DOWN (close + secure)
- The close: "Which one of these fits most comfortably inside your budget?" Then be quiet and let them answer. Start the paperwork; ask for the driver's license and the beneficiary's full name.
- Secure the sale / persistence: have the client say back in their own words what they bought, how much, what it's for, the cost, and why they chose it. Answer remaining questions. "Do you have peace of mind this will help your family?"
- Set expectations: approval timeline, your check-ins, the policy review, annual member-services review. Save your number in their phone. "I'm your agent now."
- If no sale: complete the client survey / 5 R's and book a follow-up.

OBJECTION HANDLING (isolate the real concern, reframe to consequence, never pressure)
- "I need to think about it." → Is it the coverage itself or the monthly investment? Surface the real objection, then address that specifically.
- "I need to talk to my spouse." → Expected. Anchor them to a specific option so the conversation has structure: which of the three felt closest?
- "I have coverage through work." → If you left or got laid off, does it go with you? (Consequence question.)
- "I can't afford it." → Reframe from lump sum to cash flow. Which is harder: this premium, or covering the mortgage with no income?
- "I don't think I need it." → Who depends on your income? What would their plan for the mortgage be?
- "This feels like a sales pitch." → Reset the frame: field underwriter, no pressure, no obligation. You decide if it makes sense.

TONE: Consultative, calm, conversational. Emotionally intelligent follow-up questions. Uncover buying gaps before presenting solutions. Guide toward presenting 3 options.`;
