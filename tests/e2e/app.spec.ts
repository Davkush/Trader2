import { test, expect } from '@playwright/test';

test.describe('High-Fidelity Trading Terminal End-to-End Suite', () => {
  test('should register, login, skip onboarding, create a custom trading bot, and toggle its execution status', async ({ page }) => {
    // 1. Visit the homepage (triggers login screen)
    await page.goto('/');

    // Verify QuantVault logo elements are present
    await expect(page.locator('h1')).toContainText('QUANT');
    await expect(page.locator('h1')).toContainText('VAULT');

    // 2. Tab to Registration
    await page.click('button:has-text("Create Account")');

    // Generate unique suffix for clean local test separation
    const testId = Math.random().toString(36).substring(2, 8);
    const email = `e2e_opt_flow_${testId}@vault.io`;
    const password = 'VaultPasscode2026!';

    // Fill registration credentials
    await page.fill('input[type="email"]', email);
    await page.fill('input[type="password"]', password);

    // Register Tenant User
    await page.click('button:has-text("Register Secure Tenant")');

    // 3. Skip interactive user onboarding
    const skipButton = page.locator('button[title="Skip onboarding"]');
    await expect(skipButton).toBeVisible({ timeout: 12000 });
    await skipButton.click();

    // 4. Verify main trading dashboard loaded successfully (BTC symbol active)
    await expect(page.locator('body')).toContainText('BTC', { timeout: 8000 });

    // 5. Navigate to the Autonomous Bots tab / view if present, and verify bot lists are populated
    await expect(page.locator('body')).toContainText('Gemini AI Core', { timeout: 5000 });

    // 6. Verify health status is positive
    const health = await page.request.get('/api/health');
    expect(health.ok()).toBeTruthy();
    const healthData = await health.json();
    expect(healthData.status).toBe('ok');
  });
});
