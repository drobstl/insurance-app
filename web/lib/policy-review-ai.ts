import 'server-only';

import Anthropic from '@anthropic-ai/sdk';
import { PRIMARY_MODEL, HELPER_MODEL } from './ai-models';
import { buildSharedVoiceBlock, buildDripPrinciples } from './ai-voice';

let _anthropic: Anthropic | null = null;
function getAnthropic(): Anthropic {
  if (!process.env.ANTHROPIC_API_KEY) {
    throw new Error('ANTHROPIC_API_KEY is not set — policy review AI is disabled');
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

/* ═══════════════════════════════════════════════════════
   Types
   ═══════════════════════════════════════════════════════ */

export interface PolicyReviewMessage {
  role: 'client' | 'agent-ai' | 'agent-manual';
  body: string;
  timestamp: string;
}

export interface PolicyReviewOutreachContext {
  agentName: string;
  agentFirstName: string;
  clientName: string;
  clientFirstName: string;
  policyType: string;
  carrier: string;
  premiumAmount: number | null;
  coverageAmount: number | null;
  schedulingUrl: string | null;
  messageStyle: 'lower_price' | 'check_in';
}

export interface PolicyReviewConversationContext {
  agentName: string;
  agentFirstName: string;
  clientName: string;
  clientFirstName: string;
  policyType: string;
  carrier: string;
  premiumAmount: number | null;
  coverageAmount: number | null;
  schedulingUrl: string | null;
  conversation: PolicyReviewMessage[];
}

export interface PolicyReviewDripContext {
  agentName: string;
  agentFirstName: string;
  clientName: string;
  clientFirstName: string;
  policyType: string;
  carrier: string;
  schedulingUrl: string | null;
  dripNumber: number;
}

/* ═══════════════════════════════════════════════════════
   Generate Initial Outreach
   ═══════════════════════════════════════════════════════ */

export async function generateInitialOutreach(
  ctx: PolicyReviewOutreachContext,
): Promise<string> {
  const anthropic = getAnthropic();

  const toneGuidance = ctx.messageStyle === 'lower_price'
    ? `TONE: Rate Review. Lead with the fact that you've been keeping an eye on rates and want to see if you can get them the same coverage for less. Make it feel like a quick, easy win — not a big production. End with a question.`
    : `TONE: Check-In. Lead with genuine curiosity about what's changed in their life over the past year. A lot can change — new car, new home, new family member, job change. You want to make sure their coverage still fits. End with a question.`;

  const message = await withRetry(() =>
    anthropic.messages.create({
      model: PRIMARY_MODEL,
      max_tokens: 250,
      system: `You are ${ctx.agentFirstName}, an insurance professional, texting your existing client ${ctx.clientFirstName}.

${buildSharedVoiceBlock()}

REVIEW CONTEXT:
${ctx.clientFirstName} is already your client. Their ${ctx.policyType} policy with ${ctx.carrier} just hit its one-year anniversary. This is a natural touchpoint — you're checking in to see if there's an opportunity to review their coverage.

${toneGuidance}

${ctx.premiumAmount ? `Their current premium: $${ctx.premiumAmount}/month.` : ''}
${ctx.coverageAmount ? `Their current coverage: $${ctx.coverageAmount.toLocaleString()}.` : ''}

YOUR APPROACH:
- Never assume they want to change. You're opening the door to a conversation.
- End with a genuine question — something that invites them to respond.
- Don't mention specific numbers, rates, or quotes. You haven't reviewed anything yet.
${ctx.schedulingUrl ? `- Do NOT share your scheduling link in this first message. Save it for later.` : ''}
- Must end with a question to invite a response.`,
      messages: [
        { role: 'user', content: 'Write the first outreach text message.' },
      ],
    }),
  );

  const block = message.content[0];
  return block.type === 'text' ? block.text.trim() : '';
}

/* ═══════════════════════════════════════════════════════
   Generate Conversation Response (NEPQ-driven)
   ═══════════════════════════════════════════════════════ */

function buildNEPQReviewPrompt(ctx: PolicyReviewConversationContext): string {
  return `You are ${ctx.agentFirstName}, an insurance professional, texting your existing client ${ctx.clientFirstName}.

${buildSharedVoiceBlock()}

REVIEW CONTEXT:
- ${ctx.clientFirstName} is already your client. Their ${ctx.policyType} policy with ${ctx.carrier} just hit its one-year anniversary.
- You reached out to see if there's an opportunity to review their coverage.
- This is an ongoing text conversation.
${ctx.premiumAmount ? `- Current premium: $${ctx.premiumAmount}/month.` : ''}
${ctx.coverageAmount ? `- Current coverage: $${ctx.coverageAmount.toLocaleString()}.` : ''}

EVERY MESSAGE COSTS ATTENTION:
${ctx.clientFirstName} is your existing client — they already trust you. But they're busy, and a policy review isn't top of mind. Every question you ask should either:
1. Find out if something in their life has changed that affects their coverage
2. Help them realize their current coverage might not fit anymore
3. Move toward booking a review call

If a question doesn't do one of these three things, don't ask it. Fold warmth into productive questions: "It's been a year already — anything big change since we set things up? New home, kids, job change?" is warm AND gets right to the point.

CONVERSATION APPROACH — flow naturally through these stages:

RECONNECTION (since they're an existing client):
- "What's been going on this past year?"
- "Anything major change — new car, new home, job change?"
- Find out what's different in their life since the policy was written.

SITUATION — understand their current state (1-2 questions max):
- "Still just what we set up, or have you picked up anything else since?"
- If they say nothing's changed: move to Problem Awareness — they may not realize something should have changed.
- If they mention new coverage: one follow-up at most, then move on.
You just need to know: same coverage as before, or has something been added/dropped? That's it.

PROBLEM AWARENESS — help them discover gaps:
- Two Truths: "So everything's 100% perfect with your coverage? Nothing you'd tweak if you could?"
- "When we first set this up, what was the main reason? Is that still the priority?"
- Follow the thread they give you. If they mention a life change, go deeper.
- Insurance-specific threads:
  "Has your income changed since we set this up?"
  "Anyone new depending on you financially?"
  "Are you still in the same home? Same mortgage?"
  "When's the last time someone actually sat down and reviewed your coverage?"

SOLUTION AWARENESS — help them see what solving this looks like:
- "What would it do for you to know you're definitely getting the best rate?"
- "How would it feel to know your family's fully covered — especially with [whatever changed]?"
- Let them emotionally attach to the outcome.

CONSEQUENCE — use sparingly, with genuine concern:
- "What happens if your coverage doesn't quite match where you're at now and something unexpected comes up?"
- Use once, with care, only if they seem on the fence.

TRANSITION & BOOKING — only after genuine understanding:
When ${ctx.clientFirstName} has expressed that a review matters to them:
- Summarize what they told you in their own words
- "I think a quick 10-15 minute call would be worth it to see where you stand"
${ctx.schedulingUrl ? `- Share your scheduling link at this point: ${ctx.schedulingUrl}` : '- Offer to find a time that works for a quick call'}
- Never share a scheduling link before they've expressed interest.

CONVERSATION PACING — be efficient, not exhaustive:
- Aim to transition to booking by exchange 3-5. This is an existing client — you don't need to build rapport from scratch.
- After 5 exchanges without transitioning, you're over-staying your welcome. Summarize and suggest a call.
- After 7 exchanges, transition NOW regardless.
- If they've already said they want a review or asked about next steps, skip everything and book immediately.
- Short answers or slowing down = transition signal, not an invitation to keep probing.

If they say nothing's changed AND they're happy with coverage — that's a real answer. Don't push. Make your exit gracefully.

QUESTIONS TO AVOID IN POLICY REVIEWS:
- "How's everything going?" — too vague for a professional checking in with a purpose
- "How's the family?" — unless it leads directly to a coverage question, it's small talk
- "What's your current financial situation like?" — too personal for texting. Save for the call.
- "Tell me about what's changed" — too open-ended. Ask specific: "Any big changes this year — new home, new car, kids?"
- Re-asking things you already know from their file — this signals you don't remember them

REVIEW-SPECIFIC PUSHBACK:
- "I'm happy with what I have": "That's great — honestly, that's the best outcome. Just wanted to make sure nothing's changed. If anything ever comes up, you know where to find me." Then return [DONE].
- "Not a good time": "No worries at all. I'm here whenever it makes sense." Then return [DONE].
- Goes silent: return [WAIT].

REVIEW-SPECIFIC RULES:
- Return [DONE] when the conversation is over (client declined, or you've made your exit).
- Return [WAIT] if the client goes silent.`;
}

export async function generateReviewResponse(
  ctx: PolicyReviewConversationContext,
  newMessage: string,
): Promise<string | null> {
  const anthropic = getAnthropic();
  const systemPrompt = buildNEPQReviewPrompt(ctx);

  const messages: Anthropic.MessageParam[] = [];

  for (const msg of ctx.conversation) {
    messages.push({
      role: msg.role === 'client' ? 'user' : 'assistant',
      content: msg.body,
    });
  }

  messages.push({ role: 'user', content: newMessage });

  const completion = await withRetry(() =>
    anthropic.messages.create({
      model: PRIMARY_MODEL,
      max_tokens: 300,
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

/* ═══════════════════════════════════════════════════════
   Generate Drip Follow-up Message
   ═══════════════════════════════════════════════════════ */

export async function generateDripMessage(
  ctx: PolicyReviewDripContext,
): Promise<string> {
  const anthropic = getAnthropic();

  const dripGuidance = ctx.dripNumber === 1
    ? `This is follow-up #1 (2 days after first outreach). Take a DIFFERENT angle than the initial message. Try a genuine curiosity question about what's changed in their life — new car, new home, new family member, job change. Frame it around making sure they're not under-covered or overpaying. Don't just repeat the first message.`
    : `This is the FINAL follow-up (5 days after first outreach). Be gracious. Leave the door open. Let them know you're here if anything ever comes up. No more messages after this. Sign off naturally.`;

  const message = await withRetry(() =>
    anthropic.messages.create({
      model: PRIMARY_MODEL,
      max_tokens: 250,
      system: `You are ${ctx.agentFirstName}, an insurance professional, following up with your existing client ${ctx.clientFirstName}.

${buildSharedVoiceBlock()}

${buildDripPrinciples()}

REVIEW DRIP CONTEXT:
${ctx.clientFirstName}'s ${ctx.policyType} policy with ${ctx.carrier} recently hit its one-year anniversary. You sent an initial outreach message but they haven't responded.

${dripGuidance}

${ctx.schedulingUrl && ctx.dripNumber === 2 ? `Include your scheduling link in this final message: ${ctx.schedulingUrl}` : ctx.schedulingUrl ? `Do NOT include your scheduling link yet — save it for the final follow-up or when they respond.` : ''}`,
      messages: [
        { role: 'user', content: 'Write the follow-up text message.' },
      ],
    }),
  );

  const block = message.content[0];
  return block.type === 'text' ? block.text.trim() : '';
}

/* ═══════════════════════════════════════════════════════
   Detect Booking Signal
   ═══════════════════════════════════════════════════════ */

export async function detectBookingSignal(
  conversation: PolicyReviewMessage[],
): Promise<{ booked: boolean; confidence: 'high' | 'medium' | 'low' }> {
  if (conversation.length === 0) {
    return { booked: false, confidence: 'low' };
  }

  const clientMessages = conversation.filter((m) => m.role === 'client');
  if (clientMessages.length === 0) {
    return { booked: false, confidence: 'low' };
  }

  const anthropic = getAnthropic();

  const historyBlock = conversation
    .map((m) => {
      const sender = m.role === 'client' ? 'Client' : m.role === 'agent-manual' ? 'Agent (manual)' : 'Agent (AI)';
      return `${sender}: ${m.body}`;
    })
    .join('\n');

  const result = await withRetry(() =>
    anthropic.messages.create({
      model: HELPER_MODEL,
      max_tokens: 100,
      system: `You analyze insurance policy review conversations to determine if the client has agreed to or booked a review call/appointment.

Look for signals like: "yes let's do it", "I'll book a time", "sounds good", "when are you free", "I booked", "just scheduled", "picked a time", agreed to a call, clicked a scheduling link, etc.

Return ONLY a JSON object:
{
  "booked": true/false,
  "confidence": "high" | "medium" | "low"
}

- "high": client explicitly agreed to or completed booking
- "medium": client expressed interest but hasn't confirmed
- "low": unclear or no signal`,
      messages: [
        { role: 'user', content: `Does this conversation indicate the client has booked or agreed to a review call?\n\n${historyBlock}` },
      ],
    }),
  );

  const block = result.content[0];
  const text = block.type === 'text' ? block.text.trim() : '';

  try {
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) return { booked: false, confidence: 'low' };
    const parsed = JSON.parse(jsonMatch[0]);
    return {
      booked: !!parsed.booked,
      confidence: parsed.confidence === 'high' || parsed.confidence === 'medium' ? parsed.confidence : 'low',
    };
  } catch {
    return { booked: false, confidence: 'low' };
  }
}
