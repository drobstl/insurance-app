import 'server-only';

import { NextRequest } from 'next/server';
import Anthropic from '@anthropic-ai/sdk';
import { getAdminAuth } from '../../../../lib/firebase-admin';
import { LEAD_FIELD_DEFS, LeadFieldKey } from '../../../../lib/lead-csv-parse';

/**
 * POST /api/leads/map-columns
 *
 * AI header mapper for the CSV/Excel lead import. The browser parser
 * (`lib/lead-csv-parse.ts`) handles predictable column names deterministically;
 * whatever it can't recognize it sends here as `{ index, header, samples }`.
 * Claude maps each leftover column onto one of our known lead fields (or
 * leaves it out) — the same intelligence the PDF extractor gets, so a weirdly
 * named vendor column ("Mtg Bal", "Uses Tobacco?") still lands in the right
 * field instead of being dropped.
 *
 * It only sees headers + a handful of sample cell values — never the full
 * list — and every field it returns is validated against LEAD_FIELD_DEFS on
 * the way out, so a malformed or hallucinated response degrades to "ignored"
 * rather than corrupting the import. Anything it can't confidently place is
 * simply left unmapped.
 */

export const runtime = 'nodejs';
export const maxDuration = 30;

const MODEL = 'claude-sonnet-4-6';

const VALID_FIELDS = new Set<string>(LEAD_FIELD_DEFS.map((d) => d.key));

let _anthropic: Anthropic | null = null;
function getAnthropic(): Anthropic {
  if (!process.env.ANTHROPIC_API_KEY) throw new Error('ANTHROPIC_API_KEY is not set');
  if (_anthropic) return _anthropic;
  _anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  return _anthropic;
}

interface InColumn {
  index: number;
  header: string;
  samples: string[];
}

const MAP_TOOL: Anthropic.Tool = {
  name: 'map_columns',
  description:
    'Map each spreadsheet column to the lead field it holds. Only map a column when you are confident from its header and sample values; OMIT any column that does not clearly correspond to one of the listed fields (leftover columns like lead id, campaign, source, agent, notes, or coverage amount should be left out). Never map two columns to the same field — pick the single best one.',
  input_schema: {
    type: 'object',
    properties: {
      mappings: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            index: { type: 'integer', description: 'The column index from the input.' },
            field: {
              type: 'string',
              enum: LEAD_FIELD_DEFS.map((d) => d.key),
              description: 'The lead field this column holds.',
            },
          },
          required: ['index', 'field'],
        },
      },
    },
    required: ['mappings'],
  },
};

function buildSystemPrompt(): string {
  const fieldLines = LEAD_FIELD_DEFS.map((d) => `- ${d.key} (${d.label}): ${d.hint}`).join('\n');
  return [
    "You map the columns of an insurance agent's lead spreadsheet onto a fixed set of lead fields.",
    'Call map_columns exactly once. For each column you are confident about, return its index and the field it holds. Leave out any column that does not clearly match a field.',
    'Judge from BOTH the header text and the sample values (e.g. a column of "Y"/"N" next to a tobacco-ish header is smokerStatus; a column of dollar amounts headed "Balance" near mortgage columns is mortgageBalance; a 2-letter code is state).',
    'Do not map two columns to the same field. If unsure, omit the column rather than guess.',
    'The available fields are:',
    fieldLines,
  ].join('\n');
}

export async function POST(req: NextRequest) {
  try {
    const authHeader = req.headers.get('authorization') || '';
    if (!authHeader.startsWith('Bearer ')) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }
    try {
      await getAdminAuth().verifyIdToken(authHeader.slice(7));
    } catch {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await req.json().catch(() => ({}));
    const rawColumns: unknown = body?.columns;
    const columns: InColumn[] = Array.isArray(rawColumns)
      ? rawColumns
          .filter((c): c is InColumn =>
            !!c &&
            typeof (c as InColumn).index === 'number' &&
            typeof (c as InColumn).header === 'string')
          .map((c) => ({
            index: c.index,
            header: String(c.header).slice(0, 120),
            samples: Array.isArray(c.samples)
              ? c.samples.slice(0, 6).map((s) => String(s).slice(0, 120))
              : [],
          }))
      : [];

    if (columns.length === 0) {
      return Response.json({ mappings: [] });
    }

    const userContent = [
      'Map these columns. Each shows its index, header, and a few sample values:',
      '',
      ...columns.map(
        (c) => `[${c.index}] "${c.header}" — samples: ${c.samples.length ? c.samples.map((s) => JSON.stringify(s)).join(', ') : '(none)'}`,
      ),
    ].join('\n');

    const res = await getAnthropic().messages.create({
      model: MODEL,
      max_tokens: 1024,
      system: buildSystemPrompt(),
      tools: [MAP_TOOL],
      tool_choice: { type: 'tool', name: 'map_columns' },
      messages: [{ role: 'user', content: userContent }],
    });

    const toolUse = res.content.find(
      (b): b is Anthropic.ToolUseBlock => b.type === 'tool_use',
    );
    const rawMappings = (toolUse?.input as { mappings?: unknown })?.mappings;

    // Validate: known field, index present in the request, each index + each
    // field used at most once (first wins). A bad response → empty mapping.
    const allowedIndices = new Set(columns.map((c) => c.index));
    const usedIndices = new Set<number>();
    const usedFields = new Set<string>();
    const mappings: Array<{ index: number; field: LeadFieldKey }> = [];
    if (Array.isArray(rawMappings)) {
      for (const m of rawMappings) {
        const index = (m as { index?: unknown })?.index;
        const field = (m as { field?: unknown })?.field;
        if (typeof index !== 'number' || typeof field !== 'string') continue;
        if (!allowedIndices.has(index) || !VALID_FIELDS.has(field)) continue;
        if (usedIndices.has(index) || usedFields.has(field)) continue;
        usedIndices.add(index);
        usedFields.add(field);
        mappings.push({ index, field: field as LeadFieldKey });
      }
    }

    return Response.json({ mappings });
  } catch (error) {
    console.error('Lead map-columns error:', error);
    // Soft-fail: the parser keeps its deterministic result when we return
    // nothing, so a mapper outage never blocks an import.
    return Response.json({ mappings: [] });
  }
}
