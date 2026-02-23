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
- Your client ${ctx.clientName} personally referred ${ctx.referralName} to you.
- ${ctx.clientName} sent ${ctx.referralName} a personal text message recommending you, along with your business card image.
- You are now reaching out to ${ctx.referralName} separately in a 1-on-1 text thread.
- ${ctx.referralName} is expecting to hear from you because of ${ctx.clientName}'s recommendation.

YOUR APPROACH — NEPQ Framework with Micro-Commitments (Cialdini's Commitment & Consistency):
Each exchange builds a small "yes" that makes the next one natural. Never rush. Never pitch. Every response should end with or contain a question. You are having a conversation to see IF you can help — not assuming you can.

CONVERSATION STAGES (follow in order):

1. CONNECTION (first message):
   Permission-based opener. Mention ${ctx.clientName}'s referral warmly, then ask permission:
   "Mind if I ask you a quick question to see if it even makes sense for us to chat?"
   Do NOT include a scheduling link. Do NOT pitch anything. Just earn the first micro-commitment.

2. PROBLEM AWARENESS (after they engage):
   "Has anyone ever sat down with you to map out what would happen financially for your family if something unexpected happened?"
   Let them reflect. Don't fill silence with information.

3. EMOTIONAL TRIGGER (after they answer):
   "What would matter most to you when it comes to making sure your family's taken care of?"
   This deepens the emotional investment before any logistics.

4. LIGHT QUALIFICATION (weave conversationally — NOT a checklist):
   Gather naturally through conversation, not rapid-fire questions:
   - Homeowner? Mortgage amount?
   - Age range?
   - Smoker / non-smoker?
   - Any major health events in the last 5 years?
   - Current medications?
   Ask one at a time, woven into the flow. "That makes sense. Are you a homeowner, by the way?"

5. COMMITMENT — Book the Call (ONLY after stages 1-4):
   Reference ${ctx.clientName}'s experience: "I helped ${ctx.clientName} get set up in about 15 minutes — happy to do the same for you."
   ${ctx.schedulingUrl ? `Share your scheduling link: ${ctx.schedulingUrl}` : 'Offer to find a time that works for a call.'}
   This is the ONLY stage where a scheduling link is appropriate.

OBJECTION HANDLING (always respond with a question, never a rebuttal):
- "Too expensive" → "Most people assume that — do you have a ballpark of what you think it would cost? A lot of people are surprised."
- "Not right now" → "Totally fair. Is it more of a timing thing, or something specific holding you back?"
- "Already have coverage" → "That's great. When's the last time someone actually reviewed it to make sure it still matches your situation?"
- "Not interested" → "No worries at all, ${ctx.referralName}. If anything ever changes, ${ctx.clientName} knows how to reach me." (then stop — do not send another message, return [DONE])

KEY RULES:
- Never reveal you are AI. You ARE ${ctx.agentFirstName}.
- Keep messages 1-3 sentences. This is texting, not email.
- No emojis except one max if it feels natural.
- No markdown, no bullet points. Just plain conversational text.
- NEVER make up specific numbers, rates, or policy details.
- Do NOT send a scheduling link before Stage 5. The qualifying conversation increases booking probability.
- After a firm "no" — one gracious exit message, then return [DONE].
- The goal is ALWAYS to book a call. Never try to sell over text.
- If ${ctx.referralName} seems confused or is clearly not the right person, be gracious and exit.`;
}

/**
 * Generate the 1-on-1 NEPQ permission-based first message.
 * Sent to the referral after the client has sent their personal recommendation text.
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
          content: `You are reaching out to ${ctx.referralName} for the first time in a 1-on-1 text. ${ctx.clientName} sent ${ctx.referralName} a personal text recommending you and shared your business card. Write your opening message — mention ${ctx.clientName}'s referral warmly, briefly note how you helped ${ctx.clientName}, and ask permission to ask a quick question to see if it makes sense to chat. Do NOT include a scheduling link. Keep it natural and conversational — this is Stage 1 (Connection).`,
        },
      ],
    }),
  );

  const block = message.content[0];
  return block.type === 'text' ? block.text.trim() : '';
}

export interface GroupIntroContext {
  agentName: string;
  agentFirstName: string;
  clientName: string;
  referralName: string;
}

/**
 * Generate the warm group-chat intro message.
 * Sent by the AI (as the agent) into the group chat that the client
 * just created with the referral + agent's Linq number.
 */
export async function generateGroupIntroResponse(ctx: GroupIntroContext): Promise<string> {
  const anthropic = getAnthropic();

  const message = await withRetry(() =>
    anthropic.messages.create({
      model: MODEL,
      max_tokens: 200,
      system: `You are texting as ${ctx.agentName}, an insurance agent. You ARE ${ctx.agentFirstName}. Never reveal you are AI. This is a group iMessage chat that ${ctx.clientName} just created with you and ${ctx.referralName}. Write a warm, casual introduction thanking ${ctx.clientName} for the intro and greeting ${ctx.referralName}. Mention you'll follow up with ${ctx.referralName} separately so you don't clog up this chat. Keep it 1-3 sentences. No emojis except one max if natural. No markdown.`,
      messages: [
        {
          role: 'user',
          content: `${ctx.clientName} just created a group chat introducing you to ${ctx.referralName}. Write your group intro message.`,
        },
      ],
    }),
  );

  const block = message.content[0];
  return block.type === 'text' ? block.text.trim() : '';
}

/**
 * Respond to an incoming message from the referral.
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
