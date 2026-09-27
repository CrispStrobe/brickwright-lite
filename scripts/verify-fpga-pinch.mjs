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
  const cx = box.x + box.width / 2;
  const cy = box.y + box.height / 2;

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

  await touch('touchStart', [[cx - 60, cy], [cx + 60, cy]]);
  for (const half of [90, 120, 150, 180]) {
    await touch('touchMove', [[cx - half, cy], [cx + half, cy]]);
    await page.waitForTimeout(60);
  }
  await touch('touchEnd', []);
  await page.waitForTimeout(500);
  const after = await zoom();
  check(after > before, 'pinching out zooms the gate canvas in', `x${before} -> x${after}`);

  await touch('touchStart', [[cx - 180, cy], [cx + 180, cy]]);
  for (const half of [140, 100, 70, 50]) {
    await touch('touchMove', [[cx - half, cy], [cx + half, cy]]);
    await page.waitForTimeout(60);
  }
  await touch('touchEnd', []);
  await page.waitForTimeout(500);
  const back = await zoom();
  check(back < after, 'pinching in zooms it out again', `x${after} -> x${back}`);
} finally {
  await browser.close();
}

if (failures.length) {
  console.error(`\n${failures.length} check(s) failed`);
  process.exit(1);
}
console.log('\ntwo fingers reach the FPGA gate canvas');
