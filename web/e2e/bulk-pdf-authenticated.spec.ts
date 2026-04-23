import { expect, test } from '@playwright/test';
import { PDFDocument } from 'pdf-lib';

import { loginToDashboard, requireE2ECredentials } from './helpers/auth';

async function buildPdfFixtureBuffer() {
  const pdfDoc = await PDFDocument.create();
  pdfDoc.addPage([612, 792]);
  const bytes = await pdfDoc.save();
  return Buffer.from(bytes);
}

test.describe('Bulk PDF import (authenticated)', () => {
  requireE2ECredentials();

  test('parses a local PDF with mocked ingestion endpoints', async ({ page }) => {
    await loginToDashboard(page);
    await page.goto('/dashboard/clients');

    await page.route('**/api/ingestion/v3/upload-url', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          success: true,
          uploadUrl: 'http://127.0.0.1:3000/mock-upload/test.pdf',
          gcsPath: 'ingestion/tests/test.pdf',
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
          jobId: 'job-e2e-pdf-1',
        }),
      });
    });

    await page.route('**/api/ingestion/v3/jobs/job-e2e-pdf-1', async (route) => {
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
                    firstName: 'PDF',
                    lastName: 'Client',
                    email: 'pdf-client@example.com',
                    phone: '5553334444',
                    policyNumber: 'P-12345',
                    carrier: 'Banner',
                    policyType: 'Term',
                    premiumAmount: 77.5,
                    coverageAmount: 200000,
                  },
                ],
              },
            },
          },
        }),
      });
    });

    await page.getByRole('button', { name: 'Bulk Import' }).click();
    await page.locator('input[type="file"][accept*=".csv"]').setInputFiles({
      name: 'banner-term.pdf',
      mimeType: 'application/pdf',
      buffer: await buildPdfFixtureBuffer(),
    });

    await expect(page.getByText('File status')).toBeVisible();
    await expect(page.getByText('Review records (1)')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Import 1 Client' })).toBeVisible();
  });
});
