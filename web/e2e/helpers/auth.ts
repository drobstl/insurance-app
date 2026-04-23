import { expect, type Page, test } from '@playwright/test';

const email = process.env.AFL_E2E_EMAIL;
const password = process.env.AFL_E2E_PASSWORD;

export function requireE2ECredentials() {
  test.skip(!email || !password, 'Set AFL_E2E_EMAIL and AFL_E2E_PASSWORD to run authenticated e2e specs.');
}

export async function loginToDashboard(page: Page) {
  if (!email || !password) return;

  await page.goto('/login');
  await page.getByLabel('Email Address').fill(email);
  await page.getByLabel('Password').fill(password);
  await page.getByRole('button', { name: 'Sign In' }).click();
  await page.waitForURL(/\/dashboard(?:\/.*)?$/);

  await expect(page).toHaveURL(/\/dashboard(?:\/.*)?$/);
}
