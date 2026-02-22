import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Revenue Calculator | AgentForLife',
  description:
    "See how much revenue you're leaving on the table. Calculate your losses from churn, missed referrals, and missed rewrites — then stop the leak.",
  openGraph: {
    type: 'website',
    locale: 'en_US',
    url: 'https://agentforlife.app/calculator',
    title: 'How Much Revenue Are You Leaving on the Table? | AgentForLife',
    description:
      "See how much your book of business is really worth — and how much you're losing without a retention, referral, and rewrite system.",
    siteName: 'AgentForLife',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'How Much Revenue Are You Leaving on the Table? | AgentForLife',
    description:
      "See how much your book of business is really worth — and how much you're losing without a retention, referral, and rewrite system.",
  },
};

export default function CalculatorLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <>{children}</>;
}
