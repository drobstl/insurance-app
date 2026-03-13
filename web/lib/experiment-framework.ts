import 'server-only';

import {
  getActiveExperiment,
  updateExperiment,
} from './conversation-memory';
import type { ConversationType, Experiment } from './learning-types';

/**
 * Standard normal CDF approximation (Abramowitz and Stegun).
 */
function normalCDF(x: number): number {
  const a1 = 0.254829592;
  const a2 = -0.284496736;
  const a3 = 1.421413741;
  const a4 = -1.453152027;
  const a5 = 1.061405429;
  const p = 0.3275911;

  const sign = x < 0 ? -1 : 1;
  x = Math.abs(x) / Math.SQRT2;
  const t = 1.0 / (1.0 + p * x);
  const y = 1.0 - ((((a5 * t + a4) * t + a3) * t + a2) * t + a1) * t * Math.exp(-x * x);
  return 0.5 * (1.0 + sign * y);
}

export interface SignificanceResult {
  significant: boolean;
  winner: 'control' | 'variant' | null;
  pValue: number;
  controlRate: number;
  variantRate: number;
  effectSize: number;
}

export function checkSignificance(experiment: Experiment): SignificanceResult {
  const n1 = experiment.controlConversations;
  const n2 = experiment.variantConversations;

  if (n1 < 10 || n2 < 10) {
    return {
      significant: false,
      winner: null,
      pValue: 1,
      controlRate: 0,
      variantRate: 0,
      effectSize: 0,
    };
  }

  const p1 = experiment.controlSuccesses / n1;
  const p2 = experiment.variantSuccesses / n2;
  const pooled = (experiment.controlSuccesses + experiment.variantSuccesses) / (n1 + n2);

  if (pooled === 0 || pooled === 1) {
    return {
      significant: false,
      winner: null,
      pValue: 1,
      controlRate: p1,
      variantRate: p2,
      effectSize: 0,
    };
  }

  const se = Math.sqrt(pooled * (1 - pooled) * (1 / n1 + 1 / n2));
  const z = (p2 - p1) / se;
  const pValue = 2 * (1 - normalCDF(Math.abs(z)));

  const looks = Math.max(Math.floor((n1 + n2) / 20), 1);
  const correctedAlpha = 0.05 / looks;

  const significant = pValue < correctedAlpha;
  const winner = significant ? (p2 > p1 ? 'variant' : 'control') : null;

  return {
    significant,
    winner,
    pValue: Math.round(pValue * 10000) / 10000,
    controlRate: Math.round(p1 * 1000) / 1000,
    variantRate: Math.round(p2 * 1000) / 1000,
    effectSize: Math.round((p2 - p1) * 1000) / 1000,
  };
}

export async function checkAndResolveExperiment(
  type: ConversationType,
): Promise<{ resolved: boolean; result: SignificanceResult | null }> {
  const experiment = await getActiveExperiment(type);
  if (!experiment) return { resolved: false, result: null };

  const totalConversations = experiment.controlConversations + experiment.variantConversations;

  if (totalConversations < 20) {
    return { resolved: false, result: null };
  }

  const result = checkSignificance(experiment);

  if (result.significant && result.winner) {
    await updateExperiment(experiment.id, {
      status: result.winner === 'control' ? 'winner-control' : 'winner-variant',
      pValue: result.pValue,
      resolvedAt: new Date().toISOString(),
      resolvedReason: `${result.winner} won with p=${result.pValue}. Control: ${result.controlRate}, Variant: ${result.variantRate}, Effect: ${result.effectSize}`,
    });

    console.log(
      `Experiment ${experiment.id} resolved: ${result.winner} wins (p=${result.pValue}, effect=${result.effectSize})`,
    );
    return { resolved: true, result };
  }

  if (totalConversations >= experiment.minimumSampleSize * 2) {
    await updateExperiment(experiment.id, {
      status: 'inconclusive',
      pValue: result.pValue,
      resolvedAt: new Date().toISOString(),
      resolvedReason: `Reached max sample size (${totalConversations}) without significance. p=${result.pValue}`,
    });

    console.log(`Experiment ${experiment.id} inconclusive at ${totalConversations} conversations`);
    return { resolved: true, result };
  }

  return { resolved: false, result };
}
