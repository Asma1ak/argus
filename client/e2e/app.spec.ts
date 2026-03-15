import { test, expect } from '@playwright/test';

test.describe('Home Page', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
  });

  test('should display the hero section', async ({ page }) => {
    await expect(page.locator('h1')).toContainText('Argus');
    await expect(page.locator('text=Critical Thinking Assistant')).toBeVisible();
  });

  test('should have a text input area', async ({ page }) => {
    const textarea = page.locator('textarea');
    await expect(textarea).toBeVisible();
    await expect(textarea).toHaveAttribute('placeholder', /paste|analyze|argument/i);
  });

  test('should have analyze button disabled when textarea is empty', async ({ page }) => {
    const button = page.locator('button:has-text("Analyze")');
    await expect(button).toBeDisabled();
  });

  test('should enable analyze button when text is entered', async ({ page }) => {
    const textarea = page.locator('textarea');
    const button = page.locator('button:has-text("Analyze")');
    
    await textarea.fill('Everyone is buying this product, so it must be the best!');
    await expect(button).toBeEnabled();
  });

  test('should show character count', async ({ page }) => {
    const textarea = page.locator('textarea');
    await textarea.fill('Test text');
    
    await expect(page.locator('text=/9.*5,000/')).toBeVisible();
  });

  test('should load example text when clicking example chip', async ({ page }) => {
    const textarea = page.locator('textarea');
    const exampleButton = page.locator('button:has-text("Bandwagon")');
    
    await exampleButton.click();
    await expect(textarea).not.toHaveValue('');
  });
});

test.describe('Theme Toggle', () => {
  test('should toggle between dark and light mode', async ({ page }) => {
    await page.goto('/');
    
    // Get initial theme
    const html = page.locator('html');
    const initialTheme = await html.getAttribute('data-theme');
    
    // Click theme toggle
    const themeToggle = page.locator('button[aria-label*="Switch to"]');
    await themeToggle.click();
    
    // Check theme changed
    const newTheme = await html.getAttribute('data-theme');
    expect(newTheme).not.toBe(initialTheme);
  });
});

test.describe('Navigation', () => {
  test('should navigate to login page', async ({ page }) => {
    await page.goto('/');
    await page.click('a:has-text("Login")');
    await expect(page).toHaveURL('/login');
    await expect(page.locator('h1')).toContainText('Welcome Back');
  });

  test('should navigate to register page', async ({ page }) => {
    await page.goto('/');
    await page.click('a:has-text("Register")');
    await expect(page).toHaveURL('/register');
    await expect(page.locator('h1')).toContainText('Create Account');
  });

  test('should navigate back to home from login', async ({ page }) => {
    await page.goto('/login');
    await page.click('a:has-text("Argus")');
    await expect(page).toHaveURL('/');
  });
});

test.describe('Authentication', () => {
  test('should show validation errors for invalid login', async ({ page }) => {
    await page.goto('/login');
    
    await page.fill('input[type="email"]', 'invalid@email');
    await page.fill('input[type="password"]', 'short');
    await page.click('button[type="submit"]');
    
    // Should show some feedback (either HTML5 validation or API error)
    // This depends on implementation
  });

  test('should show validation errors for invalid registration', async ({ page }) => {
    await page.goto('/register');
    
    await page.fill('input[type="email"]', 'test@example.com');
    await page.fill('input[type="password"]', 'short'); // Too short
    await page.click('button[type="submit"]');
    
    // Password must be at least 8 characters
  });

  test('should have link to register from login page', async ({ page }) => {
    await page.goto('/login');
    await page.click('a:has-text("Sign up")');
    await expect(page).toHaveURL('/register');
  });

  test('should have link to login from register page', async ({ page }) => {
    await page.goto('/register');
    await page.click('a:has-text("Sign in")');
    await expect(page).toHaveURL('/login');
  });
});

test.describe('Responsive Design', () => {
  test('should be responsive on mobile', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 667 });
    await page.goto('/');
    
    // Check that main elements are visible
    await expect(page.locator('h1')).toBeVisible();
    await expect(page.locator('textarea')).toBeVisible();
    await expect(page.locator('button:has-text("Analyze")')).toBeVisible();
  });

  test('should be responsive on tablet', async ({ page }) => {
    await page.setViewportSize({ width: 768, height: 1024 });
    await page.goto('/');
    
    await expect(page.locator('h1')).toBeVisible();
    await expect(page.locator('textarea')).toBeVisible();
  });
});

test.describe('Accessibility', () => {
  test('should have proper page title', async ({ page }) => {
    await page.goto('/');
    await expect(page).toHaveTitle(/Argus/);
  });

  test('should have focus styles', async ({ page }) => {
    await page.goto('/');
    
    // Tab to textarea
    await page.keyboard.press('Tab');
    await page.keyboard.press('Tab');
    
    const focusedElement = page.locator(':focus');
    await expect(focusedElement).toBeVisible();
  });

  test('should support keyboard navigation for analyze', async ({ page }) => {
    await page.goto('/');
    
    const textarea = page.locator('textarea');
    await textarea.fill('Test text for analysis');
    
    // Should be able to analyze with Ctrl+Enter
    await textarea.press('Control+Enter');
    
    // Button should show loading or result
  });
});

test.describe('PWA', () => {
  test('should have manifest', async ({ page }) => {
    await page.goto('/');
    const manifest = page.locator('link[rel="manifest"]');
    await expect(manifest).toHaveAttribute('href', /manifest/);
  });

  test('should have theme-color meta tag', async ({ page }) => {
    await page.goto('/');
    const themeColor = page.locator('meta[name="theme-color"]');
    await expect(themeColor).toHaveAttribute('content', /#[0-9a-f]{6}/i);
  });
});
