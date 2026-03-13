import 'server-only';

import Anthropic from '@anthropic-ai/sdk';
import { PRIMARY_MODEL } from './ai-models';
import { getRecentAnalyses, getStrategy, saveStrategy } from './conversation-memory';
import type {
  ConversationType,
  StoredAnalysis,
  ClientPersona,
} from './learning-types';

let _anthropic: Anthropic | null = null;
function getAnthropic(): Anthropic {
  if (!process.env.ANTHROPIC_API_KEY) {
    throw new Error('ANTHROPIC_API_KEY is not set');
  }
  if (_anthropic) return _anthropic;
  _anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  return _anthropic;
}

const ALL_PERSONAS: ClientPersona[] = [
  'eager', 'curious', 'skeptical', 'avoidant',
  'analytical', 'emotional', 'hostile',
];

function buildAnalysisSummaries(analyses: StoredAnalysis[]): string {
  return analyses
    .map((a, i) => {
      const scores = `outcome=${a.analysis.outcomeScore}/10, voice=${a.analysis.voiceComplianceScore}/10, strategy=${a.analysis.strategyExecutionScore}/10`;
      const techniques = a.analysis.effectiveTechniques.length > 0
        ? `Effective: ${a.analysis.effectiveTechniques.join('; ')}`
        : '';
      const antiTechniques = a.analysis.ineffectiveTechniques.length > 0
        ? `Ineffective: ${a.analysis.ineffectiveTechniques.join('; ')}`
        : '';
      const lessons = a.analysis.lessonsLearned.join('; ');
      return `[${i + 1}] ${a.outcome.toUpperCase()} | ${a.clientPersona} | ${a.analysis.exchangeCount} exchanges | ${scores}${a.isSynthetic ? ' [SYNTHETIC REWRITE]' : ''}
${techniques}
${antiTechniques}
Lessons: ${lessons}
Trigger: ${a.analysis.successTrigger ?? 'N/A'}`;
    })
    .join('\n\n');
}

function computeStats(analyses: StoredAnalysis[]) {
  const total = analyses.filter((a) => !a.isSynthetic).length;
  const successes = analyses.filter((a) => a.outcome === 'success' && !a.isSynthetic).length;
  const failures = analyses.filter((a) => a.outcome === 'failure' && !a.isSynthetic).length;
  const syntheticCount = analyses.filter((a) => a.isSynthetic).length;
  const successRate = total > 0 ? Math.round((successes / total) * 100) : 0;

  const personaBreakdown: Record<string, { total: number; successes: number }> = {};
  for (const a of analyses.filter((x) => !x.isSynthetic)) {
    if (!personaBreakdown[a.clientPersona]) {
      personaBreakdown[a.clientPersona] = { total: 0, successes: 0 };
    }
    personaBreakdown[a.clientPersona].total++;
    if (a.outcome === 'success') personaBreakdown[a.clientPersona].successes++;
  }

  return { total, successes, failures, syntheticCount, successRate, personaBreakdown };
}

function selectTopExemplars(
  analyses: StoredAnalysis[],
  limit: number = 10,
): string[] {
  return analyses
    .filter((a) => a.outcome === 'success')
    .sort((a, b) => {
      const scoreA = a.analysis.outcomeScore + a.analysis.voiceComplianceScore + a.analysis.strategyExecutionScore;
      const scoreB = b.analysis.outcomeScore + b.analysis.voiceComplianceScore + b.analysis.strategyExecutionScore;
      return scoreB - scoreA;
    })
    .slice(0, limit)
    .map((a) => a.id);
}

function selectTopExemplarsByPersona(
  analyses: StoredAnalysis[],
  limit: number = 5,
): Partial<Record<ClientPersona, string[]>> {
  const result: Partial<Record<ClientPersona, string[]>> = {};
  for (const persona of ALL_PERSONAS) {
    const personaAnalyses = analyses.filter(
      (a) => a.clientPersona === persona && a.outcome === 'success',
    );
    if (personaAnalyses.length > 0) {
      result[persona] = selectTopExemplars(personaAnalyses, limit);
    }
  }
  return result;
}

export async function synthesizeStrategy(
  type: ConversationType,
): Promise<void> {
  const anthropic = getAnthropic();

  const analyses = await getRecentAnalyses({ type, sinceDays: 30 });
  if (analyses.length < 3) {
    console.log(`Not enough analyses for ${type} (${analyses.length}). Skipping synthesis.`);
    return;
  }

  const existingStrategy = await getStrategy(type);
  const previousVersion = existingStrategy?.currentVersion ?? 0;
  const previousSuccessRate = existingStrategy?.successRate ?? 0;
  const stats = computeStats(analyses);

  const previousBlock = existingStrategy?.strategyDocument
    ? `PREVIOUS STRATEGY (v${previousVersion}):\n${existingStrategy.strategyDocument}`
    : 'No previous strategy exists. You are creating the first version.';

  const summaries = buildAnalysisSummaries(analyses);

  const result = await anthropic.messages.create({
    model: PRIMARY_MODEL,
    max_tokens: 4000,
    system: `You synthesize AI messaging strategies from analyzed conversation data. You produce a structured strategy document that will be injected into the AI agent's system prompt to improve future conversations.

CONVERSATION TYPE: ${type}
STATISTICS:
- ${stats.total} real conversations analyzed (${stats.successes} successes, ${stats.failures} failures)
- ${stats.syntheticCount} counterfactual rewrites (synthetic successful versions of failed conversations)
- Current success rate: ${stats.successRate}%
- Previous success rate: ${previousSuccessRate}%

PERSONA BREAKDOWN:
${Object.entries(stats.personaBreakdown)
  .map(([p, s]) => `  ${p}: ${s.total} conversations, ${s.total > 0 ? Math.round((s.successes / s.total) * 100) : 0}% success rate`)
  .join('\n')}

${previousBlock}

Write a comprehensive strategy document with these sections. Be specific and data-driven — cite actual success rates, exchange counts, and specific language that works. This document will be read by an AI agent before generating messages.

REQUIRED SECTIONS:

1. OVERALL — success rate, trend, key insight

2. BY PERSONA — for each persona that has data:
   - Percentage of conversations
   - Success rate
   - Top 3 effective techniques with evidence
   - Top 3 anti-patterns to avoid
   - Optimal pacing (when to transition, ideal exchange count)
   - Specific language that works (quote real phrases)

3. CROSS-PERSONA PATTERNS — what works regardless of persona

4. ANTI-PATTERNS — comprehensive list of approaches correlated with failure. Be very specific. These feed directly into the real-time quality gate that blocks bad messages.

5. CHANGES FROM PREVIOUS VERSION — what's new (skip if first version)

6. CANDIDATE FOR A/B TEST — if you identify a promising pattern with strong signal but insufficient data, describe the hypothesis and specific change to test. If no candidates, say "None at this time."

Return the full strategy document as plain text. No JSON wrapper.`,
    messages: [
      {
        role: 'user',
        content: `Synthesize a strategy from these analyzed conversations:\n\n${summaries}`,
      },
    ],
  });

  const block = result.content[0];
  const strategyDocument = block.type === 'text' ? block.text.trim() : '';
  if (!strategyDocument) {
    console.error('Strategy synthesis returned empty document');
    return;
  }

  const antiPatternsResult = await anthropic.messages.create({
    model: PRIMARY_MODEL,
    max_tokens: 1000,
    system: `Extract ONLY the anti-patterns section from this strategy document. Return them as a concise, numbered list. These will be used by a real-time quality gate to reject bad messages before they are sent. Be specific and actionable.`,
    messages: [
      { role: 'user', content: strategyDocument },
    ],
  });

  const antiPatternsBlock = antiPatternsResult.content[0];
  const antiPatterns = antiPatternsBlock.type === 'text' ? antiPatternsBlock.text.trim() : '';

  const personaStrategiesResult = await anthropic.messages.create({
    model: PRIMARY_MODEL,
    max_tokens: 2000,
    system: `Extract the persona-specific sections from this strategy document. Return a JSON object where each key is a persona name (eager, curious, skeptical, avoidant, analytical, emotional, hostile) and each value is the strategy text for that persona. Only include personas that have data. Return ONLY JSON.`,
    messages: [
      { role: 'user', content: strategyDocument },
    ],
  });

  const personaBlock = personaStrategiesResult.content[0];
  const personaText = personaBlock.type === 'text' ? personaBlock.text.trim() : '{}';
  let personaStrategies: Partial<Record<ClientPersona, string>> = {};
  try {
    const jsonMatch = personaText.match(/\{[\s\S]*\}/);
    if (jsonMatch) personaStrategies = JSON.parse(jsonMatch[0]);
  } catch {
    personaStrategies = {};
  }

  const topExemplarIds = selectTopExemplars(analyses);
  const topExemplarsByPersona = selectTopExemplarsByPersona(analyses);
  const newVersion = previousVersion + 1;

  await saveStrategy(type, {
    currentVersion: newVersion,
    strategyDocument,
    antiPatterns,
    personaStrategies,
    topExemplarIds,
    topExemplarsByPersona,
    conversationsAnalyzed: stats.total + stats.syntheticCount,
    successRate: stats.successRate,
    previousSuccessRate,
    updatedAt: new Date().toISOString(),
  });

  console.log(`Strategy v${newVersion} saved for ${type}. Success rate: ${stats.successRate}% (was ${previousSuccessRate}%).`);
}
