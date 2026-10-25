// Machine-class example probe: these examples (6502/Z80/VDP…) run through
// "Build Machine", not the MCU debugger's Run. Loads the example, builds the
// machine, waits, then reports machine + face state and screenshots.
// usage: node scripts/_tmp-machine-probe.mjs "<example name>" /tmp/out.png [search]
import { chromium } from 'playwright';
const name = process.argv[2], out = process.argv[3], search = process.argv[4] || name.split(' ')[0];
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1600, height: 1000 } });
page.on('dialog', d => d.accept());
page.on('console', m => { if (m.type() === 'error') console.log('JSERR:', m.text().slice(0, 200)); });
await page.addInitScript(() => { localStorage.clear(); });
await page.goto(process.env.BW_URL || 'https://crispstrobe.github.io/brickwright-lite/', { waitUntil: 'networkidle', timeout: 90000 });
await page.waitForSelector('[role="tab"]', { timeout: 60000 });
await page.locator('[role="tab"]', { hasText: 'Circuit' }).first().click();
await page.waitForTimeout(2500);
try { await page.locator('input[placeholder*="earch"], input[type="search"]').first().fill(search, { timeout: 4000 }); await page.waitForTimeout(800); } catch {}
await page.locator(`text=${name}`).first().click();
await page.waitForTimeout(3500);
try { await page.locator('button', { hasText: 'Build Machine' }).first().click({ timeout: 6000 }); console.log('clicked Build Machine'); }
catch (e) { console.log('NO Build Machine button:', e.message.slice(0, 120)); }
await page.waitForTimeout(9000);
const state = await page.evaluate(() => {
  const text = document.body.innerText;
  const canvases = [...document.querySelectorAll('canvas')].map(c => {
    const r = c.getBoundingClientRect();
    let nonBlank = -1;
    try {
      const ctx = c.getContext('2d');
      if (ctx) {
        const d = ctx.getImageData(0, 0, c.width, c.height).data;
        nonBlank = 0;
        for (let i = 0; i < d.length; i += 40) { if (d[i] > 8 || d[i + 1] > 8 || d[i + 2] > 8) nonBlank++; }
      }
    } catch { /* tainted or webgl */ }
    return { w: c.width, h: c.height, cssW: Math.round(r.width), cssH: Math.round(r.height), visible: r.width > 0, nonBlank };
  });
  return {
    machineRunning: /machine|running|halted|cpu/i.test(text) ? (text.match(/[A-Za-z ]*(?:running|halted)[A-Za-z ]*/i) || [''])[0].trim() : null,
    canvases,
    hasVdpFace: !!document.querySelector('[data-testid*="vdp"], [class*="vdp"], [class*="Vdp"]'),
    errBanner: (text.match(/error[^\n]{0,120}/i) || [null])[0],
  };
});
console.log('MACHINE:', JSON.stringify(state, null, 1));
await page.screenshot({ path: out });
console.log('saved', out);
await browser.close();
