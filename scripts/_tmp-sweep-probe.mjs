// Sweep panel on-deploy probe: load the RC scope example, open the Sweep
// panel, run a V/I sweep, report the status line and screenshot.
import { chromium } from 'playwright';
const out = process.argv[2] || '/tmp/sweep-probe.png';
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1600, height: 1000 } });
page.on('dialog', d => d.accept());
await page.addInitScript(() => { localStorage.clear(); });
await page.goto('https://crispstrobe.github.io/brickwright-lite/', { waitUntil: 'networkidle', timeout: 90000 });
await page.waitForSelector('[role="tab"]', { timeout: 60000 });
await page.locator('[role="tab"]', { hasText: 'Circuit' }).first().click();
await page.waitForTimeout(2500);
try { await page.locator('input[placeholder*="earch"], input[type="search"]').first().fill('RC', { timeout: 4000 }); await page.waitForTimeout(800); } catch {}
await page.locator('text=/RC low-pass|low-pass|RC.*scope/i').first().click();
await page.waitForTimeout(3000);
const toggle = page.locator('[data-testid="bw-sweep-toggle"]');
console.log('toggle present:', await toggle.count());
await toggle.first().click();
await page.waitForTimeout(500);
const panel = page.locator('[data-testid="bw-sweep-panel"]');
console.log('panel present:', await panel.count());
await page.locator('[data-testid="bw-sweep-run"]').first().click();
await page.waitForTimeout(4000);
const status = await panel.evaluate(el => el.innerText.replace(/\n+/g, ' | ').slice(0, 300)).catch(() => 'no panel');
console.log('PANEL:', status);
await page.screenshot({ path: out });
console.log('saved', out);
await browser.close();
