#!/usr/bin/env node
/**
 * Headless schematic-view verification — measures the deployed schematic SVG.
 *
 * Prerequisites:
 *   - playwright installed (`npm install playwright && npx playwright install chromium`)
 *   - the site deployed to GitHub Pages (runs against the live URL, not a local server)
 *
 * What it measures (per case):
 *   - SVG bounding box in CSS px, container fill ratio
 *   - Symbol count and overlapping-symbol pairs (mechanical proxy for illegibility)
 *   - Smallest rendered font size among all text elements
 *   - Whether any breadboard element leaks into the schematic
 *   - Wire net count, segment count, junction count
 *   - Wire segments that pass through a symbol's interior (shrunk by 6px to exclude endpoints)
 *
 * Three cases, matching the CLOSE-OUT claims in bw-circuit-ui and lite BLOCKED.md:
 *   1. 01-blink     — simple two-part circuit (basics category)
 *   2. 02-dimmer    — mid-range with potentiometer (analog category)
 *   3. 08-led-chaser-595 — 20-symbol shift-register circuit (digital category)
 *
 * Case 3 is the one that found the zero-wires defect: 20 symbols, 0 nets before
 * 92c6450, 20 nets after. The claim is bounded to these three cases and says
 * nothing about larger or more complex circuits.
 *
 * Usage:
 *   node scripts/verify-schematic.mjs
 *
 * Saves PNG screenshots under artifacts/schematic-production/ for review and
 * CI artifact upload.
 */
import { chromium } from 'playwright';
import { mkdir } from 'node:fs/promises';
import path from 'node:path';

// PROOF_URL overrides for local builds — every verify gate honors it;
// this one silently probing production while "passing" a local check
// was a measurement lie (found during the 930000d recovery).
const URL = process.env.PROOF_URL || 'https://crispstrobe.github.io/brickwright-lite/';
const SS = path.resolve('artifacts/schematic-production');
await mkdir(SS, { recursive: true });

const browser = await chromium.launch();
let exitCode = 0;
try {
const page = await browser.newPage({ viewport: { width: 1400, height: 900 } });
const errors = [];
await page.addInitScript(() => localStorage.setItem('bw-starter-v1-complete', '1'));
page.on('pageerror', e => errors.push(e.message));

// Auto-accept any confirmation dialogs (loadExample shows one)
page.on('dialog', async d => { await d.accept(); });

console.log('Loading', URL);
await page.goto(URL, { waitUntil: 'domcontentloaded', timeout: 60000 });
await page.waitForSelector('[role="tab"]', { timeout: 60000 });

// Click the Circuit tab
await page.locator('[role="tab"]', { hasText: /circuit/i }).click();
await page.waitForTimeout(3000);

// Click Full Width
try { await page.locator('button', { hasText: 'Full width' }).click({ timeout: 2000 }); } catch {}
await page.waitForTimeout(500);

// Click Examples to trigger loadExamples()
try { await page.locator('button', { hasText: 'Examples' }).click({ timeout: 2000 }); } catch {}
await page.waitForTimeout(2000);

// ── Helper to find CircuitTab fiber once ─────────────────────────────────────
const exInfo = await page.evaluate(() => {
  const guiEl = document.querySelector('[class*="gui_body"]') ||
                document.querySelector('[class*="gui"]');
  if (!guiEl) return { error: 'no gui' };
  const key = Object.keys(guiEl).find(k =>
    k.startsWith('__reactFiber') || k.startsWith('__reactInternalInstance'));
  if (!key) return { error: 'no fiber' };
  const queue = [guiEl[key]];
  for (let i = 0; i < 8000 && queue.length; i++) {
    const f = queue.shift();
    if (f && f.stateNode && typeof f.stateNode.loadExample === 'function'
        && f.stateNode.state && Array.isArray(f.stateNode.state.examples)
        && f.stateNode.state.examples.length > 0) {
      const exs = f.stateNode.state.examples;
      // Store the instance on window for later calls
      window.__bwCircuitTab = f.stateNode;
      return {
        count: exs.length,
        examples: exs.map((e, i) => ({
          idx: i, id: e.id,
          title: typeof e.title === 'string' ? e.title : (e.title?.en || e.id),
          category: e.category || '',
          hasCircuit: !!(e.files && e.files.circuit),
        })),
      };
    }
    if (f && f.child) queue.push(f.child);
    if (f && f.sibling) queue.push(f.sibling);
  }
  return { error: 'CircuitTab with examples not found' };
});

if (exInfo.error) {
  throw new Error(exInfo.error);
}

console.log(`${exInfo.count} examples`);
const requiredIds = ['01-blink', '02-dimmer', '08-led-chaser-595'];
const picks = requiredIds.map(id => exInfo.examples.find(example => example.id === id));
const missingIds = requiredIds.filter((id, index) => !picks[index] || !picks[index].hasCircuit);
if (missingIds.length) throw new Error(`required circuit example(s) missing: ${missingIds.join(', ')}`);

console.log('Selected:', picks.map(p => `${p.idx}:"${p.title}" (${p.category})`).join(' | '));

// ── Measure the schematic SVG ────────────────────────────────────────────────
async function measure() {
  return page.evaluate(() => {
    const svg = document.querySelector('svg[data-schematic]');
    if (!svg) return { error: 'no svg[data-schematic]' };

    const svgR = svg.getBoundingClientRect();
    const cR = svg.parentElement?.getBoundingClientRect() || svgR;
    const vb = svg.getAttribute('viewBox');
    const [, , vbW, vbH] = vb ? vb.split(/\s+/).map(Number) : [0, 0, 0, 0];

    const allTopG = svg.querySelectorAll(':scope > g');
    const symbolGs = [];
    const wireGs = [];
    for (const g of allTopG) {
      if (g.getAttribute('stroke-linecap') === 'round') { symbolGs.push(g); continue; }
      if (g.getAttribute('fill') === 'none') {
        const kids = [...g.children];
        if (kids.length > 0 && kids.every(k => k.tagName === 'line')) wireGs.push(g);
      }
    }

    const symBoxes = symbolGs.map(g => {
      const r = g.getBoundingClientRect();
      return { l: r.left, t: r.top, r: r.right, b: r.bottom, w: r.width, h: r.height };
    });

    let overlaps = 0;
    const overlapList = [];
    for (let i = 0; i < symBoxes.length; i++) {
      for (let j = i + 1; j < symBoxes.length; j++) {
        const a = symBoxes[i], b = symBoxes[j];
        if (a.l < b.r && a.r > b.l && a.t < b.b && a.b > b.t) {
          overlaps++;
          overlapList.push(`${i}-${j}`);
        }
      }
    }

    const texts = svg.querySelectorAll('text');
    let minFont = Infinity;
    const fontSet = new Set();
    const netLabelCounts = new Map();
    for (const t of texts) {
      const fs = parseFloat(getComputedStyle(t).fontSize);
      if (fs > 0) { fontSet.add(Math.round(fs * 10) / 10); if (fs < minFont) minFont = fs; }
      const label = t.textContent.trim();
      if (/^N\d+$/u.test(label)) netLabelCounts.set(label, (netLabelCounts.get(label) || 0) + 1);
    }
    const connectedNetLabels = [...netLabelCounts.values()].filter(count => count > 1).length;

    let breadboard = 0;
    for (const el of svg.querySelectorAll('*')) {
      for (const attr of el.attributes) {
        if (attr.value.toLowerCase().includes('breadboard')) { breadboard++; break; }
      }
    }

    const wireSegs = [];
    for (const wg of wireGs) {
      for (const line of wg.querySelectorAll('line')) wireSegs.push(line.getBoundingClientRect());
    }

    let wiresThru = 0;
    for (const seg of wireSegs) {
      for (const sym of symBoxes) {
        const m = 6;
        if (seg.left < sym.r - m && seg.right > sym.l + m &&
            seg.top < sym.b - m && seg.bottom > sym.t + m) { wiresThru++; break; }
      }
    }

    const junctions = svg.querySelectorAll(':scope > circle');

    return {
      svgW: Math.round(svgR.width), svgH: Math.round(svgR.height),
      containerW: Math.round(cR.width), containerH: Math.round(cR.height),
      fillW: Math.round(svgR.width / cR.width * 100),
      fillH: Math.round(svgR.height / cR.height * 100),
      viewBox: `${vbW}x${vbH}`,
      symbols: symbolGs.length,
      wireNets: wireGs.length,
      wireSegments: wireSegs.length,
      connectedNetLabels,
      junctions: junctions.length,
      overlappingPairs: overlaps,
      overlapDetail: overlapList,
      minFontPx: minFont === Infinity ? null : Math.round(minFont * 10) / 10,
      fontSizes: [...fontSet].sort((a, b) => a - b),
      textCount: texts.length,
      breadboardEls: breadboard,
      wiresThruSymbols: wiresThru,
    };
  });
}

// ── Run each case ────────────────────────────────────────────────────────────
const results = [];

for (let ci = 0; ci < picks.length; ci++) {
  const pick = picks[ci];
  console.log(`\n── Case ${ci + 1}: "${pick.title}" (${pick.category}, idx ${pick.idx}) ──`);

  // Load example via the stashed CircuitTab instance
  const loadOk = await page.evaluate(async (idx) => {
    const ct = window.__bwCircuitTab;
    if (!ct) return { error: 'no cached CircuitTab' };
    const exs = ct.state?.examples;
    if (!exs || !exs[idx]) return { error: `no example at ${idx}, have ${exs?.length || 0}` };
    const ex = exs[idx];
    try {
      await ct.loadExample(ex);
      return { ok: true, id: ex.id };
    } catch (e) { return { error: e.message }; }
  }, pick.idx);

  if (loadOk.error) {
    throw new Error(`failed to load ${pick.id}: ${loadOk.error}`);
  }
  console.log('  Loaded:', loadOk.id);
  await page.waitForTimeout(3000);

  // loadExample sets panel:'designer', so we should be on the designer view.
  // Now click Schematic.
  const schBtn = page.locator('[data-circuit-view-switcher] button[title="Schematic view"]');
  const schCount = await schBtn.count();
  if (schCount > 0) {
    await schBtn.first().click({ force: true });
    await page.waitForTimeout(2000);
  } else {
    throw new Error(`no Schematic view button for ${pick.id}`);
  }

  const m = await measure();
  if (m.error) {
    await page.screenshot({ path: `${SS}/schematic-${ci + 1}-ERROR.png` });
    throw new Error(`could not measure ${pick.id}: ${m.error}`);
  }

  results.push({ id: pick.id, name: pick.title, category: pick.category, ...m });

  const slug = (pick.id || pick.title).replace(/[^a-zA-Z0-9]+/g, '_').slice(0, 40);
  const ssFile = `${SS}/schematic-${ci + 1}-${slug}.png`;
  await page.screenshot({ path: ssFile });
  console.log(`  Screenshot: ${ssFile}`);
  console.log(`  SVG:              ${m.svgW} x ${m.svgH} px`);
  console.log(`  Container:        ${m.containerW} x ${m.containerH} px`);
  console.log(`  Fill:             ${m.fillW}% W x ${m.fillH}% H`);
  console.log(`  viewBox:          ${m.viewBox}`);
  console.log(`  Symbols:          ${m.symbols}`);
  console.log(`  Wire nets:        ${m.wireNets}  (${m.wireSegments} segments, ${m.junctions} junctions)`);
  console.log(`  Named net links:  ${m.connectedNetLabels}`);
  console.log(`  Overlapping pairs:${m.overlappingPairs}${m.overlapDetail.length ? ' -> ' + m.overlapDetail.join(',') : ''}`);
  console.log(`  Min font:         ${m.minFontPx ?? 'none'} px`);
  console.log(`  Font sizes:       ${m.fontSizes.join(', ')} px`);
  console.log(`  Text elements:    ${m.textCount}`);
  console.log(`  Breadboard els:   ${m.breadboardEls}`);
  console.log(`  Wires thru syms:  ${m.wiresThruSymbols}`);

  // Back to realistic for next
  if (ci < picks.length - 1) {
    const realistic = page.locator('[data-circuit-view-switcher] button[title="Realistic view"]');
    if (!await realistic.count()) throw new Error(`no Realistic view button after ${pick.id}`);
    await realistic.first().click({ force: true });
    await page.waitForTimeout(500);
  }
}

// ── Summary ──────────────────────────────────────────────────────────────────
console.log('\n\n════════════════════════════════════════');
console.log('SCHEMATIC VERIFICATION RESULTS');
console.log('════════════════════════════════════════');
const failures = [];
const check = (ok, message) => {
  if (!ok) failures.push(message);
};
for (const r of results) {
  console.log(`\n${r.name} (${r.category}):`);
  console.log(`  rendering:     ${r.svgW}x${r.svgH} in ${r.containerW}x${r.containerH} (${r.fillW}%W ${r.fillH}%H)  ${r.svgW > 0 && r.svgH > 0 ? 'OK' : 'ZERO'}`);
  console.log(`  symbols:       ${r.symbols}  ${r.symbols > 0 ? 'OK' : 'EMPTY'}`);
  console.log(`  connectivity:  ${r.wireNets} routed, ${r.connectedNetLabels} named  ${r.wireNets > 0 || r.connectedNetLabels > 0 ? 'OK' : 'EMPTY'}`);
  console.log(`  overlaps:      ${r.overlappingPairs}  ${r.overlappingPairs === 0 ? 'OK' : 'OVERLAP'}`);
  console.log(`  min font:      ${r.minFontPx ?? 'n/a'} px  ${r.minFontPx == null || r.minFontPx >= 6 ? 'OK' : 'TINY'}`);
  console.log(`  breadboard:    ${r.breadboardEls}  ${r.breadboardEls === 0 ? 'OK absent' : 'LEAKED'}`);
  console.log(`  wires thru:    ${r.wiresThruSymbols}  ${r.wiresThruSymbols === 0 ? 'OK' : 'CROSSINGS'}`);
  check(r.svgW > 0 && r.svgH > 0, `${r.id}: zero-sized SVG`);
  check(r.symbols > 0, `${r.id}: no schematic symbols`);
  check((r.wireNets > 0 && r.wireSegments > 0) || r.connectedNetLabels > 0,
    `${r.id}: no routed or named-net connectivity`);
  check(r.overlappingPairs === 0, `${r.id}: ${r.overlappingPairs} overlapping symbol pair(s)`);
  check(r.minFontPx !== null && r.minFontPx >= 6, `${r.id}: minimum font ${r.minFontPx}`);
  check(r.breadboardEls === 0, `${r.id}: breadboard leaked into schematic`);
  check(r.wiresThruSymbols === 0, `${r.id}: ${r.wiresThruSymbols} wire crossing(s)`);
}

check(results.length === requiredIds.length,
  `measured ${results.length}/${requiredIds.length} required fixtures`);
for (const error of errors) failures.push(`page error: ${error}`);
console.log(`\nScreenshots saved to ${SS}`);
if (failures.length) {
  for (const failure of failures) console.error(`FAIL: ${failure}`);
}
exitCode = failures.length ? 1 : 0;
} catch (error) {
  console.error(`FAIL: ${error.stack || error.message}`);
  exitCode = 1;
} finally {
  await browser.close();
}
process.exit(exitCode);
