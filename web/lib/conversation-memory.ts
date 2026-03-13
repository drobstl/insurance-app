import 'server-only';

import { getAdminFirestore } from './firebase-admin';
import type {
  ConversationType,
  ConversationOutcome,
  ClientPersona,
  StoredAnalysis,
  ConversationAnalysis,
  ConversationMessage,
  AnalysisMetadata,
  StrategyRecord,
  StrategyVersion,
  Experiment,
  PerformanceSnapshot,
  RollbackRecord,
} from './learning-types';

const db = () => getAdminFirestore();

// ─── Write Operations ────────────────────────────────────────────────────────

export async function storeAnalysis(params: {
  agentId: string;
  conversationType: ConversationType;
  outcome: ConversationOutcome;
  clientPersona: ClientPersona;
  analysis: ConversationAnalysis;
  conversation: ConversationMessage[];
  metadata: AnalysisMetadata;
  sourceDocPath: string;
  sourceDocId: string;
  isSynthetic?: boolean;
  syntheticSourceId?: string | null;
  experimentId?: string | null;
  experimentArm?: 'control' | 'variant' | null;
  strategyVersion?: number;
}): Promise<string> {
  const doc: Omit<StoredAnalysis, 'id'> = {
    agentId: params.agentId,
    conversationType: params.conversationType,
    outcome: params.outcome,
    clientPersona: params.clientPersona,
    analysis: params.analysis,
    conversation: params.conversation,
    metadata: params.metadata,
    sourceDocPath: params.sourceDocPath,
    sourceDocId: params.sourceDocId,
    isSynthetic: params.isSynthetic ?? false,
    syntheticSourceId: params.syntheticSourceId ?? null,
    experimentId: params.experimentId ?? null,
    experimentArm: params.experimentArm ?? null,
    strategyVersion: params.strategyVersion ?? 0,
    createdAt: new Date().toISOString(),
    conversationEndedAt: new Date().toISOString(),
  };

  const ref = await db().collection('conversationAnalyses').add(doc);
  return ref.id;
}

export async function markSourceDocAnalyzed(
  sourceDocPath: string,
  analysisId: string,
): Promise<void> {
  try {
    await db().doc(sourceDocPath).update({
      analyzed: true,
      analysisId,
    });
  } catch {
    console.warn(`Could not mark ${sourceDocPath} as analyzed`);
  }
}

// ─── Read: Strategy Documents ────────────────────────────────────────────────

export async function getStrategy(
  type: ConversationType,
): Promise<StrategyRecord | null> {
  const doc = await db().collection('aiStrategy').doc(type).get();
  if (!doc.exists) return null;
  return { conversationType: type, ...doc.data() } as StrategyRecord;
}

export async function getStrategyVersion(
  type: ConversationType,
  version: number,
): Promise<StrategyVersion | null> {
  const doc = await db()
    .collection('aiStrategy')
    .doc(type)
    .collection('versions')
    .doc(String(version))
    .get();
  if (!doc.exists) return null;
  return doc.data() as StrategyVersion;
}

export async function saveStrategy(
  type: ConversationType,
  strategy: Omit<StrategyRecord, 'conversationType'>,
): Promise<void> {
  await db().collection('aiStrategy').doc(type).set({
    ...strategy,
    conversationType: type,
  });

  await db()
    .collection('aiStrategy')
    .doc(type)
    .collection('versions')
    .doc(String(strategy.currentVersion))
    .set({
      version: strategy.currentVersion,
      strategyDocument: strategy.strategyDocument,
      antiPatterns: strategy.antiPatterns,
      personaStrategies: strategy.personaStrategies,
      topExemplarIds: strategy.topExemplarIds,
      topExemplarsByPersona: strategy.topExemplarsByPersona,
      conversationsAnalyzed: strategy.conversationsAnalyzed,
      successRate: strategy.successRate,
      promotedAt: new Date().toISOString(),
      rolledBackAt: null,
      rolledBackReason: null,
      replacedByVersion: null,
      sourceExperimentId: null,
    } satisfies StrategyVersion);
}

export async function rollbackStrategy(
  type: ConversationType,
  rolledBackVersion: number,
  restoredVersion: number,
  reason: string,
): Promise<void> {
  const previousStrategy = await getStrategyVersion(type, restoredVersion);
  if (!previousStrategy) throw new Error(`Strategy version ${restoredVersion} not found`);

  await db().collection('aiStrategy').doc(type).update({
    currentVersion: restoredVersion,
    strategyDocument: previousStrategy.strategyDocument,
    antiPatterns: previousStrategy.antiPatterns,
    personaStrategies: previousStrategy.personaStrategies,
    topExemplarIds: previousStrategy.topExemplarIds,
    topExemplarsByPersona: previousStrategy.topExemplarsByPersona,
  });

  await db()
    .collection('aiStrategy')
    .doc(type)
    .collection('versions')
    .doc(String(rolledBackVersion))
    .update({
      rolledBackAt: new Date().toISOString(),
      rolledBackReason: reason,
    });
}

// ─── Read: Exemplars ─────────────────────────────────────────────────────────

export async function getExemplars(params: {
  type: ConversationType;
  persona?: ClientPersona;
  outcome?: ConversationOutcome;
  limit?: number;
  includeSynthetic?: boolean;
}): Promise<StoredAnalysis[]> {
  const limit = params.limit ?? 10;

  const snap = await db()
    .collection('conversationAnalyses')
    .where('conversationType', '==', params.type)
    .get();

  let results = snap.docs
    .map((doc) => ({ id: doc.id, ...doc.data() } as StoredAnalysis))
    .filter((a) => a.outcome === (params.outcome ?? 'success'));

  if (params.persona && params.persona !== 'unknown') {
    const personaMatches = results.filter((r) => r.clientPersona === params.persona);
    if (personaMatches.length >= 3) {
      results = personaMatches;
    }
  }

  if (params.includeSynthetic === false) {
    results = results.filter((r) => !r.isSynthetic);
  }

  results.sort((a, b) => (b.createdAt ?? '').localeCompare(a.createdAt ?? ''));
  return results.slice(0, limit);
}

// ─── Read: For Synthesis ─────────────────────────────────────────────────────

export async function getRecentAnalyses(params: {
  sinceDays?: number;
  type?: ConversationType;
}): Promise<StoredAnalysis[]> {
  const since = new Date();
  since.setDate(since.getDate() - (params.sinceDays ?? 30));
  const sinceISO = since.toISOString();

  let snap;
  if (params.type) {
    snap = await db()
      .collection('conversationAnalyses')
      .where('conversationType', '==', params.type)
      .get();
  } else {
    snap = await db()
      .collection('conversationAnalyses')
      .get();
  }

  return snap.docs
    .map((doc) => ({ id: doc.id, ...doc.data() } as StoredAnalysis))
    .filter((a) => (a.createdAt ?? '') >= sinceISO)
    .sort((a, b) => (b.createdAt ?? '').localeCompare(a.createdAt ?? ''));
}

export async function hasBeenAnalyzed(sourceDocPath: string): Promise<boolean> {
  const snap = await db()
    .collection('conversationAnalyses')
    .where('sourceDocPath', '==', sourceDocPath)
    .limit(5)
    .get();
  return snap.docs.some((doc) => doc.data().isSynthetic !== true);
}

// ─── Experiments ─────────────────────────────────────────────────────────────

export async function getActiveExperiment(
  type: ConversationType,
): Promise<Experiment | null> {
  const snap = await db()
    .collection('experiments')
    .where('conversationType', '==', type)
    .get();

  const running = snap.docs.filter((doc) => doc.data().status === 'running');
  if (running.length === 0) return null;
  return { id: running[0].id, ...running[0].data() } as Experiment;
}

export async function createExperiment(
  experiment: Omit<Experiment, 'id'>,
): Promise<string> {
  const ref = await db().collection('experiments').add(experiment);
  return ref.id;
}

export async function updateExperiment(
  id: string,
  updates: Partial<Experiment>,
): Promise<void> {
  await db().collection('experiments').doc(id).update(updates);
}

export async function assignExperimentArm(
  experimentId: string,
): Promise<'control' | 'variant'> {
  const doc = await db().collection('experiments').doc(experimentId).get();
  if (!doc.exists) return 'control';

  const data = doc.data() as Experiment;
  const total = data.controlConversations + data.variantConversations;
  return total % 2 === 0 ? 'control' : 'variant';
}

export async function recordExperimentOutcome(
  experimentId: string,
  arm: 'control' | 'variant',
  success: boolean,
): Promise<void> {
  const field = arm === 'control' ? 'controlConversations' : 'variantConversations';
  const successField = arm === 'control' ? 'controlSuccesses' : 'variantSuccesses';

  const { FieldValue } = await import('firebase-admin/firestore');
  const updates: Record<string, unknown> = { [field]: FieldValue.increment(1) };
  if (success) {
    updates[successField] = FieldValue.increment(1);
  }

  await db().collection('experiments').doc(experimentId).update(updates);
}

// ─── Performance Snapshots ───────────────────────────────────────────────────

export async function savePerformanceSnapshot(
  snapshot: Omit<PerformanceSnapshot, 'id'>,
): Promise<string> {
  const ref = await db().collection('performanceSnapshots').add(snapshot);
  return ref.id;
}

export async function getPerformanceSnapshots(
  type: ConversationType,
  days: number,
): Promise<PerformanceSnapshot[]> {
  const since = new Date();
  since.setDate(since.getDate() - days);
  const sinceISO = since.toISOString();

  const snap = await db()
    .collection('performanceSnapshots')
    .where('conversationType', '==', type)
    .get();

  return snap.docs
    .map((doc) => ({ id: doc.id, ...doc.data() } as PerformanceSnapshot))
    .filter((s) => (s.timestamp ?? '') >= sinceISO)
    .sort((a, b) => (b.timestamp ?? '').localeCompare(a.timestamp ?? ''));
}

// ─── Rollback Log ────────────────────────────────────────────────────────────

export async function logRollback(record: Omit<RollbackRecord, 'id'>): Promise<string> {
  const ref = await db().collection('rollbackLog').add(record);
  return ref.id;
}
