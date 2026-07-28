import { test, expect } from '@playwright/test'

test.describe('Authentication', () => {
  test('login page loads', async ({ page }) => {
    await page.goto('/login')
    await expect(page).toHaveTitle(/Convoy/)
    await expect(page.getByRole('heading', { name: /sign in/i })).toBeVisible()
  })

  test('register page loads', async ({ page }) => {
    await page.goto('/register')
    await expect(page.getByRole('heading', { name: /create account/i })).toBeVisible()
  })

  test('login form validates empty fields', async ({ page }) => {
    await page.goto('/login')
    await page.getByRole('button', { name: /sign in/i }).click()
    await expect(page.getByText(/required/i).or(page.getByText(/invalid/i))).toBeVisible()
  })

  test('register validates weak password', async ({ page }) => {
    await page.goto('/register')
    await page.getByLabel(/password/i).fill('weak')
    await page.getByRole('button', { name: /create/i }).click()
    await expect(page.getByText(/password|characters|strength/i)).toBeVisible()
  })

  test('redirects to login for protected route', async ({ page }) => {
    await page.goto('/map')
    await page.waitForURL('/login')
    await expect(page.getByRole('heading', { name: /sign in/i })).toBeVisible()
  })

  test('register links to login', async ({ page }) => {
    await page.goto('/register')
    await page.getByRole('link', { name: /sign in/i }).click()
    await page.waitForURL('/login')
    await expect(page.getByRole('heading', { name: /sign in/i })).toBeVisible()
  })

  test('login links to register', async ({ page }) => {
    await page.goto('/login')
    await page.getByRole('link', { name: /create account/i }).click()
    await page.waitForURL('/register')
    await expect(page.getByRole('heading', { name: /create account/i })).toBeVisible()
  })
})
