export interface TickerQuote {
  /** The line itself. The ticker wraps it in quotation marks when rendering. */
  text: string;
  /** Attribution, shown as `— Author`. Omitted for AgentForLife house lines. */
  author?: string;
}

// ── House lines — AgentForLife's own, unattributed ──────────────────────────
// The motivation that's specific to this business: referrals, conservation,
// touchpoints, anniversaries, speed-to-lead. Kept verbatim.
const HOUSE_QUOTES: TickerQuote[] = [
  { text: "Every policy you save is a family you protect." },
  { text: "Referrals don't happen by accident — they happen by relationship." },
  { text: "The best time to ask for a referral is right after you deliver value." },
  { text: "Your book of business is your retirement plan. Guard it." },
  { text: "A 5-minute check-in call today is a retained client next year." },
  { text: "Conservation isn't just saving a policy — it's saving your commission." },
  { text: "The agent who follows up wins. Every time." },
  { text: "One referral a week is 52 new opportunities a year." },
  { text: "Clients don't leave agents who stay in touch." },
  { text: "Your next $10K month starts with today's first call." },
  { text: "Persistency is profitability. Protect what you've built." },
  { text: "Birthday messages aren't fluff — they're your highest-ROI touchpoint." },
  { text: "The top 1% of agents have one thing in common: consistency." },
  { text: "Treat every policy anniversary like a second sale opportunity." },
  { text: "A warm list is a gold mine. Work it daily." },
  { text: "Speed to lead: the first agent to call gets the appointment." },
  { text: "Your reputation is built one client interaction at a time." },
  { text: "Don't just sell coverage — sell peace of mind." },
];

// ── The greats — well-documented attributions ───────────────────────────────
// Sales legends, writers, athletes, leaders, and timeless voices, chosen to
// land for someone whose day is dials, follow-ups, and serving families.
const ATTRIBUTED_QUOTES: TickerQuote[] = [
  // Sales & business
  { text: "You can have everything in life you want, if you'll just help enough other people get what they want.", author: "Zig Ziglar" },
  { text: "People don't buy for logical reasons. They buy for emotional reasons.", author: "Zig Ziglar" },
  { text: "Timid salesmen have skinny kids.", author: "Zig Ziglar" },
  { text: "Either you run the day, or the day runs you.", author: "Jim Rohn" },
  { text: "Success is nothing more than a few simple disciplines, practiced every day.", author: "Jim Rohn" },
  { text: "Discipline is the bridge between goals and accomplishment.", author: "Jim Rohn" },
  { text: "Don't wish it were easier; wish you were better.", author: "Jim Rohn" },
  { text: "I never dreamed about success. I worked for it.", author: "Estée Lauder" },
  { text: "Don't be afraid to give up the good to go for the great.", author: "John D. Rockefeller" },
  { text: "If you really look closely, most overnight successes took a long time.", author: "Steve Jobs" },
  // Persistence & discipline
  { text: "Opportunity is missed by most people because it is dressed in overalls and looks like work.", author: "Thomas Edison" },
  { text: "I have not failed. I've just found 10,000 ways that won't work.", author: "Thomas Edison" },
  { text: "Nothing in this world can take the place of persistence.", author: "Calvin Coolidge" },
  { text: "By failing to prepare, you are preparing to fail.", author: "Benjamin Franklin" },
  { text: "The way to get started is to quit talking and begin doing.", author: "Walt Disney" },
  // Courage & action
  { text: "Do what you can, with what you have, where you are.", author: "Theodore Roosevelt" },
  { text: "Start where you are. Use what you have. Do what you can.", author: "Arthur Ashe" },
  { text: "Always bear in mind that your own resolution to succeed is more important than any other.", author: "Abraham Lincoln" },
  { text: "How wonderful it is that nobody need wait a single moment before starting to improve the world.", author: "Anne Frank" },
  // Service & relationships — the heart of the work
  { text: "People will forget what you said and what you did, but they will never forget how you made them feel.", author: "Maya Angelou" },
  { text: "Service to others is the rent you pay for your room here on earth.", author: "Muhammad Ali" },
  { text: "Alone we can do so little; together we can do so much.", author: "Helen Keller" },
  // Athletes & competitors
  { text: "You miss 100% of the shots you don't take.", author: "Wayne Gretzky" },
  { text: "I've failed over and over and over again in my life. And that is why I succeed.", author: "Michael Jordan" },
  { text: "It's not whether you get knocked down; it's whether you get up.", author: "Vince Lombardi" },
  { text: "Don't count the days, make the days count.", author: "Muhammad Ali" },
  { text: "Great things come from hard work and perseverance. No excuses.", author: "Kobe Bryant" },
  { text: "Everybody has a plan until they get punched in the mouth.", author: "Mike Tyson" },
  { text: "Success isn't always about greatness. It's about consistency.", author: "Dwayne Johnson" },
  { text: "The harder I practice, the luckier I get.", author: "Gary Player" },
  // Stoic & timeless
  { text: "You have power over your mind — not outside events. Realize this, and you will find strength.", author: "Marcus Aurelius" },
  { text: "We suffer more often in imagination than in reality.", author: "Seneca" },
];

// ── Popularly attributed ────────────────────────────────────────────────────
// Iconic lines whose exact source historians dispute. Kept because the popular
// attribution is the one that resonates — flagged here so the provenance is
// honest. Trim this block if you'd rather only ship airtight attributions.
const POPULARLY_ATTRIBUTED_QUOTES: TickerQuote[] = [
  { text: "Success is not final, failure is not fatal: it is the courage to continue that counts.", author: "Winston Churchill" },
  { text: "We make a living by what we get, but we make a life by what we give.", author: "Winston Churchill" },
  { text: "Whether you think you can, or you think you can't — you're right.", author: "Henry Ford" },
  { text: "It does not matter how slowly you go, as long as you do not stop.", author: "Confucius" },
  { text: "The chains of habit are too weak to be felt until they are too strong to be broken.", author: "Samuel Johnson" },
];

const TICKER_QUOTES: TickerQuote[] = [
  ...HOUSE_QUOTES,
  ...ATTRIBUTED_QUOTES,
  ...POPULARLY_ATTRIBUTED_QUOTES,
];

export default TICKER_QUOTES;
