import 'server-only';

/**
 * Inbound opt-out / resubscribe / help intent detection.
 *
 * Spec: `docs/afl-compliance-layer-whatwhy.md` Feature 2.
 *
 * Pure function — no side effects, no async, no Firestore. Called from
 * the Linq webhook at the TOP of `handleDirectMessage` and
 * `handleGroupMessage`, BEFORE any lane routing or AI invocation.
 * Authoritative over the AI's own disengagement: anything that matches
 * here short-circuits the rest of the webhook.
 *
 * Two match scopes:
 *
 *  1. Whole-message keywords (STOP/CANCEL/UNSUBSCRIBE/QUIT/END for opt-out;
 *     START/UNSTOP/RESUME for resubscribe; HELP). Case-insensitive,
 *     trimmed, trailing punctuation tolerated. The whole-message scope
 *     is deliberate — "stop by Tuesday" must NOT trigger.
 *
 *  2. Loose natural-language opt-outs ("leave me alone", "stop texting
 *     me", "take me off", "remove me", and reasonable variants). The
 *     spec calls out loose matching as acceptable here because erring
 *     toward suppression is safe.
 *
 * "yes" is explicitly NOT a resubscribe. In a conversational thread
 * "yes" answers the AI's question, not a request to be re-added.
 */

export type OptOutKeyword = 'STOP' | 'CANCEL' | 'UNSUBSCRIBE' | 'QUIT' | 'END';
export type ResubscribeKeyword = 'START' | 'UNSTOP' | 'RESUME';

export type ComplianceIntent =
  | { type: 'opt_out_keyword'; keyword: OptOutKeyword }
  | { type: 'opt_out_natural_language'; phraseLabel: string }
  | { type: 'resubscribe'; keyword: ResubscribeKeyword }
  | { type: 'help' };

const OPT_OUT_KEYWORDS: readonly OptOutKeyword[] = ['STOP', 'CANCEL', 'UNSUBSCRIBE', 'QUIT', 'END'];
const RESUBSCRIBE_KEYWORDS: readonly ResubscribeKeyword[] = ['START', 'UNSTOP', 'RESUME'];

/**
 * Strip the trimmed text down to its keyword shape: uppercase, trailing
 * sentence punctuation removed, whitespace collapsed. Used to test
 * whole-message keyword equality without false negatives from "STOP."
 * or "STOP!!" or "stop ".
 */
function normalizeForKeyword(input: string): string {
  return input
    .trim()
    .replace(/[.!?,\s]+$/, '')
    .replace(/^[.\s]+/, '')
    .toUpperCase();
}

const NATURAL_LANGUAGE_OPT_OUT_PATTERNS: ReadonlyArray<{ pattern: RegExp; label: string }> = [
  { pattern: /\bleave me alone\b/i, label: 'leave_me_alone' },
  { pattern: /\bstop (texting|messaging|contacting|spamming|emailing|sending) me\b/i, label: 'stop_texting_me' },
  { pattern: /\bstop sending\b/i, label: 'stop_sending' },
  { pattern: /\btake me off\b/i, label: 'take_me_off' },
  { pattern: /\bremove me\b/i, label: 'remove_me' },
  { pattern: /\bdo ?n['’]?t (text|message|contact|email) me\b/i, label: 'dont_text_me' },
  { pattern: /\bdo not (text|message|contact|email) me\b/i, label: 'do_not_text_me' },
  { pattern: /\bno more (texts?|messages?|emails?)\b/i, label: 'no_more_texts' },
  { pattern: /\bunsubscribe me\b/i, label: 'unsubscribe_me' },
  { pattern: /\bquit (texting|messaging|contacting) me\b/i, label: 'quit_texting_me' },
  { pattern: /\b(please )?(opt|take) me out\b/i, label: 'opt_me_out' },
  { pattern: /\blose (my number|this number)\b/i, label: 'lose_my_number' },
];

/**
 * Detect whether an inbound message carries a compliance-relevant intent.
 * Returns null when the message looks like ordinary conversation — caller
 * proceeds with normal lane routing in that case.
 *
 * The function is deliberately conservative for resubscribe and HELP
 * (whole-message only) and deliberately liberal for opt-out (both
 * keywords AND natural-language phrases). That asymmetry is the spec:
 * over-suppression is safe; over-resubscription is not.
 */
export function detectComplianceIntent(rawText: string): ComplianceIntent | null {
  if (!rawText || typeof rawText !== 'string') return null;
  const normalized = normalizeForKeyword(rawText);

  if (!normalized) return null;

  for (const kw of OPT_OUT_KEYWORDS) {
    if (normalized === kw) {
      return { type: 'opt_out_keyword', keyword: kw };
    }
  }

  for (const kw of RESUBSCRIBE_KEYWORDS) {
    if (normalized === kw) {
      return { type: 'resubscribe', keyword: kw };
    }
  }

  if (normalized === 'HELP' || normalized === 'INFO') {
    return { type: 'help' };
  }

  for (const { pattern, label } of NATURAL_LANGUAGE_OPT_OUT_PATTERNS) {
    if (pattern.test(rawText)) {
      return { type: 'opt_out_natural_language', phraseLabel: label };
    }
  }

  return null;
}

/**
 * Canonical confirmation reply sent after the suppression layer (not the
 * carrier) catches an opt-out. Per spec: single gracious confirmation;
 * never looped.
 */
export const OPT_OUT_CONFIRMATION_REPLY =
  "You're unsubscribed. Reply START to resume.";

/**
 * Canonical confirmation reply sent after START/UNSTOP/RESUME re-enables
 * a previously suppressed number.
 */
export const RESUBSCRIBE_CONFIRMATION_REPLY =
  "You're resubscribed. Reply STOP at any time to opt out.";

/**
 * Canonical HELP reply. Identifies AFL and points at how to actually
 * reach a human agent.
 */
export const HELP_REPLY =
  'AgentForLife: this number is shared by your insurance agent. Reply STOP to opt out. Msg & data rates may apply. For account help, reach your agent directly.';
