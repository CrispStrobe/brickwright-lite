#!/usr/bin/env node
/**
 * Two fingers pinch the FPGA gate canvas.
 *
 * The circuit designer's pinch was written and never attached (bw-circuit-ui
 * #50). The gate canvas is a different implementation - React Flow, whose
 * `zoomOnPinch` defaults to true - so it is BELIEVED to work. Believed is not
 * measured, and the integration around it could break it in ways the library
 * cannot: a `touch-action` on an ancestor, a preventDefault on the wrapper, a
 * tab that mounts the panel without laying it out.
 *
 * Driven with CDP touch points, because Playwright's touchscreen API taps with
 * one finger and cannot express a pinch. Reads the zoom off React Flow's own
 * `.react-flow__viewport` transform.
 *
 *   PROOF_URL=http://localhost:8632/ node scripts/verify-fpga-pinch.mjs
 *
 * Needs a FLAG-ON build: the tab ships hidden unless BW_ENABLE_FPGA is set at
 * build time AND `bw-fpga-enabled` is set at runtime. Both, which is what the
 * App Store capture learned the hard way.
 */
import { chromium } from 'playwright';

const base = process.env.PROOF_URL || 'http://localhost:8632/';
const failures = [];
const check = (ok, msg, detail = '') => {
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${msg}${detail ? ` - ${detail}` : ''}`);
  if (!ok) failures.push(msg);
};

const browser = await chromium.launch({ args: ['--no-sandbox', '--disable-dev-shm-usage'] });
try {
  const context = await browser.newContext({
    viewport: { width: 1100, height: 900 }, hasTouch: true,
  });
  const page = await context.newPage();
  await page.addInitScript(() => {
    try {
      localStorage.setItem('bw-starter-v1-complete', '1');
      localStorage.setItem('bw-fpga-enabled', '1');   // the tab ships hidden
      localStorage.setItem('bw-fpga-guide-done', '1');
    } catch { /* private mode */ }
  });
  await page.goto(base, { waitUntil: 'domcontentloaded', timeout: 90000 });
  await page.waitForFunction("document.querySelectorAll('[role=\"tab\"]').length >= 5",
    null, { timeout: 90000, polling: 250 });

  const tabs = await page.getByRole('tab').allTextContents();
  check(tabs.length >= 6, 'the FPGA tab is present (flag-on build, preference set)',
    JSON.stringify(tabs));
  if (tabs.length < 6) throw new Error('no FPGA tab — is this a flag-on build?');

  // Visible AND selected: the panel is forceRenderTabPanel, so its controls sit
  // in the DOM while another tab is on screen. Presence proves nothing.
  for (let i = 0; i < 8; i++) {
    const up = await page.evaluate(() => {
      const el = document.querySelector('[data-testid="bw-fpga-ic-gate"]');
      if (!el || el.getBoundingClientRect().width === 0) return false;
      const t = [...document.querySelectorAll('[role="tab"]')];
      return t[5] && t[5].getAttribute('aria-selected') === 'true';
    });
    if (up) break;
    if (i % 2 === 0) await page.getByRole('tab').nth(5).click().catch(() => {});
    else {
      await page.evaluate(() => window.dispatchEvent(
        new CustomEvent('bw-activate-tab', { detail: { index: 5 } })));
    }
    await page.waitForTimeout(1200);
  }

  const canvas = page.getByTestId('bw-fpga-rf-canvas');
  await canvas.waitFor({ state: 'visible', timeout: 30000 });
  const box = await canvas.boundingBox();

  /**
   * Pinch on EMPTY PANE, not on a node. The canvas opens with a starter
   * circuit (a AND b -> y) sitting near the middle, so the obvious choice —
   * the centre — put both fingers on the AND gate, where React Flow reads a
   * drag rather than a pane zoom. The first run of this gate failed that way
   * and looked like "the canvas does not pinch".
   *
   * So ask the page what is under each candidate and take one that is the
   * pane itself.
   */
  const spot = await page.evaluate(([bx, by, bw, bh]) => {
    const candidates = [[0.2, 0.2], [0.8, 0.2], [0.2, 0.8], [0.8, 0.8], [0.5, 0.15]];
    for (const [fx, fy] of candidates) {
      const x = bx + bw * fx, y = by + bh * fy;
      const el = document.elementFromPoint(x, y);
      if (el && el.closest('.react-flow__pane') && !el.closest('.react-flow__node')) {
        return {x, y, on: el.className.toString().slice(0, 40)};
      }
    }
    return null;
  }, [box.x, box.y, box.width, box.height]);
  check(!!spot, 'found empty pane to pinch on (not a node)',
    spot ? `${Math.round(spot.x)},${Math.round(spot.y)} on ${spot.on}` : 'every candidate was a node');
  if (!spot) throw new Error('no empty pane found');
  const cx = spot.x;
  const cy = spot.y;

  /** React Flow keeps the world->screen transform on its own viewport node. */
  const zoom = async () => page.evaluate(() => {
    const el = document.querySelector('.react-flow__viewport');
    if (!el) return NaN;
    const m = new DOMMatrixReadOnly(getComputedStyle(el).transform);
    return Math.round(m.a * 1000) / 1000;
  });

  const before = await zoom();
  check(Number.isFinite(before) && before > 0, 'the canvas reports a zoom', `x${before}`);

  const cdp = await context.newCDPSession(page);
  const touch = (type, points) => cdp.send('Input.dispatchTouchEvent', {
    type,
    touchPoints: points.map(([x, y], id) => ({ x, y, id, radiusX: 4, radiusY: 4, force: 1 })),
  });

  // PINCH IN FIRST, and the order is the finding. The canvas opens at x2 —
  // React Flow's default maxZoom — because fitView on a small starter circuit
  // lands exactly on the ceiling. Pinching out from there cannot raise the
  // zoom, so the first version of this gate reported "the canvas does not
  // pinch" while measuring a clamp. Zoom out, then back in: both directions
  // are then free to move.
  const pinch = async (halves) => {
    await touch('touchStart', [[cx - halves[0], cy], [cx + halves[0], cy]]);
    for (const half of halves.slice(1)) {
      await touch('touchMove', [[cx - half, cy], [cx + half, cy]]);
      await page.waitForTimeout(60);
    }
    await touch('touchEnd', []);
    await page.waitForTimeout(500);
    return zoom();
  };

  const out = await pinch([180, 140, 100, 70, 50]);
  check(out < before, 'pinching in zooms the gate canvas out', `x${before} -> x${out}`);

  const back = await pinch([50, 80, 120, 160, 200]);
  check(back > out, 'and pinching out zooms it back in', `x${out} -> x${back}`);

  // The clamp is real and worth naming, so the next reader does not re-derive
  // it from a confusing failure.
  check(before <= 2.001, 'the canvas opens at React Flow\'s maxZoom of 2 (fitView on a small graph)',
    `x${before}`);
} finally {
  await browser.close();
}

if (failures.length) {
  console.error(`\n${failures.length} check(s) failed`);
  process.exit(1);
}
console.log('\ntwo fingers reach the FPGA gate canvas');
