// The five "Direct to Reset" doors, as the app presents them. The server picks
// the product id (see web/lib/reset-products.ts); this maps that id to the
// client-facing copy + which concept visual to draw.
//
// Compliance / naming: the ids below are agent-facing only and never shown to a
// client. Every line here is concept copy — no projected dollars, dates, or
// returns. The client's own mortgage number (DFL hook) is their fact, shown the
// same way the original reveal did; the licensed specialist presents the rest.

export type ResetProductId = 'DFL' | 'Annuity' | 'QFA' | 'IUL' | 'IBC';

export type ResetVisual = 'graph' | 'melt' | 'loop' | 'bucket' | 'guidance';

export interface ResetDeck {
  /** Beat 2 — the framing of the problem (concept). */
  hookHeadline: string;
  /** DFL only: when we hold the mortgage number, beat 2 shows it instead. */
  hookEyebrow?: string;
  usesMortgageFact?: boolean;
  /** Beat 3 — the "what if" pivot. */
  turn: string;
  /** Beat 4 — the concept visual + the approved one-liner that lands with it. */
  visual: ResetVisual;
  visualHeadline: string;
  visualCaption: string;
  /** Beat 5 — the resolution. */
  payoffHeadline: string;
  payoffSub: string;
}

/** Shared opener (beat 1) — `{name}` is filled at render. */
export const RESET_OPENER = 'A lot can change in a few years, {name}.';

/** Shared ask (beat 6). */
export const RESET_ASK_HEADLINE = 'Since we set up your coverage, new options opened up.';
export const RESET_ASK_CTA = 'See if my family qualifies';

export const RESET_DECKS: Record<ResetProductId, ResetDeck> = {
  DFL: {
    hookEyebrow: 'your mortgage today',
    hookHeadline: 'the biggest check you write — month after month.',
    usesMortgageFact: true,
    turn: 'What if you didn’t have to spend decades paying it off?',
    visual: 'melt',
    visualHeadline: 'Pay off your mortgage years sooner — without spending an extra dime.',
    visualCaption: 'Less to the bank. More to you.',
    payoffHeadline: 'Debt handled. Future funded.',
    payoffSub: 'On the income you already make.',
  },
  Annuity: {
    hookHeadline: 'You’ve saved for retirement. The worry is what one bad year could do to it.',
    turn: 'What if a market crash simply… couldn’t touch it?',
    visual: 'graph',
    visualHeadline: 'When the market crashes, your savings don’t.',
    visualCaption: 'It holds through the dips, then keeps climbing.',
    payoffHeadline: 'Steady, protected, and built for the years ahead.',
    payoffSub: 'Growth you keep — even when the market has an off year.',
  },
  QFA: {
    hookHeadline: 'That old 401(k) from a job you’ve moved on from may be working less than you think.',
    turn: 'What if it could do more — with a pro making sure of it?',
    visual: 'guidance',
    visualHeadline: 'Put your old 401(k) to work — and keep more of it from the taxman.',
    visualCaption: 'Your money, with a pro in your corner.',
    payoffHeadline: 'More of it kept. More of it working.',
    payoffSub: 'A plan built around you.',
  },
  IUL: {
    hookHeadline: 'Taxes can take a real bite out of retirement income — right when you need it.',
    turn: 'What if there were a bucket the taxman couldn’t reach?',
    visual: 'bucket',
    visualHeadline: 'Build retirement income the taxman can’t touch.',
    visualCaption: 'Fill it now. Reach for it later.',
    payoffHeadline: 'Income on your terms. Taxes left behind.',
    payoffSub: 'Built quietly, year after year.',
  },
  IBC: {
    hookHeadline: 'Every loan — car, home, life — sends interest to a bank. Year after year.',
    turn: 'What if you could be the bank?',
    visual: 'loop',
    visualHeadline: 'Borrow from yourself instead of the bank — and keep the interest.',
    visualCaption: 'Money that circles back to you.',
    payoffHeadline: 'You finance your life — and keep the interest.',
    payoffSub: 'Your money, working in two places at once.',
  },
};

export function resetDeck(product?: ResetProductId): ResetDeck {
  return RESET_DECKS[product ?? 'DFL'] ?? RESET_DECKS.DFL;
}
