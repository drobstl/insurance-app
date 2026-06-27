import 'server-only';

/**
 * Server-only re-export of the phone helpers. The implementations live in
 * `./phone-format` (client-safe). This module keeps the `server-only` guard
 * for the many server-side import sites that use `@/lib/phone`; client code
 * (e.g. dialer buttons) must import from `./phone-format` instead.
 */
export { normalizePhone, isValidE164 } from './phone-format';
