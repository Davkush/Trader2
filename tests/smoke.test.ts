import { test, expect } from '@playwright/test';

test.describe('High-Fidelity Trading Terminal Smoke Test', () => {
  test('should load, register a new account, skip onboarding, and load the main terminal', async ({ page }) => {
    // 1. Load the page (triggers AuthScreen as there is no session token)
    await page.goto('/');

    // Check we are on the QUANTVAULT auth screen
    await expect(page.locator('h1')).toContainText('QUANT');
    await expect(page.locator('h1')).toContainText('VAULT');

    // 2. Click on "Create Account" tab
    await page.click('button:has-text("Create Account")');

    // 3. Fill in registration credentials
    const randomSuffix = Math.random().toString(36).substring(2, 8);
    const email = `smoke_test_${randomSuffix}@example.com`;
    const password = 'TestPassword123!';

    await page.fill('input[type="email"]', email);
    await page.fill('input[type="password"]', password);

    // 4. Click "Register Secure Tenant" to submit registration
    await page.click('button:has-text("Register Secure Tenant")');

    // 5. App should register successfully and show the onboarding overlay
    // We expect the onboarding overlay or its skip button to be visible
    const skipButton = page.locator('button[title="Skip onboarding"]');
    await expect(skipButton).toBeVisible({ timeout: 10000 });

    // 6. Click on the skip button to enter the workspace
    await skipButton.click();

    // 7. Verify the main dashboard has loaded (e.g., active symbol indicator or some unique panel text is visible)
    // Let's assert that the active symbol display "BTC" or the header exists
    await expect(page.locator('body')).toContainText('BTC', { timeout: 5000 });

    // Let's also verify that we can hit the /api/health endpoint directly as an authenticated/anonymous check
    const healthResponse = await page.request.get('/api/health');
    expect(healthResponse.ok()).toBeTruthy();
    const healthJson = await healthResponse.json();
    expect(healthJson).toEqual({ status: 'ok' });
  });
});
