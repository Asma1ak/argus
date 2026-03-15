import { test, expect } from '@playwright/test';

test.describe('Analysis Flow', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
  });

  test('should show loading state during analysis', async ({ page }) => {
    const textarea = page.locator('textarea');
    const button = page.locator('button:has-text("Analyze")');
    
    await textarea.fill('Everyone is buying this product, so it must be the best!');
    await button.click();
    
    // Should show loading state
    await expect(button).toContainText(/Analyzing|Loading/i);
  });

  test('should display results after analysis', async ({ page }) => {
    // This test requires the API to be running
    test.skip(process.env.CI === 'true', 'Skipping in CI - requires API');
    
    const textarea = page.locator('textarea');
    const button = page.locator('button:has-text("Analyze")');
    
    await textarea.fill('Everyone is buying this product, so it must be the best option available!');
    await button.click();
    
    // Wait for results (with timeout for API response)
    await expect(page.locator('text=Analysis Summary')).toBeVisible({ timeout: 30000 });
    
    // Should show score
    await expect(page.locator('[class*="scoreValue"], [class*="score"]')).toBeVisible();
  });

  test('should show export options after analysis', async ({ page }) => {
    test.skip(process.env.CI === 'true', 'Skipping in CI - requires API');
    
    const textarea = page.locator('textarea');
    const button = page.locator('button:has-text("Analyze")');
    
    await textarea.fill('You are either with us or against us. There is no middle ground.');
    await button.click();
    
    // Wait for results
    await expect(page.locator('text=Analysis Summary')).toBeVisible({ timeout: 30000 });
    
    // Should show export buttons
    await expect(page.locator('text=Export PDF')).toBeVisible();
    await expect(page.locator('text=Export JSON')).toBeVisible();
  });

  test('should show share link after analysis', async ({ page }) => {
    test.skip(process.env.CI === 'true', 'Skipping in CI - requires API');
    
    const textarea = page.locator('textarea');
    const button = page.locator('button:has-text("Analyze")');
    
    await textarea.fill('This famous celebrity uses this product, so it must be effective.');
    await button.click();
    
    // Wait for results
    await expect(page.locator('text=Analysis Summary')).toBeVisible({ timeout: 30000 });
    
    // Should show share section
    await expect(page.locator('text=Share Link')).toBeVisible();
  });

  test('should handle API errors gracefully', async ({ page }) => {
    // Mock API to return error
    await page.route('**/api/analyze', async route => {
      await route.fulfill({
        status: 500,
        contentType: 'application/json',
        body: JSON.stringify({ success: false, error: { message: 'Server error' } }),
      });
    });
    
    const textarea = page.locator('textarea');
    const button = page.locator('button:has-text("Analyze")');
    
    await textarea.fill('Test text');
    await button.click();
    
    // Should show error message
    await expect(page.locator('text=/error|failed/i')).toBeVisible({ timeout: 5000 });
  });

  test('should handle rate limiting', async ({ page }) => {
    await page.route('**/api/analyze', async route => {
      await route.fulfill({
        status: 429,
        contentType: 'application/json',
        body: JSON.stringify({ success: false, error: { message: 'Rate limit exceeded' } }),
      });
    });
    
    const textarea = page.locator('textarea');
    const button = page.locator('button:has-text("Analyze")');
    
    await textarea.fill('Test text');
    await button.click();
    
    await expect(page.locator('text=/rate limit|too many/i')).toBeVisible({ timeout: 5000 });
  });
});

test.describe('Shared Analysis Page', () => {
  test('should display shared analysis', async ({ page }) => {
    // Mock the API response for shared analysis
    await page.route('**/api/analyze/share/**', async route => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          success: true,
          data: {
            id: 'test-id',
            text: 'Test analyzed text',
            summary: 'This is a test summary',
            score: 75,
            issues: [
              {
                id: 1,
                type: 'fallacy',
                name: 'Test Fallacy',
                severity: 'medium',
                quote: 'Test quote',
                explanation: 'Test explanation',
                suggestion: 'Test suggestion',
              },
            ],
            analyzedAt: new Date().toISOString(),
            metadata: {
              issueCount: 1,
              severityCounts: { low: 0, medium: 1, high: 0 },
              typeCounts: { fallacy: 1 },
            },
          },
        }),
      });
    });
    
    await page.goto('/share/test-share-id');
    
    await expect(page.locator('text=Shared Analysis')).toBeVisible();
    await expect(page.locator('text=This is a test summary')).toBeVisible();
    await expect(page.locator('text=75')).toBeVisible(); // Score
    await expect(page.locator('text=Test Fallacy')).toBeVisible();
  });

  test('should show error for invalid share link', async ({ page }) => {
    await page.route('**/api/analyze/share/**', async route => {
      await route.fulfill({
        status: 404,
        contentType: 'application/json',
        body: JSON.stringify({ success: false, error: { message: 'Not found' } }),
      });
    });
    
    await page.goto('/share/invalid-id');
    
    await expect(page.locator('text=/not found|no longer available/i')).toBeVisible();
  });
});
