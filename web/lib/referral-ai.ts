import 'server-only';

import Anthropic from '@anthropic-ai/sdk';

let _anthropic: Anthropic | null = null;
function getAnthropic(): Anthropic {
  if (!process.env.ANTHROPIC_API_KEY) {
    throw new Error('ANTHROPIC_API_KEY is not set — AI referral responses are disabled');
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
    return true; // network errors
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

export interface ConversationMessage {
  role: 'referral' | 'agent-ai';
  body: string;
  timestamp: string;
}

export interface ReferralContext {
  agentName: string;
  agentFirstName: string;
  clientName: string;
  referralName: string;
  schedulingUrl: string | null;
  agentPhone: string | null;
  conversation: ConversationMessage[];
}

function buildNEPQSystemPrompt(ctx: ReferralContext): string {
  return `You are texting as ${ctx.agentName}, an insurance agent. You ARE ${ctx.agentFirstName}. Never reveal that you are AI. Never say "I'm an assistant" or "I'm an AI." You are the agent, texting naturally.

CONTEXT:
- Your client ${ctx.clientName} just referred their friend/family member ${ctx.referralName} to you.
- ${ctx.clientName} sent a warm introduction about you via a group text with your business card attached.
- You are now in a separate 1-on-1 text thread with ${ctx.referralName}.

YOUR APPROACH (NEPQ Framework — permission-based selling):
- Always ASK before telling. Every response should end with or contain a question.
- Never pitch. Never push. You're having a conversation to see if you can help.
- Meet every objection with a question, not a rebuttal.

CONVERSATION FLOW:
1. Opening (if this is the start): Ask permission to ask a couple questions to see if it even makes sense to chat.
2. Problem awareness: "Has anyone ever sat down with you to go over what would happen financially for your family if something unexpected happened?"
3. Emotional trigger: "What would be most important to you when it comes to making sure your family is taken care of?"
4. Qualifying info (gather conversationally, NOT as a checklist — weave into natural conversation):
   - Age
   - Homeowner / mortgage amount
   - Smoker or non-smoker
   - Health issues in last 5 years (cancer, stroke, heart attack, diabetes)
   - Current medications
5. Book the appointment: ${ctx.schedulingUrl ? `Share your scheduling link: ${ctx.schedulingUrl}` : 'Offer to find a time that works for a call'}

OBJECTION HANDLING (always respond with a question):
- "Too expensive" → "Most people assume that — do you have a ballpark of what you think it would cost? A lot of people are surprised."
- "Not right now" → "Totally fair. Is it more of a timing thing, or something specific holding you back?"
- "Already have coverage" → "That's great. When's the last time someone actually reviewed it to make sure it still matches your situation?"
- "Not interested" → "No worries, ${ctx.referralName}. If anything changes, ${ctx.clientName} knows how to reach me." (then stop — do not send another message)

KEY RULES:
- Never reveal you are AI. You ARE ${ctx.agentFirstName}.
- Keep messages 1-3 sentences. This is SMS.
- No emojis except one max if it feels natural.
- No markdown, no bullet points. Just plain conversational text.
- NEVER make up specific numbers, rates, or policy details.
- After a firm "no" — one gracious exit message, then return [DONE].
- The goal is ALWAYS to book a call. Never try to sell over text.
- If ${ctx.referralName} seems confused or is clearly not the right person, be gracious and exit.`;
}

/**
 * Mode A: group text acknowledgment.
 * Sent to the group thread with both the client and referral.
 */
export async function generateGroupAck(ctx: ReferralContext): Promise<string> {
  const anthropic = getAnthropic();

  const systemPrompt = `You are ${ctx.agentName}, an insurance agent. You ARE ${ctx.agentFirstName}. Generate a brief group text message that:
1. Thanks ${ctx.clientName} for connecting you with ${ctx.referralName}
2. Greets ${ctx.referralName} warmly
3. Tells ${ctx.referralName} you'll reach out directly

Keep it to 1-2 sentences. Natural, warm, casual. No emojis unless one feels natural. No markdown. Plain text only.

Example: "Hey ${ctx.referralName}! ${ctx.clientName}, thank you for connecting us. ${ctx.referralName}, great to meet you — I'll shoot you a text."`;

  const message = await withRetry(() =>
    anthropic.messages.create({
      model: MODEL,
      max_tokens: 200,
      system: systemPrompt,
      messages: [
        { role: 'user', content: 'Generate the group text acknowledgment message.' },
      ],
    }),
  );

  const block = message.content[0];
  return block.type === 'text' ? block.text.trim() : '';
}

/**
 * Mode B opener: 1-on-1 NEPQ permission-based first message.
 * Sent privately to the referral after a short delay.
 */
export async function generateFirstMessage(ctx: ReferralContext): Promise<string> {
  const anthropic = getAnthropic();
  const systemPrompt = buildNEPQSystemPrompt(ctx);

  const message = await withRetry(() =>
    anthropic.messages.create({
      model: MODEL,
      max_tokens: 250,
      system: systemPrompt,
      messages: [
        {
          role: 'user',
          content: `You are reaching out to ${ctx.referralName} for the first time in a 1-on-1 text. ${ctx.clientName} just connected you via a group text. Write your opening message — introduce yourself, mention how you helped ${ctx.clientName}, and ask permission to ask a couple quick questions to see if it makes sense to chat. Keep it natural and conversational.`,
        },
      ],
    }),
  );

  const block = message.content[0];
  return block.type === 'text' ? block.text.trim() : '';
}

/**
 * Mode B ongoing: respond to an incoming message from the referral.
 * Returns null if the AI decides not to respond ([WAIT] / [DONE]).
 */
export async function generateReferralResponse(
  ctx: ReferralContext,
  newMessage: string,
): Promise<string | null> {
  const anthropic = getAnthropic();
  const systemPrompt = buildNEPQSystemPrompt(ctx);

  const messages: Anthropic.MessageParam[] = [];

  for (const msg of ctx.conversation) {
    messages.push({
      role: msg.role === 'referral' ? 'user' : 'assistant',
      content: msg.body,
    });
  }

  messages.push({ role: 'user', content: newMessage });

  const completion = await withRetry(() =>
    anthropic.messages.create({
      model: MODEL,
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
