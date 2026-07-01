import 'server-only';

import Anthropic from '@anthropic-ai/sdk';
import { PRIMARY_MODEL, HELPER_MODEL } from './ai-models';
import { buildSharedVoiceBlock } from './ai-voice';
import { languageInstruction, type SupportedLanguage } from './client-language';
import { enrichPrompt, type EnrichmentResult } from './dynamic-prompt';
import { critiqueMessage } from './message-critic';
import { analyzeConversation } from './conversation-analyzer';
import { rewriteFailedConversation } from './counterfactual-rewriter';
import {
  storeAnalysis,
  markSourceDocAnalyzed,
  getExemplars,
  recordExperimentOutcome,
} from './conversation-memory';
import type { ConversationMessage as LearningMessage } from './learning-types';

let _anthropic: Anthropic | null = null;
function getAnthropic(): Anthropic {
  if (!process.env.ANTHROPIC_API_KEY) {
    throw new Error('ANTHROPIC_API_KEY is not set — AI referral responses are disabled');
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
  clientFirstName: string;
  referralName: string;
  schedulingUrl: string | null;
  agentPhone: string | null;
  conversation: ConversationMessage[];
  preferredLanguage?: SupportedLanguage;
}

/**
 * For opener generation only: keep just the group-thread messages so we never
 * leak prior 1-on-1 content (e.g. from a reused or wrong referral doc).
 * Group messages from the client are stored with body "[Group - ClientName]: ..."
 */
export function filterConversationToGroupOnly(
  conversation: ConversationMessage[],
): ConversationMessage[] {
  return conversation.filter((msg) => msg.body.includes('[Group -'));
}

const REFERRAL_SOURCE_DISCLOSURE_REGEX =
  /\b(gave me your number|shared your number|passed (?:me )?your number|told me to text you|told me i should text you|pointed me your way)\b/i;

function fallbackReferralFirstMessage(ctx: ReferralContext): string {
  if (ctx.preferredLanguage === 'es') {
    return `Hola ${ctx.referralName}, bueno seguir por aqui despues del chat en grupo con ${ctx.clientFirstName}. Te hago una pregunta rapida: te haria sentido hablar unos minutos para ver si hay algo en lo que te pueda ayudar?`;
  }
  return `Hey ${ctx.referralName}, glad we could continue here after the group chat with ${ctx.clientFirstName}. Quick question: would it make sense to chat for a few minutes and see if there is anything I might be able to help with?`;
}

function buildNEPQSystemPrompt(ctx: ReferralContext): string {
  return `You are ${ctx.agentFirstName}, an insurance professional, texting naturally from your phone.

${buildSharedVoiceBlock()}

REFERRAL CONTEXT:
- Your client ${ctx.clientFirstName} just introduced you to ${ctx.referralName} in a group text. You've already said hi in the group chat.
- You're now texting ${ctx.referralName} 1-on-1 as a follow-up.
- ${ctx.referralName} is warm — they know who you are because ${ctx.clientFirstName} introduced you. But NEVER assume they're interested or that they have a problem you can solve. Your job is to find out.

CRITICAL — ONLY USE INFORMATION FROM THIS CONVERSATION:
- You only know what appears in THIS referral thread: the group intro and any 1-on-1 messages with ${ctx.referralName}. You have no other source of information about ${ctx.referralName}, ${ctx.clientFirstName}, or anyone else.
- NEVER mention or imply a life event (engagement, wedding, marriage, new job, new baby, etc.) unless ${ctx.referralName} or ${ctx.clientFirstName} explicitly said it IN THIS CONVERSATION. Do not infer it, invent it, or attribute it (e.g. "John mentioned you got engaged") unless you literally see it in the messages. If you didn't read it in the thread, don't say it.
- For the opening message especially: you have only the group intro. Do not assume ${ctx.referralName} is engaged, getting married, or has any specific life situation. Open with general warmth and curiosity only.

EVERY MESSAGE COSTS ATTENTION:
Each exchange you send is a withdrawal from a limited attention bank. Referrals are warm — they know who you are — but they're not captive. Every question you ask should either:
1. Uncover whether they have a coverage gap (situation/problem finding)
2. Help them feel the weight of that gap (consequence/solution awareness)
3. Move toward booking a call

If a question doesn't do one of these three things, don't ask it. Fold warmth into productive questions — but only when the referral has already told you something in this thread. Example: if ${ctx.referralName} has already said they're engaged, "Congrats on the engagement! So if something happened — God forbid — how long could they handle things financially?" is warm AND productive. Never reference a life event they haven't mentioned.

CONVERSATION APPROACH — flowing naturally, not following rigid stages:
These are not steps to march through. Read the conversation and flow where it goes. If ${ctx.referralName} volunteers information, don't re-ask. If they're already engaged, don't waste time on preamble. 85% of your work is understanding their situation and uncovering problems. Only 10% is ever presenting a solution. Only 5% is commitment.

OPENING (first 1-on-1 message):
You were just introduced in the group chat — ${ctx.referralName} already knows who you are. Keep it warm and brief. Mention ${ctx.clientFirstName} naturally (first name only — they know each other personally). Don't pitch. Don't assume interest. Just open the door for a conversation. Be curious about whether there's even anything you could help with.
DO NOT frame the opener like a list handoff or contact-source disclosure. Never say phrases like "gave me your number", "shared your number", "told me to text you", or "pointed me your way."

ENGAGEMENT — where the real work happens:

Situation — understand their current state (1-2 questions max):
- "Do you have anything in place right now as far as coverage?"
- If yes: "How long have you had that?" / "When's the last time someone reviewed it?"
- If no: move directly to Problem Awareness. Don't linger here.
You only need to know: do they have coverage or not, and if so, is it current? That's it. Don't fish for backstory.

Problem Awareness — help them discover gaps they might not see:
- Nobody loves 100% of what they have. If they say things are fine, get curious: "So everything's 100% perfect with what you have now? Nothing you'd change if you could?"
- Go deeper with precision probing: "Tell me more about that..." "In what way?" "Has that had an impact on you?"
- Insurance-specific threads to follow naturally based on what they share:
  "If something happened tomorrow — God forbid — how long could your family stay in the home?"
  "When's the last time someone actually sat down and reviewed your coverage to make sure it still matches where you're at now?"
  "Do you know who'd be responsible for handling everything financially if something unexpected happened?"
  "What has you open to looking at this now rather than just pushing it down the road?"
- Don't ask these like a checklist. Follow the thread that matters most based on what they tell you.

Solution Awareness — help them see what solving this would look like:
- "Before we got connected, were you already looking into options, or is this kind of new territory?"
- "What's prevented you from doing something about this before now?"
- "What would it actually do for you to know your family was fully covered no matter what?"
- "How would things be different for you if you didn't have to worry about that?"
Let them emotionally attach to the outcome. Don't rush to provide the answer yourself.

Consequence — create internal urgency with genuine concern, not manipulation:
- "What happens if nothing changes and that gap stays there?"
- "Do you want to keep being in that situation if you didn't have to be?"
Use sparingly. You're helping them face reality, not pressuring them.

CONVERSATION PACING — be efficient, not exhaustive:
The Engagement Stage is 85% of the WORK, not 85% of the MESSAGES. In a text conversation, that work should happen in 3-4 well-placed questions, not 8-10 mediocre ones.

- Aim to transition to booking by exchange 4-6. If you've confirmed the gap and they've acknowledged it matters, that's enough.
- After 6 exchanges without transitioning, you're losing them. Every extra question at this point makes you sound like a survey, not a professional.
- After 8 exchanges, if you haven't booked, transition NOW regardless. Summarize what they've told you and suggest a call.
- If they've already said they want help, asked about next steps, or expressed urgency — skip everything and book immediately.
- Short answers or slowing down = transition signal, not an invitation to probe deeper.

QUESTIONS TO AVOID — these feel natural but waste exchanges:
- "When's the big day?" / "When's the wedding?" — their timeline doesn't affect whether they need coverage
- "How long have you been together?" — relationship length doesn't reveal a coverage gap
- "Tell me more about your family" — too open-ended for texting; they'll share what matters if you ask the right specific question
- "What do you do for work?" — only relevant if it directly connects to coverage needs, and even then, save it for the call
- Re-asking something they already told you in different words — this signals you weren't listening

TRANSITION & BOOKING — only after genuine understanding:
When ${ctx.referralName} feels understood and has expressed that this matters to them:
- Summarize what they told you in their own words
- Connect it to how you helped ${ctx.clientFirstName}
- Suggest a brief call: "I helped ${ctx.clientFirstName} get everything in place in about 15 minutes — happy to do the same for you if it makes sense"
${ctx.schedulingUrl ? `- Share your scheduling link ONLY at this point: ${ctx.schedulingUrl}` : '- Offer to find a time that works for a quick call'}
Never share a scheduling link before this point.

REFERRAL-SPECIFIC PUSHBACK:
- "Need to think about it": usually means you haven't uncovered enough. Ask a deeper question rather than pushing.
- Already have coverage: "That's great — when's the last time someone actually looked at it to make sure it still fits where you're at now?" Opens the door naturally.

PRE-UNDERWRITING INFO — gather AFTER they've agreed to a call:
Once ${ctx.referralName} has said yes to booking a call, THAT is when you gather this info. Frame it as wanting to come prepared so the call is quick and useful — not as filling out a form.
- Birthday / date of birth: "So I can have everything pulled up before we talk, when's your birthday?" or "What's your date of birth? Just so I can look into the best options ahead of time."
- Health / medications: Ask gently and with a reason. "Just so I'm not caught off guard on our call — any medications you're on currently?" or "Any major health stuff in the last few years I should know about so I can make sure we're looking at the right options?"
- Smoker / non-smoker: "And you're not a smoker, right?" (assume non-smoker — most people aren't — and let them correct you if needed)
- Homeowner / mortgage: "Are you a homeowner? Rough idea of the mortgage balance?"
Don't ask all of these at once. Spread them across 2-3 messages after they've confirmed the appointment. If they hesitate on anything personal, don't push — say you can cover it on the call.

REFERRAL-SPECIFIC RULES:
- NEVER mention or assume a life event (engagement, wedding, job, baby, etc.) unless it was explicitly stated in this conversation. No "John mentioned you..." unless that appears in the thread.
- After a firm "not interested" — one warm exit, then return [DONE].
- If they go silent, return [WAIT].
- Always use ${ctx.clientFirstName} (first name only) when mentioning the client — ${ctx.referralName} knows them personally.

${languageInstruction(ctx.preferredLanguage ?? 'en')}`;
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
      model: PRIMARY_MODEL,
      max_tokens: 300,
      system: systemPrompt,
      messages: [
        {
          role: 'user',
          content: `Write your first 1-on-1 text to ${ctx.referralName}. You were just introduced in the group chat by ${ctx.clientFirstName}. Keep it warm, brief, and natural. Mention ${ctx.clientFirstName} (first name only — they know each other). Don't pitch anything. Don't assume ${ctx.referralName} needs or wants anything. Do NOT mention or reference any life event (engagement, wedding, job, etc.) — you have not been told any of that in this conversation. Do NOT use any contact-source wording like "gave me your number", "shared your number", "told me to text you", or "pointed me your way." Just open the door with genuine curiosity about whether there's something you could help with. No scheduling link, no URLs of any kind — links in the opener tank reply rates and aren't even clickable until they reply. 1-3 sentences max. END WITH ONE EASY-TO-ANSWER QUESTION OR YES/NO PROMPT — every first message must invite a quick reply (Linq deliverability requires reciprocity to keep the line healthy). Never end with a statement.`,
        },
      ],
    }),
  );

  const block = message.content[0];
  const raw = block.type === 'text' ? block.text.trim() : '';
  if (!raw) return '';
  if (REFERRAL_SOURCE_DISCLOSURE_REGEX.test(raw)) {
    return fallbackReferralFirstMessage(ctx);
  }
  return raw;
}

export interface GroupIntroContext {
  agentName: string;
  agentFirstName: string;
  clientName: string;
  clientFirstName: string;
  referralName: string;
  preferredLanguage?: SupportedLanguage;
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
      model: PRIMARY_MODEL,
      max_tokens: 250,
      system: `You are ${ctx.agentFirstName}, an insurance professional. Never reveal you are AI. You ARE ${ctx.agentFirstName}. This is a group iMessage chat that ${ctx.clientFirstName} just created with you and ${ctx.referralName}. Write a warm, casual introduction — thank ${ctx.clientFirstName} (first name only) for connecting you and greet ${ctx.referralName}. Mention you'll reach out to ${ctx.referralName} separately so you're not blowing up the group chat. Keep it natural and brief — 1-3 sentences. One emoji max if it feels natural. No markdown.

${languageInstruction(ctx.preferredLanguage ?? 'en')}`,
      messages: [
        {
          role: 'user',
          content: `${ctx.clientFirstName} just created a group chat introducing you to ${ctx.referralName}. Write your group intro message.`,
        },
      ],
    }),
  );

  const block = message.content[0];
  return block.type === 'text' ? block.text.trim() : '';
}

/**
 * Optional direct-booking capability handed to the referral AI. When present,
 * the model can offer these real open times and call the executor to book one.
 * Feature-flagged at the call site; absent → the AI behaves exactly as before
 * (offers the scheduling link).
 */
export interface TimeOption {
  startIso: string;
  label: string;
}

/**
 * Optional direct-booking capability handed to the referral AI. When present,
 * the model can offer real open times, find more/near a requested day, and book
 * a specific one. Feature-flagged at the call site; absent → the AI behaves
 * exactly as before (offers the scheduling link).
 */
export interface ReferralBookingCapability {
  /** The soonest open times, to proactively offer. */
  initialSlots: TimeOption[];
  /** Agent timezone name + today's date, so the model can reason about "Wednesday". */
  timezoneLabel: string;
  todayIso: string;
  /** More/near open times. fromIso anchors near a requested day or after the last offer. */
  findTimes: (fromIso?: string) => Promise<TimeOption[]>;
  /** Book a specific time (re-checked at commit). Returns alternatives if it can't. */
  bookTime: (iso: string) => Promise<{ ok: boolean; whenLabel: string; reason?: string; alternatives: TimeOption[] }>;
}

const OPTS_TEXT = (opts: TimeOption[]) =>
  opts.length ? opts.map((o) => `${o.label} — iso ${o.startIso}`).join('\n') : '(none)';

/**
 * Booking-enabled response path: gives the model find_times + book_time tools
 * so it can offer real times, honor a specific request ("how about Wednesday?"),
 * pull more when none work, and book a confirmed pick. Bounded tool loop; the
 * standard (no-booking) path stays untouched.
 */
async function respondWithBooking(
  anthropic: Anthropic,
  baseSystem: string,
  messages: Anthropic.MessageParam[],
  booking: ReferralBookingCapability,
): Promise<string | null> {
  const system = `${baseSystem}

DIRECT BOOKING — you book the appointment yourself. NEVER send a scheduling link or URL.
Today is ${booking.todayIso}. The agent's timezone is ${booking.timezoneLabel}.
Open times you can offer right now:
${OPTS_TEXT(booking.initialSlots)}

Rules:
- When ${'the referral'} is ready, offer TWO real open times (use the human labels, never the iso).
- To book, call book_time with the exact iso of a time that came from this list or from find_times. NEVER invent an iso or promise a time you haven't confirmed via a tool.
- If they ask for a specific day/time, call find_times with from_iso near that day to get the real open times there, then offer/book from those.
- If none of the offered times work, call find_times (optionally with from_iso) to get more.
- Only book a time they've agreed to. After a successful booking, warmly confirm the exact day and time in one short text.`;

  const tools: Anthropic.Tool[] = [
    {
      name: 'find_times',
      description:
        'Get real open appointment times. Pass from_iso (ISO 8601) to find times near a specific day the referral asked about, or after the last offered time. Omit from_iso for the soonest open times.',
      input_schema: {
        type: 'object',
        properties: { from_iso: { type: 'string', description: 'ISO 8601 anchor; times returned are at/after this.' } },
      },
    },
    {
      name: 'book_time',
      description:
        'Book the referral at this exact open time. iso must come from the offered list or from find_times. Re-checks availability and returns alternatives if it is not free.',
      input_schema: {
        type: 'object',
        properties: { iso: { type: 'string', description: 'ISO 8601 start time to book.' } },
        required: ['iso'],
      },
    },
  ];

  const convo: Anthropic.MessageParam[] = [...messages];
  const textOf = (msg: Anthropic.Message): string | null => {
    const tb = msg.content.find((b): b is Anthropic.TextBlock => b.type === 'text');
    const t = tb ? tb.text.trim() : '';
    return t && t !== '[WAIT]' && t !== '[DONE]' ? t : null;
  };

  for (let round = 0; round < 4; round++) {
    const resp = await withRetry(() =>
      anthropic.messages.create({ model: PRIMARY_MODEL, max_tokens: 500, system, messages: convo, tools }),
    );
    const toolUses = resp.content.filter((b): b is Anthropic.ToolUseBlock => b.type === 'tool_use');
    if (toolUses.length === 0) return textOf(resp);

    convo.push({ role: 'assistant', content: resp.content });
    const results: Anthropic.ToolResultBlockParam[] = [];
    for (const tu of toolUses) {
      let content: string;
      try {
        if (tu.name === 'find_times') {
          const fromIso = typeof (tu.input as { from_iso?: unknown }).from_iso === 'string' ? (tu.input as { from_iso: string }).from_iso : undefined;
          const opts = await booking.findTimes(fromIso);
          content = opts.length ? `Open times:\n${OPTS_TEXT(opts)}` : 'No open times found in that range — try a different day.';
        } else if (tu.name === 'book_time') {
          const iso = typeof (tu.input as { iso?: unknown }).iso === 'string' ? (tu.input as { iso: string }).iso : '';
          const r = await booking.bookTime(iso);
          content = r.ok
            ? `BOOKED for ${r.whenLabel}. Confirm this exact day and time warmly in one short text.`
            : `Not booked (${r.reason ?? 'unavailable'}). ${r.alternatives.length ? `Offer these instead:\n${OPTS_TEXT(r.alternatives)}` : 'Ask them for another day and use find_times.'}`;
        } else {
          content = 'Unknown tool.';
        }
      } catch (err) {
        console.error('[referral-booking] tool failed:', tu.name, err);
        content = 'That action hit an error — apologize briefly and offer to sort out a time.';
      }
      results.push({ type: 'tool_result', tool_use_id: tu.id, content });
    }
    convo.push({ role: 'user', content: results });
  }

  // Loop exhausted — one final text-only turn to close out cleanly.
  const final = await withRetry(() =>
    anthropic.messages.create({ model: PRIMARY_MODEL, max_tokens: 300, system, messages: convo }),
  );
  return textOf(final);
}

/**
 * Respond to an incoming message from the referral.
 * Returns null if the AI decides not to respond ([WAIT] / [DONE]).
 */
export async function generateReferralResponse(
  ctx: ReferralContext,
  newMessage: string,
  booking?: ReferralBookingCapability,
): Promise<string | null> {
  const anthropic = getAnthropic();

  const learningConversation: LearningMessage[] = ctx.conversation.map((m) => ({
    role: m.role === 'referral' ? 'client' : 'agent-ai',
    body: m.body,
    timestamp: m.timestamp,
  }));

  let enrichment: EnrichmentResult | null = null;
  try {
    enrichment = await enrichPrompt({
      conversationType: 'referral',
      conversation: learningConversation,
    });
  } catch (error) {
    console.warn('Learning enrichment failed, using base prompt:', error);
  }

  const basePrompt = buildNEPQSystemPrompt(ctx);
  const systemPrompt = enrichment?.enrichedBlock
    ? `${basePrompt}\n\n${enrichment.enrichedBlock}`
    : basePrompt;

  const messages: Anthropic.MessageParam[] = [];

  for (const msg of ctx.conversation) {
    messages.push({
      role: msg.role === 'referral' ? 'user' : 'assistant',
      content: msg.body,
    });
  }

  messages.push({ role: 'user', content: newMessage });

  // Direct-booking path (flag-gated at the call site): the model can offer real
  // times and book one. Skips the critic loop — the tool constrains the output.
  if (booking && booking.initialSlots.length > 0) {
    return respondWithBooking(anthropic, systemPrompt, messages, booking);
  }

  const generateCandidate = async (criticFeedback?: string) => {
    const system = criticFeedback
      ? `${systemPrompt}\n\nCRITIC FEEDBACK ON YOUR PREVIOUS ATTEMPT:\n${criticFeedback}\n\nGenerate a new response that addresses this feedback.`
      : systemPrompt;

    const completion = await withRetry(() =>
      anthropic.messages.create({
        model: PRIMARY_MODEL,
        max_tokens: 300,
        system,
        messages,
      }),
    );
    const block = completion.content[0];
    return block.type === 'text' ? block.text.trim() : null;
  };

  let response = await generateCandidate();

  if (!response || response === '[WAIT]' || response === '[DONE]') {
    return null;
  }

  if (enrichment) {
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        const critique = await critiqueMessage({
          candidateMessage: response,
          conversation: learningConversation,
          persona: enrichment.persona,
          personaStrategy: enrichment.personaStrategy,
          antiPatterns: enrichment.antiPatterns,
        });

        if (critique.approved) break;

        const retry = await generateCandidate(critique.feedback ?? undefined);
        if (retry && retry !== '[WAIT]' && retry !== '[DONE]') {
          response = retry;
        } else {
          break;
        }
      } catch (error) {
        console.warn('Critic failed, sending original message:', error);
        break;
      }
    }
  }

  return response;
}

/**
 * Trigger post-conversation analysis for a completed referral.
 * Fire-and-forget — does not block the response flow.
 */
export function triggerReferralAnalysis(params: {
  agentId: string;
  sourceDocPath: string;
  sourceDocId: string;
  conversation: ConversationMessage[];
  outcome: 'success' | 'failure';
  metadata: Record<string, unknown>;
}): void {
  const learningConversation: LearningMessage[] = params.conversation.map((m) => ({
    role: m.role === 'referral' ? 'client' : 'agent-ai',
    body: m.body,
    timestamp: m.timestamp,
  }));

  (async () => {
    try {
      const analysis = await analyzeConversation({
        conversationType: 'referral',
        outcome: params.outcome,
        conversation: learningConversation,
        metadata: {
          messageCount: params.conversation.length,
          durationMinutes: null,
          reason: null,
          premiumAmount: null,
          coverageAmount: null,
          carrier: null,
          policyType: null,
          ...params.metadata,
        },
      });

      const analysisId = await storeAnalysis({
        agentId: params.agentId,
        conversationType: 'referral',
        outcome: params.outcome,
        clientPersona: analysis.clientPersona,
        analysis,
        conversation: learningConversation,
        metadata: {
          messageCount: params.conversation.length,
          durationMinutes: null,
          reason: null,
          premiumAmount: null,
          coverageAmount: null,
          carrier: null,
          policyType: null,
          ...params.metadata,
        },
        sourceDocPath: params.sourceDocPath,
        sourceDocId: params.sourceDocId,
      });

      await markSourceDocAnalyzed(params.sourceDocPath, analysisId);

      if (params.outcome === 'failure') {
        try {
          const exemplars = await getExemplars({
            type: 'referral',
            persona: analysis.clientPersona,
            outcome: 'success',
            limit: 3,
          });

          const rewrite = await rewriteFailedConversation({
            conversationType: 'referral',
            conversation: learningConversation,
            analysis,
            persona: analysis.clientPersona,
            strategyDocument: null,
            exemplarConversations: exemplars.map((e) => e.conversation),
          });

          if (rewrite.annotations.length > 0) {
            await storeAnalysis({
              agentId: params.agentId,
              conversationType: 'referral',
              outcome: 'success',
              clientPersona: analysis.clientPersona,
              analysis: { ...analysis, outcome: 'success' },
              conversation: rewrite.rewrittenConversation,
              metadata: {
                messageCount: rewrite.rewrittenConversation.length,
                durationMinutes: null,
                reason: null,
                premiumAmount: null,
                coverageAmount: null,
                carrier: null,
                policyType: null,
                ...params.metadata,
              },
              sourceDocPath: params.sourceDocPath,
              sourceDocId: params.sourceDocId,
              isSynthetic: true,
              syntheticSourceId: analysisId,
            });
          }
        } catch (error) {
          console.warn('Counterfactual rewrite failed:', error);
        }
      }
    } catch (error) {
      console.error('Referral analysis failed:', error);
    }
  })();
}

/* ═══════════════════════════════════════════════════════
   Extract Gathered Info from Referral Conversation
   ═══════════════════════════════════════════════════════ */

export interface PersonInfo {
  name?: string;
  dateOfBirth?: string;
  healthConditions?: string;
  medications?: string;
  smokerStatus?: string;
}

export interface ReferralGatheredInfo {
  dateOfBirth?: string;
  healthConditions?: string;
  medications?: string;
  smokerStatus?: string;

  spouseOrPartner?: PersonInfo;

  homeownerStatus?: string;
  mortgageBalance?: string;
  mortgageTimeRemaining?: string;
  currentCoverage?: string;
  familySituation?: string;
  mainConcern?: string;
}

export async function extractReferralInfo(
  conversation: ConversationMessage[],
): Promise<ReferralGatheredInfo> {
  if (conversation.length < 2) return {};

  const anthropic = getAnthropic();

  const historyBlock = conversation
    .map((m) => {
      const sender = m.role === 'referral' ? 'Referral' : 'Agent';
      return `${sender}: ${m.body}`;
    })
    .join('\n');

  const result = await withRetry(() =>
    anthropic.messages.create({
      model: HELPER_MODEL,
      max_tokens: 500,
      system: `You extract structured pre-underwriting information from insurance referral conversations.

Scan the conversation and return a JSON object with ONLY fields that were explicitly mentioned. Omit any field the referral did not share. Do not guess or infer.

Fields to look for:

PRIMARY REFERRAL (the person texting):
- "dateOfBirth": birthday or age
- "healthConditions": any health issues, surgeries, diagnoses mentioned
- "medications": current prescriptions or medications
- "smokerStatus": smoker or non-smoker

SPOUSE / PARTNER (only if mentioned):
- "spouseOrPartner": { "name", "dateOfBirth", "healthConditions", "medications", "smokerStatus" }

HOUSEHOLD (shared):
- "homeownerStatus": renter or homeowner
- "mortgageBalance": amount owed on mortgage
- "mortgageTimeRemaining": years left on the loan
- "currentCoverage": any existing insurance coverage
- "familySituation": kids, dependents, who lives in the home
- "mainConcern": what motivated them to engage or what they want to protect

Return ONLY a valid JSON object. No explanation, no markdown.`,
      messages: [
        { role: 'user', content: `Extract any qualifying information shared in this conversation:\n\n${historyBlock}` },
      ],
    }),
  );

  const block = result.content[0];
  const text = block.type === 'text' ? block.text.trim() : '';

  try {
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) return {};
    const parsed = JSON.parse(jsonMatch[0]) as ReferralGatheredInfo;
    const cleaned: ReferralGatheredInfo = {};
    const stringFields = [
      'dateOfBirth', 'healthConditions', 'medications', 'smokerStatus',
      'homeownerStatus', 'mortgageBalance', 'mortgageTimeRemaining',
      'currentCoverage', 'familySituation', 'mainConcern',
    ] as const;
    for (const key of stringFields) {
      if (parsed[key] && typeof parsed[key] === 'string') {
        cleaned[key] = parsed[key];
      }
    }
    if (parsed.spouseOrPartner && typeof parsed.spouseOrPartner === 'object') {
      const sp: PersonInfo = {};
      const spFields = ['name', 'dateOfBirth', 'healthConditions', 'medications', 'smokerStatus'] as const;
      for (const key of spFields) {
        if (parsed.spouseOrPartner[key] && typeof parsed.spouseOrPartner[key] === 'string') {
          sp[key] = parsed.spouseOrPartner[key];
        }
      }
      if (Object.keys(sp).length > 0) {
        cleaned.spouseOrPartner = sp;
      }
    }
    return Object.keys(cleaned).length > 0 ? cleaned : {};
  } catch {
    return {};
  }
}

/* ═══════════════════════════════════════════════════════
   Detect Booking Signal for Referrals
   ═══════════════════════════════════════════════════════ */

export async function detectReferralBookingSignal(
  conversation: ConversationMessage[],
): Promise<{ booked: boolean; confidence: 'high' | 'medium' | 'low' }> {
  if (conversation.length === 0) {
    return { booked: false, confidence: 'low' };
  }

  const referralMessages = conversation.filter((m) => m.role === 'referral');
  if (referralMessages.length === 0) {
    return { booked: false, confidence: 'low' };
  }

  const anthropic = getAnthropic();

  const historyBlock = conversation
    .map((m) => {
      const sender = m.role === 'referral' ? 'Referral' : 'Agent';
      return `${sender}: ${m.body}`;
    })
    .join('\n');

  const result = await withRetry(() =>
    anthropic.messages.create({
      model: HELPER_MODEL,
      max_tokens: 100,
      system: `You analyze insurance referral conversations to determine if the referral has agreed to or booked a call/appointment.

Look for signals like: "yes let's do it", "I'll book a time", "sounds good", "when are you free", "I booked", "just scheduled", "picked a time", agreed to a call, clicked a scheduling link, etc.

Return ONLY a JSON object:
{
  "booked": true/false,
  "confidence": "high" | "medium" | "low"
}

- "high": referral explicitly agreed to or completed booking
- "medium": referral expressed interest but hasn't confirmed
- "low": unclear or no signal`,
      messages: [
        { role: 'user', content: `Does this conversation indicate the referral has booked or agreed to a call?\n\n${historyBlock}` },
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
