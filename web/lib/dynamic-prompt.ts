import 'server-only';

import Anthropic from '@anthropic-ai/sdk';
import { HELPER_MODEL } from './ai-models';
import { classifyPersona } from './client-persona';
import {
  getStrategy,
  getExemplars,
  getActiveExperiment,
  assignExperimentArm,
  getStrategyVersion,
} from './conversation-memory';
import type {
  ConversationType,
  ConversationMessage,
  ClientPersona,
  StoredAnalysis,
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

function formatExemplarForPrompt(analysis: StoredAnalysis, index: number): string {
  const transcript = analysis.conversation
    .map((m) => {
      const label = m.role.includes('client') || m.role === 'referral' ? 'Client' : 'Agent';
      return `${label}: ${m.body}`;
    })
    .join('\n');

  const exchangeInfo = analysis.analysis.exchangeCountAtSuccess
    ? `, booked in ${analysis.analysis.exchangeCountAtSuccess} exchanges`
    : '';

  const annotation = analysis.analysis.whatWorked || analysis.analysis.successTrigger || '';

  return `Example ${index + 1} (${analysis.clientPersona} client${exchangeInfo}):
${transcript}
[WHY THIS WORKED: ${annotation}]`;
}

async function selectBestExemplars(
  currentConversation: ConversationMessage[],
  pool: StoredAnalysis[],
  limit: number,
): Promise<StoredAnalysis[]> {
  if (pool.length <= limit) return pool;

  const anthropic = getAnthropic();

  const currentTranscript = currentConversation
    .map((m) => {
      const label = m.role.includes('client') || m.role === 'referral' ? 'Client' : 'Agent';
      return `${label}: ${m.body}`;
    })
    .join('\n');

  const poolDescriptions = pool
    .map((a, i) => {
      const summary = `[${i}] ${a.clientPersona} persona, ${a.analysis.exchangeCount} exchanges. ${a.analysis.whatWorked?.slice(0, 100) ?? ''}`;
      return summary;
    })
    .join('\n');

  const result = await anthropic.messages.create({
    model: HELPER_MODEL,
    max_tokens: 100,
    system: `Select the ${limit} most relevant exemplar conversations for the current situation. Return ONLY JSON: { "selectedIndexes": [0, 2, 4] }`,
    messages: [
      {
        role: 'user',
        content: `Current conversation:\n${currentTranscript}\n\nExemplar pool:\n${poolDescriptions}`,
      },
    ],
  });

  const block = result.content[0];
  const text = block.type === 'text' ? block.text.trim() : '';

  try {
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) return pool.slice(0, limit);
    const parsed = JSON.parse(jsonMatch[0]);
    if (!Array.isArray(parsed.selectedIndexes)) return pool.slice(0, limit);
    return parsed.selectedIndexes
      .filter((i: number) => i >= 0 && i < pool.length)
      .slice(0, limit)
      .map((i: number) => pool[i]);
  } catch {
    return pool.slice(0, limit);
  }
}

export interface EnrichmentResult {
  enrichedBlock: string;
  persona: ClientPersona;
  strategyVersion: number;
  experimentId: string | null;
  experimentArm: 'control' | 'variant' | null;
  antiPatterns: string | null;
  personaStrategy: string | null;
}

export async function enrichPrompt(params: {
  conversationType: ConversationType;
  conversation: ConversationMessage[];
}): Promise<EnrichmentResult> {
  const [personaResult, strategy] = await Promise.all([
    classifyPersona(params.conversation),
    getStrategy(params.conversationType),
  ]);

  const persona = personaResult.persona;

  if (!strategy) {
    return {
      enrichedBlock: '',
      persona,
      strategyVersion: 0,
      experimentId: null,
      experimentArm: null,
      antiPatterns: null,
      personaStrategy: null,
    };
  }

  let strategyVersion = strategy.currentVersion;
  let strategyDocument = strategy.strategyDocument;
  let antiPatterns = strategy.antiPatterns;
  let personaStrategy = strategy.personaStrategies[persona] ?? null;
  let experimentId: string | null = null;
  let experimentArm: 'control' | 'variant' | null = null;

  const experiment = await getActiveExperiment(params.conversationType);
  if (experiment) {
    experimentId = experiment.id;
    experimentArm = await assignExperimentArm(experiment.id);

    if (experimentArm === 'variant') {
      const variantDoc = await getStrategyVersion(
        params.conversationType,
        experiment.variantStrategyVersion,
      );
      if (variantDoc) {
        strategyVersion = experiment.variantStrategyVersion;
        strategyDocument = variantDoc.strategyDocument;
        antiPatterns = variantDoc.antiPatterns;
        personaStrategy = variantDoc.personaStrategies[persona] ?? personaStrategy;
      }
    }
  }

  const exemplarPool = await getExemplars({
    type: params.conversationType,
    persona,
    outcome: 'success',
    limit: 10,
    includeSynthetic: true,
  });

  const selectedExemplars = await selectBestExemplars(
    params.conversation,
    exemplarPool,
    3,
  );

  const exemplarsBlock = selectedExemplars.length > 0
    ? selectedExemplars.map((e, i) => formatExemplarForPrompt(e, i)).join('\n\n')
    : '';

  const personaBlock = personaStrategy
    ? `\nPERSONA-SPECIFIC TACTICS (client is ${persona}):\n${personaStrategy}`
    : '';

  let enrichedBlock = '';

  if (strategyDocument) {
    enrichedBlock += `\nLEARNED STRATEGY (v${strategyVersion}, based on ${strategy.conversationsAnalyzed} analyzed conversations):\n${strategyDocument}`;
  }

  if (personaBlock) {
    enrichedBlock += personaBlock;
  }

  if (exemplarsBlock) {
    enrichedBlock += `\n\nEXAMPLE CONVERSATIONS THAT WORKED:\n\n${exemplarsBlock}`;
  }

  return {
    enrichedBlock,
    persona,
    strategyVersion,
    experimentId,
    experimentArm,
    antiPatterns: antiPatterns || null,
    personaStrategy,
  };
}
