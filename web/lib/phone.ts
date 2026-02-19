import 'server-only';

/**
 * Normalize a US phone number to E.164 format (+1XXXXXXXXXX).
 * Handles common formats from contact pickers, Twilio webhooks,
 * and user input. Returns the original string if it can't be normalized.
 */
export function normalizePhone(raw: string): string {
  const digits = raw.replace(/[^0-9+]/g, '');

  if (digits.startsWith('+1') && digits.length === 12) {
    return digits;
  }

  if (digits.startsWith('+')) {
    return digits;
  }

  if (digits.startsWith('1') && digits.length === 11) {
    return '+' + digits;
  }

  if (digits.length === 10) {
    return '+1' + digits;
  }

  return digits;
}

/**
 * Quick check that a string looks like a valid E.164 phone number.
 */
export function isValidE164(phone: string): boolean {
  return /^\+[1-9]\d{6,14}$/.test(phone);
}
