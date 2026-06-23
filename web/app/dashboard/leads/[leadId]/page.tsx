'use client';

import { useEffect, useRef, useState } from 'react';
import { useParams, useRouter, useSearchParams } from 'next/navigation';
import LeadDetailPanel from '../../../../components/LeadDetailPanel';
import { CloseSaleRitual } from '../../../../components/CloseSaleRitual';
import { useDashboard } from '../../DashboardContext';
import { leadsAccessReason } from '../../../../lib/tier-gating';
import UpgradeToProCard from '../../../../components/UpgradeToProCard';

export default function LeadDetailPage() {
  const router = useRouter();
  const params = useParams<{ leadId: string }>();
  const searchParams = useSearchParams();
  const leadId = params?.leadId;
  // Deep-link query param — set by the "Send from phone" QR hand-off
  // on macOS. The panel auto-opens the send-confirmation drawer for
  // this appointment and strips the param from the URL.
  const openConfirmationParam = searchParams?.get('openConfirmation') ?? null;
  // Deep-link from the intro-text QR hand-off — auto-opens the intro
  // drawer on the phone so the agent sends from their own number.
  const openIntroParam = searchParams?.get('openIntro') === '1';

  const { user, agentProfile, profileLoading } = useDashboard();

  // Close Sale slide state — see queue page for the same pattern.
  // LeadDetailPanel slides left out of view; Close Sale slides in
  // from the right. Matches the Add Client flow on /dashboard/clients.
  const [closeSaleLead, setCloseSaleLead] = useState<{
    id: string;
    name: string;
    firstName: string;
    phone: string;
  } | null>(null);
  const navigateAfterCloseSale = useRef(false);

  // Feature flag + tier gate — see web/app/dashboard/leads/page.tsx
  // for the matching guard on the list/queue route. Three outcomes:
  //   accessible  → render the panel
  //   env_off     → redirect to /dashboard (legacy)
  //   tier_locked → render UpgradeToProCard
  // Waits until both `user` and the profile resolve before deciding so
  // admins / Pro agents mid-load aren't bounced and don't see a
  // momentary upgrade-card flash.
  const reason = leadsAccessReason(agentProfile.membershipTier, user?.email, agentProfile.trialEndsAt);
  useEffect(() => {
    if (!user) return;
    if (profileLoading) return;
    if (reason === 'env_off') router.replace('/dashboard');
  }, [user, profileLoading, reason, router]);

  if (!user || profileLoading) return null;
  if (reason === 'env_off') return null;
  if (reason === 'tier_locked') {
    return <UpgradeToProCard surface="leads" />;
  }

  if (!leadId) return null;

  return (
    <div className="max-w-4xl mx-auto">
      <button
        onClick={() => router.push('/dashboard/leads')}
        className="text-sm text-[#44bbaa] hover:text-[#005751] font-semibold mb-4"
      >
        ← All leads
      </button>

      {/* Slide-belt container — LeadDetailPanel ↔ CloseSaleRitual. */}
      <div className="relative overflow-hidden" style={{ minHeight: closeSaleLead ? 900 : undefined }}>
        <div
          className="transition-all duration-[700ms] ease-[cubic-bezier(0.22,1,0.36,1)]"
          style={{
            transform: closeSaleLead ? 'translateX(-110%)' : 'translateX(0)',
            opacity: closeSaleLead ? 0 : 1,
            pointerEvents: closeSaleLead ? 'none' : 'auto',
          }}
          aria-hidden={!!closeSaleLead}
        >
          <LeadDetailPanel
            key={leadId}
            leadId={leadId}
            initialOpenConfirmationApptId={openConfirmationParam}
            initialOpenIntro={openIntroParam}
            onConverted={() => router.push('/dashboard/clients')}
            onDeleted={() => router.push('/dashboard/leads')}
            onRequestCloseSale={(leadSnapshot) => {
              navigateAfterCloseSale.current = false;
              setCloseSaleLead(leadSnapshot);
            }}
            showNotFoundBackLink
          />
        </div>

        <div
          className="absolute inset-x-0 top-0 transition-all duration-[700ms] ease-[cubic-bezier(0.22,1,0.36,1)]"
          style={{
            transform: closeSaleLead ? 'translateX(0)' : 'translateX(110%)',
            opacity: closeSaleLead ? 1 : 0,
            pointerEvents: closeSaleLead ? 'auto' : 'none',
          }}
          aria-hidden={!closeSaleLead}
        >
          {closeSaleLead && user && (
            <CloseSaleRitual
              open={!!closeSaleLead}
              user={user}
              agentId={user.uid}
              agentName={agentProfile.name || ''}
              lead={closeSaleLead}
              onConverted={() => {
                navigateAfterCloseSale.current = true;
              }}
              onClose={() => {
                setCloseSaleLead(null);
                if (navigateAfterCloseSale.current) {
                  navigateAfterCloseSale.current = false;
                  router.push('/dashboard/clients');
                }
              }}
            />
          )}
        </div>
      </div>
    </div>
  );
}
