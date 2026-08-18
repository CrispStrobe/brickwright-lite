/**
 * VdpScreen E2E probe: load eater6502-vdp-hello, Build Machine,
 * verify VdpScreen mounts AND paints a non-blank frame.
 *
 * Usage: node scripts/_tmp-vdp-probe.mjs [url] [screenshot.png]
 * Exits 0 on success, 1 on failure.
 */
import { chromium } from 'playwright';

const url = process.argv[2] || process.env.BW_URL || 'https://crispstrobe.github.io/brickwright-lite/';
const out = process.argv[3] || '/tmp/vdp-probe.png';

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1600, height: 1000 } });
const errors = [];
page.on('dialog', async d => { console.log(`  dialog: "${d.message().slice(0,60)}" → accept`); await d.accept(); });
page.on('console', m => { if (m.type() === 'error') errors.push(m.text().slice(0,200)); });
await page.addInitScript(() => { localStorage.clear(); });

console.log(`[1] Load app`);
await page.goto(url, { waitUntil: 'networkidle', timeout: 90000 });
await page.waitForSelector('[role="tab"]', { timeout: 60000 });

console.log(`[2] Circuit tab`);
await page.locator('[role="tab"]', { hasText: 'Circuit' }).first().click({ timeout: 10000 });
await page.waitForTimeout(2000);

console.log(`[3] Click VDP example`);
try {
  await page.locator('text=/VDP/i').first().click({ timeout: 6000 });
} catch (e) { console.log('  FAIL:', e.message.slice(0,80)); }
await page.waitForTimeout(2000);
// Accept the in-page confirm if it appears
try { await page.locator('button', { hasText: /^OK$/i }).first().click({ timeout: 3000 }); } catch {}
await page.waitForTimeout(5000);

console.log(`[4] Build Machine`);
try {
  await page.locator('button', { hasText: /Build Machine/i }).first().click({ timeout: 8000 });
  console.log('  → clicked');
} catch (e) { console.log('  FAIL:', e.message.slice(0,80)); }

console.log(`[5] Waiting 5s for machine extraction…`);
await page.waitForTimeout(5000);
await page.screenshot({ path: out.replace('.png', '-post-build.png') });

// Load a ROM to boot the machine
console.log(`[6] Loading ROM preset…`);
try {
  // Click "LCD Hello" or any available preset
  const preset = page.locator('button, [role="button"]', { hasText: /LCD Hello|Tali Forth|MS BASIC/i }).first();
  await preset.click({ timeout: 6000 });
  console.log('  → ROM preset clicked');
} catch (e) { console.log('  FAIL:', e.message.slice(0,80)); }

// Also click Run if visible
await page.waitForTimeout(2000);
try {
  await page.locator('button', { hasText: /^.?\s*Run$/i }).first().click({ timeout: 3000 });
  console.log('  → Run clicked');
} catch {}

console.log(`[7] Waiting 15s for VDP to render…`);
await page.waitForTimeout(15000);
await page.screenshot({ path: out.replace('.png', '-post-run.png') });

console.log(`[8] Check VdpScreen`);
const r = await page.evaluate(() => {
  const o = { vdp: false, nb: 0, size: null, noSig: false, canvases: 0, target: null };
  for (const c of document.querySelectorAll('canvas')) {
    const b = c.getBoundingClientRect();
    if (b.width < 10) continue;
    o.canvases++;
    if (c.width === 480 && c.height === 360) continue; // scratch stage
    if (c.width < 128 || c.height < 96) continue;
    o.vdp = true;
    o.size = `${c.width}x${c.height}`;
    try {
      const d = c.getContext('2d').getImageData(0,0,c.width,c.height).data;
      for (let i=0;i<d.length;i+=4) if (d[i]>8||d[i+1]>8||d[i+2]>8) o.nb++;
    } catch {}
  }
  o.noSig = /NO SIGNAL/i.test(document.body.innerText);
  try { const t = window.__benchTarget; o.target = t ? { hasVideo: typeof t.video==='function', returns: t.video?.() ? 'frame' : 'null' } : 'none'; } catch {}
  return o;
});

await page.screenshot({ path: out });

console.log(`\n=== RESULT ===`);
console.log(`VDP canvas:   ${r.vdp ? `YES (${r.size})` : 'NO'}`);
console.log(`Non-blank:    ${r.nb}`);
console.log(`NO SIGNAL:    ${r.noSig}`);
console.log(`Canvases:     ${r.canvases}`);
console.log(`Target:       ${JSON.stringify(r.target)}`);
console.log(`JS errors:    ${errors.length}`);
for (const e of errors.slice(0,3)) console.log(`  ${e}`);

const pass = r.vdp && r.nb > 100;
console.log(`\nVERDICT: ${pass ? 'PASS — VdpScreen mounted + painting' : r.vdp ? 'PARTIAL — mounted but blank' : r.noSig ? 'MOUNTED-NO-SIGNAL' : 'FAIL — not mounted'}`);
await browser.close();
process.exit(pass ? 0 : 1);
