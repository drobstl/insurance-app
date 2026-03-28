import 'server-only';

import { GoogleAuth } from 'google-auth-library';

interface IngestionV3TaskConfig {
  projectId: string;
  location: string;
  queue: string;
  serviceAccountEmail: string;
  processorAudience: string;
  processorBaseUrl: string;
}

let authClient: GoogleAuth | null = null;

function getAuthClient(): GoogleAuth {
  if (!authClient) {
    authClient = new GoogleAuth({
      scopes: ['https://www.googleapis.com/auth/cloud-tasks'],
    });
  }
  return authClient;
}

export function getIngestionV3TaskConfigFromEnv(): IngestionV3TaskConfig {
  const projectId = process.env.CLOUD_TASKS_PROJECT_ID?.trim() || process.env.GCP_PROJECT_ID?.trim() || '';
  const location = process.env.CLOUD_TASKS_LOCATION?.trim() || '';
  const queue = process.env.CLOUD_TASKS_QUEUE?.trim() || '';
  const serviceAccountEmail = process.env.CLOUD_TASKS_SERVICE_ACCOUNT_EMAIL?.trim() || '';
  const processorBaseUrl = (process.env.INGESTION_V3_PROCESSOR_BASE_URL || '').trim().replace(/\/+$/, '');
  const processorAudience = (process.env.INGESTION_V3_PROCESSOR_AUDIENCE || processorBaseUrl).trim();

  if (!projectId) throw new Error('Missing CLOUD_TASKS_PROJECT_ID (or GCP_PROJECT_ID).');
  if (!location) throw new Error('Missing CLOUD_TASKS_LOCATION.');
  if (!queue) throw new Error('Missing CLOUD_TASKS_QUEUE.');
  if (!serviceAccountEmail) throw new Error('Missing CLOUD_TASKS_SERVICE_ACCOUNT_EMAIL.');
  if (!processorBaseUrl) throw new Error('Missing INGESTION_V3_PROCESSOR_BASE_URL.');
  if (!processorAudience) throw new Error('Missing INGESTION_V3_PROCESSOR_AUDIENCE.');

  return {
    projectId,
    location,
    queue,
    serviceAccountEmail,
    processorAudience,
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

  const taskBody: Record<string, unknown> = {
    httpRequest: {
      httpMethod: 'POST',
      url,
      headers: {
        'Content-Type': 'application/json',
      },
      body: Buffer.from(JSON.stringify({ jobId })).toString('base64'),
      oidcToken: {
        serviceAccountEmail: cfg.serviceAccountEmail,
        audience: cfg.processorAudience,
      },
    },
  };

  if (delaySeconds > 0) {
    taskBody.scheduleTime = new Date(Date.now() + delaySeconds * 1000).toISOString();
  }

  const auth = getAuthClient();
  const client = await auth.getClient();
  const accessToken = await client.getAccessToken();

  const apiUrl = `https://cloudtasks.googleapis.com/v2/${parent}/tasks`;
  const res = await fetch(apiUrl, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${accessToken.token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ task: taskBody }),
  });

  if (!res.ok) {
    const errorBody = await res.text();
    throw new Error(`Cloud Tasks API error (${res.status}): ${errorBody}`);
  }

  const task = await res.json();
  return { taskName: task.name || '' };
}
