import { chromium } from '@playwright/test';
import { mkdir } from 'node:fs/promises';
const browser = await chromium.launch();
await mkdir('artifacts', { recursive: true });
const issues = [];
let checks = 0;
const password = process.env.E2E_PASSWORD || 'BazaarDemo2026!';
for (const [name, width, height] of [['desktop', 1440, 1000], ['mobile', 390, 844]]) {
  const context = await browser.newContext({ viewport: { width, height }, reducedMotion: 'reduce' });
  const page = await context.newPage();
  async function audit(label) {
    await page.waitForLoadState('networkidle');
    checks++;
    const result = await page.evaluate(() => ({
      overflow: document.documentElement.scrollWidth > innerWidth,
      small: [...document.querySelectorAll('body *')].filter(e => {
        const s = getComputedStyle(e);
        return s.visibility !== 'hidden' && s.display !== 'none' && e.getClientRects().length && [...e.childNodes].some(n => n.nodeType === Node.TEXT_NODE && n.textContent?.trim()) && parseFloat(s.fontSize) < 14;
      }).map(e => ({ text: e.textContent?.slice(0, 45), size: getComputedStyle(e).fontSize }))
    }));
    if (result.overflow || result.small.length) issues.push({ name, path: label, ...result });
  }
  for (const path of ['/', '/shop', '/discover', '/compare', '/stores', '/product/the-everyday-lounge-chair']) {
    await page.goto(`http://localhost:3187${path}`);
    await audit(path);
    if (path === '/') await page.screenshot({ path: `artifacts/landing-${name}.png`, fullPage: true });
  }
  async function login(email) {
    const response = await context.request.post('http://localhost:3187/api/auth/login', { data: { email, password } });
    if (!response.ok()) throw new Error(`Audit sign-in failed: ${response.status()}`);
  }
  await login('customer@bazaar.test');
  for (const path of ['/business', '/rewards', '/subscriptions', '/newsletter']) {
    await page.goto(`http://localhost:3187${path}`);
    await audit(path);
    if (path === '/rewards') await page.screenshot({ path: `artifacts/rewards-${name}.png`, fullPage: true });
  }
  await login('owner@form.test');
  await page.goto('http://localhost:3187/vendor');
  for (const tab of ['Business sales', 'Analytics']) {
    await page.getByRole('button', { name: tab, exact: true }).click();
    await audit(`/vendor/${tab}`);
  }
  await login('admin@bazaar.test');
  await page.goto('http://localhost:3187/admin');
  for (const tab of ['Business verification', 'Marketing']) {
    await page.getByRole('button', { name: tab, exact: true }).click();
    await audit(`/admin/${tab}`);
  }
  await context.close();
}
await browser.close();
console.log(JSON.stringify({ checks, issues }, null, 2));
if (issues.length) process.exitCode = 1;
