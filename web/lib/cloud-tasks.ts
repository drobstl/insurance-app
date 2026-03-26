import 'server-only';

import { CloudTasksClient } from '@google-cloud/tasks';

interface IngestionV3TaskConfig {
  projectId: string;
  location: string;
  queue: string;
  serviceAccountEmail: string;
  processorAudience: string;
  processorBaseUrl: string;
}

const cloudTasksClient = new CloudTasksClient();

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
  const parent = cloudTasksClient.queuePath(cfg.projectId, cfg.location, cfg.queue);
  const url = `${cfg.processorBaseUrl}/api/ingestion/v3/jobs/${encodeURIComponent(jobId)}/process`;
  const delaySeconds = Math.max(0, Math.floor(options?.delaySeconds ?? 0));

  const [task] = await cloudTasksClient.createTask({
    parent,
    task: {
      ...(delaySeconds > 0
        ? {
            scheduleTime: {
              seconds: Math.floor(Date.now() / 1000) + delaySeconds,
            },
          }
        : {}),
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
    },
  });

  return { taskName: task.name || '' };
}
