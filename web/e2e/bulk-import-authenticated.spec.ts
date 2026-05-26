import path from 'node:path';
import { expect, test } from '@playwright/test';

import { loginToDashboard, requireE2ECredentials } from './helpers/auth';

const fixtureCsvPath = path.resolve(__dirname, 'fixtures', 'clients-basic.csv');

test.describe('Bulk import (authenticated)', () => {
  requireE2ECredentials();

  test('shows updated microcopy in bulk import flow', async ({ page }) => {
    await loginToDashboard(page);
    await page.goto('/dashboard/clients');

    await page.getByRole('button', { name: 'Bulk Import' }).click();

    await expect(page.getByRole('heading', { name: 'Bulk Import' })).toBeVisible();
    await expect(
      page.getByText('Bring in spreadsheets and PDFs from Google Drive or your computer.'),
    ).toBeVisible();
    await expect(page.getByText('Pick files from your Google Drive.')).toBeVisible();
    await expect(page.getByText('Select files from your computer.')).toBeVisible();
    await expect(page.getByText('Drop files here to start import')).toBeVisible();
    await expect(page.getByText('CSV, TSV, Excel, PDF', { exact: false }).first()).toBeVisible();
  });

  test('can parse local CSV and submit mocked batch import', async ({ page }) => {
    await loginToDashboard(page);
    await page.goto('/dashboard/clients');

    await page.route('**/api/ingestion/v3/upload-url', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          success: true,
          uploadUrl: 'http://127.0.0.1:3000/mock-upload/test.csv',
          gcsPath: 'ingestion/tests/test.csv',
        }),
      });
    });

    await page.route('**/mock-upload/**', async (route) => {
      await route.fulfill({ status: 200, body: '' });
    });

    await page.route('**/api/ingestion/v3/jobs', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          success: true,
          jobId: 'job-e2e-csv-1',
        }),
      });
    });

    await page.route('**/api/ingestion/v3/jobs/job-e2e-csv-1', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          success: true,
          job: {
            status: 'review_ready',
            result: {
              bob: {
                rows: [
                  {
                    firstName: 'Jane',
                    lastName: 'Carter',
                    email: 'jane@example.com',
                    phone: '5551112222',
                    policyNumber: 'CSV-1001',
                    carrier: 'Banner',
                    policyType: 'Term',
                    premiumAmount: 89.15,
                    coverageAmount: 250000,
                  },
                  {
                    firstName: 'Robert',
                    lastName: 'Miles',
                    email: 'robert@example.com',
                    phone: '',
                    policyNumber: 'CSV-1002',
                    carrier: 'SBLI',
                    policyType: 'Whole Life',
                    premiumAmount: 120,
                    coverageAmount: 150000,
                  },
                ],
              },
            },
          },
        }),
      });
    });

    await page.route('**/api/clients/import-batch', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          success: true,
          imported: 2,
          skipped: 0,
          records: [
            { clientId: 'test-client-1', firstName: 'Jane', phone: '5551112222' },
            { clientId: 'test-client-2', firstName: 'Robert', phone: '' },
          ],
        }),
      });
    });

    await page.getByRole('button', { name: 'Bulk Import' }).click();
    await page.locator('input[type="file"][accept*=".csv"]').setInputFiles(fixtureCsvPath);

    await expect(page.getByText('Review records (2)')).toBeVisible({ timeout: 15000 });
    await expect(page.getByRole('button', { name: 'Import 2 Clients' })).toBeVisible();

    await page.getByRole('button', { name: 'Import 2 Clients' }).click();
    await expect(page.getByText(/Successfully imported/i)).toBeVisible({ timeout: 15000 });
  });
});
