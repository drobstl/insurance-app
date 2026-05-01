export type ConversationLane =
  | 'beneficiary'
  | 'referral'
  | 'conservation'
  | 'policy_review'
  | 'lead'
  | 'manual';

export type ConversationPurpose =
  | 'beneficiary_intro'
  | 'beneficiary_followup'
  | 'beneficiary_manual'
  | 'referral_group_intro'
  | 'referral_outreach'
  | 'conservation'
  | 'policy_review'
  | 'lead_unassigned'
  | 'manual_general';

export type LinkedEntityType =
  | 'beneficiary'
  | 'referral'
  | 'conservationAlert'
  | 'policyReview'
  | 'lead'
  | 'none';

export type AllowedResponder =
  | 'none'
  | 'beneficiary'
  | 'referral'
  | 'conservation'
  | 'policy_review'
  | 'manual_only';

export interface ThreadAiPolicy {
  allowAutoReply: boolean;
  allowedResponder: AllowedResponder;
}

export interface ConversationThreadDoc {
  threadId: string;
  agentId: string;
  provider: 'linq';
  providerThreadId: string;
  providerType: 'sms_direct' | 'sms_group' | 'email' | 'push';
  purpose: ConversationPurpose;
  lane: ConversationLane;
  linkedEntityType: LinkedEntityType;
  linkedEntityId: string | null;
  primaryPersonId: string | null;
  participantPersonIds: string[];
  participantPhonesE164: string[];
  aiPolicy: ThreadAiPolicy;
  lifecycleStatus: 'active' | 'paused' | 'closed' | 'archived';
  confidence: 'high' | 'medium' | 'low';
  assignmentSource: 'outbound_create' | 'inbound_match' | 'manual' | 'migration';
  lastInboundAt: string | null;
  lastOutboundAt: string | null;
  lastMessageAt: string | null;
  createdAt: string;
  updatedAt: string;
}
