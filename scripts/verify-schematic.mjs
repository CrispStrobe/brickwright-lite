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
 * Saves PNG screenshots to /tmp/schematic-{1,2,3}-*.png for owner review.
 */
import { chromium } from 'playwright';

// PROOF_URL overrides for local builds — every verify gate honors it;
// this one silently probing production while "passing" a local check
// was a measurement lie (found during the 930000d recovery).
const URL = process.env.PROOF_URL || 'https://crispstrobe.github.io/brickwright-lite/';
const SS = '/tmp';

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1400, height: 900 } });
const errors = [];
page.on('pageerror', e => errors.push(e.message));

// Auto-accept any confirmation dialogs (loadExample shows one)
page.on('dialog', async d => { await d.accept(); });

console.log('Loading', URL);
await page.goto(URL, { waitUntil: 'networkidle', timeout: 60000 });
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
function findCircuitTabScript() {
  return `
    (function findCT() {
      const guiEl = document.querySelector('[class*="gui_body"]') ||
                    document.querySelector('[class*="gui"]');
      if (!guiEl) return null;
      const key = Object.keys(guiEl).find(k =>
        k.startsWith('__reactFiber') || k.startsWith('__reactInternalInstance'));
      if (!key) return null;
      const queue = [guiEl[key]];
      for (let i = 0; i < 8000 && queue.length; i++) {
        const f = queue.shift();
        if (f && f.stateNode && typeof f.stateNode.loadExample === 'function'
            && f.stateNode.state && Array.isArray(f.stateNode.state.examples)) {
          return f.stateNode;
        }
        if (f && f.child) queue.push(f.child);
        if (f && f.sibling) queue.push(f.sibling);
      }
      return null;
    })()
  `;
}

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
  console.error('FAIL:', exInfo.error);
  await browser.close();
  process.exit(1);
}

console.log(`${exInfo.count} examples`);
const withCircuit = exInfo.examples.filter(e => e.hasCircuit);

// Pick three: simple, mid, complex
const basics = withCircuit.filter(e => e.category === 'basics');
const analog = withCircuit.filter(e => e.category === 'analog');
const digital = withCircuit.filter(e => e.category === 'digital');
const motors = withCircuit.filter(e => e.category === 'motors');

const picks = [];
if (basics.length > 0) picks.push(basics[0]);
if (analog.length > 0) picks.push(analog[0]);
if (digital.length > 0) picks.push(digital[0]);
else if (motors.length > 0) picks.push(motors[0]);
// Ensure 3
while (picks.length < 3 && picks.length < withCircuit.length) {
  const next = withCircuit.find(e => !picks.some(p => p.idx === e.idx));
  if (next) picks.push(next); else break;
}

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
    for (const t of texts) {
      const fs = parseFloat(getComputedStyle(t).fontSize);
      if (fs > 0) { fontSet.add(Math.round(fs * 10) / 10); if (fs < minFont) minFont = fs; }
    }

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
    console.error('  Load failed:', loadOk.error);
    continue;
  }
  console.log('  Loaded:', loadOk.id);
  await page.waitForTimeout(3000);

  // loadExample sets panel:'designer', so we should be on the designer view.
  // Now click Schematic.
  const schBtn = page.locator('button', { hasText: 'Schematic' });
  const schCount = await schBtn.count();
  if (schCount > 0) {
    await schBtn.first().click({ force: true });
    await page.waitForTimeout(2000);
  } else {
    console.error('  No Schematic button');
    continue;
  }

  const m = await measure();
  if (m.error) {
    console.error('  Measure failed:', m.error);
    // Screenshot anyway for debugging
    await page.screenshot({ path: `${SS}/schematic-${ci + 1}-ERROR.png` });
    continue;
  }

  results.push({ name: pick.title, category: pick.category, ...m });

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
  console.log(`  Overlapping pairs:${m.overlappingPairs}${m.overlapDetail.length ? ' -> ' + m.overlapDetail.join(',') : ''}`);
  console.log(`  Min font:         ${m.minFontPx ?? 'none'} px`);
  console.log(`  Font sizes:       ${m.fontSizes.join(', ')} px`);
  console.log(`  Text elements:    ${m.textCount}`);
  console.log(`  Breadboard els:   ${m.breadboardEls}`);
  console.log(`  Wires thru syms:  ${m.wiresThruSymbols}`);

  // Back to realistic for next
  try {
    await page.locator('button', { hasText: 'Realistic' }).first().click({ force: true });
    await page.waitForTimeout(500);
  } catch {}
}

// ── Summary ──────────────────────────────────────────────────────────────────
console.log('\n\n════════════════════════════════════════');
console.log('SCHEMATIC VERIFICATION RESULTS');
console.log('════════════════════════════════════════');
for (const r of results) {
  console.log(`\n${r.name} (${r.category}):`);
  console.log(`  rendering:     ${r.svgW}x${r.svgH} in ${r.containerW}x${r.containerH} (${r.fillW}%W ${r.fillH}%H)  ${r.svgW > 0 && r.svgH > 0 ? 'OK' : 'ZERO'}`);
  console.log(`  symbols:       ${r.symbols}  ${r.symbols > 0 ? 'OK' : 'EMPTY'}`);
  console.log(`  overlaps:      ${r.overlappingPairs}  ${r.overlappingPairs === 0 ? 'OK' : 'OVERLAP'}`);
  console.log(`  min font:      ${r.minFontPx ?? 'n/a'} px  ${r.minFontPx == null || r.minFontPx >= 6 ? 'OK' : 'TINY'}`);
  console.log(`  breadboard:    ${r.breadboardEls}  ${r.breadboardEls === 0 ? 'OK absent' : 'LEAKED'}`);
  console.log(`  wires thru:    ${r.wiresThruSymbols}  ${r.wiresThruSymbols === 0 ? 'OK' : 'CROSSINGS'}`);
}

console.log('\nScreenshots saved to /tmp/schematic-*.png');
if (errors.length) console.log('Page errors:', errors.join('; '));
await browser.close();
