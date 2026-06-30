import 'server-only';

import { NextRequest } from 'next/server';
import Anthropic from '@anthropic-ai/sdk';
import { getAdminAuth } from '../../../../lib/firebase-admin';
import {
  coerceLeadFilters,
  EMPTY_LEAD_FILTERS,
  LEAD_STATUS_OPTIONS,
  LEAD_TEMPERATURE_OPTIONS,
  LEAD_DIAL_OUTCOME_OPTIONS,
} from '../../../../lib/lead-filters';

/**
 * Natural-language → LeadFilters translator.
 *
 * The agent types a sentence ("80+ leads in Texas I haven't called in a
 * month"); Claude compiles it into the SAME structured LeadFilters the manual
 * filter bar produces. It never reads the agent's leads — it only maps words to
 * known filter fields — so it can't fabricate a result. Whatever it returns is
 * run through coerceLeadFilters on the way out, so a malformed response
 * degrades to a safe partial filter rather than breaking the page. Anything it
 * can't map to a field comes back as `searchQuery` (plain keyword search).
 */

const MODEL = 'claude-sonnet-4-6';

let _anthropic: Anthropic | null = null;
function getAnthropic(): Anthropic {
  if (!process.env.ANTHROPIC_API_KEY) throw new Error('ANTHROPIC_API_KEY is not set');
  if (_anthropic) return _anthropic;
  _anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  return _anthropic;
}

const FILTER_TOOL: Anthropic.Tool = {
  name: 'set_lead_filters',
  description:
    'Apply a structured filter to the agent\'s lead list based on what they typed. Only set fields the agent clearly asked for; leave everything else empty/null. Put any leftover free text that is not a structured filter (a name, phone fragment, lead code, email) into searchQuery.',
  input_schema: {
    type: 'object',
    properties: {
      filters: {
        type: 'object',
        properties: {
          statuses: {
            type: 'array',
            items: { type: 'string', enum: LEAD_STATUS_OPTIONS.map((o) => o.key) },
            description: 'Pipeline status. Matches ANY selected.',
          },
          tagIds: {
            type: 'array',
            items: { type: 'string' },
            description: 'Tag IDs (from the provided tag list only — never invent one). Lead must have ALL.',
          },
          states: {
            type: 'array',
            items: { type: 'string' },
            description: '2-letter USPS state codes (e.g. TX, FL). Matches ANY selected.',
          },
          city: { type: ['string', 'null'], description: 'City name substring.' },
          dateFrom: { type: ['string', 'null'], description: 'Lead added on/after this date, YYYY-MM-DD.' },
          dateTo: { type: ['string', 'null'], description: 'Lead added on/before this date, YYYY-MM-DD.' },
          followUpDue: { type: 'boolean', description: 'Has a follow-up due now.' },
          hasFollowUp: { type: 'boolean', description: 'Has any follow-up scheduled.' },
          temperatures: {
            type: 'array',
            items: { type: 'string', enum: LEAD_TEMPERATURE_OPTIONS.map((o) => o.key) },
            description: 'Lead temperature. Matches ANY selected.',
          },
          dialOutcomes: {
            type: 'array',
            items: { type: 'string', enum: LEAD_DIAL_OUTCOME_OPTIONS.map((o) => o.key) },
            description: 'Most-recent dial outcome. Matches ANY selected.',
          },
          ageMin: { type: ['number', 'null'], description: 'Minimum age in years.' },
          ageMax: { type: ['number', 'null'], description: 'Maximum age in years.' },
          creditEligible: {
            type: 'boolean',
            description: 'Lead is 80+ and eligible for a Symmetry lead credit.',
          },
          appDownloaded: { type: ['string', 'null'], enum: ['yes', 'no', null], description: 'Downloaded the app.' },
          assessmentCompleted: { type: ['string', 'null'], enum: ['yes', 'no', null], description: 'Finished the assessment.' },
          introSent: { type: ['string', 'null'], enum: ['yes', 'no', null], description: 'Intro text was sent.' },
          notContactedDays: { type: ['number', 'null'], description: 'Not called within the last N days (includes never-called).' },
          contactedWithinDays: { type: ['number', 'null'], description: 'Called within the last N days.' },
          neverContacted: { type: 'boolean', description: 'Never dialed at all.' },
          smoker: { type: ['string', 'null'], enum: ['Y', 'N', null], description: 'Smoker (Y) or non-smoker (N).' },
          gender: { type: ['string', 'null'], enum: ['M', 'F', null], description: 'Gender.' },
          hasMortgage: { type: 'boolean', description: 'Has a mortgage payment on file.' },
        },
      },
      searchQuery: {
        type: 'string',
        description: 'Leftover free text to keyword-search (names, phone fragments, lead codes). Empty if everything mapped to a filter.',
      },
    },
    required: ['filters', 'searchQuery'],
  },
};

function todayISO(): string {
  return new Date().toISOString().slice(0, 10);
}

export async function POST(req: NextRequest) {
  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader?.startsWith('Bearer ')) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }
    await getAdminAuth().verifyIdToken(authHeader.split('Bearer ')[1]);

    const body = await req.json();
    const query: string = typeof body.query === 'string' ? body.query.trim() : '';
    const tags: { id: string; label: string }[] = Array.isArray(body.tags)
      ? body.tags.filter((t: unknown): t is { id: string; label: string } =>
          !!t && typeof (t as { id?: unknown }).id === 'string' && typeof (t as { label?: unknown }).label === 'string',
        )
      : [];
    const states: string[] = Array.isArray(body.states)
      ? body.states.filter((s: unknown): s is string => typeof s === 'string')
      : [];

    if (!query) {
      return Response.json({ filters: EMPTY_LEAD_FILTERS, searchQuery: '' });
    }

    const tagList = tags.length
      ? tags.map((t) => `- "${t.label}" → id ${t.id}`).join('\n')
      : '(none)';
    const stateList = states.length ? states.join(', ') : '(none on file)';

    const system = [
      "You translate an insurance agent's natural-language request into a structured filter over their lead list.",
      'Call set_lead_filters exactly once. Only set fields the agent clearly asked for; leave the rest empty or null.',
      `Today is ${todayISO()}. Resolve relative dates ("this month", "last week", "since June") to absolute YYYY-MM-DD ranges.`,
      'Map tag names to IDs using ONLY this list (never invent an ID); if a referenced tag is not here, fold the word into searchQuery instead:',
      tagList,
      `States present in this agent's leads: ${stateList}. Use 2-letter codes.`,
      'Notes: "lead credit" / "80 plus" → creditEligible. "haven\'t called / not called in N days" → notContactedDays. "never called" → neverContacted. "hot/warm/cool" → temperatures. Names, phone fragments, or lead codes go in searchQuery, not a filter.',
    ].join('\n');

    const res = await getAnthropic().messages.create({
      model: MODEL,
      max_tokens: 1024,
      system,
      tools: [FILTER_TOOL],
      tool_choice: { type: 'tool', name: 'set_lead_filters' },
      messages: [{ role: 'user', content: query }],
    });

    const toolUse = res.content.find(
      (b): b is Anthropic.ToolUseBlock => b.type === 'tool_use',
    );
    const raw = (toolUse?.input ?? {}) as { filters?: unknown; searchQuery?: unknown };

    return Response.json({
      filters: coerceLeadFilters(raw.filters),
      searchQuery: typeof raw.searchQuery === 'string' ? raw.searchQuery : '',
    });
  } catch (error) {
    console.error('Lead search-translate error:', error);
    return Response.json({ error: 'Internal server error' }, { status: 500 });
  }
}
