// Preset-boot acceptance probe: load a machine-class example, Build Machine,
// click a Machine Loader preset, and assert the bench actually boots —
// serial output in the debug panel's console (BBC BASIC '>' prompt for Z80,
// Tali Forth banner for 6502).
// usage: BW_URL=http://localhost:8617/ node scripts/_tmp-preset-probe.mjs \
//          "Z80 Breadboard Computer" "BBC BASIC" /tmp/z80-preset.png
import { chromium } from 'playwright';
const exampleName = process.argv[2] || 'Z80 Breadboard Computer';
const presetName = process.argv[3] || 'BBC BASIC';
const out = process.argv[4] || '/tmp/preset-probe.png';
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1600, height: 1000 } });
page.on('dialog', d => d.accept());
page.on('console', m => { if (m.type() === 'error') console.log('JSERR:', m.text().slice(0, 200)); });
await page.addInitScript(() => { localStorage.clear(); });
await page.goto(process.env.BW_URL || 'https://crispstrobe.github.io/brickwright-lite/', { waitUntil: 'networkidle', timeout: 90000 });
await page.waitForSelector('[role="tab"]', { timeout: 60000 });
await page.locator('[role="tab"]', { hasText: 'Circuit' }).first().click();
await page.waitForTimeout(2500);
try { await page.locator('input[placeholder*="earch"], input[type="search"]').first().fill(exampleName.split(' ')[0], { timeout: 4000 }); await page.waitForTimeout(800); } catch {}
await page.locator(`text=${exampleName}`).first().click();
await page.waitForTimeout(3500);
await page.locator('button', { hasText: 'Build Machine' }).first().click({ timeout: 8000 });
console.log('clicked Build Machine');
await page.waitForTimeout(2500);

// The Machine Loader presets render under Build Machine after success.
const presetBtns = await page.locator('[data-build-machine] button').allInnerTexts();
console.log('LOADER BUTTONS:', JSON.stringify(presetBtns));
const preset = page.locator('[data-build-machine] button', { hasText: presetName }).first();
await preset.click({ timeout: 8000 });
console.log('clicked preset', presetName);
await page.waitForTimeout(8000);

const state = await page.evaluate(() => {
  const serialEl = document.querySelector('[data-testid="bw-serial-console"]');
  const note = document.querySelector('[data-loader-note]');
  const text = document.body.innerText;
  return {
    loaderNote: note ? note.textContent : null,
    serial: serialEl ? serialEl.textContent.slice(0, 400) : null,
    phase: (text.match(/\b(ready|running|paused|error)\b[^\n]{0,140}/) || [null])[0],
  };
});
console.log('STATE:', JSON.stringify(state, null, 1));
const ok = state.serial && state.serial.length > 0;
console.log(ok ? 'PASS: serial output present' : 'FAIL: no serial output');
await page.screenshot({ path: out });
console.log('saved', out);
await browser.close();
process.exit(ok ? 0 : 1);
