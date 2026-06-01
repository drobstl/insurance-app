import { expect, test } from '@playwright/test';

// Smoke coverage for the entry-mechanism Phase 1 signup front door.
// Render-only: never submits, so it creates no Firebase/Stripe records and
// is safe to run on every PR (same pattern as public-smoke.spec.ts).
//
// Guards the coexistence contract:
//   - bare /signup         → no-card 14-day trial form (name/email/phone)
//   - /signup?tier=growth  → unchanged card-at-signup form (no phone field)
// (growth is the live billable tier; pro/agency are comingSoon and redirect
//  to /pricing, so they can't exercise the card form here.)

test('bare /signup renders the no-card 14-day trial form', async ({ page }) => {
  await page.goto('/signup');

  await expect(page.getByRole('heading', { name: 'Start Your Free Trial' })).toBeVisible();
  // Locks in the Jun 1 amendment value (14 days, not 30).
  await expect(page.getByText('Full Pro access for 14 days')).toBeVisible();

  await expect(page.getByLabel('Full Name')).toBeVisible();
  await expect(page.getByLabel('Email Address')).toBeVisible();
  // Phone is the no-card-only field.
  await expect(page.getByLabel('Phone Number')).toBeVisible();

  await expect(page.getByRole('button', { name: 'Start Free Trial' })).toBeVisible();
});

test('/signup?tier=growth still renders the card-at-signup form', async ({ page }) => {
  await page.goto('/signup?tier=growth');

  await expect(page.getByRole('heading', { name: 'Create Your Account' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Continue to Payment' })).toBeVisible();

  // The card flow does not collect a phone number at signup.
  await expect(page.getByLabel('Phone Number')).toHaveCount(0);
});
