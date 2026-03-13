import 'server-only';

import {
  getRecentAnalyses,
  getStrategy,
  getStrategyVersion,
  savePerformanceSnapshot,
  rollbackStrategy,
  logRollback,
} from './conversation-memory';
import type { ConversationType, PerformanceSnapshot } from './learning-types';

/**
 * Approximate one-tailed binomial test using normal approximation.
 * Tests whether the observed rate is significantly LESS than the baseline.
 */
function binomialTestLess(
  observedSuccesses: number,
  totalTrials: number,
  baselineRate: number,
): number {
  if (totalTrials === 0 || baselineRate === 0 || baselineRate === 1) return 1;

  const observedRate = observedSuccesses / totalTrials;
  const se = Math.sqrt((baselineRate * (1 - baselineRate)) / totalTrials);
  if (se === 0) return 1;

  const z = (observedRate - baselineRate) / se;

  const a1 = 0.254829592;
  const a2 = -0.284496736;
  const a3 = 1.421413741;
  const a4 = -1.453152027;
  const a5 = 1.061405429;
  const p = 0.3275911;

  const sign = z < 0 ? -1 : 1;
  const absZ = Math.abs(z) / Math.SQRT2;
  const t = 1.0 / (1.0 + p * absZ);
  const y = 1.0 - ((((a5 * t + a4) * t + a3) * t + a2) * t + a1) * t * Math.exp(-absZ * absZ);
  const cdf = 0.5 * (1.0 + sign * y);

  return cdf;
}

const CONVERSATION_TYPES: ConversationType[] = [
  'referral',
  'conservation',
  'policy-review',
  'fif-reset',
];

const MIN_SAMPLE_SIZE = 20;
const REGRESSION_THRESHOLD = -0.05;
const P_VALUE_THRESHOLD = 0.05;

export interface MonitorResult {
  type: ConversationType;
  snapshot: Omit<PerformanceSnapshot, 'id'>;
  regressionDetected: boolean;
  rolledBack: boolean;
}

async function monitorType(type: ConversationType): Promise<MonitorResult | null> {
  const strategy = await getStrategy(type);
  if (!strategy) return null;

  const currentVersion = strategy.currentVersion;
  if (currentVersion <= 1) return null;

  const sevenDaysAgo = new Date();
  sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

  const recentAnalyses = await getRecentAnalyses({ type, sinceDays: 7 });

  const currentVersionAnalyses = recentAnalyses.filter(
    (a) => a.strategyVersion === currentVersion && !a.isSynthetic,
  );

  const completed = currentVersionAnalyses.length;
  const successes = currentVersionAnalyses.filter((a) => a.outcome === 'success').length;
  const failures = currentVersionAnalyses.filter((a) => a.outcome === 'failure').length;
  const successRate = completed > 0 ? successes / completed : 0;

  const previousVersionDoc = await getStrategyVersion(type, currentVersion - 1);
  const baselineSuccessRate = previousVersionDoc?.successRate
    ? previousVersionDoc.successRate / 100
    : strategy.previousSuccessRate / 100;
  const baselineVersion = currentVersion - 1;

  const delta = successRate - baselineSuccessRate;

  let isRegression = false;
  let rolledBack = false;

  if (completed >= MIN_SAMPLE_SIZE && delta < REGRESSION_THRESHOLD) {
    const pValue = binomialTestLess(successes, completed, baselineSuccessRate);
    isRegression = pValue < P_VALUE_THRESHOLD;

    if (isRegression) {
      console.warn(
        `REGRESSION DETECTED for ${type} v${currentVersion}: ${Math.round(successRate * 100)}% vs baseline ${Math.round(baselineSuccessRate * 100)}% (p=${pValue.toFixed(4)})`,
      );

      try {
        await rollbackStrategy(type, currentVersion, baselineVersion, `Auto-rollback: success rate ${Math.round(successRate * 100)}% vs baseline ${Math.round(baselineSuccessRate * 100)}% (p=${pValue.toFixed(4)})`);

        await logRollback({
          conversationType: type,
          rolledBackVersion: currentVersion,
          restoredVersion: baselineVersion,
          trigger: 'regression',
          evidence: {
            currentSuccessRate: Math.round(successRate * 1000) / 1000,
            baselineSuccessRate: Math.round(baselineSuccessRate * 1000) / 1000,
            delta: Math.round(delta * 1000) / 1000,
            pValue,
            sampleSize: completed,
          },
          timestamp: new Date().toISOString(),
        });

        rolledBack = true;
        console.log(`Rolled back ${type} from v${currentVersion} to v${baselineVersion}`);
      } catch (error) {
        console.error(`Failed to rollback ${type}:`, error);
      }
    }
  }

  const snapshot: Omit<PerformanceSnapshot, 'id'> = {
    conversationType: type,
    strategyVersion: currentVersion,
    period: '7d',
    conversationsCompleted: completed,
    successes,
    failures,
    successRate: Math.round(successRate * 1000) / 1000,
    baselineVersion,
    baselineSuccessRate: Math.round(baselineSuccessRate * 1000) / 1000,
    delta: Math.round(delta * 1000) / 1000,
    isRegression,
    rollbackTriggered: rolledBack,
    timestamp: new Date().toISOString(),
  };

  await savePerformanceSnapshot(snapshot);

  return { type, snapshot, regressionDetected: isRegression, rolledBack };
}

export async function runPerformanceMonitor(): Promise<MonitorResult[]> {
  const results: MonitorResult[] = [];

  for (const type of CONVERSATION_TYPES) {
    try {
      const result = await monitorType(type);
      if (result) results.push(result);
    } catch (error) {
      console.error(`Performance monitor error for ${type}:`, error);
    }
  }

  return results;
}
