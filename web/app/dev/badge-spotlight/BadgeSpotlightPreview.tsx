'use client';

import BadgeProgressCard from '../../../components/BadgeProgressCard';
import type { AgentAggregates } from '../../../lib/stats-aggregation';

// Earns a realistic mix: founding member + several starter/mid badges earned,
// elite/legendary still locked (so both the "earned" and "progress" spotlights
// are exercisable from one screen).
const mockStats: AgentAggregates = {
  referrals: { total: 6, appointmentsBooked: 2 },
  clientsFromReferrals: 3,
  savedPolicies: { count: 7, apv: 5000 },
  successfulRewrites: { count: 2, apv: 1500 },
  referralApv: 2200,
  totalApv: 6200,
  touchpoints: { holidayCardsSent: 6, birthdayMessagesSent: 5, anniversarySent: 3, total: 14 },
  rates: { referralAppointmentRate: 0.33, conservationSaveRate: 0.7 },
  agentsReferred: 1,
  isFoundingMember: true,
  updatedAt: '2026-06-17T00:00:00.000Z',
};

export default function BadgeSpotlightPreview() {
  return (
    <div className="min-h-screen bg-[#f4f4f0] flex items-start justify-center p-8">
      <div className="w-full max-w-md">
        <p className="mb-3 text-xs text-[#9ca3af]">dev · badge spotlight preview — click any badge</p>
        <BadgeProgressCard
          stats={mockStats}
          onShareBadge={(b) => console.log('[preview] share badge', b.id)}
        />
      </div>
    </div>
  );
}
