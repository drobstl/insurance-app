import { expect, type Page, test } from '@playwright/test';

const email = process.env.AFL_E2E_EMAIL;
const password = process.env.AFL_E2E_PASSWORD;
// ── Two-step verification coverage (OPT-IN, OFF by default) ──────────────────
// CI runs with these UNSET, so login is a plain password → dashboard and the
// functional specs stay green under mandatory MFA by signing in as an
// unenrolled bot account (see .github/workflows/web-e2e.yml).
//
// Why off: the sign-in SMS *challenge* uses Firebase invisible reCAPTCHA, which
// hangs in a headless browser (run 27310089989). *Enrollment* works headlessly,
// but testing it every run means the account ends enrolled → the next run hits
// the unrunnable challenge → so it needs a per-run admin reset of the factors.
//
// To turn full coverage on (accepting the Firebase admin key as a CI secret):
//   1. Add a Playwright global-setup project that, using the admin key, clears
//      the bot account's factors, signs in, enrolls the test number through the
//      MfaGate, and saves storageState; point the specs at that storageState so
//      only setup ever logs in (the broken challenge path is never taken).
//   2. Set AFL_E2E_MFA_PHONE / AFL_E2E_MFA_CODE to a Firebase *test* phone
//      number + fixed code (Auth → Sign-in method → Phone → testing numbers)
//      and run with NEXT_PUBLIC_E2E_AUTH_TEST_MODE=true (see web/firebase.ts).
// With these set, the flow below also self-enrolls/answers the challenge for a
// direct (non-storageState) login.
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
  // Enroll it with the test number. After the Jun 15 go-live MfaGate forces
  // this by itself; before go-live, #148's ?mfa=setup override surfaces the
  // same gate, so CI rehearses the real enroll flow ahead of the cutover.
  // (Self-healing after an MFA reset; if the gate doesn't render — e.g. a
  // flag-off build — the probe times out and login is already complete.)
  if (mfaPhone) {
    await page.goto('/dashboard?mfa=setup');
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
    await page.goto('/dashboard');
  }

  await expect(page).toHaveURL(DASHBOARD_URL);
}
