import { expect, type Page, test } from '@playwright/test';

const email = process.env.AFL_E2E_EMAIL;
const password = process.env.AFL_E2E_PASSWORD;
// Two-step verification (mandatory in prod from Jun 15, 2026). Set these to a
// Firebase *test* phone number and its fixed code (Authentication → Sign-in
// method → Phone → "Phone numbers for testing") and run the app with
// NEXT_PUBLIC_E2E_AUTH_TEST_MODE=true (see web/firebase.ts) so no real
// SMS/reCAPTCHA is involved. Unset, login behaves exactly as before.
const mfaPhone = process.env.AFL_E2E_MFA_PHONE;
const mfaCode = process.env.AFL_E2E_MFA_CODE;

const DASHBOARD_URL = /\/dashboard(?:\/.*)?$/;

export function requireE2ECredentials() {
  test.skip(!email || !password, 'Set AFL_E2E_EMAIL and AFL_E2E_PASSWORD to run authenticated e2e specs.');
}

export async function loginToDashboard(page: Page) {
  if (!email || !password) return;

  await page.goto('/login');
  await page.getByLabel('Email Address').fill(email);
  await page.getByLabel('Password').fill(password);
  await page.getByRole('button', { name: 'Sign In' }).click();

  if (!mfaCode) {
    await page.waitForURL(DASHBOARD_URL);
    await expect(page).toHaveURL(DASHBOARD_URL);
    return;
  }

  // An enrolled account gets the SMS challenge instead of a redirect; race the
  // two outcomes and answer the challenge if it appears.
  const challengeCode = page.getByPlaceholder('6-digit code');
  await Promise.race([
    page.waitForURL(DASHBOARD_URL).catch(() => {}),
    challengeCode.waitFor({ state: 'visible' }).catch(() => {}),
  ]);

  if (!DASHBOARD_URL.test(new URL(page.url()).pathname)) {
    await challengeCode.fill(mfaCode);
    await page.getByRole('button', { name: 'Verify & continue' }).click();
    await page.waitForURL(DASHBOARD_URL);
    await expect(page).toHaveURL(DASHBOARD_URL);
    return; // challenged means enrolled — the dashboard gate can't appear
  }

  // Dashboard reached without a challenge → the account has no second factor.
  // From the Jun 15 go-live, MfaGate blocks the dashboard until enrollment, so
  // enroll with the test number (self-healing after an MFA reset; pre-go-live
  // the gate is just a banner and the probe times out harmlessly).
  if (mfaPhone) {
    const gateHeading = page.getByRole('heading', { name: 'Securing your account' });
    const gateShown = await gateHeading
      .waitFor({ state: 'visible', timeout: 4000 })
      .then(() => true)
      .catch(() => false);
    if (gateShown) {
      await page.getByPlaceholder('(555) 123-4567').fill(mfaPhone.replace(/^\+1/, ''));
      await page.getByRole('button', { name: 'Send my code' }).click();
      await page.getByPlaceholder('6-digit code').fill(mfaCode);
      await page.getByRole('button', { name: 'Verify & finish' }).click();
      await gateHeading.waitFor({ state: 'detached' });
    }
  }

  await expect(page).toHaveURL(DASHBOARD_URL);
}
