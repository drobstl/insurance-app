import type { AllowedResponder, ConversationLane, ConversationThreadDoc } from './conversation-routing-types';

export function responderForLane(lane: ConversationLane): AllowedResponder {
  if (lane === 'beneficiary') return 'beneficiary';
  if (lane === 'referral') return 'referral';
  if (lane === 'conservation') return 'conservation';
  if (lane === 'policy_review') return 'policy_review';
  if (lane === 'welcome_activation') return 'welcome_activation';
  if (lane === 'manual') return 'manual_only';
  return 'none';
}

export function canAutoReplyInLane(params: {
  thread: Pick<ConversationThreadDoc, 'lane' | 'aiPolicy'>;
  responder: AllowedResponder;
}): boolean {
  if (!params.thread.aiPolicy.allowAutoReply) return false;
  if (params.thread.aiPolicy.allowedResponder === 'manual_only') return false;
  if (params.thread.aiPolicy.allowedResponder === 'none') return false;
  return params.thread.aiPolicy.allowedResponder === params.responder;
}
