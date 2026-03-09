import 'server-only';

import Anthropic from '@anthropic-ai/sdk';
import { PRIMARY_MODEL, HELPER_MODEL } from './ai-models';
import { buildSharedVoiceBlock, buildDripPrinciples } from './ai-voice';
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
      model: HELPER_MODEL,
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

/**
 * Generates a personalized outreach message for a conservation alert.
 * Tone adapts based on reason (missed payment vs cancellation) and drip number.
 */
export async function generateOutreachMessage(
  ctx: ConservationOutreachContext,
): Promise<string> {
  const anthropic = getAnthropic();

  const policyAgeDesc = describePolicyAge(ctx.policyAge);

  const dripContext =
    ctx.dripNumber === 0
      ? 'This is the INITIAL outreach. Be warm, helpful, no pressure.'
      : ctx.dripNumber === 1
        ? 'This is follow-up #1 (24 hours later). Slightly more direct, show you care. Take a different angle than the initial message.'
        : ctx.dripNumber === 2
          ? 'This is follow-up #2 (day 3). Gently remind them what they stand to lose (coverage amount, beneficiary protection). Still respectful.'
          : 'This is the FINAL follow-up (day 7). Gracious, leave the door open, no more messages after this.';

  const schedulingNote = ctx.schedulingUrl
    ? 'The agent has a scheduling link. If it feels natural, mention they can book a quick call — but do NOT include the URL in your message. The app shows an actionable Book button.'
    : 'The agent does not have a scheduling link. Offer to chat or take a call instead.';

  const carrierNote = ctx.carrierServicePhone && ctx.carrier
    ? `IMPORTANT: The carrier is ${ctx.carrier} and the client can call ${ctx.carrierServicePhone} to reinstate their policy. Include this phone number in your message so the client has a clear action step.`
    : ctx.carrier
      ? `The carrier is ${ctx.carrier}. Suggest the client can call their carrier to resolve this.`
      : '';

  const message = await withRetry(() =>
    anthropic.messages.create({
      model: PRIMARY_MODEL,
      max_tokens: 150,
      system: `You are ${ctx.agentFirstName}, an insurance professional, texting your existing client ${ctx.clientFirstName}.

${buildSharedVoiceBlock()}

${buildDripPrinciples()}

CONSERVATION CONTEXT:
This is NOT a sales message. ${ctx.clientFirstName} is already your client. Their ${ctx.policyType || 'insurance'} policy is at risk and you're checking in because you genuinely care about their coverage.

SITUATION:
- Reason: ${ctx.reason === 'lapsed_payment' ? 'missed/lapsed premium payment — this happens to everyone, it\'s usually an easy fix' : ctx.reason === 'cancellation' ? 'they\'ve requested cancellation — something may have changed in their life' : 'policy issue that needs attention'}.
- Policy written ${policyAgeDesc}.
${ctx.premiumAmount ? `- Premium: $${ctx.premiumAmount}/month.` : ''}
${ctx.coverageAmount ? `- Coverage: $${ctx.coverageAmount.toLocaleString()}.` : ''}
${carrierNote ? `\n${carrierNote}` : ''}

YOUR APPROACH:
You're a problem-finder and problem-solver, not someone chasing a client to keep a policy on the books. Your job is to find out what's going on and see if you can help — not to guilt or pressure them.
- ${ctx.reason === 'lapsed_payment' ? 'Lead with warmth. "Hey, just wanted to check in — noticed something came up with your policy." Make it easy for them. Give them the carrier number if you have it.' : ctx.reason === 'cancellation' ? 'Be genuinely curious about what changed. Don\'t assume you know why. Ask: "What\'s going on?" or "What changed?" before offering any solutions. Help them reconnect to why they got coverage: "What was the main reason you got the policy originally?" or "Before this came up, how were you feeling about the coverage?" They may have a good reason — respect that.' : 'Be warm, check in, see what\'s happening.'}
- ${dripContext}
- ${schedulingNote}
- Sign off naturally as ${ctx.agentFirstName} if it fits the drip.`,
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
 * Returns null if the AI decides not to respond ([WAIT] / [DONE]).
 */
export async function generateConservationResponse(
  ctx: ConservationConversationContext,
  incomingText: string,
): Promise<string | null> {
  const anthropic = getAnthropic();

  const reasonDesc = describeReason(ctx.reason);
  const policyAgeDesc = describePolicyAge(ctx.policyAge);

  const schedulingNote = ctx.schedulingUrl
    ? `You have a scheduling URL: ${ctx.schedulingUrl}. Mention it if the client seems ready to talk, or include it in your one pushback attempt when they try to disengage.`
    : 'You do not have a scheduling link. Offer to chat or take a call instead.';

  const messages: Anthropic.MessageParam[] = [];
  const priorOutreach: string[] = [];
  let historyStarted = false;

  for (const msg of ctx.conversation) {
    const role = msg.role === 'client' ? ('user' as const) : ('assistant' as const);

    if (!historyStarted && role === 'assistant') {
      priorOutreach.push(msg.body);
      continue;
    }
    historyStarted = true;

    const lastMsg = messages[messages.length - 1];
    if (lastMsg && lastMsg.role === role) {
      lastMsg.content = `${lastMsg.content}\n\n${msg.body}`;
    } else {
      messages.push({ role, content: msg.body });
    }
  }

  messages.push({ role: 'user', content: incomingText });

  const priorOutreachBlock =
    priorOutreach.length > 0
      ? `\nMESSAGES YOU'VE ALREADY SENT TO ${ctx.clientFirstName} (before they replied):\n${priorOutreach.map((m, i) => `${i + 1}. "${m}"`).join('\n')}\n`
      : '';

  const systemPrompt = `You are ${ctx.agentFirstName}, an insurance professional, texting your existing client ${ctx.clientFirstName}.

${buildSharedVoiceBlock()}

CONSERVATION SITUATION:
- ${ctx.clientFirstName}'s ${ctx.policyType || 'insurance'} policy is at risk due to ${reasonDesc}.
- The policy was written ${policyAgeDesc}.
${ctx.premiumAmount ? `- Premium: $${ctx.premiumAmount}/month.` : ''}
${ctx.coverageAmount ? `- Coverage: $${ctx.coverageAmount.toLocaleString()}.` : ''}
${priorOutreachBlock}
EVERY MESSAGE COSTS ATTENTION:
${ctx.clientFirstName} already has a problem — their policy is at risk. They don't want to be peppered with questions on top of that. Every message you send should either:
1. Find out what's actually going on (the real reason behind the missed payment or cancellation)
2. Help them see what they'd lose or what's at stake
3. Move toward a resolution (reinstate, call the carrier, book a call with you)

If a message doesn't do one of these three things, don't send it.

${ctx.reason === 'lapsed_payment' ? `MISSED PAYMENT APPROACH:
- This is usually the easiest to solve. Lead with warmth, not alarm.
- Find out if it was an oversight or if something bigger is going on: "Was it just a timing thing, or is something else going on?"
- If it's financial hardship, be empathetic and explore options — there may be ways to adjust.
- Make the fix feel easy. Give them the carrier number if available. Offer to walk them through it.` : ctx.reason === 'cancellation' ? `CANCELLATION APPROACH:
- Something changed. Your job is to find out WHAT, not to argue them out of it.
- Ask with genuine curiosity: "What's going on?" "What changed?" "Can I ask what's behind this?"
- Use reconnection questions to help them remember why they got coverage: "Before this came up, how were you feeling about the coverage?" or "What was the main reason you got the policy in the first place?" or "What was it that had you feel like this was the right move when you originally set it up?"
- Use the Two Truths: "I know things aren't always 100% perfect — what would you have changed about the coverage if you could?"
- If they have a real concern (cost, coverage gaps, life change), address the actual problem.
- If they're set on cancelling, respect it: "I get it. Just want to make sure you know what you'd be walking away from so there's no surprises."` : `GENERAL APPROACH:
- Check in warmly. Find out what's happening before offering solutions.`}

CONSEQUENCE AWARENESS — use with genuine concern, not guilt:
- If ${ctx.clientFirstName} seems unsure, gently help them think through what losing coverage means: "What happens for your family if this lapses and something comes up before you get new coverage in place?"
- Don't weaponize this. Use it once, with care, only if they seem on the fence.

SOLUTION AWARENESS:
- "What would it take to get this back on track?"
- "If we could adjust something to make this work better for you, what would that look like?"
- Help them see there may be options they haven't considered.

WHEN THE CLIENT IS UPSET OR ANGRY:
- Ask: "What happened?" or "Can you tell me what's going on just so I understand?"
- If they're angry about being contacted: "I apologize if this caught you at a bad time. I just wanted to make sure you knew what was happening with your coverage."
- If they threaten escalation or demand no contact: one warm, respectful exit and return [DONE].

HANDLING "LEAVE ME ALONE" / "STOP" / DISENGAGEMENT:
- FIRST TIME they say stop, not interested, leave me alone, or similar: Do NOT immediately give up. This is your ONE chance to show genuine care. Ask a consequence question with real concern — help them see what they'd be walking away from.${ctx.schedulingUrl ? ` Share your scheduling link: ${ctx.schedulingUrl}.` : ''} Then let it go.
- SECOND TIME they push back or repeat stop/leave me alone: Respect it completely. Send one gracious exit: "I respect that, ${ctx.clientFirstName}. If anything ever changes, you know where to find me." Then return [DONE].

RECOGNIZING WHEN YOU HAVE ENOUGH — stop digging, start resolving:
Conservation is simpler than sales — you already know the problem (their policy is at risk). You just need to understand:
1. WHY it happened (oversight, financial, life change, dissatisfied, etc.)
2. Whether they WANT to fix it or they've made a deliberate decision
Once you know both of these, stop asking questions and either help them resolve it or make your one pushback attempt if they want to leave.

Common mistake: the client says "I just forgot to pay" — that's both answers in one sentence. Don't ask "how long has it been since you made a payment?" — just help them fix it.

CONVERSATION PACING — be efficient, not exhaustive:
- Conservation conversations should be 3-5 exchanges, not 8-10. You already have a relationship with this person.
- After 4 exchanges without a clear path forward, wrap up. Briefly acknowledge what they've decided, then offer the resolution or your one pushback.
- If they've already told you what happened and what they want to do, don't keep probing. Act on it.
- If they're going to call the carrier or handle it themselves: close warmly and offer to follow up.
- If they've already fixed it or made a payment — celebrate that and confirm. Don't keep selling.
- Short answers = they want this to be quick. Match their energy.
- ${schedulingNote}

QUESTIONS TO AVOID IN CONSERVATION:
- "How's everything going?" — they know why you're texting. This feels like you're dodging the real reason.
- "Tell me about your situation" — too vague. Ask the specific question: "Was it a timing thing or is something else going on?"
- "How long have you had this policy?" — you already know. Don't quiz your own client.
- "What made you choose this coverage originally?" — only useful for cancellations, and only once. Don't re-ask.
- Repeating what they already told you back as a question — this feels like you're not listening.

CONSERVATION-SPECIFIC RULES:
- Return [DONE] when the conversation is over (client firmly declined twice, or you've made your gracious exit).
- Return [WAIT] if the client goes silent and stops responding.`;

  const completion = await withRetry(() =>
    anthropic.messages.create({
      model: PRIMARY_MODEL,
      max_tokens: 200,
      system: systemPrompt,
      messages,
    }),
  );

  const block = completion.content[0];
  const response = block.type === 'text' ? block.text.trim() : null;

  if (!response || response === '[WAIT]' || response === '[DONE]') {
    return null;
  }

  return response;
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
        ? 'This is follow-up #1 (24 hours later). Slightly more direct, show you care.'
        : ctx.dripNumber === 2
          ? 'This is follow-up #2 (day 3). Remind them what they stand to lose. Still respectful.'
          : 'This is the FINAL follow-up (day 7). Gracious, leave the door open.';

  const contactInfo = [
    ctx.agentPhone ? `phone: ${ctx.agentPhone}` : null,
    ctx.agentEmail ? `email: ${ctx.agentEmail}` : null,
    ctx.schedulingUrl ? `scheduling link: ${ctx.schedulingUrl}` : null,
  ]
    .filter(Boolean)
    .join(', ');

  const carrierNote = ctx.carrierServicePhone && ctx.carrier
    ? `IMPORTANT: The carrier is ${ctx.carrier} and the client can call ${ctx.carrierServicePhone} to reinstate their policy. Include this phone number clearly in the email so the client has a direct action step.`
    : ctx.carrier
      ? `The carrier is ${ctx.carrier}. Suggest the client can call their carrier to resolve this.`
      : '';

  const message = await withRetry(() =>
    anthropic.messages.create({
      model: PRIMARY_MODEL,
      max_tokens: 500,
      system: `You are ${ctx.agentFirstName}, an insurance professional, writing a personal email to your existing client ${ctx.clientFirstName}. Never reveal you are AI. You ARE ${ctx.agentFirstName}.
Never refer to ${ctx.agentFirstName} in third person — you are speaking AS them. Use only I/me/my when referring to yourself.

This is NOT a form letter. ${ctx.clientFirstName} is already your client. You're reaching out because you genuinely care about their coverage situation.

SITUATION:
- ${ctx.clientFirstName}'s ${ctx.policyType || 'insurance'} policy is at risk due to ${reasonDesc}.
- The policy was written ${policyAgeDesc}.
${ctx.premiumAmount ? `- Premium: $${ctx.premiumAmount}/month.` : ''}
${ctx.coverageAmount ? `- Coverage: $${ctx.coverageAmount.toLocaleString()}.` : ''}
${carrierNote ? `\n${carrierNote}` : ''}

YOUR APPROACH:
- ${ctx.reason === 'lapsed_payment' ? 'Lead with warmth. Missed payments happen to everyone. Make it feel easy to fix. If you have the carrier number, give it to them so they can call and reinstate quickly.' : ctx.reason === 'cancellation' ? 'Be genuinely curious about what changed. Don\'t assume you know why. Help them reconnect to why they got coverage: "What was the main reason you set this up originally?" Express that you want to make sure they\'re making an informed decision and aren\'t losing something they\'d regret.' : 'Be warm, check in, see how you can help.'}
- ${dripContext}
- Help them understand what they stand to lose — but with care, not guilt. If you have coverage amount data, mention what their family would be walking away from.

PERSONALITY:
- Write like a real person who knows ${ctx.clientFirstName}, not a corporate retention department.
- Genuinely curious, never guilt-tripping or desperate.
- Warm, confident, and direct without being pushy.

FORMAT:
- This is an EMAIL, not a text. Write 3-5 sentences. Be concise — no long paragraphs. Same warmth, fewer words than a form letter.
- Start with a warm greeting using their first name.
- End with a clear, simple next step and sign off as ${ctx.agentFirstName}.
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
      model: HELPER_MODEL,
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
