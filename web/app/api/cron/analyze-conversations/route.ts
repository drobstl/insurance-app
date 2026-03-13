import 'server-only';

import { NextRequest, NextResponse } from 'next/server';
import { getAdminFirestore } from '../../../../lib/firebase-admin';
import { analyzeConversation } from '../../../../lib/conversation-analyzer';
import { rewriteFailedConversation } from '../../../../lib/counterfactual-rewriter';
import {
  storeAnalysis,
  markSourceDocAnalyzed,
  hasBeenAnalyzed,
  getExemplars,
  getStrategy,
} from '../../../../lib/conversation-memory';
import type { ConversationType, ConversationMessage, ConversationOutcome } from '../../../../lib/learning-types';

/**
 * GET /api/cron/analyze-conversations
 *
 * Daily cron: finds all conversations that reached terminal state
 * but haven't been analyzed yet. Runs the multi-pass LLM judge on each,
 * then counterfactual rewrites on failures.
 *
 * Schedule: 0 7 * * * (7 AM UTC daily)
 */

export const maxDuration = 300;

interface TerminalConversation {
  agentId: string;
  sourceDocPath: string;
  sourceDocId: string;
  conversationType: ConversationType;
  outcome: ConversationOutcome;
  conversation: ConversationMessage[];
  metadata: Record<string, unknown>;
}

async function findTerminalReferrals(db: FirebaseFirestore.Firestore): Promise<TerminalConversation[]> {
  const results: TerminalConversation[] = [];
  const agentsSnap = await db.collection('agents').get();

  for (const agentDoc of agentsSnap.docs) {
    const agentId = agentDoc.id;
    const referralsSnap = await db
      .collection('agents').doc(agentId)
      .collection('referrals')
      .where('analyzed', '!=', true)
      .get();

    for (const refDoc of referralsSnap.docs) {
      const data = refDoc.data();
      const isTerminal = data.status === 'booked' || data.appointmentBooked === true ||
        data.status === 'lost' || data.status === 'closed' || data.status === 'done';

      if (!isTerminal || !data.conversation?.length) continue;

      const docPath = `agents/${agentId}/referrals/${refDoc.id}`;
      const alreadyDone = await hasBeenAnalyzed(docPath);
      if (alreadyDone) continue;

      const outcome: ConversationOutcome =
        data.status === 'booked' || data.appointmentBooked ? 'success' : 'failure';

      results.push({
        agentId,
        sourceDocPath: docPath,
        sourceDocId: refDoc.id,
        conversationType: 'referral',
        outcome,
        conversation: (data.conversation as Array<{ role: string; body: string; timestamp?: string }>).map((m) => ({
          role: m.role === 'referral' ? 'client' : 'agent-ai',
          body: m.body,
          timestamp: m.timestamp ?? new Date().toISOString(),
        })),
        metadata: {
          messageCount: data.conversation.length,
          durationMinutes: null,
          reason: null,
          premiumAmount: null,
          coverageAmount: null,
          carrier: null,
          policyType: null,
        },
      });
    }
  }

  return results;
}

async function findTerminalConservation(db: FirebaseFirestore.Firestore): Promise<TerminalConversation[]> {
  const results: TerminalConversation[] = [];
  const agentsSnap = await db.collection('agents').get();

  for (const agentDoc of agentsSnap.docs) {
    const agentId = agentDoc.id;
    const alertsSnap = await db
      .collection('agents').doc(agentId)
      .collection('conservationAlerts')
      .where('status', 'in', ['saved', 'lost'])
      .get();

    for (const alertDoc of alertsSnap.docs) {
      const data = alertDoc.data();
      if (!data.conversation?.length) continue;

      const docPath = `agents/${agentId}/conservationAlerts/${alertDoc.id}`;
      const alreadyDone = await hasBeenAnalyzed(docPath);
      if (alreadyDone) continue;

      results.push({
        agentId,
        sourceDocPath: docPath,
        sourceDocId: alertDoc.id,
        conversationType: 'conservation',
        outcome: data.status === 'saved' ? 'success' : 'failure',
        conversation: (data.conversation as Array<{ role: string; body: string; timestamp?: string }>).map((m) => ({
          role: m.role,
          body: m.body,
          timestamp: m.timestamp ?? new Date().toISOString(),
        })),
        metadata: {
          messageCount: data.conversation.length,
          durationMinutes: null,
          reason: data.reason ?? null,
          premiumAmount: data.premiumAmount ?? null,
          coverageAmount: data.coverageAmount ?? null,
          carrier: data.carrier ?? null,
          policyType: data.policyType ?? null,
        },
      });
    }
  }

  return results;
}

async function findTerminalReviews(db: FirebaseFirestore.Firestore): Promise<TerminalConversation[]> {
  const results: TerminalConversation[] = [];
  const agentsSnap = await db.collection('agents').get();

  for (const agentDoc of agentsSnap.docs) {
    const agentId = agentDoc.id;
    const reviewsSnap = await db
      .collection('agents').doc(agentId)
      .collection('policyReviews')
      .where('status', 'in', ['booked', 'closed', 'opted-out'])
      .get();

    for (const revDoc of reviewsSnap.docs) {
      const data = revDoc.data();
      if (!data.conversation?.length) continue;

      const docPath = `agents/${agentId}/policyReviews/${revDoc.id}`;
      const alreadyDone = await hasBeenAnalyzed(docPath);
      if (alreadyDone) continue;

      results.push({
        agentId,
        sourceDocPath: docPath,
        sourceDocId: revDoc.id,
        conversationType: 'policy-review',
        outcome: data.status === 'booked' ? 'success' : 'failure',
        conversation: (data.conversation as Array<{ role: string; body: string; timestamp?: string }>).map((m) => ({
          role: m.role,
          body: m.body,
          timestamp: m.timestamp ?? new Date().toISOString(),
        })),
        metadata: {
          messageCount: data.conversation.length,
          durationMinutes: null,
          reason: null,
          premiumAmount: data.premiumAmount ?? null,
          coverageAmount: data.coverageAmount ?? null,
          carrier: data.carrier ?? null,
          policyType: data.policyType ?? null,
        },
      });
    }
  }

  return results;
}

export async function GET(req: NextRequest) {
  const authHeader = req.headers.get('authorization');
  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const db = getAdminFirestore();

    const [referrals, conservation, reviews] = await Promise.all([
      findTerminalReferrals(db),
      findTerminalConservation(db),
      findTerminalReviews(db),
    ]);

    const allConversations = [...referrals, ...conservation, ...reviews];
    let analyzed = 0;
    let rewritten = 0;
    const errors: string[] = [];

    for (const conv of allConversations) {
      try {
        const strategy = await getStrategy(conv.conversationType);
        const analysis = await analyzeConversation({
          conversationType: conv.conversationType,
          outcome: conv.outcome,
          conversation: conv.conversation,
          metadata: conv.metadata as Parameters<typeof analyzeConversation>[0]['metadata'],
          strategyDocument: strategy?.strategyDocument ?? null,
        });

        const analysisId = await storeAnalysis({
          agentId: conv.agentId,
          conversationType: conv.conversationType,
          outcome: conv.outcome,
          clientPersona: analysis.clientPersona,
          analysis,
          conversation: conv.conversation,
          metadata: conv.metadata as Parameters<typeof storeAnalysis>[0]['metadata'],
          sourceDocPath: conv.sourceDocPath,
          sourceDocId: conv.sourceDocId,
          strategyVersion: strategy?.currentVersion ?? 0,
        });

        await markSourceDocAnalyzed(conv.sourceDocPath, analysisId);
        analyzed++;

        if (conv.outcome === 'failure') {
          try {
            const exemplars = await getExemplars({
              type: conv.conversationType,
              persona: analysis.clientPersona,
              outcome: 'success',
              limit: 3,
            });

            const rewrite = await rewriteFailedConversation({
              conversationType: conv.conversationType,
              conversation: conv.conversation,
              analysis,
              persona: analysis.clientPersona,
              strategyDocument: strategy?.strategyDocument ?? null,
              exemplarConversations: exemplars.map((e) => e.conversation),
            });

            if (rewrite.annotations.length > 0) {
              await storeAnalysis({
                agentId: conv.agentId,
                conversationType: conv.conversationType,
                outcome: 'success',
                clientPersona: analysis.clientPersona,
                analysis: { ...analysis, outcome: 'success' },
                conversation: rewrite.rewrittenConversation,
                metadata: conv.metadata as Parameters<typeof storeAnalysis>[0]['metadata'],
                sourceDocPath: conv.sourceDocPath,
                sourceDocId: conv.sourceDocId,
                isSynthetic: true,
                syntheticSourceId: analysisId,
              });
              rewritten++;
            }
          } catch (err) {
            console.warn(`Counterfactual rewrite failed for ${conv.sourceDocPath}:`, err);
          }
        }
      } catch (err) {
        const msg = `Failed to analyze ${conv.sourceDocPath}: ${err}`;
        console.error(msg);
        errors.push(msg);
      }
    }

    return NextResponse.json({
      success: true,
      found: allConversations.length,
      analyzed,
      rewritten,
      errors: errors.length,
    });
  } catch (error) {
    console.error('Analyze conversations cron error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
