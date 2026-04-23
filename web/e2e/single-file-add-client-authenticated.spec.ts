import { expect, test } from '@playwright/test';

import { loginToDashboard, requireE2ECredentials } from './helpers/auth';

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
});
