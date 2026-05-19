import 'server-only';

import { sendOrCreateChat } from './linq';
import { normalizePhone } from './phone';

export interface ForwardInboundParams {
  db: FirebaseFirestore.Firestore;
  agentId: string;
  fromPhoneE164: string | null;
  fromName?: string | null;
  text: string;
}

/**
 * Forward a cold inbound text to the agent's personal cell so they know in
 * real time that a client / beneficiary just texted their Linq line. Fired
 * from the leadInbox path — i.e. only for inbounds with no open AI lane.
 *
 * The forward is sent FROM the agent's own Linq line. The body instructs
 * the agent to reply directly to the client at their phone number, so
 * cell-to-cell becomes the conversation channel once a relationship exists.
 * The Linq line stays a first-touch funnel.
 *
 * Never throws. Forwarding failure must not block leadInbox writes or
 * webhook processing.
 */
export async function forwardInboundToAgentCell(
  params: ForwardInboundParams,
): Promise<void> {
  try {
    const agentSnap = await params.db
      .collection('agents')
      .doc(params.agentId)
      .get();
    if (!agentSnap.exists) {
      console.log('[inbound-forward] skipped: agent_not_found', {
        agentId: params.agentId,
      });
      return;
    }
    const agentData = agentSnap.data() as Record<string, unknown>;

    // Missing/undefined = enabled. Only an explicit `false` opts out.
    if (agentData.forwardInboundSms === false) {
      console.log('[inbound-forward] skipped: disabled', {
        agentId: params.agentId,
      });
      return;
    }

    const rawCell = (agentData.phoneNumber as string | undefined) || '';
    if (!rawCell.trim()) {
      console.log('[inbound-forward] skipped: no_cell', {
        agentId: params.agentId,
      });
      return;
    }
    const agentCell = normalizePhone(rawCell);

    const fromPhone = params.fromPhoneE164 || 'unknown number';
    const fromLabel = params.fromName
      ? `${params.fromName} (${fromPhone})`
      : fromPhone;

    const trimmedText = params.text.length > 600
      ? `${params.text.slice(0, 597)}...`
      : params.text;

    const replyLine = params.fromPhoneE164
      ? `Reply: ${params.fromPhoneE164}`
      : 'Reply: (sender number unavailable)';

    const body = [
      '📲 New text to your Linq line',
      `From: ${fromLabel}`,
      `"${trimmedText}"`,
      replyLine,
    ].join('\n');

    await sendOrCreateChat({ to: agentCell, text: body });

    console.log('[inbound-forward] sent', {
      agentId: params.agentId,
      fromPhoneE164: params.fromPhoneE164,
    });
  } catch (error) {
    console.warn('[inbound-forward] failed', {
      agentId: params.agentId,
      fromPhoneE164: params.fromPhoneE164,
      error: error instanceof Error ? error.message : String(error),
    });
  }
}

/**
 * Returns the agent doc id if the sender phone matches an agent's
 * personal `phoneNumber` — used to short-circuit the webhook when an
 * agent accidentally replies to their own forward SMS.
 */
export async function findAgentBySelfPhone(
  db: FirebaseFirestore.Firestore,
  senderPhoneE164: string,
): Promise<string | null> {
  if (!senderPhoneE164) return null;
  const snap = await db
    .collection('agents')
    .where('phoneNumber', '==', senderPhoneE164)
    .limit(1)
    .get();
  if (snap.empty) return null;
  return snap.docs[0].id;
}
