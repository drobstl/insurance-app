import { Timestamp } from 'firebase-admin/firestore';

export type ConservationReason = 'lapsed_payment' | 'cancellation' | 'other';

export type ConservationStatus =
  | 'new'
  | 'outreach_scheduled'
  | 'outreach_sent'
  | 'drip_1'
  | 'drip_2'
  | 'drip_3'
  | 'saved'
  | 'lost';

export type ConservationSource = 'email_forward' | 'paste';

export interface ConservationAlert {
  id: string;

  source: ConservationSource;
  rawText: string;

  clientName: string;
  policyNumber: string;
  carrier: string;
  reason: ConservationReason;

  clientId: string | null;
  policyId: string | null;

  policyAge: number | null;
  isChargebackRisk: boolean;
  priority: 'high' | 'low';
  premiumAmount: number | null;
  policyType: string | null;
  clientHasApp: boolean;
  clientPolicyCount: number | null;

  status: ConservationStatus;
  scheduledOutreachAt: string | null;
  outreachSentAt: string | null;
  pushSentAt: string | null;
  smsSentAt: string | null;
  lastDripAt: string | null;
  dripCount: number;

  initialMessage: string | null;
  dripMessages: string[];
  aiInsight: string | null;

  notes: string | null;
  createdAt: Timestamp;
  resolvedAt: string | null;
}

export interface ExtractedConservationData {
  clientName: string;
  policyNumber: string;
  carrier: string;
  reason: ConservationReason;
  confidence: 'high' | 'medium' | 'low';
}

export interface ConservationOutreachContext {
  clientFirstName: string;
  clientName: string;
  agentName: string;
  agentFirstName: string;
  policyType: string | null;
  policyAge: number | null;
  reason: ConservationReason;
  schedulingUrl: string | null;
  dripNumber: number;
  premiumAmount: number | null;
  coverageAmount?: number | null;
}
