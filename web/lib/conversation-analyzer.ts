import 'server-only';

import Anthropic from '@anthropic-ai/sdk';
import { PRIMARY_MODEL } from './ai-models';
import { buildSharedVoiceBlock } from './ai-voice';
import type {
  ConversationType,
  ConversationOutcome,
  ConversationAnalysis,
  ConversationMessage,
  AnalysisMetadata,
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

function describeOutcome(type: ConversationType, outcome: ConversationOutcome): string {
  if (outcome === 'neutral') return 'Conversation ended without a clear success or failure signal.';
  const descriptions: Record<ConversationType, Record<string, string>> = {
    referral: {
      success: 'The referral agreed to or booked an appointment.',
      failure: 'The referral did not book an appointment — declined, went silent, or conversation ended without booking.',
    },
    conservation: {
      success: 'The client reinstated/saved their at-risk policy.',
      failure: 'The policy was lost — client declined to reinstate or was unresponsive.',
    },
    'policy-review': {
      success: 'The client booked an anniversary review call.',
      failure: 'The client did not book — declined, opted out, or was unresponsive.',
    },
    'fif-reset': {
      success: 'The client booked a FIF reset appointment (debt relief, tax/wealth protection, or retirement solutions).',
      failure: 'The client did not book a FIF reset appointment.',
    },
  };
  return descriptions[type]?.[outcome] ?? `Outcome: ${outcome}`;
}

interface Pass1Result {
  effectiveTechniques: string[];
  ineffectiveTechniques: string[];
  turningPoints: Array<{ exchangeNumber: number; description: string; impact: string }>;
  whatWorked: string;
  whatFailed: string;
  lessonsLearned: string[];
  suggestedImprovements: string[];
  exchangeCount: number;
  exchangeCountAtSuccess: number | null;
  successTrigger: string | null;
  clientPersona: ClientPersona;
}

async function runPass1OutcomeAnalysis(
  type: ConversationType,
  outcome: ConversationOutcome,
  transcript: string,
): Promise<Pass1Result> {
  const anthropic = getAnthropic();

  const result = await anthropic.messages.create({
    model: PRIMARY_MODEL,
    max_tokens: 1500,
    system: `You are an expert conversation analyst evaluating an AI messaging agent's performance in insurance client conversations.

CONVERSATION TYPE: ${type}
OUTCOME: ${outcome} — ${describeOutcome(type, outcome)}

VOICE IDENTITY & MESSAGING FRAMEWORK:
${buildSharedVoiceBlock()}

Analyze this conversation thoroughly. Evaluate what the AI agent did well, what it did poorly, where the conversation turned, and what persona the client displayed.

Return ONLY a valid JSON object:
{
  "effectiveTechniques": ["technique with brief explanation"],
  "ineffectiveTechniques": ["technique with brief explanation"],
  "turningPoints": [{ "exchangeNumber": 1, "description": "...", "impact": "positive|negative|neutral" }],
  "whatWorked": "narrative summary of winning moves",
  "whatFailed": "narrative summary of mistakes or missed opportunities",
  "lessonsLearned": ["actionable takeaway"],
  "suggestedImprovements": ["specific improvement for future conversations"],
  "exchangeCount": 5,
  "exchangeCountAtSuccess": 4,
  "successTrigger": "what specifically triggered the outcome, or null",
  "clientPersona": "eager|curious|skeptical|avoidant|analytical|emotional|hostile|unknown"
}`,
    messages: [
      { role: 'user', content: `Analyze this ${type} conversation:\n\n${transcript}` },
    ],
  });

  const block = result.content[0];
  const text = block.type === 'text' ? block.text.trim() : '';
  const jsonMatch = text.match(/\{[\s\S]*\}/);
  if (!jsonMatch) throw new Error('Pass 1: no JSON in response');

  try {
    return JSON.parse(jsonMatch[0]) as Pass1Result;
  } catch {
    const cleaned = jsonMatch[0]
      .replace(/,\s*([\]}])/g, '$1')
      .replace(/[\x00-\x1F\x7F]/g, ' ')
      .replace(/(["\w])\s*\n\s*(["\w{[])/g, '$1, $2');
    try {
      return JSON.parse(cleaned) as Pass1Result;
    } catch {
      return {
        effectiveTechniques: [],
        ineffectiveTechniques: [],
        turningPoints: [],
        whatWorked: '',
        whatFailed: '',
        lessonsLearned: [],
        suggestedImprovements: [],
        exchangeCount: 0,
        exchangeCountAtSuccess: null,
        successTrigger: null,
        clientPersona: 'unknown' as ClientPersona,
      };
    }
  }
}

async function runPass2VoiceAudit(transcript: string): Promise<number> {
  const anthropic = getAnthropic();

  const result = await anthropic.messages.create({
    model: PRIMARY_MODEL,
    max_tokens: 500,
    system: `You audit AI-generated messages for voice compliance. Score 1-10.

VOICE RULES:
- 1-3 sentences per message. Texting, not email.
- No markdown, no bullet points, no bold.
- One emoji max per message, usually zero.
- No jargon, no policy numbers, no acronyms.
- Never fabricate numbers or quotes.
- Use hedge language: "might", "could", "if it makes sense".
- Never use: "Absolutely!", "Great question!", "I totally understand", "Just checking in!", "I wanted to reach out", "No obligation", urgency language, multiple exclamation marks.
- Emotional range: between "genuinely curious" and "quietly concerned". No excitement, no alarm.
- Short sentences: 5-15 words sweet spot. One thought per sentence.
- Questions do the heavy lifting.

For each AI message, check compliance. Return ONLY JSON:
{ "voiceComplianceScore": 8, "violations": ["Message 3: 5 sentences (too long)", "Message 5: used 'Absolutely!'"] }`,
    messages: [
      { role: 'user', content: `Audit the Agent messages in this conversation:\n\n${transcript}` },
    ],
  });

  const block = result.content[0];
  const text = block.type === 'text' ? block.text.trim() : '';
  const jsonMatch = text.match(/\{[\s\S]*\}/);
  if (!jsonMatch) return 5;
  const parsed = JSON.parse(jsonMatch[0]);
  return typeof parsed.voiceComplianceScore === 'number' ? parsed.voiceComplianceScore : 5;
}

async function runPass3StrategyScoring(
  type: ConversationType,
  persona: ClientPersona,
  strategyDoc: string | null,
  transcript: string,
): Promise<number> {
  const anthropic = getAnthropic();

  const strategyBlock = strategyDoc
    ? `STRATEGY DOCUMENT (what the agent should have followed):\n${strategyDoc}`
    : 'No strategy document exists yet — score based on general best practices for this conversation type.';

  const result = await anthropic.messages.create({
    model: PRIMARY_MODEL,
    max_tokens: 500,
    system: `You evaluate how well an AI agent executed its recommended strategy. Score 1-10.

CONVERSATION TYPE: ${type}
CLIENT PERSONA: ${persona}

${strategyBlock}

Evaluate:
- Did it follow the recommended approach for this persona?
- Did it transition to booking/resolution at the right time?
- Did it use recommended language patterns?
- Where did it deviate? Was the deviation justified?

Return ONLY JSON:
{ "strategyExecutionScore": 7, "deviations": ["description"], "justifiedDeviations": ["description"] }`,
    messages: [
      { role: 'user', content: `Evaluate strategy execution:\n\n${transcript}` },
    ],
  });

  const block = result.content[0];
  const text = block.type === 'text' ? block.text.trim() : '';
  const jsonMatch = text.match(/\{[\s\S]*\}/);
  if (!jsonMatch) return 5;
  const parsed = JSON.parse(jsonMatch[0]);
  return typeof parsed.strategyExecutionScore === 'number' ? parsed.strategyExecutionScore : 5;
}

export async function analyzeConversation(params: {
  conversationType: ConversationType;
  outcome: ConversationOutcome;
  conversation: ConversationMessage[];
  metadata: AnalysisMetadata;
  strategyDocument?: string | null;
}): Promise<ConversationAnalysis> {
  const transcript = formatTranscript(params.conversation);

  const [pass1, voiceScore] = await Promise.all([
    runPass1OutcomeAnalysis(params.conversationType, params.outcome, transcript),
    runPass2VoiceAudit(transcript),
  ]);

  const strategyScore = await runPass3StrategyScoring(
    params.conversationType,
    pass1.clientPersona,
    params.strategyDocument ?? null,
    transcript,
  );

  return {
    conversationType: params.conversationType,
    outcome: params.outcome,
    clientPersona: pass1.clientPersona,
    outcomeScore: Math.round(
      (pass1.effectiveTechniques.length /
        Math.max(pass1.effectiveTechniques.length + pass1.ineffectiveTechniques.length, 1)) * 10,
    ),
    voiceComplianceScore: voiceScore,
    strategyExecutionScore: strategyScore,
    effectiveTechniques: pass1.effectiveTechniques,
    ineffectiveTechniques: pass1.ineffectiveTechniques,
    turningPoints: pass1.turningPoints.map((tp) => ({
      ...tp,
      impact: tp.impact as 'positive' | 'negative' | 'neutral',
    })),
    whatWorked: pass1.whatWorked,
    whatFailed: pass1.whatFailed,
    lessonsLearned: pass1.lessonsLearned,
    suggestedImprovements: pass1.suggestedImprovements,
    exchangeCount: pass1.exchangeCount,
    exchangeCountAtSuccess: pass1.exchangeCountAtSuccess ?? null,
    successTrigger: pass1.successTrigger ?? null,
  };
}
