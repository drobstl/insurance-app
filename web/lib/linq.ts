import 'server-only';

import crypto from 'crypto';

const LINQ_BASE_URL = 'https://api.linqapp.com/api/partner/v3';

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
  const from = opts.from || getLinqPhoneNumber();
  const toArray = Array.isArray(opts.to) ? opts.to : [opts.to];

  const message: Record<string, unknown> = {
    parts: buildParts(opts.text, opts.mediaUrls, opts.attachmentIds),
  };
  if (opts.idempotencyKey) {
    message.idempotency_key = opts.idempotencyKey;
  }

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
  const message: Record<string, unknown> = {
    parts: buildParts(opts.text, opts.mediaUrls, opts.attachmentIds),
  };
  if (opts.idempotencyKey) {
    message.idempotency_key = opts.idempotencyKey;
  }

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
