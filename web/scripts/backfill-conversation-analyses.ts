/**
 * One-time backfill script: analyze all historical completed conversations.
 *
 * This bootstraps the learning system with analyses from every conversation
 * that has already happened, so the AI starts with a knowledge base from
 * day one rather than learning from scratch.
 *
 * Usage:
 *   npx tsx web/scripts/backfill-conversation-analyses.ts
 *
 * Requirements:
 *   - ANTHROPIC_API_KEY set in environment
 *   - FIREBASE_ADMIN_SERVICE_ACCOUNT or FIREBASE_ADMIN_SERVICE_ACCOUNT_BASE64 set
 *
 * The script:
 *   1. Reads all completed referrals, conservation alerts, and policy reviews
 *   2. Runs the multi-pass analyzer on each
 *   3. Runs counterfactual rewriting on all failures
 *   4. Stores all analyses in Firestore
 *   5. Triggers strategy synthesis to build v1 from the complete dataset
 */

import { initializeApp, cert, getApps } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';

const getServiceAccountJson = () => {
  const raw = process.env.FIREBASE_ADMIN_SERVICE_ACCOUNT;
  if (raw && raw.trim().startsWith('{')) return raw;
  const base64 = process.env.FIREBASE_ADMIN_SERVICE_ACCOUNT_BASE64;
  if (base64) return Buffer.from(base64, 'base64').toString('utf8');
  return null;
};

const serviceAccountJson = getServiceAccountJson();
if (!serviceAccountJson) {
  console.error('Firebase Admin credentials are not configured.');
  process.exit(1);
}

if (!process.env.ANTHROPIC_API_KEY) {
  console.error('ANTHROPIC_API_KEY is not set.');
  process.exit(1);
}

if (getApps().length === 0) {
  initializeApp({ credential: cert(JSON.parse(serviceAccountJson)) });
}

const db = getFirestore();

interface ConversationDoc {
  agentId: string;
  sourceDocPath: string;
  sourceDocId: string;
  conversationType: 'referral' | 'conservation' | 'policy-review';
  outcome: 'success' | 'failure';
  conversation: Array<{ role: string; body: string; timestamp: string }>;
  metadata: Record<string, unknown>;
}

async function collectReferrals(): Promise<ConversationDoc[]> {
  const results: ConversationDoc[] = [];
  const agentsSnap = await db.collection('agents').get();

  for (const agentDoc of agentsSnap.docs) {
    const agentId = agentDoc.id;
    const referralsSnap = await db
      .collection('agents').doc(agentId)
      .collection('referrals')
      .get();

    for (const refDoc of referralsSnap.docs) {
      const data = refDoc.data();
      const isTerminal = data.status === 'booked' || data.appointmentBooked === true ||
        data.status === 'lost' || data.status === 'closed' || data.status === 'done';

      if (!isTerminal || !data.conversation?.length) continue;

      const outcome = (data.status === 'booked' || data.appointmentBooked) ? 'success' : 'failure';

      results.push({
        agentId,
        sourceDocPath: `agents/${agentId}/referrals/${refDoc.id}`,
        sourceDocId: refDoc.id,
        conversationType: 'referral',
        outcome: outcome as 'success' | 'failure',
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

async function collectConservation(): Promise<ConversationDoc[]> {
  const results: ConversationDoc[] = [];
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

      results.push({
        agentId,
        sourceDocPath: `agents/${agentId}/conservationAlerts/${alertDoc.id}`,
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

async function collectReviews(): Promise<ConversationDoc[]> {
  const results: ConversationDoc[] = [];
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

      results.push({
        agentId,
        sourceDocPath: `agents/${agentId}/policyReviews/${revDoc.id}`,
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

const DELAY_BETWEEN_ANALYSES_MS = 2000;

async function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

async function main() {
  console.log('Collecting historical conversations...');

  const [referrals, conservation, reviews] = await Promise.all([
    collectReferrals(),
    collectConservation(),
    collectReviews(),
  ]);

  const all = [...referrals, ...conservation, ...reviews];
  console.log(`Found ${all.length} terminal conversations:`);
  console.log(`  Referrals: ${referrals.length}`);
  console.log(`  Conservation: ${conservation.length}`);
  console.log(`  Reviews: ${reviews.length}`);

  if (all.length === 0) {
    console.log('No conversations to analyze.');
    return;
  }

  const { analyzeConversation: analyze } = await import('../lib/conversation-analyzer');
  const { rewriteFailedConversation } = await import('../lib/counterfactual-rewriter');
  const { storeAnalysis, markSourceDocAnalyzed, getExemplars } = await import('../lib/conversation-memory');

  let analyzed = 0;
  let rewritten = 0;
  let errors = 0;

  for (const conv of all) {
    try {
      process.stdout.write(`[${analyzed + 1}/${all.length}] ${conv.conversationType} (${conv.outcome}) ${conv.sourceDocPath}... `);

      const analysis = await analyze({
        conversationType: conv.conversationType,
        outcome: conv.outcome,
        conversation: conv.conversation,
        metadata: conv.metadata as Parameters<typeof analyze>[0]['metadata'],
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
      });

      await markSourceDocAnalyzed(conv.sourceDocPath, analysisId);
      analyzed++;
      console.log(`done (persona: ${analysis.clientPersona}, score: ${analysis.outcomeScore})`);

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
            strategyDocument: null,
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
            console.log(`  -> counterfactual rewrite stored (${rewrite.annotations.length} messages rewritten)`);
          }
        } catch (err) {
          console.warn(`  -> counterfactual rewrite failed: ${err}`);
        }
      }

      await sleep(DELAY_BETWEEN_ANALYSES_MS);
    } catch (err) {
      console.error(`FAILED: ${err}`);
      errors++;
      await sleep(DELAY_BETWEEN_ANALYSES_MS);
    }
  }

  console.log('\n--- Backfill Complete ---');
  console.log(`Analyzed: ${analyzed}`);
  console.log(`Rewritten: ${rewritten}`);
  console.log(`Errors: ${errors}`);

  console.log('\nRunning strategy synthesis...');
  const { synthesizeStrategy } = await import('../lib/strategy-synthesizer');

  for (const type of ['referral', 'conservation', 'policy-review'] as const) {
    try {
      await synthesizeStrategy(type);
      console.log(`Strategy v1 generated for ${type}`);
    } catch (err) {
      console.error(`Strategy synthesis failed for ${type}:`, err);
    }
  }

  console.log('\nDone.');
}

main().catch((err) => {
  console.error('Backfill failed:', err);
  process.exit(1);
});
