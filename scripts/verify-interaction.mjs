#!/usr/bin/env node
/**
 * Playwright interaction tests for the schematic camera.
 *
 * Prerequisites:
 *   - playwright installed (`npm install playwright && npx playwright install chromium`)
 *   - the site deployed to GitHub Pages (runs against the live URL)
 *
 * WHY THESE TESTS EXIST AND CANNOT BE REPLACED:
 *
 * These three scenarios test hit-testing after a camera transform. They
 * cannot be replaced by rendered-geometry checks, overlap counts, net
 * counts, or any other measurement that reads the SVG's visual output,
 * because all of those pass identically whether or not the browser's
 * hit regions follow the transform. A symbol that is visible but
 * unclickable looks perfect in every rendered-geometry test and fails
 * only when a user (or elementFromPoint) tries to interact with it.
 *
 * The camera (a798d56) works by changing the SVG viewBox — pan shifts
 * x/y, zoom changes k which scales the viewport width/height. SVG
 * elements stay at their original coordinates; only the viewport moves.
 * The browser recomputes hit regions from the viewBox, unlike CSS
 * transforms which can leave hit regions at old coordinates. These
 * tests verify that contract holds after each transform type.
 *
 * Three scenarios, tested on the 01-blink example (6 symbols, "5V" label):
 *
 *   1. PAN: wheel-scroll pans the view. The "5V" text moves ~155px
 *      rightward on screen. elementFromPoint at the NEW position must
 *      hit a symbol; at the OLD position must hit nothing (svg background).
 *
 *   2. CURSOR-ANCHORED ZOOM: ctrl+wheel zooms at the cursor, which is
 *      placed ON the symbol. The text grows from ~17px to ~55px wide.
 *      The symbol stays nearly in place (≤15px shift) because the zoom
 *      anchor IS the symbol. elementFromPoint at the new position must
 *      hit the symbol. The old position ALSO hits, which is correct —
 *      not a stale region, but the anchor keeping the target stationary.
 *
 *   3. PAN + ZOOM combined: pan first (moves the symbol), then
 *      cursor-anchored zoom at the symbol's new location. The old
 *      position must miss; the new must hit.
 *
 * Usage:
 *   node scripts/verify-interaction.mjs
 */

import { chromium } from 'playwright';

const URL = 'https://crispstrobe.github.io/brickwright-lite/';

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1400, height: 900 } });
page.on('dialog', async d => { await d.accept(); });

await page.goto(URL, { waitUntil: 'networkidle', timeout: 60000 });
await page.waitForSelector('[role="tab"]', { timeout: 60000 });

// Navigate to Circuit tab, full width, load example
await page.locator('[role="tab"]', { hasText: /circuit/i }).click();
await page.waitForTimeout(3000);
try { await page.locator('button', { hasText: 'Full width' }).click({ timeout: 2000 }); } catch {}
try { await page.locator('button', { hasText: 'Examples' }).click({ timeout: 2000 }); } catch {}
await page.waitForTimeout(2000);

// Load 01-blink via CircuitTab fiber
await page.evaluate(async () => {
  const guiEl = document.querySelector('[class*="gui_body"]') ||
                document.querySelector('[class*="gui"]');
  const key = Object.keys(guiEl).find(k =>
    k.startsWith('__reactFiber') || k.startsWith('__reactInternalInstance'));
  const queue = [guiEl[key]];
  for (let i = 0; i < 8000 && queue.length; i++) {
    const f = queue.shift();
    if (f && f.stateNode && typeof f.stateNode.loadExample === 'function'
        && f.stateNode.state && Array.isArray(f.stateNode.state.examples)
        && f.stateNode.state.examples.length > 0) {
      window.__bwCT = f.stateNode;
      break;
    }
    if (f && f.child) queue.push(f.child);
    if (f && f.sibling) queue.push(f.sibling);
  }
  if (window.__bwCT) await window.__bwCT.loadExample(window.__bwCT.state.examples[0]);
});
await page.waitForTimeout(3000);

// Switch to Schematic view
await page.locator('button', { hasText: 'Schematic' }).first().click({ force: true });
await page.waitForTimeout(2000);

// ── Helpers ──────────────────────────────────────────────────────────────

/** Find the screen position and size of a named text label inside a symbol <g>. */
function getSymbolTextPos(label) {
  return page.evaluate((lbl) => {
    const svg = document.querySelector('svg[data-schematic]');
    const syms = [...svg.querySelectorAll(':scope > g')].filter(
      g => g.getAttribute('stroke-linecap') === 'round');
    for (const g of syms) {
      for (const t of g.querySelectorAll('text')) {
        if (t.textContent.trim() === lbl) {
          const r = t.getBoundingClientRect();
          return { cx: Math.round(r.left + r.width / 2),
                   cy: Math.round(r.top + r.height / 2),
                   w: Math.round(r.width), h: Math.round(r.height) };
        }
      }
    }
    return null;
  }, label);
}

/**
 * Hit-test at a screen coordinate. Returns whether the element under
 * that point is inside any symbol <g> (stroke-linecap="round").
 *
 * Uses elementFromPoint + parent walk, which is the browser's own
 * hit-testing — exactly what a user click would resolve to.
 */
function hitTestAt(cx, cy) {
  return page.evaluate(({ cx, cy }) => {
    if (!isFinite(cx) || !isFinite(cy) ||
        cx < 0 || cy < 0 || cx > window.innerWidth || cy > window.innerHeight)
      return { inSymbol: false, offscreen: true };
    const el = document.elementFromPoint(cx, cy);
    if (!el) return { inSymbol: false, tag: 'null' };
    const svg = document.querySelector('svg[data-schematic]');
    if (!svg) return { inSymbol: false, tag: el.tagName };
    const syms = [...svg.querySelectorAll(':scope > g')].filter(
      g => g.getAttribute('stroke-linecap') === 'round');
    let node = el;
    while (node && node !== svg) {
      if (syms.includes(node)) return { inSymbol: true, tag: el.tagName };
      node = node.parentElement;
    }
    return { inSymbol: false, tag: el.tagName };
  }, { cx, cy });
}

// ── Test runner ──────────────────────────────────────────────────────────

const results = [];
function assert(name, passed, detail = '') {
  results.push({ name, passed, detail });
  console.log(`  ${passed ? 'PASS' : 'FAIL'}  ${name}${detail ? '  (' + detail + ')' : ''}`);
}

// ── BASELINE ─────────────────────────────────────────────────────────────
// The "5V" text inside the vsource symbol is a filled <text> element with
// a reliable hit area. Using a text label rather than a <path> avoids
// the issue where elementFromPoint misses unfilled SVG paths at their
// center (the center of a zigzag resistor path is empty space).

const base = await getSymbolTextPos('5V');
if (!base) { console.error('FAIL: could not find "5V" label'); process.exit(1); }
const baseHit = await hitTestAt(base.cx, base.cy);
assert('Baseline: "5V" label hittable at identity transform', baseHit.inSymbol,
  `${base.w}×${base.h} px at (${base.cx}, ${base.cy})`);

// ── SCENARIO 1: PAN ─────────────────────────────────────────────────────
// Wheel without ctrl = pan (classifyWheel returns {kind:'pan'}).
// 3 steps × 30px deltaX = ~90px logical pan → ~155px screen shift at the
// current viewBox scale. The symbol moves rightward; the old position
// should hit svg background (or a wire), not a symbol.

const svgBox = await page.locator('svg[data-schematic]').boundingBox();
for (let i = 0; i < 3; i++) {
  await page.mouse.move(svgBox.x + svgBox.width / 2, svgBox.y + svgBox.height / 2);
  await page.mouse.wheel(30, 0);
  await page.waitForTimeout(80);
}
await page.waitForTimeout(500);

const panPos = await getSymbolTextPos('5V');
const panHitNew = await hitTestAt(panPos.cx, panPos.cy);
const panHitOld = await hitTestAt(base.cx, base.cy);
const panShift = Math.abs(panPos.cx - base.cx);

assert('Pan: symbol hittable at NEW screen position', panHitNew.inSymbol,
  `moved ${panShift}px to (${panPos.cx}, ${panPos.cy})`);
assert('Pan: nothing at OLD screen position', !panHitOld.inSymbol,
  `old (${base.cx}, ${base.cy}) hit ${panHitOld.tag}`);

// ── SCENARIO 2: CURSOR-ANCHORED ZOOM ─────────────────────────────────────
// Reset to identity, then zoom with ctrl+wheel with the cursor ON the
// symbol. Cursor-anchored zoom keeps the point under the cursor fixed,
// so the symbol barely moves (~11px measured). The text grows from ~17px
// to ~55px wide (3× zoom factor). The old position still hits because
// the anchor held it in place — this is correct, not a stale region.

await page.locator('svg[data-schematic]').dblclick(); // reset
await page.waitForTimeout(500);

const preZoom = await getSymbolTextPos('5V');
await page.mouse.move(preZoom.cx, preZoom.cy); // cursor ON the symbol
await page.keyboard.down('Control');
for (let i = 0; i < 3; i++) {
  await page.mouse.wheel(0, -40);
  await page.waitForTimeout(100);
}
await page.keyboard.up('Control');
await page.waitForTimeout(500);

const zoomPos = await getSymbolTextPos('5V');
const zoomHitNew = await hitTestAt(zoomPos.cx, zoomPos.cy);
const zoomShift = Math.round(Math.hypot(zoomPos.cx - preZoom.cx, zoomPos.cy - preZoom.cy));

assert('Zoom: symbol hittable at NEW screen position', zoomHitNew.inSymbol,
  `grew ${preZoom.w}→${zoomPos.w}px, shifted ${zoomShift}px`);

// For cursor-anchored zoom, the old position hitting the symbol is
// CORRECT (the anchor keeps it in place). Verify the shift is small.
assert('Zoom: cursor-anchored shift is small (≤20px)', zoomShift <= 20,
  `${zoomShift}px`);

// ── SCENARIO 3: PAN + ZOOM (the one that matters most) ──────────────────
// This catches a stale hit region left at the pre-transform coordinates.
// Pan moves the symbol away from its original position, then zoom grows
// it. The original position must miss entirely.

await page.locator('svg[data-schematic]').dblclick(); // reset
await page.waitForTimeout(500);

const preCombo = await getSymbolTextPos('5V');

// Pan
for (let i = 0; i < 3; i++) {
  await page.mouse.move(svgBox.x + svgBox.width / 2, svgBox.y + svgBox.height / 2);
  await page.mouse.wheel(25, 0);
  await page.waitForTimeout(80);
}
// Zoom at the symbol's new position
const midCombo = await getSymbolTextPos('5V');
await page.mouse.move(midCombo.cx, midCombo.cy);
await page.keyboard.down('Control');
for (let i = 0; i < 3; i++) {
  await page.mouse.wheel(0, -40);
  await page.waitForTimeout(100);
}
await page.keyboard.up('Control');
await page.waitForTimeout(500);

const comboPos = await getSymbolTextPos('5V');
const comboHitNew = await hitTestAt(comboPos.cx, comboPos.cy);
const comboHitOld = await hitTestAt(preCombo.cx, preCombo.cy);
const comboShift = Math.abs(comboPos.cx - preCombo.cx);

assert('Pan+zoom: symbol hittable at NEW screen position', comboHitNew.inSymbol,
  `at (${comboPos.cx}, ${comboPos.cy}), ${comboPos.w}×${comboPos.h}px`);
assert('Pan+zoom: nothing at OLD screen position', !comboHitOld.inSymbol,
  `old (${preCombo.cx}, ${preCombo.cy}) hit ${comboHitOld.tag}, shifted ${comboShift}px`);

// ── Summary ──────────────────────────────────────────────────────────────

console.log('\n════════════════════════════════════════');
console.log('CAMERA HIT-TESTING');
console.log('════════════════════════════════════════');
const passed = results.filter(r => r.passed).length;
const failed = results.filter(r => !r.passed).length;
console.log(`${passed} passed, ${failed} failed out of ${results.length}`);
if (failed === 0) {
  console.log('\nAll assertions pass. Hit regions track the SVG viewBox');
  console.log('transform correctly after pan, zoom, and combined transforms.');
  console.log('No stale hit areas remain at previous screen coordinates.');
}
for (const r of results.filter(r => !r.passed)) {
  console.log(`\n  FAIL: ${r.name}\n    ${r.detail}`);
}

await browser.close();
process.exit(failed > 0 ? 1 : 0);
