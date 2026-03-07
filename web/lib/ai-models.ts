// Pricing reference (per million tokens):
// claude-opus-4-20250514:    $15 input / $75 output (LEGACY — 5x more expensive)
// claude-sonnet-4-6:         $3 input / $15 output  (CURRENT — best value for SMS-length output)
// claude-opus-4-6:           $5 input / $25 output   (fallback if Sonnet quality isn't sufficient)
// claude-haiku-4-5-20251001: $1 input / $5 output    (budget option — test before using)

export const PRIMARY_MODEL = 'claude-sonnet-4-6';

export const HELPER_MODEL = 'claude-sonnet-4-6';

// Previous models (keep for reference)
// export const LEGACY_PRIMARY = 'claude-opus-4-20250514';
// export const LEGACY_HELPER = 'claude-sonnet-4-20250514';
