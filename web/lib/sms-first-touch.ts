import 'server-only';

import type { SupportedLanguage } from './client-language';

const DEFAULT_CONFIRMATION_PROMPT_EN =
  'Can you help me with something real quick? Just reply with a quick thumbs up so I know this reached you.';
const DEFAULT_CONFIRMATION_PROMPT_ES =
  'Me ayudas con algo rapido? Solo responde con un pulgar arriba para saber que te llego este mensaje.';
const URL_AT_END_REGEX = /https?:\/\/[^\s]+$/i;
const ALREADY_HAS_CONFIRMATION_REGEX =
  /thumbs?\s*up|pulgar\s+arriba|confirm|received|got this|te llego|recibiste|👍/i;

export function ensureSmsFirstTouchConfirmation(
  text: string,
  language: SupportedLanguage = 'en',
): string {
  const trimmed = text.trim();
  const prompt = language === 'es' ? DEFAULT_CONFIRMATION_PROMPT_ES : DEFAULT_CONFIRMATION_PROMPT_EN;

  if (!trimmed) return prompt;
  if (ALREADY_HAS_CONFIRMATION_REGEX.test(trimmed)) {
    return trimmed;
  }
  if (URL_AT_END_REGEX.test(trimmed)) {
    return `${trimmed} ${prompt}`;
  }
  const needsPunctuation = !/[.!?]$/.test(trimmed);
  return `${trimmed}${needsPunctuation ? '.' : ''} ${prompt}`;
}
