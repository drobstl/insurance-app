import 'server-only';

import Anthropic from '@anthropic-ai/sdk';
import { HELPER_MODEL } from './ai-models';
import type { ConversationMessage, PersonaClassification, ClientPersona } from './learning-types';

let _anthropic: Anthropic | null = null;
function getAnthropic(): Anthropic {
  if (!process.env.ANTHROPIC_API_KEY) {
    throw new Error('ANTHROPIC_API_KEY is not set');
  }
  if (_anthropic) return _anthropic;
  _anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  return _anthropic;
}

const VALID_PERSONAS: ClientPersona[] = [
  'eager', 'curious', 'skeptical', 'avoidant',
  'analytical', 'emotional', 'hostile', 'unknown',
];

export async function classifyPersona(
  conversation: ConversationMessage[],
): Promise<PersonaClassification> {
  const clientMessages = conversation.filter(
    (m) => m.role === 'client' || m.role === 'referral',
  );

  if (clientMessages.length === 0) {
    return { persona: 'unknown', confidence: 'low', signals: [] };
  }

  const anthropic = getAnthropic();

  const transcript = conversation
    .map((m) => {
      const label = m.role.includes('client') || m.role === 'referral' ? 'Client' : 'Agent';
      return `${label}: ${m.body}`;
    })
    .join('\n');

  const result = await anthropic.messages.create({
    model: HELPER_MODEL,
    max_tokens: 200,
    system: `Classify this person's communication style from their messages.

Categories:
- eager: ready to move, asking next steps, short affirmatives, expressing urgency
- curious: asking questions, wants info, open but uncommitted
- skeptical: "I'm good", pushback, guarded, questioning motives
- avoidant: short answers, non-committal, trying to end conversation
- analytical: wants numbers, details, comparisons, logic-driven
- emotional: mentions family, fear, concern, feeling-driven decisions
- hostile: angry, demanding, threatening, escalating
- unknown: not enough signal to classify

Return ONLY a JSON object:
{ "persona": "...", "confidence": "high|medium|low", "signals": ["signal1", "signal2"] }`,
    messages: [
      { role: 'user', content: `Classify the client persona:\n\n${transcript}` },
    ],
  });

  const block = result.content[0];
  const text = block.type === 'text' ? block.text.trim() : '';

  try {
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) return { persona: 'unknown', confidence: 'low', signals: [] };
    const parsed = JSON.parse(jsonMatch[0]);
    return {
      persona: VALID_PERSONAS.includes(parsed.persona) ? parsed.persona : 'unknown',
      confidence: ['high', 'medium', 'low'].includes(parsed.confidence) ? parsed.confidence : 'low',
      signals: Array.isArray(parsed.signals) ? parsed.signals : [],
    };
  } catch {
    return { persona: 'unknown', confidence: 'low', signals: [] };
  }
}
