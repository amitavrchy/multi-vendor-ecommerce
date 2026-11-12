import { test, expect } from '@playwright/test';
const password = process.env.E2E_PASSWORD || 'BazaarDemo2026!';
test('business buyer verifies, negotiates with a seller and checks out a quote without a bag', async ({
  page,
  browser,
}) => {
  const unique = Date.now(),
    legalName = `Browser Procurement ${unique}`;
  expect(
    (
      await page.request.post('/api/auth/register', {
        data: { email: `business-${unique}@bazaar.test`, name: 'Business Buyer', password },
      })
    ).ok(),
  ).toBeTruthy();
  await page.goto('/business');
  await page.getByLabel('Legal business name').fill(legalName);
  await page.getByLabel('Registration number').fill(`BIZ-${unique}`);
  await page.getByLabel('Billing address').fill('Dhaka procurement office, road 12');
  await page.getByRole('button', { name: 'Submit for verification' }).click();
  await expect(page.getByText('Pending', { exact: true })).toBeVisible();
  const me = await (await page.request.get('/api/auth/me')).json();
  expect(
    (
      await page.request.patch(`/api/business/admin/applications/${me.id}`, {
        data: { status: 'APPROVED', reviewNote: 'Unauthorized buyer attempt' },
      })
    ).status(),
  ).toBe(403);
  const admin = await browser.newContext({ baseURL: 'http://localhost:3187' }),
    seller = await browser.newContext({ baseURL: 'http://localhost:3187' });
  try {
    expect(
      (
        await admin.request.post('/api/auth/login', {
          data: { email: 'admin@bazaar.test', password },
        })
      ).ok(),
    ).toBeTruthy();
    const adminPage = await admin.newPage();
    await adminPage.goto('/admin');
    await adminPage.getByRole('button', { name: 'Business verification', exact: true }).click();
    const application = adminPage.locator('.growth-record').filter({ hasText: legalName });
    await application.getByLabel('Review note').fill('Verified business for browser test');
    await application.getByRole('button', { name: 'Save decision' }).click();
    await expect(application.getByText('Approved', { exact: true })).toBeVisible();
    expect(
      (
        await seller.request.post('/api/auth/login', {
          data: { email: 'owner@form.test', password },
        })
      ).ok(),
    ).toBeTruthy();
    const inventory = await (await seller.request.get('/api/vendor/products')).json();
    const product = inventory.find(
      (p: { status: string; variants: { stockQty: number; reservedQty: number }[] }) =>
        p.status === 'ACTIVE' && p.variants[0].stockQty - p.variants[0].reservedQty >= 2,
    );
    expect(product).toBeTruthy();
    await page.goto(`/product/${product.slug}`);
    await page.locator('summary').filter({ hasText: 'Business & wholesale' }).click();
    await page.getByLabel('Quote quantity').fill('2');
    await page
      .getByLabel('Your requirements')
      .fill('Please quote for our new office buying program');
    await page.getByRole('button', { name: 'Request quote', exact: true }).click();
    await expect(page.getByRole('status')).toContainText('Quote requested');
    const sellerPage = await seller.newPage();
    await sellerPage.goto('/vendor');
    await sellerPage.getByRole('button', { name: 'Business sales', exact: true }).click();
    const request = sellerPage.locator('.growth-record').filter({ hasText: legalName }).first();
    await request.getByLabel('Offer unit price (৳)').fill('1');
    await request.getByLabel('Offer note').fill('Browser negotiated offer for two units');
    await request.getByRole('button', { name: 'Send offer' }).click();
    await expect(request.getByText('Offered', { exact: true })).toBeVisible();
    await page.goto('/business');
    await page.getByRole('button', { name: 'Accept offer' }).click();
    await page.getByRole('link', { name: 'Checkout quote' }).click();
    await expect(page.getByRole('heading', { name: 'Make it yours.' })).toBeVisible();
    const address = await page.request.post('/api/profile/addresses', {
      data: {
        label: 'Office',
        name: 'Business Buyer',
        phone: '+8801700000000',
        line1: 'Dhaka procurement office, road 12',
        city: 'Dhaka',
        postalCode: '1209',
      },
    });
    expect(address.ok()).toBeTruthy();
    await page.reload();
    await expect(page.getByRole('button', { name: 'Place your order' })).toBeEnabled();
    await page.getByRole('button', { name: 'Place your order' }).click();
    await expect(page).toHaveURL(/\/orders/);
    await expect(
      page
        .getByRole('heading', { name: /Your order|Every order|Good things|Your good finds/i })
        .first(),
    ).toBeVisible();
    const orders = await (await page.request.get('/api/orders')).json();
    expect(orders[0].goodsMinor).toBe(200);
    expect(orders[0].sourceKind).toBe('QUOTE');
  } finally {
    await admin.close();
    await seller.close();
  }
});
test('a shopper creates, skips, pauses and cancels a replenishment subscription', async ({
  page,
}) => {
  const unique = Date.now();
  expect(
    (
      await page.request.post('/api/auth/register', {
        data: { email: `repeat-${unique}@bazaar.test`, name: 'Repeat Shopper', password },
      })
    ).ok(),
  ).toBeTruthy();
  await page.goto('/shop');
  await page.locator('.product-card h3 a').first().click();
  await page.locator('summary').filter({ hasText: 'Keep the good things coming' }).click();
  await page.getByLabel('Prepare the first renewal now').check();
  await page.getByRole('button', { name: 'Create subscription', exact: true }).click();
  await expect(page.getByRole('status')).toContainText('Subscription saved');
  await page.goto('/subscriptions');
  await expect
    .poll(
      async () => {
        const list = await (await page.request.get('/api/subscriptions')).json();
        return list[0]?.renewals.length || 0;
      },
      { timeout: 25000 },
    )
    .toBe(1);
  await page.reload();
  await expect(page.getByRole('link', { name: 'Review & checkout renewal' })).toBeVisible();
  await page.getByRole('button', { name: 'Skip this renewal' }).click();
  await expect(page.getByText('Skipped', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Pause', exact: true }).click();
  await expect(page.getByText('Paused', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Resume', exact: true }).click();
  await page.getByRole('button', { name: 'Cancel subscription', exact: true }).click();
  await expect(page.getByText('Cancelled', { exact: true })).toBeVisible();
});
test('rewards expose a private referral code and prevent unearned redemption', async ({ page }) => {
  expect(
    (
      await page.request.post('/api/auth/register', {
        data: { email: `rewards-${Date.now()}@bazaar.test`, name: 'Rewards Shopper', password },
      })
    ).ok(),
  ).toBeTruthy();
  await page.goto('/rewards');
  await expect(page.getByRole('heading', { name: 'Your Bazaar rewards.' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Redeem 100 points' })).toBeDisabled();
  await expect(page.locator('.referral-code code')).toHaveText(/^[A-F0-9]{12}$/);
  const code = await page.locator('.referral-code code').innerText();
  await page.getByLabel('Have a friend’s code?').fill(code);
  await page.getByRole('button', { name: 'Claim referral' }).click();
  await expect(page.getByRole('status')).toContainText('another shopper');
});
test('marketing drafts stay private and newsletter failures are explicit', async ({ page }) => {
  expect((await page.request.get('/api/marketing/campaigns')).status()).toBe(401);
  expect(
    (
      await page.request.post('/api/auth/login', { data: { email: 'admin@bazaar.test', password } })
    ).ok(),
  ).toBeTruthy();
  await page.goto('/admin');
  await page.getByRole('button', { name: 'Marketing', exact: true }).click();
  const title = `Browser draft ${Date.now()}`;
  await page.getByLabel('Campaign subject').fill(title);
  await page
    .getByLabel('Message', { exact: true })
    .fill('Thoughtful new finds for our confirmed subscribers.');
  await page.getByRole('button', { name: 'Create draft' }).click();
  await expect(page.getByRole('heading', { name: title })).toBeVisible();
  await page.goto('/newsletter?confirm=invalid');
  await page.getByRole('button', { name: 'Confirm subscription', exact: true }).click();
  await expect(page.locator('p[role=alert]')).toBeVisible();
});
