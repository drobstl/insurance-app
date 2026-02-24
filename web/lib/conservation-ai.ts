import 'server-only';

import Anthropic from '@anthropic-ai/sdk';
import type {
  ExtractedConservationData,
  ConservationOutreachContext,
  ConservationConversationContext,
  ConservationMessage,
  ConservationReason,
  SaveSignalResult,
} from './conservation-types';

let _anthropic: Anthropic | null = null;
function getAnthropic(): Anthropic {
  if (!process.env.ANTHROPIC_API_KEY) {
    throw new Error('ANTHROPIC_API_KEY is not set');
  }
  if (_anthropic) return _anthropic;
  _anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  return _anthropic;
}

const MODEL = 'claude-sonnet-4-20250514';
const MAX_RETRIES = 2;
const RETRY_DELAY_MS = 1500;

function isTransientError(error: unknown): boolean {
  if (error instanceof Anthropic.APIError) {
    return error.status === 429 || error.status === 500 || error.status === 529;
  }
  if (error instanceof Error && error.message.includes('fetch')) {
    return true;
  }
  return false;
}

async function withRetry<T>(fn: () => Promise<T>): Promise<T> {
  let lastError: unknown;
  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;
      if (!isTransientError(error) || attempt === MAX_RETRIES - 1) {
        throw error;
      }
      console.warn(`Anthropic API attempt ${attempt + 1} failed, retrying...`, error);
      await new Promise((r) => setTimeout(r, RETRY_DELAY_MS * (attempt + 1)));
    }
  }
  throw lastError;
}

/**
 * Extracts structured conservation data from raw carrier email or portal text.
 */
export async function extractConservationData(
  rawText: string,
): Promise<ExtractedConservationData> {
  const anthropic = getAnthropic();

  const message = await withRetry(() =>
    anthropic.messages.create({
      model: MODEL,
      max_tokens: 500,
      system: `You extract structured data from insurance carrier conservation opportunity notifications. These are forwarded carrier emails or portal pages indicating a client's policy has lapsed, had a missed payment, or been canceled.

Extract the following fields. Return ONLY a JSON object, no other text:
{
  "clientName": "full name of the policyholder/insured/client",
  "policyNumber": "policy number (may be partial or formatted differently)",
  "carrier": "insurance company name",
  "reason": "lapsed_payment" | "cancellation" | "other",
  "confidence": "high" | "medium" | "low"
}

CRITICAL RULES for clientName:
- The CLIENT is the policyholder/insured person, NOT the agent or SPA who forwarded the email.
- Look for explicit labels like "Client Name:", "Insured:", "Policyholder:", "Insured Name:", "Owner:", or "Name:" in the email body. Use that value.
- Names in the email subject line or after "SPA", "Agent", or "Writing Agent" typically refer to the AGENT, not the client. Do NOT use those as the client name.
- The email may be forwarded, so ignore forwarding headers and focus on the original carrier notification content.

Other rules:
- For reason: use "lapsed_payment" if it mentions missed payment, non-payment, lapse, NSF, premium due, or "danger of lapsing". Use "cancellation" if it mentions cancellation, surrender, or termination by the client. Use "other" if unclear.
- For confidence: "high" if all 4 fields are clearly present, "medium" if 1 field required inference, "low" if 2+ fields are uncertain.
- If a field is genuinely missing from the text, use your best guess or "Unknown" for strings.
- Policy numbers may appear in various formats: with dashes, spaces, or prefixes. Include the full number as shown.`,
      messages: [
        {
          role: 'user',
          content: `Extract conservation alert data from this carrier notification:\n\n${rawText}`,
        },
      ],
    }),
  );

  const block = message.content[0];
  const responseText = block.type === 'text' ? block.text.trim() : '';

  try {
    const jsonMatch = responseText.match(/\{[\s\S]*\}/);
    if (!jsonMatch) throw new Error('No JSON found in response');
    const parsed = JSON.parse(jsonMatch[0]);

    return {
      clientName: parsed.clientName || 'Unknown',
      policyNumber: parsed.policyNumber || 'Unknown',
      carrier: parsed.carrier || 'Unknown',
      reason: (['lapsed_payment', 'cancellation', 'other'] as ConservationReason[]).includes(
        parsed.reason,
      )
        ? parsed.reason
        : 'other',
      confidence: parsed.confidence || 'low',
    };
  } catch {
    console.error('Failed to parse extraction response:', responseText);
    return {
      clientName: 'Unknown',
      policyNumber: 'Unknown',
      carrier: 'Unknown',
      reason: 'other',
      confidence: 'low',
    };
  }
}

/**
 * Generates a personalized outreach message for a conservation alert.
 * Tone adapts based on reason (missed payment vs cancellation) and drip number.
 */
export async function generateOutreachMessage(
  ctx: ConservationOutreachContext,
): Promise<string> {
  const anthropic = getAnthropic();

  const policyAgeDesc = ctx.policyAge
    ? ctx.policyAge < 30
      ? 'less than a month ago'
      : ctx.policyAge < 90
        ? 'a few months ago'
        : ctx.policyAge < 365
          ? `about ${Math.round(ctx.policyAge / 30)} months ago`
          : `over a year ago`
    : 'recently';

  const dripContext =
    ctx.dripNumber === 0
      ? 'This is the INITIAL outreach. Be warm, helpful, no pressure.'
      : ctx.dripNumber === 1
        ? 'This is follow-up #1 (day 2). Slightly more direct, show you care. Take a different angle than the initial message.'
        : ctx.dripNumber === 2
          ? 'This is follow-up #2 (day 5). Gently remind them what they stand to lose (coverage amount, beneficiary protection). Still respectful.'
          : 'This is the FINAL follow-up (day 7). Gracious, leave the door open, no more messages after this.';

  const schedulingNote = ctx.schedulingUrl
    ? `The agent has a scheduling URL: ${ctx.schedulingUrl}. If it feels natural, mention they can book a quick call.`
    : 'The agent does not have a scheduling link. Offer to chat or take a call instead.';

  const message = await withRetry(() =>
    anthropic.messages.create({
      model: MODEL,
      max_tokens: 250,
      system: `You are writing an SMS/text message as ${ctx.agentName}, an insurance agent, to their client ${ctx.clientFirstName}. You ARE ${ctx.agentFirstName}. Never reveal you are AI.

SITUATION:
- ${ctx.clientFirstName}'s ${ctx.policyType || 'insurance'} policy is at risk.
- Reason: ${ctx.reason === 'lapsed_payment' ? 'missed/lapsed premium payment' : ctx.reason === 'cancellation' ? 'policy cancellation request' : 'policy issue'}.
- The policy was written ${policyAgeDesc}.
${ctx.premiumAmount ? `- Premium: $${ctx.premiumAmount}/month.` : ''}
${ctx.coverageAmount ? `- Coverage: $${ctx.coverageAmount.toLocaleString()}.` : ''}

TONE GUIDANCE:
- ${ctx.reason === 'lapsed_payment' ? 'Be helpful and understanding. Missed payments happen. Focus on how easy it is to fix.' : ctx.reason === 'cancellation' ? 'Be understanding and curious. Something may have changed. Focus on exploring options.' : 'Be warm and check in.'}
- ${dripContext}
- ${schedulingNote}

RULES:
- Keep it 1-3 sentences. This is SMS.
- Sound like a real person texting, not a form letter.
- No emojis except one max if natural.
- No markdown, no bullet points. Plain conversational text.
- Never mention specific policy numbers or internal jargon.
- Sign off naturally as ${ctx.agentFirstName} if it fits.`,
      messages: [
        {
          role: 'user',
          content: 'Write the text message.',
        },
      ],
    }),
  );

  const block = message.content[0];
  return block.type === 'text' ? block.text.trim() : '';
}

/**
 * Generates a brief AI insight about the likelihood of saving the policy.
 */
export async function assessSaveability(context: {
  clientName: string;
  policyAge: number | null;
  clientHasApp: boolean;
  clientPolicyCount: number | null;
  reason: ConservationReason;
  premiumAmount: number | null;
}): Promise<string> {
  const factors: string[] = [];

  if (context.clientHasApp) {
    factors.push('client has the mobile app installed (direct channel)');
  } else {
    factors.push('client does not have the app (SMS only)');
  }

  if (context.clientPolicyCount && context.clientPolicyCount > 1) {
    factors.push(`client has ${context.clientPolicyCount} total policies (deeper relationship)`);
  }

  if (context.policyAge !== null) {
    factors.push(
      context.policyAge < 180
        ? `policy is only ${Math.round(context.policyAge / 30)} months old`
        : `policy is ${Math.round(context.policyAge / 30)} months old`,
    );
  }

  if (context.reason === 'lapsed_payment') {
    factors.push('reason is a missed payment (often fixable)');
  } else if (context.reason === 'cancellation') {
    factors.push('client initiated cancellation (harder to save)');
  }

  const hasApp = context.clientHasApp;
  const multiPolicy = (context.clientPolicyCount || 0) > 1;
  const isMissedPayment = context.reason === 'lapsed_payment';

  let outlook: string;
  if (hasApp && multiPolicy && isMissedPayment) {
    outlook = 'Good chance of saving';
  } else if ((hasApp || multiPolicy) && isMissedPayment) {
    outlook = 'Decent chance of saving';
  } else if (isMissedPayment) {
    outlook = 'Worth reaching out';
  } else if (hasApp || multiPolicy) {
    outlook = 'Uncertain but worth a try';
  } else {
    outlook = 'Lower chance -- reach out anyway';
  }

  return `${outlook} -- ${factors.join(', ')}.`;
}

function describePolicyAge(policyAge: number | null): string {
  if (!policyAge) return 'recently';
  if (policyAge < 30) return 'less than a month ago';
  if (policyAge < 90) return 'a few months ago';
  if (policyAge < 365) return `about ${Math.round(policyAge / 30)} months ago`;
  return 'over a year ago';
}

function describeReason(reason: ConservationReason): string {
  if (reason === 'lapsed_payment') return 'missed/lapsed premium payment';
  if (reason === 'cancellation') return 'policy cancellation request';
  return 'policy issue';
}

function formatConversationHistory(conversation: ConservationMessage[]): string {
  return conversation
    .map((m) => {
      const sender =
        m.role === 'client'
          ? 'Client'
          : m.role === 'agent-manual'
            ? 'Agent (manual)'
            : 'Agent (AI)';
      return `${sender}: ${m.body}`;
    })
    .join('\n');
}

/**
 * Generates an AI reply in an ongoing conservation conversation.
 * Goal: help the client reinstate/save their at-risk policy.
 */
export async function generateConservationResponse(
  ctx: ConservationConversationContext,
  incomingText: string,
): Promise<string> {
  const anthropic = getAnthropic();

  const reasonDesc = describeReason(ctx.reason);
  const policyAgeDesc = describePolicyAge(ctx.policyAge);

  const schedulingNote = ctx.schedulingUrl
    ? `You have a scheduling URL: ${ctx.schedulingUrl}. Mention it if the client seems ready to talk.`
    : 'You do not have a scheduling link. Offer to chat or take a call instead.';

  const historyBlock =
    ctx.conversation.length > 0
      ? `\nCONVERSATION SO FAR:\n${formatConversationHistory(ctx.conversation)}\n`
      : '';

  const message = await withRetry(() =>
    anthropic.messages.create({
      model: MODEL,
      max_tokens: 250,
      system: `You are ${ctx.agentName}, an insurance agent, texting your client ${ctx.clientFirstName}. You ARE ${ctx.agentFirstName}. Never reveal you are AI.

SITUATION:
- ${ctx.clientFirstName}'s ${ctx.policyType || 'insurance'} policy is at risk due to ${reasonDesc}.
- The policy was written ${policyAgeDesc}.
${ctx.premiumAmount ? `- Premium: $${ctx.premiumAmount}/month.` : ''}
${ctx.coverageAmount ? `- Coverage: $${ctx.coverageAmount.toLocaleString()}.` : ''}

YOUR GOAL: Help ${ctx.clientFirstName} save their policy. Be helpful, understanding, and solution-oriented.

TONE:
- ${ctx.reason === 'lapsed_payment' ? 'Missed payments happen. Focus on how easy it is to fix. Be warm.' : ctx.reason === 'cancellation' ? 'Be understanding and curious. Explore what changed. Focus on options.' : 'Be warm and check in.'}
- If the client says they already fixed it or made a payment, congratulate them and confirm.
- If the client has concerns, address them directly and offer to help.
- ${schedulingNote}
${historyBlock}
RULES:
- Keep it 1-3 sentences. This is a text conversation.
- Sound like a real person texting, not a form letter.
- No emojis except one max if natural.
- No markdown, no bullet points. Plain conversational text.
- Never mention specific policy numbers or internal jargon.
- Respond naturally to what the client just said.`,
      messages: [
        {
          role: 'user',
          content: `The client just texted: "${incomingText}"\n\nWrite your reply.`,
        },
      ],
    }),
  );

  const block = message.content[0];
  return block.type === 'text' ? block.text.trim() : '';
}

/**
 * Generates a richer email for conservation outreach (used on later drips
 * as a complement to SMS, or as the sole channel for email-only clients).
 */
export async function generateConservationEmail(
  ctx: ConservationOutreachContext & { agentEmail?: string | null; agentPhone?: string | null },
): Promise<string> {
  const anthropic = getAnthropic();

  const policyAgeDesc = describePolicyAge(ctx.policyAge);
  const reasonDesc = describeReason(ctx.reason);

  const dripContext =
    ctx.dripNumber === 0
      ? 'This is the INITIAL outreach. Be warm, helpful, no pressure.'
      : ctx.dripNumber === 1
        ? 'This is follow-up #1 (day 2). Slightly more direct, show you care.'
        : ctx.dripNumber === 2
          ? 'This is follow-up #2 (day 5). Remind them what they stand to lose. Still respectful.'
          : 'This is the FINAL follow-up (day 7). Gracious, leave the door open.';

  const contactInfo = [
    ctx.agentPhone ? `phone: ${ctx.agentPhone}` : null,
    ctx.agentEmail ? `email: ${ctx.agentEmail}` : null,
    ctx.schedulingUrl ? `scheduling link: ${ctx.schedulingUrl}` : null,
  ]
    .filter(Boolean)
    .join(', ');

  const message = await withRetry(() =>
    anthropic.messages.create({
      model: MODEL,
      max_tokens: 500,
      system: `You are writing a short personal email as ${ctx.agentName}, an insurance agent, to their client ${ctx.clientFirstName}. You ARE ${ctx.agentFirstName}. Never reveal you are AI.

SITUATION:
- ${ctx.clientFirstName}'s ${ctx.policyType || 'insurance'} policy is at risk due to ${reasonDesc}.
- The policy was written ${policyAgeDesc}.
${ctx.premiumAmount ? `- Premium: $${ctx.premiumAmount}/month.` : ''}
${ctx.coverageAmount ? `- Coverage: $${ctx.coverageAmount.toLocaleString()}.` : ''}

TONE GUIDANCE:
- ${ctx.reason === 'lapsed_payment' ? 'Be helpful and understanding. Missed payments happen.' : ctx.reason === 'cancellation' ? 'Be understanding and curious. Explore what changed.' : 'Be warm and check in.'}
- ${dripContext}

FORMAT:
- This is an EMAIL, not a text. Write 3-5 sentences.
- Start with a warm greeting using their first name.
- Be specific about what they stand to lose (coverage amount, beneficiary protection) when you have the data.
- End with a clear call to action and sign off as ${ctx.agentFirstName}.
${contactInfo ? `- Include your contact info in the sign-off: ${contactInfo}` : ''}
- No markdown, no bullet points, no emojis. Warm, professional, personal.
- Do not include a subject line. Just the email body.`,
      messages: [
        {
          role: 'user',
          content: 'Write the email body.',
        },
      ],
    }),
  );

  const block = message.content[0];
  return block.type === 'text' ? block.text.trim() : '';
}

/**
 * Analyzes a conservation conversation to detect if the client has indicated
 * the policy is saved/reinstated. Returns a confidence level.
 */
export async function detectSaveSignal(
  conversation: ConservationMessage[],
): Promise<SaveSignalResult> {
  if (conversation.length === 0) {
    return { saved: false, confidence: 'low' };
  }

  const clientMessages = conversation.filter((m) => m.role === 'client');
  if (clientMessages.length === 0) {
    return { saved: false, confidence: 'low' };
  }

  const anthropic = getAnthropic();

  const historyBlock = formatConversationHistory(conversation);

  const message = await withRetry(() =>
    anthropic.messages.create({
      model: MODEL,
      max_tokens: 100,
      system: `You analyze insurance conservation conversations to determine if the client has indicated their policy is saved, reinstated, or the issue is resolved.

Look for signals like: "I made the payment", "it's been taken care of", "I called the carrier", "policy is back on track", "already handled it", "payment went through", etc.

Return ONLY a JSON object:
{
  "saved": true/false,
  "confidence": "high" | "medium" | "low"
}

- "high": client explicitly stated they resolved it
- "medium": client implied it but didn't say directly
- "low": unclear or no signal`,
      messages: [
        {
          role: 'user',
          content: `Does this conversation indicate the policy has been saved?\n\n${historyBlock}`,
        },
      ],
    }),
  );

  const block = message.content[0];
  const text = block.type === 'text' ? block.text.trim() : '';

  try {
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) return { saved: false, confidence: 'low' };
    const parsed = JSON.parse(jsonMatch[0]);
    return {
      saved: !!parsed.saved,
      confidence: parsed.confidence === 'high' || parsed.confidence === 'medium'
        ? parsed.confidence
        : 'low',
    };
  } catch {
    return { saved: false, confidence: 'low' };
  }
}
