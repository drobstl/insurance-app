import 'server-only';

import crypto from 'crypto';

/**
 * Bunny.net Stream helpers. The browser uploads chunks directly to Bunny
 * via the TUS protocol (resumable, fully bypasses Vercel's 4.5 MB body
 * limit), so all this module does server-side is:
 *
 *   1. createVideo — register a new video on the library and get its GUID
 *   2. getUploadEndpoint — mint a signed TUS endpoint + headers for the
 *      browser to PUT/PATCH against
 *   3. getStreamUrls — derive the HLS / iframe / thumbnail URLs from the
 *      video GUID (no network call — Bunny's URL scheme is deterministic)
 *   4. deleteVideo — remove a video by GUID
 *
 * Env vars (all required):
 *   - BUNNY_STREAM_LIBRARY_ID:    numeric library id from the Bunny dashboard
 *   - BUNNY_STREAM_API_KEY:       library access key (NOT the account key)
 *   - BUNNY_STREAM_CDN_HOSTNAME:  pull-zone hostname, e.g. vz-xxxxx.b-cdn.net
 */

const BUNNY_API_BASE = 'https://video.bunnycdn.com';
const TUS_ENDPOINT = 'https://video.bunnycdn.com/tusupload';
const TUS_AUTH_TTL_SECONDS = 60 * 60 * 24; // 24 h — gives plenty of resume window for a paused upload.

function getConfig() {
  // .trim() every value: a trailing newline pasted into the Vercel env
  // (a known hazard in this project — it silently killed PostHog for
  // months, fixed the same way in #143) breaks the TUS upload in a
  // particularly sneaky way. Bunny TRIMS the AccessKey request header,
  // so createVideo still returns 200; but the TUS AuthorizationSignature
  // is sha256(libraryId + apiKey + expire + videoId), and a stray
  // newline inside that hashed string makes the signature mismatch
  // Bunny's server-side hash → every upload 401s on creation. Trimming
  // here makes the whole pipeline immune regardless of what's in Vercel.
  const libraryId = process.env.BUNNY_STREAM_LIBRARY_ID?.trim();
  const apiKey = process.env.BUNNY_STREAM_API_KEY?.trim();
  const cdnHostname = process.env.BUNNY_STREAM_CDN_HOSTNAME?.trim();
  if (!libraryId || !apiKey || !cdnHostname) {
    throw new Error(
      'Bunny Stream is not configured: set BUNNY_STREAM_LIBRARY_ID, BUNNY_STREAM_API_KEY, BUNNY_STREAM_CDN_HOSTNAME.',
    );
  }
  return { libraryId, apiKey, cdnHostname };
}

export async function createVideo(params: { title: string }): Promise<{ videoId: string }> {
  const { libraryId, apiKey } = getConfig();
  const res = await fetch(`${BUNNY_API_BASE}/library/${libraryId}/videos`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Accept': 'application/json',
      'AccessKey': apiKey,
    },
    body: JSON.stringify({ title: (params.title || 'Untitled').slice(0, 200) }),
  });
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`Bunny createVideo failed (${res.status}): ${body}`);
  }
  const data = (await res.json().catch(() => ({}))) as { guid?: string };
  if (!data.guid) throw new Error('Bunny createVideo: response missing "guid"');
  return { videoId: data.guid };
}

export interface BunnyUploadHandshake {
  uploadUrl: string;
  headers: {
    AuthorizationSignature: string;
    AuthorizationExpire: string;
    VideoId: string;
    LibraryId: string;
  };
}

export function getUploadEndpoint(videoId: string): BunnyUploadHandshake {
  const { libraryId, apiKey } = getConfig();
  const expire = Math.floor(Date.now() / 1000) + TUS_AUTH_TTL_SECONDS;
  // Bunny TUS signature spec: sha256(libraryId + apiKey + expire + videoGuid)
  const signature = crypto
    .createHash('sha256')
    .update(`${libraryId}${apiKey}${expire}${videoId}`)
    .digest('hex');
  return {
    uploadUrl: TUS_ENDPOINT,
    headers: {
      AuthorizationSignature: signature,
      AuthorizationExpire: String(expire),
      VideoId: videoId,
      LibraryId: String(libraryId),
    },
  };
}

export interface BunnyStreamUrls {
  hlsUrl: string;
  iframeUrl: string;
  thumbnailUrl: string;
}

export function getStreamUrls(videoId: string): BunnyStreamUrls {
  const { libraryId, cdnHostname } = getConfig();
  return {
    hlsUrl: `https://${cdnHostname}/${videoId}/playlist.m3u8`,
    iframeUrl: `https://iframe.mediadelivery.net/embed/${libraryId}/${videoId}`,
    thumbnailUrl: `https://${cdnHostname}/${videoId}/thumbnail.jpg`,
  };
}

export async function deleteVideo(videoId: string): Promise<void> {
  const { libraryId, apiKey } = getConfig();
  const res = await fetch(`${BUNNY_API_BASE}/library/${libraryId}/videos/${videoId}`, {
    method: 'DELETE',
    headers: { 'AccessKey': apiKey, 'Accept': 'application/json' },
  });
  if (!res.ok && res.status !== 404) {
    const body = await res.text().catch(() => '');
    throw new Error(`Bunny deleteVideo failed (${res.status}): ${body}`);
  }
}
