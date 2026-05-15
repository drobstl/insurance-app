/**
 * Single source of truth for the AFL backend base URL.
 *
 * Production builds always hit `https://agentforlife.app`.
 *
 * Dev builds default to the LAN IP on port 3000 (the canonical local
 * dev server convention — `cd web && npm run dev`). To test against an
 * alternate dev server (e.g. a worktree running on a different port),
 * temporarily change `DEV_API_BASE` here. This is the ONLY place the
 * dev URL is wired, so reverting is one line.
 *
 * If we ever want this driven by an env var (`expo-constants` extras
 * → `app.config.ts`), this is the place to wire it.
 */

const DEV_API_BASE = 'http://192.168.40.133:3001';
const PROD_API_BASE = 'https://agentforlife.app';

export const API_BASE = __DEV__ ? DEV_API_BASE : PROD_API_BASE;
