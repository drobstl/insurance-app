import 'server-only';

import Anthropic from '@anthropic-ai/sdk';
import { PRIMARY_MODEL } from './ai-models';
import { buildSharedVoiceBlock } from './ai-voice';
import type {
  ConversationType,
  ConversationAnalysis,
  ConversationMessage,
  CounterfactualResult,
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

function formatTranscript(conversation: ConversationMessage[]): string {
  return conversation
    .map((m) => {
      const label = m.role.includes('client') || m.role === 'referral' ? 'Client' : 'Agent';
      return `${label}: ${m.body}`;
    })
    .join('\n');
}

function formatExemplars(exemplars: ConversationMessage[][]): string {
  if (exemplars.length === 0) return 'No exemplars available yet.';
  return exemplars
    .map((conv, i) => `EXEMPLAR ${i + 1}:\n${formatTranscript(conv)}`)
    .join('\n\n');
}

export async function rewriteFailedConversation(params: {
  conversationType: ConversationType;
  conversation: ConversationMessage[];
  analysis: ConversationAnalysis;
  persona: ClientPersona;
  strategyDocument: string | null;
  exemplarConversations: ConversationMessage[][];
}): Promise<CounterfactualResult> {
  const anthropic = getAnthropic();
  const transcript = formatTranscript(params.conversation);

  const analysisBlock = `FAILURE ANALYSIS:
- What failed: ${params.analysis.whatFailed}
- Ineffective techniques: ${params.analysis.ineffectiveTechniques.join('; ')}
- Turning points: ${params.analysis.turningPoints.map((tp) => `Exchange ${tp.exchangeNumber}: ${tp.description} (${tp.impact})`).join('; ')}
- Suggested improvements: ${params.analysis.suggestedImprovements.join('; ')}`;

  const strategyBlock = params.strategyDocument
    ? `CURRENT STRATEGY:\n${params.strategyDocument}`
    : 'No strategy document yet — use the voice identity and NEPQ framework as your guide.';

  const result = await anthropic.messages.create({
    model: PRIMARY_MODEL,
    max_tokens: 2000,
    system: `You rewrite failed AI messaging conversations to show what SHOULD have been said. This creates synthetic training data for the learning system.

CONVERSATION TYPE: ${params.conversationType}
CLIENT PERSONA: ${params.persona}

VOICE IDENTITY:
${buildSharedVoiceBlock()}

${strategyBlock}

${analysisBlock}

SUCCESSFUL EXEMPLARS (same type + persona):
${formatExemplars(params.exemplarConversations)}

RULES:
- Keep ALL client messages exactly as they are. Only rewrite agent messages.
- Follow the voice identity strictly (1-3 sentences, hedge language, no forbidden phrases).
- Address the specific failures identified in the analysis.
- Aim for the outcome the conversation should have achieved (booking, saving, etc.).
- For each rewritten message, explain WHY the new version is better.

Return ONLY a JSON object:
{
  "rewrittenConversation": [
    { "role": "client", "body": "exact original client message" },
    { "role": "agent", "body": "rewritten agent message" },
    ...
  ],
  "annotations": [
    {
      "exchangeNumber": 1,
      "originalMessage": "what the agent originally said",
      "rewrittenMessage": "what it should have said",
      "reasoning": "why this is better"
    }
  ]
}`,
    messages: [
      { role: 'user', content: `Rewrite the agent's messages in this failed conversation:\n\n${transcript}` },
    ],
  });

  const block = result.content[0];
  const text = block.type === 'text' ? block.text.trim() : '';
  const jsonMatch = text.match(/\{[\s\S]*\}/);
  if (!jsonMatch) {
    return {
      originalConversation: params.conversation,
      rewrittenConversation: params.conversation,
      annotations: [],
    };
  }

  try {
    const parsed = JSON.parse(jsonMatch[0]);
    return {
      originalConversation: params.conversation,
      rewrittenConversation: Array.isArray(parsed.rewrittenConversation)
        ? parsed.rewrittenConversation.map((m: { role: string; body: string }) => ({
            role: m.role,
            body: m.body,
            timestamp: new Date().toISOString(),
          }))
        : params.conversation,
      annotations: Array.isArray(parsed.annotations) ? parsed.annotations : [],
    };
  } catch {
    return {
      originalConversation: params.conversation,
      rewrittenConversation: params.conversation,
      annotations: [],
    };
  }
}
