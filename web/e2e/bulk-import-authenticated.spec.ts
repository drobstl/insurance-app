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

    await expect(page.getByText('Import clients in 3 steps')).toBeVisible();
    await expect(page.getByText('1) Add files  2) Review parsed records  3) Import')).toBeVisible();
    await expect(page.getByText('Pick files from your Drive.')).toBeVisible();
    await expect(page.getByText('Select files from your computer.')).toBeVisible();
    await expect(page.getByText('Drag and drop files here.')).toBeVisible();
    await expect(page.getByText('CSV, TSV, Excel, PDF • Max 50 files')).toBeVisible();
  });

  test('can parse local CSV and submit mocked batch import', async ({ page }) => {
    await loginToDashboard(page);
    await page.goto('/dashboard/clients');

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

    await expect(page.getByText('Review records (2)')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Import 2 Clients' })).toBeVisible();

    await page.getByRole('button', { name: 'Import 2 Clients' }).click();
    await expect(page.getByText('Imported 2 clients')).toBeVisible();
  });
});
