// Quick stills: node tools/shot.mjs <file.html> <hash1> [hash2 ...] -> review/shot/<n>.jpg  (hash like "t=20" or "f=2&a=.5")
import { chromium } from 'playwright'; import fs from 'node:fs'; import path from 'node:path';
const [file, ...hs] = process.argv.slice(2);
fs.mkdirSync('review/shot', { recursive: true });
const browser = await chromium.launch({ channel: 'chrome', headless: true, args: ['--autoplay-policy=no-user-gesture-required','--use-gl=angle','--use-angle=metal','--enable-gpu','--ignore-gpu-blocklist'] });
const ctx = await browser.newContext({ viewport: { width: 1280, height: 720 } });
const page = await ctx.newPage(); const errs = [];
page.on('console', m => m.type() === 'error' && errs.push(m.text())); page.on('pageerror', e => errs.push(String(e)));
let n = 0;
for (const h of hs) {
  await page.goto('file://' + path.resolve(file) + '?' + (n) + '#' + h + '&mute=1');
  await page.waitForTimeout(300); await page.mouse.click(640, 360); await page.waitForTimeout(600);
  const name = h.replace(/[^\w.=-]+/g, '_');
  await page.screenshot({ path: `review/shot/${name}.jpg`, type: 'jpeg', quality: 85 }); n++;
}
await browser.close(); if (errs.length) console.log('ERRORS', errs);
