import { expect, test } from '@playwright/test';
import { PDFDocument } from 'pdf-lib';

import { loginToDashboard, requireE2ECredentials } from './helpers/auth';

async function buildPdfFixtureBuffer() {
  const pdfDoc = await PDFDocument.create();
  pdfDoc.addPage([612, 792]);
  const bytes = await pdfDoc.save();
  return Buffer.from(bytes);
}

test.describe('Single-file add client flow (authenticated)', () => {
  requireE2ECredentials();

  test('opens add-client surface and manual-entry controls', async ({ page }) => {
    await loginToDashboard(page);
    await page.goto('/dashboard/clients');

    await page.getByRole('button', { name: 'Add Client' }).click();

    await expect(page.getByRole('heading', { name: 'Add Client' })).toBeVisible();
    await expect(page.getByText('Upload an application or expand manual entry.')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Upload Application PDF' })).toBeVisible();

    await page.getByRole('button', { name: 'Expand Manual Entry' }).click();
    await expect(page.getByRole('button', { name: 'Hide Manual Entry' })).toBeVisible();
    await expect(page.locator('input[placeholder="Name *"]').first()).toBeVisible();
    await expect(page.getByRole('button', { name: 'Create Client' })).toBeVisible();

    await page.getByRole('button', { name: 'Hide Manual Entry' }).click();
    await expect(page.getByRole('button', { name: 'Expand Manual Entry' })).toBeVisible();
  });

  test('routes PDF upload into review panel with onboarding target and confirm action', async ({ page }) => {
    await loginToDashboard(page);
    await page.goto('/dashboard/clients');

    await page.route('**/api/ingestion/v3/upload-url', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          success: true,
          uploadUrl: 'http://127.0.0.1:3000/mock-upload/onboarding-review.pdf',
          gcsPath: 'ingestion/tests/onboarding-review.jpg',
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
          jobId: 'job-e2e-onboarding-review-1',
        }),
      });
    });
    await page.route('**/api/ingestion/v3/jobs/job-e2e-onboarding-review-1', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          success: true,
          job: {
            status: 'review_ready',
            result: {
              application: {
                data: {
                  insuredName: 'Review Target',
                  insuredEmail: 'review-target@example.com',
                  insuredPhone: '5551234444',
                  insuredDateOfBirth: '1988-01-02',
                  policyType: 'Term',
                  policyNumber: 'R-1001',
                  carrier: 'Banner',
                  premiumAmount: 99,
                  premiumFrequency: 'monthly',
                  faceAmount: 250000,
                  beneficiaries: [],
                },
              },
            },
          },
        }),
      });
    });

    await page.getByRole('button', { name: 'Add Client' }).click();
    await page
      .locator('input[type="file"][accept=".pdf,application/pdf"]')
      .setInputFiles({
        name: 'onboarding-review.pdf',
        mimeType: 'application/pdf',
        buffer: await buildPdfFixtureBuffer(),
      });

    await expect(page.getByRole('heading', { name: 'Review & Confirm' })).toBeVisible();
    const reviewPanel = page.locator('[data-onboarding-target="clients-addflow-review-panel"]');
    await expect(reviewPanel).toBeVisible();
    await expect(reviewPanel.getByRole('button', { name: 'Confirm & Create' })).toBeVisible();
    await expect(page.locator('[data-onboarding-target="clients-addflow-confirm-create"]')).toBeVisible();
  });
});
