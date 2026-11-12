import { test, expect } from '@playwright/test';
const password = 'BazaarDemo2026!';
test('comparison enforces four products and persists the shortlist', async ({ page }) => {
  await page.goto('/shop');
  const cards = page.locator('.product-card');
  await expect(cards.first()).toBeVisible();
  for (let i = 0; i < 4; i++)
    await cards.nth(i).getByRole('button', { name: 'Add to comparison', exact: true }).click();
  await cards.nth(4).getByRole('button', { name: 'Add to comparison', exact: true }).click();
  await expect(page.getByRole('status')).toContainText('Compare up to four');
  await page.goto('/compare');
  await expect(page.locator('.comparison-table thead th')).toHaveCount(5);
  await page.reload();
  await expect(page.locator('.comparison-table thead th')).toHaveCount(5);
  await page
    .getByRole('button', { name: /Remove .* from comparison/ })
    .first()
    .click();
  await expect(page.locator('.comparison-table thead th')).toHaveCount(4);
});
test('guest favourites merge into an account and sync to another browser', async ({
  page,
  browser,
}) => {
  await page.goto('/shop');
  await page
    .locator('.product-card')
    .first()
    .getByRole('button', { name: /^Save / })
    .click();
  const email = `discovery-${Date.now()}@bazaar.test`;
  const registered = await page.request.post('/api/auth/register', {
    data: { name: 'Discovery Customer', email, password },
  });
  expect(registered.ok()).toBeTruthy();
  await page.reload();
  await expect(page.getByRole('link', { name: /Wishlist, 1 saved/ })).toBeVisible();
  await expect
    .poll(async () => {
      const saved = await page.request.get('/api/discovery/saved');
      return (await saved.json()).length;
    })
    .toBe(1);
  const context = await browser.newContext({ baseURL: 'http://localhost:3187' });
  try {
    const logged = await context.request.post('/api/auth/login', { data: { email, password } });
    expect(logged.ok()).toBeTruthy();
    const other = await context.newPage();
    await other.goto('/wishlist');
    await expect(other.locator('.product-card')).toHaveCount(1);
    await other
      .locator('.product-card')
      .first()
      .getByRole('button', { name: /^Remove / })
      .click();
    await expect(other.locator('.product-card')).toHaveCount(0);
    await page.reload();
    await expect(page.getByRole('link', { name: /Wishlist, 0 saved/ })).toBeVisible();
  } finally {
    await context.close();
  }
});
test('price alerts, store following and personal recommendations work together', async ({
  page,
}) => {
  const email = `radar-${Date.now()}@bazaar.test`;
  expect(
    (
      await page.request.post('/api/auth/register', {
        data: { name: 'Radar Customer', email, password },
      })
    ).ok(),
  ).toBeTruthy();
  await page.goto('/shop');
  await page.locator('.product-card h3 a').first().click();
  await expect(page.getByRole('heading', { name: 'A little smarter shopping' })).toBeVisible();
  await page.getByRole('button', { name: 'Follow store', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Following', exact: true })).toBeVisible();
  await page.getByLabel('Target price in taka').fill('1');
  await page.getByRole('button', { name: 'Price alert', exact: true }).click();
  await expect(page.getByRole('status')).toContainText('Alert saved');
  await page.goto('/activity');
  await expect(page.locator('.radar-list article')).toHaveCount(1);
  await expect(page.locator('.followed-grid article')).toHaveCount(1);
  await page.getByRole('button', { name: /Delete alert for/ }).click();
  await expect(page.locator('.radar-list article')).toHaveCount(0);
  await page.goto('/discover');
  await expect(page.locator('.product-card').first()).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Recently on your radar' })).toBeVisible();
});
test('owner analytics offers scoped reporting and downloadable daily data', async ({ page }) => {
  expect(
    (
      await page.request.post('/api/auth/login', { data: { email: 'owner@form.test', password } })
    ).ok(),
  ).toBeTruthy();
  await page.goto('/vendor');
  await page.getByRole('button', { name: 'Analytics', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Business intelligence' })).toBeVisible();
  await page.getByLabel('Reporting window').selectOption('14');
  await expect(page.getByRole('img', { name: /Daily sales over 14 days/ })).toBeVisible();
  const download = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Export CSV' }).click();
  expect((await download).suggestedFilename()).toBe('bazaar-sales-14-days.csv');
});
