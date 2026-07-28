import { test, expect } from '@playwright/test'

test.describe('Map page', () => {
  test('redirects unauthenticated user to login', async ({ page }) => {
    await page.goto('/map')
    await page.waitForURL('/login')
    await expect(page.getByRole('heading', { name: /sign in/i })).toBeVisible()
  })

  test('has navigation elements', async ({ page }) => {
    await page.goto('/')
    const nav = page.locator('nav, header, [role="navigation"]')
    await expect(nav).toBeVisible()
  })
})
