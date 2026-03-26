# AFL Web Dashboard

AgentForLife web dashboard built with Next.js (App Router), Firebase, and Claude-powered ingestion/parsing.

## Local Development

```bash
npm install
npm run dev
```

Open `http://localhost:3000`.

## Ingestion v3 (Shipped)

The active ingestion pipeline is v3 and uses:

- `POST /api/ingestion/v3/upload-url` for signed GCS upload URLs
- `POST /api/ingestion/v3/jobs` to create a typed processing job
- `POST /api/ingestion/v3/jobs/[jobId]/process` as Cloud Tasks target (OIDC required)
- `GET /api/ingestion/v3/jobs/[jobId]` for polling status/results

Cloud Tasks and processor auth config:

- `CLOUD_TASKS_PROJECT_ID` (or `GCP_PROJECT_ID`)
- `CLOUD_TASKS_LOCATION`
- `CLOUD_TASKS_QUEUE`
- `CLOUD_TASKS_SERVICE_ACCOUNT_EMAIL`
- `INGESTION_V3_PROCESSOR_BASE_URL`
- `INGESTION_V3_PROCESSOR_AUDIENCE` (optional; defaults to base URL)

## Deployment Gate (Corpus)

Deploys are gated by:

```bash
npm run test:ingestion-corpus
```

`npm run build` runs the corpus gate before Next build.

Corpus files live under `tests/ingestion-corpus/fixtures`.

**Important:** current fixture PDFs are placeholders for scaffolding.  
Before production rollout, replace them with real redacted insurance application samples, or the gate is not a real regression signal.

## Rollout Sequence

Recommended rollout:

1. Internal-only traffic
2. 20% of ingestion traffic
3. 100% traffic
4. Continue telemetry monitoring and typed failure review
