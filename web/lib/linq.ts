import 'server-only';

import crypto from 'crypto';
import { normalizePhone } from './phone';

const LINQ_BASE_URL = 'https://api.linqapp.com/api/partner/v3';
const DEFAULT_MIN_SEND_INTERVAL_MS = 1000;
const URL_REGEX = /\bhttps?:\/\/[^\s]+/gi;
const TRAILING_URL_PUNCTUATION_REGEX = /[).,!?:;]+$/;

// ---------------------------------------------------------------------------
// Outbound kill switch
// ---------------------------------------------------------------------------
//
// Setting `LINQ_OUTBOUND_DISABLED=true` halts every outbound call into Linq's
// API at the lib layer. Send-side functions (createChat, sendMessage,
// sendOrCreateChat, uploadAttachment, shareContactCard) log a structured
// `[linq:outbound-skipped]` event and throw `LinqOutboundDisabledError`.
//
// Every existing caller wraps these calls in try/catch and treats failure as
// "skip and move on" (cron logs error and returns null; webhook handler rolls
// back the activation claim; UI routes return 500). This means the platform
// degrades gracefully — no bad chatIds get persisted, and flipping the env
// var back to `false` (or unsetting) restores normal operation immediately.
//
// Inbound webhook handling, signature verification, and typing indicators
// are intentionally NOT gated — they don't generate SMS traffic on the line.
//
// Use case: temporarily protect Linq pooled-line deliverability while
// upstream messaging architecture is being redesigned.
export class LinqOutboundDisabledError extends Error {
  constructor(fn: string) {
    super(`Linq outbound disabled (LINQ_OUTBOUND_DISABLED=true); skipped ${fn}.`);
    this.name = 'LinqOutboundDisabledError';
  }
}

function isLinqOutboundDisabled(): boolean {
  return process.env.LINQ_OUTBOUND_DISABLED === 'true';
}

function logLinqOutboundSkipped(context: {
  fn: string;
  to?: string | string[];
  chatId?: string;
  textLength?: number;
  hasMedia?: boolean;
  filename?: string;
}): void {
  console.warn('[linq:outbound-skipped]', JSON.stringify(context));
}

function getMinSendIntervalMs(): number {
  const raw = process.env.LINQ_MIN_SEND_INTERVAL_MS;
  if (!raw) return DEFAULT_MIN_SEND_INTERVAL_MS;
  const parsed = Number(raw);
  if (!Number.isFinite(parsed) || parsed < 0) {
    return DEFAULT_MIN_SEND_INTERVAL_MS;
  }
  return Math.floor(parsed);
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Per-instance outbound throttling for Linq send operations.
 * This guards against burst traffic and keeps us away from
 * high-velocity spikes that can trigger number limitations.
 */
async function enforceOutboundThrottle(): Promise<void> {
  const minIntervalMs = getMinSendIntervalMs();
  if (minIntervalMs <= 0) return;

  const state = globalThis as typeof globalThis & {
    __aflLinqNextAllowedAtMs?: number;
  };
  const now = Date.now();
  const scheduledAt = Math.max(now, state.__aflLinqNextAllowedAtMs ?? 0);
  state.__aflLinqNextAllowedAtMs = scheduledAt + minIntervalMs;

  const waitMs = scheduledAt - now;
  if (waitMs > 0) {
    await sleep(waitMs);
  }
}

function getLinqToken(): string {
  const token = process.env.LINQ_API_TOKEN;
  if (!token) {
    throw new Error('LINQ_API_TOKEN is not configured.');
  }
  return token;
}

export function getLinqPhoneNumber(): string {
  const number = process.env.LINQ_PHONE_NUMBER;
  if (!number) {
    throw new Error('LINQ_PHONE_NUMBER is not configured.');
  }
  return number;
}

function getLinqWebhookSecret(): string {
  const secret = process.env.LINQ_WEBHOOK_SECRET;
  if (!secret) {
    throw new Error('LINQ_WEBHOOK_SECRET is not configured.');
  }
  return secret;
}

async function linqFetch(
  path: string,
  options: RequestInit = {},
): Promise<Response> {
  const url = `${LINQ_BASE_URL}${path}`;
  const res = await fetch(url, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${getLinqToken()}`,
      ...options.headers,
    },
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Linq API error ${res.status} on ${path}: ${body}`);
  }

  return res;
}

// ---------------------------------------------------------------------------
// Types — Outbound
// ---------------------------------------------------------------------------

export interface LinqMessagePart {
  type: 'text' | 'media';
  value?: string;
  url?: string;
  attachment_id?: string;
}

interface LinqSentMessage {
  id: string;
  service: string | null;
  parts: LinqMessagePart[];
  sent_at: string;
  delivery_status: string;
  is_read: boolean;
}

interface LinqChatHandle {
  id: string;
  handle: string;
  service: string;
  is_me?: boolean | null;
  status?: string | null;
  joined_at?: string;
  left_at?: string | null;
}

export interface CreateChatResult {
  chatId: string;
  isGroup: boolean;
  messageId: string;
  service: string | null;
}

export interface SendMessageResult {
  chatId: string;
  messageId: string;
  service: string | null;
}

// ---------------------------------------------------------------------------
// Types — Webhook V2 (2026-02-03)
// ---------------------------------------------------------------------------

export interface LinqWebhookEnvelope {
  api_version: string;
  webhook_version: string;
  event_type: string;
  event_id: string;
  created_at: string;
  trace_id: string;
  partner_id: string;
  data: LinqWebhookMessageData;
}

export interface LinqWebhookMessageData {
  chat: {
    id: string;
    is_group: boolean | null;
    owner_handle: LinqChatHandle | null;
  };
  id: string;
  idempotency_key: string | null;
  direction: 'inbound' | 'outbound';
  sender_handle: LinqChatHandle;
  parts: LinqWebhookPart[];
  effect: { type: string; name: string } | null;
  reply_to: { message_id: string; part_index?: number } | null;
  sent_at: string | null;
  delivered_at: string | null;
  read_at: string | null;
  service: string;
  preferred_service: string | null;
}

export type LinqWebhookPart = LinqWebhookTextPart | LinqWebhookMediaPart;

export interface LinqWebhookTextPart {
  type: 'text';
  value: string;
}

export interface LinqWebhookMediaPart {
  type: 'media';
  id: string;
  url: string;
  filename: string;
  mime_type: string;
  size_bytes: number;
}

// ---------------------------------------------------------------------------
// Outbound messaging
// ---------------------------------------------------------------------------

function buildParts(
  text: string,
  mediaUrls?: string[],
  attachmentIds?: string[],
): LinqMessagePart[] {
  const parts: LinqMessagePart[] = [];

  if (text) {
    parts.push({ type: 'text', value: text });
  }

  if (mediaUrls) {
    for (const url of mediaUrls) {
      parts.push({ type: 'media', url });
    }
  }

  if (attachmentIds) {
    for (const id of attachmentIds) {
      parts.push({ type: 'media', attachment_id: id });
    }
  }

  return parts;
}

function stripLinksFromText(text: string): string {
  return text.replace(URL_REGEX, ' ').replace(/\s{2,}/g, ' ').trim();
}

function hasLink(text: string): boolean {
  return /\bhttps?:\/\/[^\s]+/i.test(text);
}

function extractLinks(text: string): string[] {
  const matches = text.match(URL_REGEX) ?? [];
  return matches
    .map((url) => url.replace(TRAILING_URL_PUNCTUATION_REGEX, ''))
    .filter(Boolean);
}

/**
 * Create a new chat and send the first message.
 * `to` accepts a single phone or an array — multiple recipients create a group chat.
 */
export async function createChat(opts: {
  to: string | string[];
  text: string;
  mediaUrls?: string[];
  attachmentIds?: string[];
  idempotencyKey?: string;
  from?: string;
}): Promise<CreateChatResult> {
  if (isLinqOutboundDisabled()) {
    logLinqOutboundSkipped({
      fn: 'createChat',
      to: opts.to,
      textLength: opts.text?.length ?? 0,
      hasMedia: Boolean(opts.mediaUrls?.length || opts.attachmentIds?.length),
    });
    throw new LinqOutboundDisabledError('createChat');
  }
  const from = normalizePhone(opts.from || getLinqPhoneNumber());
  const toArray = (Array.isArray(opts.to) ? opts.to : [opts.to]).map(normalizePhone);
  const hasMedia = Boolean(opts.mediaUrls?.length || opts.attachmentIds?.length);
  const textHasLink = hasLink(opts.text);
  const linksInText = textHasLink ? extractLinks(opts.text) : [];
  const textWithoutLinks = textHasLink ? stripLinksFromText(opts.text) : opts.text.trim();
  const needsSafeFirstMessage = textHasLink || hasMedia;
  const safeFirstText = textWithoutLinks || 'Hi there.';

  const message: Record<string, unknown> = {
    parts: buildParts(
      needsSafeFirstMessage ? safeFirstText : opts.text,
      needsSafeFirstMessage ? undefined : opts.mediaUrls,
      needsSafeFirstMessage ? undefined : opts.attachmentIds,
    ),
  };
  if (opts.idempotencyKey) {
    message.idempotency_key = opts.idempotencyKey;
  }

  await enforceOutboundThrottle();
  const res = await linqFetch('/chats', {
    method: 'POST',
    body: JSON.stringify({ from, to: toArray, message }),
  });

  const data = await res.json();
  const chat = data.chat as {
    id: string;
    is_group: boolean;
    message: LinqSentMessage;
  };

  if (needsSafeFirstMessage) {
    const followupText = linksInText.length > 0
      ? `Here is the link: ${linksInText.join(' ')}`
      : '';
    const hasFollowupContent = Boolean(
      followupText || opts.mediaUrls?.length || opts.attachmentIds?.length,
    );

    if (hasFollowupContent) {
    await sendMessage({
      chatId: chat.id,
      text: followupText,
      mediaUrls: opts.mediaUrls,
      attachmentIds: opts.attachmentIds,
      idempotencyKey: opts.idempotencyKey
        ? `${opts.idempotencyKey}:followup`
        : undefined,
    });
    }
  }

  return {
    chatId: chat.id,
    isGroup: chat.is_group,
    messageId: chat.message.id,
    service: chat.message.service,
  };
}

/**
 * Send a message to an existing chat.
 */
export async function sendMessage(opts: {
  chatId: string;
  text: string;
  mediaUrls?: string[];
  attachmentIds?: string[];
  idempotencyKey?: string;
}): Promise<SendMessageResult> {
  if (isLinqOutboundDisabled()) {
    logLinqOutboundSkipped({
      fn: 'sendMessage',
      chatId: opts.chatId,
      textLength: opts.text?.length ?? 0,
      hasMedia: Boolean(opts.mediaUrls?.length || opts.attachmentIds?.length),
    });
    throw new LinqOutboundDisabledError('sendMessage');
  }
  const message: Record<string, unknown> = {
    parts: buildParts(opts.text, opts.mediaUrls, opts.attachmentIds),
  };
  if (opts.idempotencyKey) {
    message.idempotency_key = opts.idempotencyKey;
  }

  await enforceOutboundThrottle();
  const res = await linqFetch(`/chats/${opts.chatId}/messages`, {
    method: 'POST',
    body: JSON.stringify({ message }),
  });

  const data = await res.json();

  return {
    chatId: data.chat_id,
    messageId: data.message.id,
    service: data.message.service,
  };
}

/**
 * Send a message to a phone number, creating a 1-on-1 chat if needed.
 * Uses sendMessage when chatId is available, otherwise createChat.
 */
export async function sendOrCreateChat(opts: {
  to: string;
  chatId?: string | null;
  text: string;
  mediaUrls?: string[];
  attachmentIds?: string[];
  idempotencyKey?: string;
}): Promise<{ chatId: string; messageId: string }> {
  if (isLinqOutboundDisabled()) {
    logLinqOutboundSkipped({
      fn: 'sendOrCreateChat',
      to: opts.to,
      chatId: opts.chatId ?? undefined,
      textLength: opts.text?.length ?? 0,
      hasMedia: Boolean(opts.mediaUrls?.length || opts.attachmentIds?.length),
    });
    throw new LinqOutboundDisabledError('sendOrCreateChat');
  }
  if (opts.chatId) {
    const result = await sendMessage({
      chatId: opts.chatId,
      text: opts.text,
      mediaUrls: opts.mediaUrls,
      attachmentIds: opts.attachmentIds,
      idempotencyKey: opts.idempotencyKey,
    });
    return { chatId: result.chatId, messageId: result.messageId };
  }

  const result = await createChat({
    to: opts.to,
    text: opts.text,
    mediaUrls: opts.mediaUrls,
    attachmentIds: opts.attachmentIds,
    idempotencyKey: opts.idempotencyKey,
  });
  return { chatId: result.chatId, messageId: result.messageId };
}

// ---------------------------------------------------------------------------
// Attachments — pre-upload
// ---------------------------------------------------------------------------

export interface UploadAttachmentResult {
  attachmentId: string;
  uploadUrl: string;
  downloadUrl: string;
  requiredHeaders: Record<string, string>;
}

/**
 * Request a presigned upload URL from Linq, then PUT the raw bytes.
 * Returns a permanent attachment_id for use in message parts.
 */
export async function uploadAttachment(opts: {
  filename: string;
  contentType: string;
  sizeBytes: number;
  fileBuffer: Buffer;
}): Promise<string> {
  if (isLinqOutboundDisabled()) {
    logLinqOutboundSkipped({
      fn: 'uploadAttachment',
      filename: opts.filename,
    });
    throw new LinqOutboundDisabledError('uploadAttachment');
  }
  const res = await linqFetch('/attachments', {
    method: 'POST',
    body: JSON.stringify({
      filename: opts.filename,
      content_type: opts.contentType,
      size_bytes: opts.sizeBytes,
    }),
  });

  const data = (await res.json()) as UploadAttachmentResult & {
    attachment_id: string;
    upload_url: string;
    download_url: string;
    required_headers: Record<string, string>;
  };

  const uploadRes = await fetch(data.upload_url, {
    method: 'PUT',
    headers: { ...data.required_headers, 'Content-Length': String(opts.sizeBytes) },
    body: opts.fileBuffer as unknown as BodyInit,
  });

  if (!uploadRes.ok) {
    throw new Error(
      `Linq attachment upload failed: ${uploadRes.status} ${await uploadRes.text()}`,
    );
  }

  return data.attachment_id;
}

// ---------------------------------------------------------------------------
// Typing indicators
// ---------------------------------------------------------------------------

export async function startTypingIndicator(chatId: string): Promise<void> {
  await linqFetch(`/chats/${chatId}/typing`, { method: 'POST' });
}

export async function stopTypingIndicator(chatId: string): Promise<void> {
  await linqFetch(`/chats/${chatId}/typing`, { method: 'DELETE' });
}

// ---------------------------------------------------------------------------
// Contact card sharing
// ---------------------------------------------------------------------------

export async function shareContactCard(chatId: string): Promise<void> {
  if (isLinqOutboundDisabled()) {
    logLinqOutboundSkipped({ fn: 'shareContactCard', chatId });
    throw new LinqOutboundDisabledError('shareContactCard');
  }
  await linqFetch(`/chats/${chatId}/share_contact_card`, { method: 'POST' });
}

// ---------------------------------------------------------------------------
// Webhook signature verification
// ---------------------------------------------------------------------------

/**
 * Verify a Linq webhook signature using HMAC-SHA256.
 * Signature = HMAC-SHA256("{timestamp}.{rawBody}", signingSecret)
 */
export function verifyWebhookSignature(
  rawBody: string,
  timestamp: string,
  signature: string,
): boolean {
  const secret = getLinqWebhookSecret();
  const message = `${timestamp}.${rawBody}`;
  const expected = crypto
    .createHmac('sha256', secret)
    .update(message)
    .digest('hex');

  try {
    return crypto.timingSafeEqual(
      Buffer.from(expected),
      Buffer.from(signature),
    );
  } catch {
    return false;
  }
}

// ---------------------------------------------------------------------------
// Webhook helpers
// ---------------------------------------------------------------------------

/**
 * Extract the text content from a V2 webhook message's parts array.
 */
export function extractTextFromParts(
  parts: LinqWebhookPart[] | LinqMessagePart[] | null,
): string {
  if (!parts) return '';
  return parts
    .filter((p) => p.type === 'text' && 'value' in p && p.value)
    .map((p) => (p as { value: string }).value)
    .join(' ');
}
