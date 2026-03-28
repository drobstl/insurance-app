import 'server-only';

import { createHmac } from 'crypto';
import { GoogleAuth } from 'google-auth-library';

interface IngestionV3TaskConfig {
  projectId: string;
  location: string;
  queue: string;
  processorBaseUrl: string;
}

let authClient: GoogleAuth | null = null;
let cachedCredentials: Record<string, unknown> | null = null;

function loadCredentials(): Record<string, unknown> {
  if (!cachedCredentials) {
    const base64Key = process.env.FIREBASE_ADMIN_SERVICE_ACCOUNT_BASE64;
    if (!base64Key) {
      throw new Error('Missing FIREBASE_ADMIN_SERVICE_ACCOUNT_BASE64 env var for GCP credentials.');
    }
    cachedCredentials = JSON.parse(Buffer.from(base64Key, 'base64').toString('utf-8'));
  }
  return cachedCredentials!;
}

function getAuthClient(): GoogleAuth {
  if (!authClient) {
    const credentials = loadCredentials();
    authClient = new GoogleAuth({
      credentials,
      scopes: ['https://www.googleapis.com/auth/cloud-tasks'],
    });
  }
  return authClient;
}

/**
 * Derives a webhook verification token from the service account's private_key_id.
 * Both cloud-tasks.ts (sender) and the process route (receiver) compute the same value.
 */
export function deriveWebhookSecret(): string {
  const creds = loadCredentials();
  const keyId = creds.private_key_id;
  if (typeof keyId !== 'string' || !keyId) {
    throw new Error('Service account credentials missing private_key_id.');
  }
  return createHmac('sha256', keyId).update('cloud-tasks-webhook-v1').digest('hex');
}

export function getIngestionV3TaskConfigFromEnv(): IngestionV3TaskConfig {
  const projectId = process.env.CLOUD_TASKS_PROJECT_ID?.trim() || process.env.GCP_PROJECT_ID?.trim() || '';
  const location = process.env.CLOUD_TASKS_LOCATION?.trim() || '';
  const queue = process.env.CLOUD_TASKS_QUEUE?.trim() || '';
  const processorBaseUrl = (process.env.INGESTION_V3_PROCESSOR_BASE_URL || '').trim().replace(/\/+$/, '');

  if (!projectId) throw new Error('Missing CLOUD_TASKS_PROJECT_ID (or GCP_PROJECT_ID).');
  if (!location) throw new Error('Missing CLOUD_TASKS_LOCATION.');
  if (!queue) throw new Error('Missing CLOUD_TASKS_QUEUE.');
  if (!processorBaseUrl) throw new Error('Missing INGESTION_V3_PROCESSOR_BASE_URL.');

  return {
    projectId,
    location,
    queue,
    processorBaseUrl,
  };
}

export async function enqueueIngestionV3ProcessJob(
  jobId: string,
  options?: { delaySeconds?: number },
): Promise<{ taskName: string }> {
  const cfg = getIngestionV3TaskConfigFromEnv();
  const parent = `projects/${cfg.projectId}/locations/${cfg.location}/queues/${cfg.queue}`;
  const url = `${cfg.processorBaseUrl}/api/ingestion/v3/jobs/${encodeURIComponent(jobId)}/process`;
  const delaySeconds = Math.max(0, Math.floor(options?.delaySeconds ?? 0));

  console.log(`[cloud-tasks] Enqueuing job ${jobId}`, {
    parent,
    targetUrl: url,
    delaySeconds,
    projectId: cfg.projectId,
    location: cfg.location,
    queue: cfg.queue,
    processorBaseUrl: cfg.processorBaseUrl,
  });

  const taskBody: Record<string, unknown> = {
    httpRequest: {
      httpMethod: 'POST',
      url,
      headers: {
        'Content-Type': 'application/json',
        'X-CloudTasks-Webhook-Secret': deriveWebhookSecret(),
      },
      body: Buffer.from(JSON.stringify({ jobId })).toString('base64'),
    },
  };

  if (delaySeconds > 0) {
    taskBody.scheduleTime = new Date(Date.now() + delaySeconds * 1000).toISOString();
  }

  let accessTokenValue: string | null | undefined;
  try {
    const auth = getAuthClient();
    const client = await auth.getClient();
    const accessToken = await client.getAccessToken();
    accessTokenValue = accessToken.token;
    if (!accessTokenValue) {
      throw new Error('GCP auth returned empty access token');
    }
  } catch (authErr) {
    console.error(`[cloud-tasks] Auth failed for job ${jobId}:`, authErr);
    throw authErr;
  }

  const apiUrl = `https://cloudtasks.googleapis.com/v2/${parent}/tasks`;

  let res: Response;
  try {
    res = await fetch(apiUrl, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${accessTokenValue}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ task: taskBody }),
    });
  } catch (fetchErr) {
    console.error(`[cloud-tasks] Fetch to Cloud Tasks API failed for job ${jobId}:`, fetchErr);
    throw fetchErr;
  }

  if (!res.ok) {
    const errorBody = await res.text();
    console.error(`[cloud-tasks] Cloud Tasks API error for job ${jobId}:`, {
      status: res.status,
      statusText: res.statusText,
      body: errorBody,
      apiUrl,
    });
    throw new Error(`Cloud Tasks API error (${res.status}): ${errorBody}`);
  }

  const task = await res.json();
  console.log(`[cloud-tasks] Successfully enqueued job ${jobId}:`, {
    taskName: task.name,
    scheduleTime: task.scheduleTime,
  });
  return { taskName: task.name || '' };
}
