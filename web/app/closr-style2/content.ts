export const closrStyle2Content = {
  brandName: 'AgentForLife',
  nav: {
    features: 'Features',
    pricing: 'Pricing',
    login: 'Log in',
    primaryCtaWhenFoundingOpen: 'Get Started Free',
  },
  hero: {
    headlineTop: 'Kill chargebacks.',
    headlineLeadIn: 'Explode your referrals. ',
    headlineEmphasis: '3x',
    headlineTail: ' your income.',
    body:
      'AgentForLife protects your book and leverages it while you sleep. Your clients get your own branded app, automated touchpoints, one-tap referrals, and policy retention on autopilot. You get peace of mind and a business that compounds.',
    primaryCtaWhenFoundingOpen: 'Lock In My Free Spot',
  },
  stats: [
    { value: '97%', label: 'Client Retention' },
    { value: '3x', label: 'Referral Volume' },
    { value: '$0', label: 'Founding Cost' },
    { value: '10 min', label: 'Setup Time' },
  ],
  payoff: {
    eyebrow: 'Protect Your Book',
    title: 'How AgentForLife pays for itself',
    cards: [
      {
        title: 'Save at-risk policies',
        body: 'Conservation alerts trigger outreach before cancellations become chargebacks.',
      },
      {
        title: 'Automate relationship touchpoints',
        body: 'Birthdays, holidays, anniversaries, and policy milestones go out on schedule.',
      },
      {
        title: 'Generate warm referrals',
        body: 'Clients share in-app and AI qualifies referrals while you stay focused on selling.',
      },
    ],
  },
  proof: {
    eyebrow: 'Product Proof',
    title: 'Four systems working while you sell',
    featureCtaLabel: 'See how it works',
    features: [
      {
        id: 'retention',
        title: 'Automated Retention',
        subtitle: "You move forward, AgentForLife has your back.",
        body: "When a policy slips, forward the email notice and AgentForLife springs into action with personalized outreach. Then follows up on Day 2, 5, and 7. You sell it, we save it.",
        href: '/v5/retention',
      },
      {
        id: 'referrals',
        title: 'One-Tap Referrals',
        subtitle: "Put a referral button in every client's pocket. AI takes it from there.",
        body: 'One tap from your client. AgentForLife texts the referral, qualifies them, and books the appointment on your calendar. You just show up and close.',
        href: '/v5/referrals',
      },
      {
        id: 'rewrites',
        title: 'Automated Rewrites',
        subtitle: 'Every anniversary is a booked appointment.',
        body: 'At the one-year mark, your client hears from you -- not the carrier. AgentForLife notifies and books them on your calendar. The rewrite comes to you.',
        href: '/v5/rewrites',
      },
      {
        id: 'relationships',
        title: 'Relationships on Autopilot',
        subtitle: "People don't refer agents, they refer relationships.",
        body: '7+ personalized touchpoints per year, per client -- completely automatic. Holiday cards for 5 major holidays, birthday messages, anniversary alerts, and custom push notifications.',
        href: '/v5/relationships',
      },
    ] as const,
  },
  pain: {
    eyebrow: 'The Uncomfortable Truth',
    title: "Here's what's costing you money right now",
    cards: [
      {
        title: 'Silence',
        body: "After the close, you become a name they'll never call. Then a lapse notice hits -- and a chargeback follows.",
        accent: '#7F1C34',
      },
      {
        title: 'Dead referrals',
        body: 'You ask clients to refer friends. They say "sure." They never do. The few who try? The lead goes cold.',
        accent: '#8451B8',
      },
      {
        title: 'Missed rewrites',
        body: 'Every policy anniversary is a lay-down sale. With no system to flag it, the carrier auto-renews and you miss out.',
        accent: '#0F5F56',
      },
    ],
    calculatorCtaWhenFoundingOpen: 'Stop the Bleeding',
  },
  greenCallout: {
    title: 'Built for agents who want clients for life',
    chips: ['Retention', 'Referrals', 'Rewrites'],
    body:
      'Give clients a branded app experience and give yourself a post-sale system that keeps policies active and referrals flowing.',
    ctaWhenFoundingOpen: 'Start Free',
  },
  pricing: {
    title: 'Pricing',
    subtitle: 'Founding access is free for life while spots remain. Standard access begins at $49/month.',
    cards: [
      {
        title: 'Founding Members',
        price: '$0',
        body: 'Free for life while 50 founding spots are open.',
        ctaWhenFoundingOpen: 'Apply now',
      },
      {
        title: 'Standard',
        price: '$49',
        body: '$49/month. Cancel anytime.',
        ctaWhenFoundingOpen: 'Get started',
      },
    ],
  },
  finalCta: {
    title: 'Keep clients close. Grow by referral.',
    body: 'Launch in minutes and run your entire post-sale system from one place.',
    ctaLabel: 'Lock in my free spot',
  },
  footer: {
    links: {
      privacy: 'Privacy',
      terms: 'Terms',
      login: 'Log in',
    },
  },
};

export type ClosrStyle2FeatureId = (typeof closrStyle2Content.proof.features)[number]['id'];
