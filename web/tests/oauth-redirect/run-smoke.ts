#!/usr/bin/env npx tsx
/**
 * Smoke test for the canonical-origin OAuth redirect helper.
 *
 * Guards the class of `redirect_uri_mismatch` sign-in failures this helper
 * exists to prevent. Every emitted callback URL must be one of the four
 * "Authorized redirect URIs" registered on the Google Cloud OAuth client:
 *
 *   prod drive     https://agentforlife.app/api/integrations/google/callback
 *   prod calendar  https://agentforlife.app/api/integrations/google-calendar/callback
 *   local drive    http://localhost:3000/api/integrations/google/callback
 *   local calendar http://localhost:3001/api/integrations/google-calendar/callback
 *
 * Run: npm run test:oauth-redirect
 */
import assert from 'node:assert/strict';
import {
  CANONICAL_APP_ORIGIN,
  GOOGLE_CALENDAR_CALLBACK_PATH,
  GOOGLE_DRIVE_CALLBACK_PATH,
  buildGoogleCallbackUrl,
  resolveCanonicalOrigin,
} from '../../lib/oauth-redirect';

/** Run `fn` with NEXT_PUBLIC_APP_URL forced to `value` (undefined = unset). */
function withEnv(value: string | undefined, fn: () => void): void {
  const prev = process.env.NEXT_PUBLIC_APP_URL;
  if (value === undefined) {
    delete process.env.NEXT_PUBLIC_APP_URL;
  } else {
    process.env.NEXT_PUBLIC_APP_URL = value;
  }
  try {
    fn();
  } finally {
    if (prev === undefined) {
      delete process.env.NEXT_PUBLIC_APP_URL;
    } else {
      process.env.NEXT_PUBLIC_APP_URL = prev;
    }
  }
}

// The exact set of URIs registered on the OAuth client. The helper must NEVER
// emit anything outside this set for a prod-like or local-like environment.
const REGISTERED_URIS = new Set([
  'https://agentforlife.app/api/integrations/google/callback',
  'https://agentforlife.app/api/integrations/google-calendar/callback',
  'http://localhost:3000/api/integrations/google/callback',
  'http://localhost:3001/api/integrations/google-calendar/callback',
]);

function run(): void {
  // ── Group A: local dev keeps localhost EVEN THOUGH .env.local pins the prod
  // URL. This is the regression guard for the env-first ordering trap. ──
  withEnv('https://agentforlife.app', () => {
    assert.equal(
      buildGoogleCallbackUrl('http://localhost:3000/api/integrations/google/auth', GOOGLE_DRIVE_CALLBACK_PATH),
      'http://localhost:3000/api/integrations/google/callback',
      'local drive must stay on localhost:3000 even when NEXT_PUBLIC_APP_URL is the prod URL',
    );
    assert.equal(
      buildGoogleCallbackUrl('http://localhost:3001/api/integrations/google-calendar/auth', GOOGLE_CALENDAR_CALLBACK_PATH),
      'http://localhost:3001/api/integrations/google-calendar/callback',
      'local calendar must stay on localhost:3001 (note the different port)',
    );
    assert.equal(
      resolveCanonicalOrigin('http://127.0.0.1:3000/whatever'),
      'http://127.0.0.1:3000',
      '127.0.0.1 is treated as localhost',
    );
  });

  // ── Group B: non-canonical prod hosts collapse onto the canonical origin. ──
  withEnv('https://agentforlife.app', () => {
    for (const host of [
      'https://agentforlife.app',
      'https://www.agentforlife.app',
      'https://web-git-feature-xyz.vercel.app',
      'https://insurance-app-abc123.vercel.app',
    ]) {
      assert.equal(
        buildGoogleCallbackUrl(`${host}/api/integrations/google/auth`, GOOGLE_DRIVE_CALLBACK_PATH),
        'https://agentforlife.app/api/integrations/google/callback',
        `drive on ${host} must collapse to the canonical callback`,
      );
      assert.equal(
        buildGoogleCallbackUrl(`${host}/api/integrations/google-calendar/auth`, GOOGLE_CALENDAR_CALLBACK_PATH),
        'https://agentforlife.app/api/integrations/google-calendar/callback',
        `calendar on ${host} must collapse to the canonical callback`,
      );
    }
  });

  // ── Group C: env var wins over the hard-coded fallback (non-localhost). ──
  withEnv('https://staging.agentforlife.app', () => {
    assert.equal(
      resolveCanonicalOrigin('https://www.agentforlife.app/api/integrations/google/auth'),
      'https://staging.agentforlife.app',
      'NEXT_PUBLIC_APP_URL wins over both the request origin and the hard-coded fallback',
    );
  });

  // ── Group D: env unset → hard-coded canonical fallback. ──
  withEnv(undefined, () => {
    assert.equal(
      resolveCanonicalOrigin('https://www.agentforlife.app/x'),
      CANONICAL_APP_ORIGIN,
      'with NEXT_PUBLIC_APP_URL unset, a non-localhost host falls back to canonical',
    );
    assert.equal(CANONICAL_APP_ORIGIN, 'https://agentforlife.app', 'canonical fallback is the apex domain');
  });

  // ── Group E: byte-identical at auth time and token-exchange time, even when
  // the two requests arrive on different hosts (the code-exchange requirement). ──
  withEnv('https://agentforlife.app', () => {
    const authTime = buildGoogleCallbackUrl(
      'https://www.agentforlife.app/api/integrations/google/auth', // user hit www
      GOOGLE_DRIVE_CALLBACK_PATH,
    );
    const exchangeTime = buildGoogleCallbackUrl(
      'https://agentforlife.app/api/integrations/google/callback', // Google redirected to apex
      GOOGLE_DRIVE_CALLBACK_PATH,
    );
    assert.equal(authTime, exchangeTime, 'auth-time and exchange-time redirect_uri must be byte-identical');
    assert.equal(authTime, 'https://agentforlife.app/api/integrations/google/callback');
  });

  // ── Group F: NEXT_PUBLIC_APP_URL is normalized to its origin (trailing
  // slash / path / casing stripped) so it can never emit an unregistered URI. ──
  for (const messy of ['https://agentforlife.app/', 'https://agentforlife.app/some/path', 'HTTPS://AgentForLife.app']) {
    withEnv(messy, () => {
      assert.equal(
        buildGoogleCallbackUrl('https://www.agentforlife.app/api/integrations/google/auth', GOOGLE_DRIVE_CALLBACK_PATH),
        'https://agentforlife.app/api/integrations/google/callback',
        `messy env value "${messy}" must normalize to the canonical origin`,
      );
    });
  }

  // ── Group G: malformed / empty request URLs degrade safely (never localhost,
  // never a throw). ──
  withEnv(undefined, () => {
    assert.equal(
      buildGoogleCallbackUrl('not-a-valid-url', GOOGLE_DRIVE_CALLBACK_PATH),
      'https://agentforlife.app/api/integrations/google/callback',
      'unparseable request URL falls back to canonical, does not throw',
    );
    assert.equal(buildGoogleCallbackUrl('', GOOGLE_CALENDAR_CALLBACK_PATH), 'https://agentforlife.app/api/integrations/google-calendar/callback');
  });

  // ── Group H: the two flow paths are distinct and correctly suffixed. ──
  assert.notEqual(GOOGLE_DRIVE_CALLBACK_PATH, GOOGLE_CALENDAR_CALLBACK_PATH, 'drive and calendar paths differ');
  withEnv('https://agentforlife.app', () => {
    assert.ok(
      buildGoogleCallbackUrl('https://agentforlife.app/x', GOOGLE_DRIVE_CALLBACK_PATH).endsWith('/api/integrations/google/callback'),
    );
    assert.ok(
      buildGoogleCallbackUrl('https://agentforlife.app/x', GOOGLE_CALENDAR_CALLBACK_PATH).endsWith('/api/integrations/google-calendar/callback'),
    );
  });

  // ── Cross-cutting: across a representative matrix, only ever emit a
  // REGISTERED redirect URI (constraint #3). ──
  for (const env of ['https://agentforlife.app', undefined]) {
    withEnv(env, () => {
      const cases: Array<[string, string]> = [
        ['https://agentforlife.app/api/integrations/google/auth', GOOGLE_DRIVE_CALLBACK_PATH],
        ['https://www.agentforlife.app/api/integrations/google/auth', GOOGLE_DRIVE_CALLBACK_PATH],
        ['https://preview-xyz.vercel.app/api/integrations/google-calendar/auth', GOOGLE_CALENDAR_CALLBACK_PATH],
        ['http://localhost:3000/api/integrations/google/auth', GOOGLE_DRIVE_CALLBACK_PATH],
        ['http://localhost:3001/api/integrations/google-calendar/auth', GOOGLE_CALENDAR_CALLBACK_PATH],
        // NOTE: 127.0.0.1 is intentionally excluded — the registered local URIs
        // use `localhost`, and Google treats the two hosts as distinct. The
        // helper honestly preserves 127.0.0.1 (see Group A); dev must use localhost.
      ];
      for (const [reqUrl, path] of cases) {
        const emitted = buildGoogleCallbackUrl(reqUrl, path);
        assert.ok(
          REGISTERED_URIS.has(emitted),
          `emitted "${emitted}" (env=${String(env)}, req=${reqUrl}) is NOT a registered redirect URI`,
        );
      }
    });
  }

  console.log('[oauth-redirect-smoke] passed');
}

run();
