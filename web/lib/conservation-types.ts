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

export type ConservationSource = 'email_forward' | 'paste' | 'manual_flag';

export type ConservationChannel = 'sms' | 'push' | 'email';

export type TouchStage =
  | 'initial'
  | 'followup_24h'
  | 'followup_day3'
  | 'followup_day7';

export const TOUCH_STAGE_TO_STATUS: Record<TouchStage, ConservationStatus> = {
  initial: 'outreach_sent',
  followup_24h: 'drip_1',
  followup_day3: 'drip_2',
  followup_day7: 'drip_3',
};

export const STATUS_TO_TOUCH_STAGE: Partial<Record<ConservationStatus, TouchStage>> = {
  outreach_sent: 'initial',
  drip_1: 'followup_24h',
  drip_2: 'followup_day3',
  drip_3: 'followup_day7',
};

export const TOUCH_STAGE_DRIP_NUMBER: Record<TouchStage, number> = {
  initial: 0,
  followup_24h: 1,
  followup_day3: 2,
  followup_day7: 3,
};

export const NEXT_TOUCH_STAGE: Partial<Record<TouchStage, TouchStage>> = {
  initial: 'followup_24h',
  followup_24h: 'followup_day3',
  followup_day3: 'followup_day7',
};

const MS_PER_HOUR = 60 * 60 * 1000;
const MS_PER_DAY = 24 * MS_PER_HOUR;

export const TOUCH_STAGE_DELAY: Record<TouchStage, number> = {
  initial: 0,
  followup_24h: 24 * MS_PER_HOUR,
  followup_day3: 3 * MS_PER_DAY,
  followup_day7: 7 * MS_PER_DAY,
};

export const STAGE_PRIMARY_CHANNEL: Record<TouchStage, ConservationChannel> = {
  initial: 'push',
  followup_24h: 'sms',
  followup_day3: 'email',
  followup_day7: 'push',
};

export const STAGE_FALLBACK_ORDER: Record<TouchStage, ConservationChannel[]> = {
  initial: ['push', 'sms', 'email'],
  followup_24h: ['sms', 'email', 'push'],
  followup_day3: ['email', 'push', 'sms'],
  followup_day7: ['push', 'sms'],
};

export interface ConservationMessage {
  role: 'client' | 'agent-ai' | 'agent-manual';
  body: string;
  timestamp: string;
  channels?: ConservationChannel[];
}

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
  conversation: ConservationMessage[];
  chatId: string | null;
  aiEnabled: boolean;
  availableChannels: ConservationChannel[];
  noContactMethod: boolean;
  saveSuggested: boolean;
  aiInsight: string | null;

  touchStage: TouchStage | null;
  nextTouchAt: string | null;
  channelsUsed: ConservationChannel[];
  lastClientReplyAt: string | null;

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
  availableChannels?: ConservationChannel[];
  carrierServicePhone?: string | null;
  carrier?: string | null;
}

export interface ConservationConversationContext {
  clientFirstName: string;
  clientName: string;
  agentName: string;
  agentFirstName: string;
  policyType: string | null;
  policyAge: number | null;
  reason: ConservationReason;
  schedulingUrl: string | null;
  premiumAmount: number | null;
  coverageAmount?: number | null;
  conversation: ConservationMessage[];
}

export interface SaveSignalResult {
  saved: boolean;
  confidence: 'high' | 'medium' | 'low';
}
