import { chromium } from '@playwright/test';
import { mkdir } from 'node:fs/promises';
const browser = await chromium.launch();
await mkdir('artifacts', { recursive: true });
const issues = [];
for (const [name,width,height] of [['desktop',1440,1000],['mobile',390,844]]) {
  const page = await browser.newPage({viewport:{width,height},reducedMotion:'reduce'});
  for (const path of ['/', '/shop','/discover','/compare','/stores','/product/the-everyday-lounge-chair']) {
    await page.goto(`http://localhost:3187${path}`);
    await page.waitForLoadState('networkidle');
    const result = await page.evaluate(()=>({ overflow:document.documentElement.scrollWidth>innerWidth, small:[...document.querySelectorAll('body *')].filter(e=>{const s=getComputedStyle(e);return s.visibility!=='hidden'&&s.display!=='none'&&e.getClientRects().length&&[...e.childNodes].some(n=>n.nodeType===Node.TEXT_NODE&&n.textContent?.trim())&&parseFloat(s.fontSize)<14;}).map(e=>({text:e.textContent?.slice(0,45),size:getComputedStyle(e).fontSize})) }));
    if(result.overflow||result.small.length)issues.push({name,path,...result});
    if(path==='/')await page.screenshot({path:`artifacts/landing-${name}.png`,fullPage:true});
  }
  await page.close();
}
await browser.close();
console.log(JSON.stringify({routes:12,issues},null,2));
if(issues.length)process.exitCode=1;
