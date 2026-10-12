// Usage: npm run dev (in another shell), then: npm run shot -- [url] [waitMs] [outDir]
import { chromium } from 'playwright';
import { mkdirSync } from 'fs';

const url = process.argv[2] ?? 'http://localhost:5173/';
const waitMs = Number(process.argv[3] ?? 5000);
const outDir = process.argv[4] ?? 'screenshots';
mkdirSync(outDir, { recursive: true });

const sizes = [
  { name: 'phone', width: 390, height: 844, isMobile: true, hasTouch: true, deviceScaleFactor: 2 },
  { name: 'desktop', width: 1440, height: 900, isMobile: false, hasTouch: false, deviceScaleFactor: 1 },
];

const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
for (const s of sizes) {
  const page = await browser.newPage({ viewport: { width: s.width, height: s.height }, isMobile: s.isMobile, hasTouch: s.hasTouch, deviceScaleFactor: s.deviceScaleFactor });
  page.on('console', (m) => { if (m.type() === 'error') console.error(`[${s.name}]`, m.text()); });
  page.on('pageerror', (e) => console.error(`[${s.name}] pageerror`, e.message));
  await page.goto(url);
  await page.waitForTimeout(waitMs);
  await page.screenshot({ path: `${outDir}/${s.name}.png` });
  console.log(`wrote ${outDir}/${s.name}.png`);
  await page.close();
}
await browser.close();
