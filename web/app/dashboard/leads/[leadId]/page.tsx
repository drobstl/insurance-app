'use client';

import { useEffect, useRef, useState } from 'react';
import { useParams, useRouter, useSearchParams } from 'next/navigation';
import LeadDetailPanel from '../../../../components/LeadDetailPanel';
import { CloseSaleRitual } from '../../../../components/CloseSaleRitual';
import { useDashboard } from '../../DashboardContext';
import { LEAD_MODE_ENABLED } from '../../../../lib/feature-flags';

export default function LeadDetailPage() {
  const router = useRouter();
  const params = useParams<{ leadId: string }>();
  const searchParams = useSearchParams();
  const leadId = params?.leadId;
  // Deep-link query param — set by the "Send from phone" QR hand-off
  // on macOS. The panel auto-opens the send-confirmation drawer for
  // this appointment and strips the param from the URL.
  const openConfirmationParam = searchParams?.get('openConfirmation') ?? null;

  const { user, agentProfile } = useDashboard();

  // Close Sale ritual modal — hosted here (not inside LeadDetailPanel)
  // so it survives the panel's unmount after Card 1's convert. Same
  // shape as the queue page wiring. See comments in
  // LeadDetailPanel.tsx and CloseSaleRitual.tsx.
  const [closeSaleLead, setCloseSaleLead] = useState<{
    id: string;
    name: string;
    firstName: string;
    phone: string;
  } | null>(null);
  const navigateAfterCloseSale = useRef(false);

  // Feature flag gate — see web/app/dashboard/leads/page.tsx for the
  // matching guard on the list/queue route.
  useEffect(() => {
    if (!LEAD_MODE_ENABLED) router.replace('/dashboard');
  }, [router]);
  if (!LEAD_MODE_ENABLED) return null;

  if (!leadId) return null;

  return (
    <div className="max-w-4xl mx-auto">
      <button
        onClick={() => router.push('/dashboard/leads')}
        className="text-sm text-[#44bbaa] hover:text-[#005751] font-semibold mb-4"
      >
        ← All leads
      </button>
      <LeadDetailPanel
        key={leadId}
        leadId={leadId}
        initialOpenConfirmationApptId={openConfirmationParam}
        onConverted={() => router.push('/dashboard/clients')}
        onDeleted={() => router.push('/dashboard/leads')}
        onRequestCloseSale={(leadSnapshot) => {
          navigateAfterCloseSale.current = false;
          setCloseSaleLead(leadSnapshot);
        }}
        showNotFoundBackLink
      />

      {closeSaleLead && user && (
        <CloseSaleRitual
          open={!!closeSaleLead}
          user={user}
          agentId={user.uid}
          agentName={agentProfile.name || ''}
          lead={closeSaleLead}
          onConverted={() => {
            // Card 1 success — defer navigation until the modal
            // closes so the agent can finish Cards 2 + 3.
            navigateAfterCloseSale.current = true;
          }}
          onClose={() => {
            setCloseSaleLead(null);
            if (navigateAfterCloseSale.current) {
              navigateAfterCloseSale.current = false;
              // Same destination the plain `onConverted` path uses
              // on this surface — the new client is sorted to the
              // top of /dashboard/clients.
              router.push('/dashboard/clients');
            }
          }}
        />
      )}
    </div>
  );
}
