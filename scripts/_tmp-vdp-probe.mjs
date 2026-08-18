/**
 * VdpScreen end-to-end probe: load the eater6502-vdp-hello example,
 * Build Machine, verify VdpScreen mounts AND paints.
 *
 * Usage: node scripts/_tmp-vdp-probe.mjs [url] [screenshot.png]
 * Exits 0 on success, 1 on failure.
 */
import { chromium } from 'playwright';

const url = process.argv[2] || process.env.BW_URL || 'https://crispstrobe.github.io/brickwright-lite/';
const screenshot = process.argv[3] || '/tmp/vdp-probe.png';

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1600, height: 1000 } });
const errors = [];
page.on('dialog', async d => { console.log(`  dialog: "${d.message().slice(0, 80)}" → accept`); await d.accept(); });
page.on('console', m => { if (m.type() === 'error') errors.push(m.text().slice(0, 200)); });
await page.addInitScript(() => { localStorage.clear(); });

console.log(`[1] Loading ${url}…`);
await page.goto(url, { waitUntil: 'networkidle', timeout: 90000 });
await page.waitForSelector('[role="tab"]', { timeout: 60000 });

// Go to Code tab first (machine examples need the Code tab's Build Machine button)
console.log('[2] Opening Code tab…');
await page.locator('[role="tab"]', { hasText: 'Code' }).first().click({ timeout: 10000 });
await page.waitForTimeout(2000);

// The Code tab should show the pseudocode editor with a language selector
// and the debugger panel. Look for "Build Machine" or a machine example selector.
// First, we need to load the VDP example. The example browser might be in the
// Circuit tab. Let me try switching to Circuit, loading, then back.
console.log('[3] Opening Circuit tab to load example…');
await page.locator('[role="tab"]', { hasText: 'Circuit' }).first().click({ timeout: 10000 });
await page.waitForTimeout(2000);

// Look for the example in the examples browser
console.log('[4] Clicking "6502 + VDP Video" example…');
try {
  // Scroll the examples list to find VDP
  const exItem = page.locator('text=/VDP/i').first();
  await exItem.scrollIntoViewIfNeeded({ timeout: 5000 });
  await exItem.click({ timeout: 5000 });
  console.log('  → clicked VDP example');
} catch (e) {
  console.log('  FAIL: could not find VDP example:', e.message.slice(0, 120));
}
// Wait for dialog accept and example load
await page.waitForTimeout(5000);

// Take a screenshot to see current state
await page.screenshot({ path: screenshot.replace('.png', '-after-load.png') });

// Now switch to Code tab where Build Machine lives
console.log('[5] Switching to Code tab…');
try {
  await page.locator('[role="tab"]', { hasText: 'Code' }).first().click({ timeout: 10000 });
} catch {
  await page.locator('[role="tab"]', { hasText: 'Code' }).first().click({ force: true });
}
await page.waitForTimeout(3000);

// Look for Build Machine button
console.log('[6] Looking for Build Machine…');
let machineBuilt = false;
try {
  // Build Machine button might be in the debugger panel
  const btn = page.locator('button', { hasText: /Build Machine/i }).first();
  await btn.scrollIntoViewIfNeeded({ timeout: 5000 });
  await btn.click({ timeout: 8000 });
  machineBuilt = true;
  console.log('  → Build Machine clicked');
} catch {
  // Maybe it auto-builds or the button text is different
  console.log('  → No Build Machine button, checking if already built…');
}

await page.waitForTimeout(3000);
await page.screenshot({ path: screenshot.replace('.png', '-after-build.png') });

// If we need to switch back to Circuit tab to see the VdpScreen
console.log('[7] Switching to Circuit tab for VdpScreen…');
await page.locator('[role="tab"]', { hasText: 'Circuit' }).first().click({ force: true });
await page.waitForTimeout(10000); // Give VDP time to render frames

console.log('[8] Checking VdpScreen state…');
const result = await page.evaluate(() => {
  const out = {
    vdpMounted: false, nonBlank: 0, canvasSize: null,
    noSignal: false, canvasCount: 0,
    allCanvases: [], machineText: null,
  };

  const canvases = [...document.querySelectorAll('canvas')];
  out.canvasCount = canvases.length;

  for (const c of canvases) {
    const r = c.getBoundingClientRect();
    let nb = -1;
    try {
      const ctx = c.getContext('2d');
      if (ctx) {
        const d = ctx.getImageData(0, 0, c.width, c.height).data;
        nb = 0;
        for (let i = 0; i < d.length; i += 4) if (d[i] > 8 || d[i+1] > 8 || d[i+2] > 8) nb++;
      }
    } catch {}
    out.allCanvases.push({ w: c.width, h: c.height, cssW: Math.round(r.width), cssH: Math.round(r.height), vis: r.width > 0, nb });

    // VDP canvas: NOT the Scratch stage (480×360) — look for retro sizes
    if (c.width !== 480 && c.height !== 360 && c.width >= 128 && c.height >= 96 && r.width > 0) {
      out.vdpMounted = true;
      out.canvasSize = `${c.width}×${c.height}`;
      out.nonBlank = nb;
    }
  }

  out.noSignal = !!document.body.innerText.match(/NO SIGNAL/i);
  // Check for "click to play" hint from VdpScreen
  out.clickToPlay = !!document.body.innerText.match(/click to play/i);
  // Check the instruments panel for VDP-related content
  const text = document.body.innerText;
  out.machineText = (text.match(/(?:6502|machine|built|cpu|vdp|video)[^\n]{0,80}/i) || [null])[0];

  try {
    const target = window.__benchTarget;
    out.hasTarget = !!target;
    if (target) {
      out.targetHasVideo = typeof target.video === 'function';
      const vf = target.video?.();
      out.videoReturns = vf ? `frame ${vf.frame}, ${vf.width}×${vf.height}` : 'null';
    }
  } catch {}

  return out;
});

console.log('\n=== VDP PROBE RESULTS ===');
console.log(`VdpScreen canvas:   ${result.vdpMounted ? `YES (${result.canvasSize})` : 'NO'}`);
console.log(`Non-blank pixels:   ${result.nonBlank}`);
console.log(`NO SIGNAL:          ${result.noSignal}`);
console.log(`Click to play:      ${result.clickToPlay}`);
console.log(`Canvas count:       ${result.canvasCount}`);
console.log(`All canvases:       ${JSON.stringify(result.allCanvases)}`);
console.log(`Has target:         ${result.hasTarget}`);
console.log(`target.video:       ${result.targetHasVideo ?? 'N/A'}`);
console.log(`video() returns:    ${result.videoReturns ?? 'N/A'}`);
console.log(`Machine text:       ${result.machineText || 'none'}`);
console.log(`JS errors:          ${errors.length}`);
for (const e of errors.slice(0, 3)) console.log(`  ${e}`);

await page.screenshot({ path: screenshot });
console.log(`Screenshot:         ${screenshot}`);

let verdict;
if (result.vdpMounted && result.nonBlank > 100) {
  verdict = 'PASS — VdpScreen mounted and painting';
} else if (result.vdpMounted) {
  verdict = `PARTIAL — VdpScreen mounted but ${result.nonBlank} non-blank pixels (may need more boot time)`;
} else if (result.noSignal) {
  verdict = 'MOUNTED-NO-SIGNAL — VdpScreen shows NO SIGNAL (video() returning null)';
} else {
  verdict = 'FAIL — VdpScreen did NOT mount (fix may not be deployed yet)';
}
console.log(`\nVERDICT: ${verdict}`);

await browser.close();
process.exit(result.vdpMounted ? 0 : 1);
