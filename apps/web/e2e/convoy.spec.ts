import { test, expect } from '@playwright/test'

test.describe('Convoy page', () => {
  test('redirects unauthenticated user to login', async ({ page }) => {
    await page.goto('/convoy')
    await page.waitForURL('/login')
    await expect(page.getByRole('heading', { name: /sign in/i })).toBeVisible()
  })

  test('convoy create button exists on home page', async ({ page }) => {
    await page.goto('/')
    await expect(
      page
        .getByRole('link', { name: /create|new convoy/i })
        .or(page.getByRole('button', { name: /create|new convoy/i })),
    ).toBeVisible()
  })
})
