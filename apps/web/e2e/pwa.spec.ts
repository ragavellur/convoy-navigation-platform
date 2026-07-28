import { test, expect } from '@playwright/test'

test.describe('PWA', () => {
  test('manifest link exists in HTML head', async ({ page }) => {
    await page.goto('/')
    const manifestLink = page.locator('link[rel="manifest"]')
    await expect(manifestLink).toBeVisible()
    await expect(manifestLink).toHaveAttribute('href', /manifest/i)
  })

  test('service worker registers', async ({ page }) => {
    await page.goto('/')
    const hasSw = await page.evaluate(() => 'serviceWorker' in navigator)
    expect(hasSw).toBe(true)
  })
})
