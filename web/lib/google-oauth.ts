import 'server-only';

import { OAuth2Client } from 'google-auth-library';

export const GOOGLE_OAUTH_CLIENT_ID =
  '527695351928-3mkhjhni5spi4rd28n1cj617o4vm06cl.apps.googleusercontent.com';
export const GOOGLE_DRIVE_SCOPE = 'https://www.googleapis.com/auth/drive.readonly';

/** Shown when Google rejects a refresh token (revoked, expired, or app credentials changed). */
export const GOOGLE_DRIVE_RECONNECT_USER_MESSAGE =
  'Your Google Drive connection expired or was revoked. Click “Connect Google Drive” again to sign in.';

export class GoogleDriveReconnectRequiredError extends Error {
  constructor() {
    super('GoogleDriveReconnectRequiredError');
    this.name = 'GoogleDriveReconnectRequiredError';
  }
}

export function isGoogleInvalidGrantError(error: unknown): boolean {
  if (error && typeof error === 'object' && 'response' in error) {
    const data = (error as { response?: { data?: { error?: string } } }).response?.data;
    if (data?.error === 'invalid_grant') return true;
  }
  const msg = error instanceof Error ? error.message : String(error);
  return msg.toLowerCase().includes('invalid_grant');
}

function getGoogleOAuthClientSecret(): string {
  const secret = process.env.GOOGLE_OAUTH_CLIENT_SECRET || '';
  if (!secret.trim()) {
    throw new Error('GOOGLE_OAUTH_CLIENT_SECRET is not configured.');
  }
  return secret;
}

export function createGoogleOAuthClient(redirectUri: string): OAuth2Client {
  return new OAuth2Client({
    clientId: GOOGLE_OAUTH_CLIENT_ID,
    clientSecret: getGoogleOAuthClientSecret(),
    redirectUri,
  });
}

export function buildGoogleConsentUrl(params: {
  redirectUri: string;
  state: string;
}): string {
  const client = createGoogleOAuthClient(params.redirectUri);
  return client.generateAuthUrl({
    access_type: 'offline',
    prompt: 'consent',
    scope: [GOOGLE_DRIVE_SCOPE],
    include_granted_scopes: true,
    state: params.state,
  });
}

export async function exchangeGoogleCodeForTokens(params: {
  code: string;
  redirectUri: string;
}): Promise<{
  accessToken?: string;
  refreshToken?: string;
  expiryDateMs?: number;
  scope?: string;
  tokenType?: string;
  idToken?: string;
}> {
  const client = createGoogleOAuthClient(params.redirectUri);
  const { tokens } = await client.getToken(params.code);
  return {
    accessToken: tokens.access_token ?? undefined,
    refreshToken: tokens.refresh_token ?? undefined,
    expiryDateMs: typeof tokens.expiry_date === 'number' ? tokens.expiry_date : undefined,
    scope: tokens.scope ?? undefined,
    tokenType: tokens.token_type ?? undefined,
    idToken: tokens.id_token ?? undefined,
  };
}

export async function refreshGoogleAccessToken(params: {
  refreshToken: string;
  redirectUri: string;
}): Promise<{
  accessToken?: string;
  refreshToken?: string;
  expiryDateMs?: number;
  scope?: string;
  tokenType?: string;
}> {
  const client = createGoogleOAuthClient(params.redirectUri);
  client.setCredentials({ refresh_token: params.refreshToken });

  const refreshed = await client.refreshAccessToken();
  const tokens = refreshed.credentials;
  return {
    accessToken: tokens.access_token ?? undefined,
    refreshToken: tokens.refresh_token ?? undefined,
    expiryDateMs: typeof tokens.expiry_date === 'number' ? tokens.expiry_date : undefined,
    scope: tokens.scope ?? undefined,
    tokenType: tokens.token_type ?? undefined,
  };
}
