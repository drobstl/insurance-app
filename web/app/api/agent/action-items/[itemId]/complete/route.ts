import 'server-only';

import { NextRequest, NextResponse } from 'next/server';

import { completeActionItem } from '../../../../../../lib/action-item-store';
import {
  ACTION_ITEM_SUGGESTED_ACTIONS_BY_LANE,
  type ActionItemCompletionAction,
  type ActionItemDoc,
  type ActionItemSuggestedAction,
} from '../../../../../../lib/action-item-types';
import { getAdminAuth, getAdminFirestore } from '../../../../../../lib/firebase-admin';

/**
 * POST /api/agent/action-items/{itemId}/complete
 *
 * Marks a pending action item completed by an agent action. Validates
 * that `completionAction` is in the lane's allowed vocabulary (per
 * `ACTION_ITEM_SUGGESTED_ACTIONS_BY_LANE`) so an agent cannot, for
 * example, post `completionAction: 'skip'` against a welcome lane item
 * where skip is intentionally not surfaced.
 *
 * Telemetry (`action_item_completed`) is fired client-side from the
 * dashboard so PostHog identity context lives in the request lifecycle.
 *
 * Body: { completionAction, completionNote? }
 * Auth: Bearer <Firebase ID token>
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ itemId: string }> },
) {
  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader?.startsWith('Bearer ')) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    const token = authHeader.slice('Bearer '.length).trim();
    if (!token) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    const decoded = await getAdminAuth().verifyIdToken(token);
    const agentId = decoded.uid;
    const { itemId } = await params;
    if (!itemId) {
      return NextResponse.json({ error: 'Missing itemId' }, { status: 400 });
    }

    const body = (await req.json().catch(() => null)) as
      | { completionAction?: unknown; completionNote?: unknown }
      | null;
    const completionActionRaw =
      typeof body?.completionAction === 'string' ? body.completionAction.trim() : '';
    if (!completionActionRaw) {
      return NextResponse.json({ error: 'Missing completionAction' }, { status: 400 });
    }
    const completionNote =
      typeof body?.completionNote === 'string' ? body.completionNote.trim() : null;

    const db = getAdminFirestore();
    const ref = db
      .collection('agents')
      .doc(agentId)
      .collection('actionItems')
      .doc(itemId);
    const snap = await ref.get();
    if (!snap.exists) {
      return NextResponse.json({ error: 'Action item not found' }, { status: 404 });
    }
    const current = snap.data() as ActionItemDoc;
    if (current.status !== 'pending') {
      return NextResponse.json(
        { error: `Action item is ${current.status}; cannot complete.` },
        { status: 409 },
      );
    }

    const allowedForLane = ACTION_ITEM_SUGGESTED_ACTIONS_BY_LANE[current.lane] as readonly ActionItemSuggestedAction[];
    if (!allowedForLane.includes(completionActionRaw as ActionItemSuggestedAction)) {
      return NextResponse.json(
        {
          error: `completionAction '${completionActionRaw}' is not allowed for lane '${current.lane}'.`,
          allowed: allowedForLane,
        },
        { status: 400 },
      );
    }
    const completionAction = completionActionRaw as ActionItemCompletionAction;

    const result = await completeActionItem({
      db,
      agentId,
      itemId,
      completedBy: agentId,
      completionAction,
      completionNote,
    });

    if (!result.completed) {
      return NextResponse.json({ success: false, doc: result.doc });
    }

    console.log('[welcome-action-item] completed', {
      agentId,
      itemId,
      lane: current.lane,
      triggerReason: current.triggerReason,
      completionAction,
    });

    // Phase 1 Track B onboarding bridge — when a welcome lane action
    // item is completed via 'text_personally', mark the
    // firstWelcomeSent onboarding milestone. The legacy
    // /api/client/welcome-sms route used to mark this milestone (in
    // the dashboard UI handler) but that path is deprecated; the
    // new welcome-flow path needs to mark it from here. Uses
    // Firestore dot-notation update to set just the nested field
    // without risk of replacing the parent onboarding object.
    if (current.lane === 'welcome' && completionAction === 'text_personally') {
      try {
        await db
          .collection('agents')
          .doc(agentId)
          .update({
            'onboarding.requiredMilestones.firstWelcomeSent': true,
          });
        console.log('[welcome-action-item] marked firstWelcomeSent', { agentId, itemId });
      } catch (markErr) {
        // Non-blocking — completion succeeded even if milestone mark
        // failed. Onboarding overlay will catch up on next refresh.
        console.warn('[welcome-action-item] firstWelcomeSent mark failed (non-blocking)', {
          agentId,
          error: markErr instanceof Error ? markErr.message : String(markErr),
        });
      }
    }

    return NextResponse.json({ success: true, doc: result.doc });
  } catch (error) {
    const errMsg = error instanceof Error ? error.message : String(error);
    console.error('[welcome-action-item] complete failed', { error: errMsg });
    if (errMsg.includes('Firebase ID token')) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    return NextResponse.json({ error: errMsg }, { status: 500 });
  }
}
