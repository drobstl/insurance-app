'use client';

import { useParams, useRouter, useSearchParams } from 'next/navigation';
import LeadDetailPanel from '../../../../components/LeadDetailPanel';

export default function LeadDetailPage() {
  const router = useRouter();
  const params = useParams<{ leadId: string }>();
  const searchParams = useSearchParams();
  const leadId = params?.leadId;
  // Deep-link query param — set by the "Send from phone" QR hand-off
  // on macOS. The panel auto-opens the send-confirmation drawer for
  // this appointment and strips the param from the URL.
  const openConfirmationParam = searchParams?.get('openConfirmation') ?? null;

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
        showNotFoundBackLink
      />
    </div>
  );
}
