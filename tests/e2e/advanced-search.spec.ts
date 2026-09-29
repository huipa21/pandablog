import { expect, test } from '@playwright/test'

const adminUsername = process.env.E2E_ADMIN_USERNAME ?? process.env.APP_LOGIN_USERNAME
const adminPassword = process.env.E2E_ADMIN_PASSWORD

/** Letters-only unique word (digits would split the token in the search analyzer). */
function uniqueWord() {
  const letters = 'abcdefghijklmnopqrstuvwxyz'
  let suffix = ''
  let value = Date.now()
  while (value > 0) {
    suffix += letters[value % 26]
    value = Math.floor(value / 26)
  }
  return `zebra${suffix}`
}

test('advanced search dropdown finds posts with a typo (fuzzy) and applies filters', async ({ page }) => {
  test.skip(!adminUsername || !adminPassword, 'Set E2E_ADMIN_USERNAME and E2E_ADMIN_PASSWORD to run authenticated search tests.')

  await page.setViewportSize({ width: 1366, height: 900 })
  const loginResponse = await page.request.post('/api/auth/login', {
    data: { username: adminUsername, password: adminPassword }
  })
  expect(loginResponse.ok(), `login failed: ${await loginResponse.text()}`).toBeTruthy()

  const word = uniqueWord()
  // Swap two adjacent letters in the middle: one Damerau-Levenshtein edit.
  const typo = `${word.slice(0, 2)}${word[3]}${word[2]}${word.slice(4)}`
  const title = `Advanced search ${word}`

  const createResponse = await page.request.post('/api/admin/posts', {
    data: {
      title,
      status: 'published',
      content_json: {
        type: 'doc',
        content: [{ type: 'paragraph', content: [{ type: 'text', text: `Body mentions ${word} once.` }] }]
      }
    }
  })
  expect(createResponse.ok(), `create failed: ${await createResponse.text()}`).toBeTruthy()
  const post = await createResponse.json() as { id: string }

  try {
    // API: exact and typo-tolerant matches, exact tier first.
    const exact = await (await page.request.get('/api/search', { params: { q: word } })).json()
    expect(exact.results.map((result: { post: { title: string }, tier: string }) => [result.post.title, result.tier])).toContainEqual([title, 'exact'])
    const fuzzy = await (await page.request.get('/api/search', { params: { q: typo } })).json()
    expect(fuzzy.results.map((result: { post: { title: string }, tier: string }) => [result.post.title, result.tier])).toContainEqual([title, 'fuzzy'])

    // UI: open the ▾ dropdown on the search page, enter comma separated keywords, submit.
    await page.goto('/search')
    await page.waitForLoadState('networkidle')
    await page.getByTestId('search-advanced-toggle').first().click()
    const panel = page.getByTestId('search-advanced-panel')
    await expect(panel).toBeVisible()
    await panel.getByTestId('search-advanced-keywords').first().fill(`${typo}, nosuchwordzzzz`)
    await panel.getByTestId('search-advanced-submit').click()

    await expect(page).toHaveURL(/\/search\?.*kw=or/)
    await expect(page.getByTestId('search-active-filters')).toBeVisible()
    await expect(page.getByTestId('search-results').getByRole('link', { name: title })).toBeVisible()

    // A date filter that excludes the post removes it from the results.
    await page.getByTestId('search-advanced-toggle').first().click()
    await page.getByTestId('search-advanced-date').click()
    await page.getByRole('option', { name: /custom/i }).click()
    await page.getByTestId('search-advanced-start').fill('2000-01-01')
    await page.getByTestId('search-advanced-end').fill('2000-12-31')
    await page.getByTestId('search-advanced-submit').click()
    await expect(page).toHaveURL(/date=custom/)
    await expect(page.getByTestId('search-results')).toBeHidden()
  } finally {
    // First delete archives, second delete removes the post.
    await page.request.delete(`/api/admin/posts/${encodeURIComponent(post.id)}`).catch(() => undefined)
    await page.request.delete(`/api/admin/posts/${encodeURIComponent(post.id)}`).catch(() => undefined)
  }
})
