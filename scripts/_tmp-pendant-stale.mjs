// Pendant stale-matrix probe: run the pendant, sample the matrix device
// state twice a few seconds apart, and report whether ANYTHING changed —
// engine-side. If the engine frames differ but the screen doesn't, the
// face is stale; if the engine frames are identical, the firmware/emulation
// (or missing EEPROM animation data) is the story.
import { chromium } from 'playwright';
const out = process.argv[2] || '/tmp/pendant-stale.png';
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1600, height: 1000 } });
page.on('dialog', d => d.accept());
await page.addInitScript(() => { localStorage.clear(); });
await page.goto('https://crispstrobe.github.io/brickwright-lite/', { waitUntil: 'networkidle', timeout: 90000 });
await page.waitForSelector('[role="tab"]', { timeout: 60000 });
await page.locator('[role="tab"]', { hasText: 'Circuit' }).first().click();
await page.waitForTimeout(2500);
try { await page.locator('input[placeholder*="earch"], input[type="search"]').first().fill('pendant', { timeout: 4000 }); await page.waitForTimeout(800); } catch {}
await page.locator('text=/pendant|blinkenrocket/i').first().click();
await page.waitForTimeout(3500);
for (const label of ['Sim mode', 'Power on']) {
  try { await page.locator(`[aria-label="${label}"]`).first().click({ timeout: 4000 }); await page.waitForTimeout(300); } catch {}
}
try { await page.locator('button', { hasText: 'Run' }).first().click({ timeout: 4000 }); } catch {}
await page.waitForTimeout(5000);

const sample = () => page.evaluate(() => {
  const b = window.__activeBoard || window.__board;
  const parts = b?.getParts?.() || [];
  const m = parts.find(p => p.kind === 'led_matrix' || p.kind === 'matrix8x8');
  if (!m) return { err: 'no matrix part; kinds: ' + parts.map(p => p.kind).join(',') };
  const ds = b.getDeviceState ? b.getDeviceState(m.id) : null;
  // Whatever shape the state has, serialize the frame-ish parts of it.
  const grid = ds && (ds.pixels || ds.frame || ds.grid || ds.rows || ds);
  return { id: m.id, frame: JSON.stringify(grid).slice(0, 2000), t: String(b.timeNs) };
});

const s1 = await sample();
await page.waitForTimeout(4000);
const s2 = await sample();
console.log('S1:', s1.err || `${s1.id} t=${s1.t} frame[0..120]=${(s1.frame || '').slice(0, 120)}`);
console.log('S2:', s2.err || `${s2.id} t=${s2.t} frame[0..120]=${(s2.frame || '').slice(0, 120)}`);
console.log('TIME ADVANCED:', s1.t !== s2.t);
console.log('FRAME CHANGED:', s1.frame !== s2.frame);
await page.screenshot({ path: out });
console.log('saved', out);
await browser.close();
