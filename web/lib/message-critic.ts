import 'server-only';

import Anthropic from '@anthropic-ai/sdk';
import { HELPER_MODEL } from './ai-models';
import type {
  ConversationMessage,
  ClientPersona,
  CriticResult,
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

export async function critiqueMessage(params: {
  candidateMessage: string;
  conversation: ConversationMessage[];
  persona: ClientPersona;
  personaStrategy: string | null;
  antiPatterns: string | null;
}): Promise<CriticResult> {
  const anthropic = getAnthropic();
  const transcript = formatTranscript(params.conversation);

  const antiPatternsBlock = params.antiPatterns
    ? `ANTI-PATTERNS TO CHECK (reject if any match):\n${params.antiPatterns}`
    : 'No learned anti-patterns yet.';

  const personaBlock = params.personaStrategy
    ? `PERSONA-SPECIFIC STRATEGY (${params.persona}):\n${params.personaStrategy}`
    : `Client persona: ${params.persona}. No persona-specific strategy yet.`;

  const result = await anthropic.messages.create({
    model: HELPER_MODEL,
    max_tokens: 400,
    system: `You are a quality gate for AI-generated insurance agent messages. Score this candidate message before it reaches the client.

VOICE RULES:
- 1-3 sentences per message. This is texting, not email.
- No markdown, bullet points, bold, or formatting.
- One emoji max, usually zero.
- No jargon, policy numbers, or acronyms.
- Never fabricate numbers or quotes.
- Use hedge language: "might", "could", "if it makes sense".
- FORBIDDEN: "Absolutely!", "Great question!", "I totally understand", "Just checking in!", "I wanted to reach out", "No obligation", urgency language, "I'd love to", multiple exclamation marks.
- Emotional range: between "genuinely curious" and "quietly concerned".
- Short sentences: 5-15 words. One thought per sentence.

${antiPatternsBlock}

${personaBlock}

CONVERSATION SO FAR:
${transcript}

CANDIDATE MESSAGE TO EVALUATE:
${params.candidateMessage}

Score on these dimensions:
1. voiceFidelity (0-10): Does it follow the voice rules above?
2. strategicAlignment (0-10): Is this the right move for a ${params.persona} client at this stage?
3. brevity (true/false): 1-3 sentences, every sentence earns its place?
4. goalAdvancement (0-10): Does it discover a gap, create awareness, or move toward booking/resolution?
5. antiPatternViolation (true/false): Does it match any anti-pattern listed above?

APPROVAL RULE: Approve if brevity=true AND antiPatternViolation=false AND average(voiceFidelity, strategicAlignment, goalAdvancement) >= 7.

Return ONLY a JSON object:
{
  "scores": {
    "voiceFidelity": 8,
    "strategicAlignment": 7,
    "brevity": true,
    "goalAdvancement": 8,
    "antiPatternViolation": false
  },
  "approved": true,
  "feedback": "specific guidance if rejected, null if approved",
  "flaggedIssues": ["issue1"]
}`,
    messages: [
      { role: 'user', content: 'Evaluate this candidate message.' },
    ],
  });

  const block = result.content[0];
  const text = block.type === 'text' ? block.text.trim() : '';

  try {
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) return defaultApproval();
    const parsed = JSON.parse(jsonMatch[0]);

    const scores = parsed.scores ?? {};
    const voiceFidelity = typeof scores.voiceFidelity === 'number' ? scores.voiceFidelity : 7;
    const strategicAlignment = typeof scores.strategicAlignment === 'number' ? scores.strategicAlignment : 7;
    const goalAdvancement = typeof scores.goalAdvancement === 'number' ? scores.goalAdvancement : 7;
    const brevity = typeof scores.brevity === 'boolean' ? scores.brevity : true;
    const antiPatternViolation = typeof scores.antiPatternViolation === 'boolean' ? scores.antiPatternViolation : false;

    const avgScore = (voiceFidelity + strategicAlignment + goalAdvancement) / 3;
    const approved = brevity && !antiPatternViolation && avgScore >= 7;

    return {
      approved,
      scores: { voiceFidelity, strategicAlignment, brevity, goalAdvancement, antiPatternViolation },
      compositeScore: Math.round(avgScore * 10) / 10,
      feedback: approved ? null : (parsed.feedback ?? 'Message did not meet quality threshold.'),
      flaggedIssues: Array.isArray(parsed.flaggedIssues) ? parsed.flaggedIssues : [],
    };
  } catch {
    return defaultApproval();
  }
}

function defaultApproval(): CriticResult {
  return {
    approved: true,
    scores: {
      voiceFidelity: 7,
      strategicAlignment: 7,
      brevity: true,
      goalAdvancement: 7,
      antiPatternViolation: false,
    },
    compositeScore: 7,
    feedback: null,
    flaggedIssues: [],
  };
}
