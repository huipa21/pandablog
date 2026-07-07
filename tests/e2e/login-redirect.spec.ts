import { expect, test } from '@playwright/test'

const adminUsername = process.env.E2E_ADMIN_USERNAME ?? process.env.APP_LOGIN_USERNAME
const adminPassword = process.env.E2E_ADMIN_PASSWORD

test.describe('login redirects', () => {
  test('keeps the credential form visible for anonymous visitors', async ({ context, page }) => {
    await context.clearCookies()

    await page.goto('/login')

    await expect(page.locator('input[autocomplete="username"]')).toBeVisible()
    await expect(page.locator('input[autocomplete="current-password"]')).toBeVisible()
    await expect(page).toHaveURL(/\/login(?:\?.*)?$/)
  })

  test('sends authenticated admin-capable users to the dashboard by default', async ({ page }) => {
    test.skip(!adminUsername || !adminPassword, 'Set E2E_ADMIN_USERNAME and E2E_ADMIN_PASSWORD to run authenticated admin tests.')

    const loginResponse = await page.request.post('/api/auth/login', {
      data: {
        username: adminUsername,
        password: adminPassword
      }
    })
    expect(loginResponse.ok()).toBeTruthy()

    const login = await loginResponse.json() as {
      user?: { role?: string }
      mfa_required?: boolean
      mfa_enrollment_required?: boolean
    }
    test.skip(Boolean(login.mfa_required || login.mfa_enrollment_required), 'Authenticated E2E user requires MFA.')
    test.skip(login.user?.role === 'viewer', 'Authenticated E2E user cannot access the admin dashboard.')

    await page.goto('/login')

    await expect(page).toHaveURL(/\/admin\/dashboard(?:\?.*)?$/)
  })
})