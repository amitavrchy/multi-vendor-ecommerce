import { test, expect } from '@playwright/test';
const password = process.env.E2E_PASSWORD || 'BazaarDemo2026!';
test('storefront search, saved items and responsive typography', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Good finds. For your everyday.' })).toBeVisible();
  await expect(page.locator('.product-card')).toHaveCount(8);
  await page.locator('.product-card').first().getByRole('button', { name: /Save/ }).click();
  await page.getByRole('link', { name: /Wishlist,/ }).click();
  await expect(page.locator('.product-card')).toHaveCount(1);
  await page.getByRole('textbox', { name: 'Search products' }).fill('headphones');
  await page.getByRole('textbox', { name: 'Search products' }).press('Enter');
  await expect(page.locator('.product-card')).toHaveCount(1);
  await expect(page.locator('.product-card h3')).toContainText('headphones');
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');
  await expect(page.locator('.category-card')).toHaveCount(6);
  const measurements = await page.evaluate(() => ({
    overflow: document.documentElement.scrollWidth > window.innerWidth,
    small: [...document.querySelectorAll('body *')]
      .filter((e) => {
        const s = getComputedStyle(e);
        return (
          s.display !== 'none' &&
          e.getClientRects().length > 0 &&
          [...e.childNodes].some((n) => n.nodeType === Node.TEXT_NODE && n.textContent?.trim()) &&
          parseFloat(s.fontSize) < 14
        );
      })
      .map((e) => ({ tag: e.tagName, size: getComputedStyle(e).fontSize })),
  }));
  expect(measurements.overflow).toBe(false);
  expect(measurements.small).toEqual([]);
});
test('customer checks out two stores, seller fulfills, customer reviews and requests return', async ({
  page,
  request,
}) => {
  const unique = Date.now();
  const email = `e2e-${unique}@bazaar.test`;
  await page.goto('/login');
  await page.getByRole('button', { name: 'Create account', exact: true }).click();
  await page.getByLabel('Your name').fill('Browser Customer');
  await page.getByLabel('Email address').fill(email);
  await page.getByLabel('Password', { exact: true }).fill(password);
  await page.getByRole('button', { name: 'Create your account' }).click();
  await expect(page).toHaveURL(/\/account$/);
  await page.getByRole('button', { name: 'Add', exact: true }).click();
  const dialog = page.getByRole('dialog');
  await dialog.getByLabel('Full name').fill('Browser Customer');
  await dialog.getByLabel('Phone number').fill('+8801700000000');
  await dialog.getByLabel('Street address').fill('House 12, Browser Test Street');
  await dialog.getByLabel('City', { exact: true }).fill('Dhaka');
  await dialog.getByLabel('Postal code').fill('1209');
  await dialog.getByRole('button', { name: 'Save address' }).click();
  await expect(dialog).toBeHidden();
  for (const slug of ['the-everyday-lounge-chair', 'studio-wireless-headphones']) {
    await page.goto(`/product/${slug}`);
    await page.getByRole('button', { name: /Add to bag —/ }).click();
    await expect(page.getByRole('status').filter({ hasText: 'Added to your bag' })).toBeVisible();
  }
  await page.goto('/cart');
  await expect(page.locator('.cart-vendor')).toHaveCount(2);
  await page.getByRole('link', { name: /Continue to checkout/ }).click();
  await page.getByRole('textbox', { name: 'Coupon code' }).fill('WELCOME10');
  await page.getByRole('button', { name: 'Apply', exact: true }).click();
  await expect(page.getByText(/WELCOME10 applied/)).toBeVisible();
  await page.getByRole('button', { name: 'Place your order' }).click();
  await expect(page).toHaveURL(/\/orders/);
  await expect(page.locator('.shipment')).toHaveCount(2);
  const ordersResponse = await page.request.get('/api/orders');
  const orders = await ordersResponse.json();
  const order = orders[0];
  expect(order.vendorOrders).toHaveLength(2);
  const admin = await request.post('/api/auth/login', {
    data: { email: 'admin@bazaar.test', password },
  });
  expect(admin.ok()).toBeTruthy();
  for (const vo of order.vendorOrders) {
    for (const status of ['PROCESSING', 'SHIPPED', 'DELIVERED']) {
      const response = await request.post(`/api/vendor/orders/${vo.id}/status`, {
        data: { status, ...(status === 'SHIPPED' ? { trackingNumber: 'BROWSER-TRACK-1' } : {}) },
      });
      expect(response.ok()).toBeTruthy();
    }
  }
  await page.reload();
  await page.getByRole('button', { name: 'Share a review' }).first().click();
  await page
    .getByRole('dialog')
    .getByLabel('Tell us a little more')
    .fill('Beautiful quality and a thoughtful everyday design.');
  await page.getByRole('dialog').getByRole('button', { name: 'Submit request' }).click();
  await expect(page.getByRole('dialog')).toBeHidden();
  await page.getByRole('button', { name: 'Request a return' }).first().click();
  await page
    .getByRole('dialog')
    .getByLabel('How can we help?')
    .fill('The find arrived damaged. Please arrange a return.');
  await page.getByRole('dialog').getByRole('button', { name: 'Submit request' }).click();
  await expect(page.getByRole('dialog')).toBeHidden();
  await expect(page.getByText('Requested', { exact: true })).toBeVisible();
});
test('vendor and admin workspaces enforce roles and load real data', async ({ page }) => {
  await page.goto('/login');
  await page.getByLabel('Email address').fill('owner@form.test');
  await page.getByLabel('Password', { exact: true }).fill(password);
  await page.getByRole('button', { name: 'Sign in', exact: true }).last().click();
  await expect(page).toHaveURL(/\/account$/);
  await page.goto('/vendor');
  await expect(page.getByRole('heading', { name: 'Form & Field', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Products', exact: true }).click();
  await expect(page.locator('tbody tr').first()).toBeVisible();
  await page.goto('/admin');
  await expect(page.getByRole('heading', { name: 'This space is for another role' })).toBeVisible();
  await page.getByRole('button', { name: 'Sign out' }).click();
  await expect(page).toHaveURL('http://localhost:3187/');
  await page.goto('/login');
  await page.getByLabel('Email address').fill('admin@bazaar.test');
  await page.getByLabel('Password', { exact: true }).fill(password);
  await page.getByRole('button', { name: 'Sign in', exact: true }).last().click();
  await expect(page).toHaveURL(/\/account$/);
  await page.goto('/admin');
  await expect(page.getByRole('heading', { name: 'Keep the good things growing.' })).toBeVisible();
  await page.getByRole('button', { name: 'Stores & KYC' }).click();
  expect(await page.locator('tbody tr').count()).toBeGreaterThanOrEqual(3);
});
test('API rejects privilege escalation, foreign inventory and unsigned webhooks', async ({
  request,
}) => {
  await request.post('/api/auth/login', { data: { email: 'customer@bazaar.test', password } });
  expect((await request.get('/api/admin/vendors')).status()).toBe(403);
  expect(
    (
      await request.patch('/api/vendor/products/variant-1/inventory', { data: { stockQty: 100 } })
    ).status(),
  ).toBe(403);
  expect(
    (await request.post('/api/payments/webhooks/COD', { data: { status: 'SUCCEEDED' } })).status(),
  ).toBe(400);
  await request.post('/api/auth/logout', { data: {} });
  expect((await request.get('/api/orders')).status()).toBe(401);
});

test('a new seller submits KYC and publishes a moderated product', async ({ page, request }) => {
  const suffix = String(Date.now());
  await page.goto('/login');
  await page.getByRole('button', { name: 'Create account', exact: true }).click();
  await page.getByLabel('Your name').fill('New Independent Seller');
  await page.getByLabel('Email address').fill(`seller-${suffix}@bazaar.test`);
  await page.getByLabel('Password', { exact: true }).fill(password);
  await page.getByRole('button', { name: 'Create your account' }).click();
  await expect(page).toHaveURL(/\/account$/);
  await page.goto('/sell');
  await page.getByLabel('Store name').fill(`Little Store ${suffix}`);
  await page.getByLabel('Store URL').fill(`little-store-${suffix}`);
  await page.getByLabel('Your story').fill('Thoughtful little things made with care.');
  await page.getByRole('button', { name: 'Start your seller journey' }).click();
  await expect(page).toHaveURL(/\/vendor$/);
  await page.getByRole('button', { name: 'Verification', exact: true }).click();
  await page.getByLabel('Legal business name').fill('Little Store Limited');
  await page.getByLabel('Trade license / registration').fill(`LICENSE-${suffix}`);
  await page.getByLabel('Secure document URL').fill('https://example.test/kyc/document.pdf');
  await page.getByRole('button', { name: 'Submit for verification' }).click();
  await expect(page.locator('.dashboard-status')).toContainText('Kyc Pending');
  const vendor = await (await page.request.get('/api/vendor/me')).json();
  expect(
    (
      await request.post('/api/auth/login', { data: { email: 'admin@bazaar.test', password } })
    ).ok(),
  ).toBeTruthy();
  expect(
    (await request.patch(`/api/admin/vendors/${vendor.id}`, { data: { status: 'ACTIVE' } })).ok(),
  ).toBeTruthy();
  await page.reload();
  await page.getByRole('button', { name: 'Products', exact: true }).click();
  await page.getByRole('button', { name: 'Add product' }).click();
  const dialog = page.getByRole('dialog');
  await dialog.getByLabel('Product title').fill(`Thoughtful browser find ${suffix}`);
  await dialog.getByLabel('URL slug').fill(`thoughtful-browser-find-${suffix}`);
  await dialog.getByLabel('SKU', { exact: true }).fill(`E2E-${suffix}`);
  await dialog
    .getByLabel('Description', { exact: true })
    .fill('A considered little everyday essential for a calmer home.');
  await dialog.getByLabel('Price (৳)', { exact: true }).fill('1250');
  await dialog.getByLabel('Stock quantity').fill('8');
  await dialog.getByRole('button', { name: 'Save draft for approval' }).click();
  await expect(dialog).toBeHidden();
  await expect(page.locator('tbody')).toContainText('Draft');
  const products = await (await page.request.get('/api/vendor/products')).json();
  expect(
    (
      await request.patch(`/api/admin/products/${products[0].id}`, { data: { status: 'ACTIVE' } })
    ).ok(),
  ).toBeTruthy();
  await page.goto(`/product/thoughtful-browser-find-${suffix}`);
  await expect(
    page.getByRole('heading', { name: `Thoughtful browser find ${suffix}`, exact: true }),
  ).toBeVisible();
  await expect(page.getByText('In stock · 8 available')).toBeVisible();
});
