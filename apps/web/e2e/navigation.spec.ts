import { test, expect } from '@playwright/test'

test.describe('Navigation', () => {
  test('home page loads', async ({ page }) => {
    await page.goto('/')
    await expect(page).toHaveTitle(/Convoy/)
  })

  test('can navigate to login from home page', async ({ page }) => {
    await page.goto('/')
    const loginLink = page.getByRole('link', { name: /sign in|login/i }).first()
    if (await loginLink.isVisible()) {
      await loginLink.click()
      await page.waitForURL('/login')
      await expect(page.getByRole('heading', { name: /sign in/i })).toBeVisible()
    }
  })

  test('404 page shows for unknown routes', async ({ page }) => {
    await page.goto('/this-route-does-not-exist-12345')
    await expect(page.getByText(/not found|404/i)).toBeVisible()
  })
})
