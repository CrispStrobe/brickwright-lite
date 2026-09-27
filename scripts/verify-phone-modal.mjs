#!/usr/bin/env node
/**
 * A modal is reachable on a phone-sized screen.
 *
 * The page is floored at 1024px wide (upstream's minimum, and load-bearing:
 * removing it collapses the circuit designer, which the "floor holds, scroll
 * appears below it" browser gate exists to prevent). So on a 430pt screen the
 * LAYOUT viewport is 1024 while the VISUAL one is 430, and a modal placed with
 * `inset: 0` centres at x=512 with its buttons off the side of the screen.
 *
 * Reported from iOS as "cannot import a machine". This asserts the opposite:
 * the Machine Manager's controls land INSIDE the visible box and can be
 * pressed without panning.
 *
 *   PROOF_URL=http://localhost:8617/ node scripts/verify-phone-modal.mjs
 */
import { chromium } from 'playwright';

const base = process.env.PROOF_URL || 'http://localhost:8617/';
const failures = [];
const check = (ok, msg, detail = '') => {
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${msg}${detail ? ` - ${detail}` : ''}`);
  if (!ok) failures.push(msg);
};

const browser = await chromium.launch({ args: ['--no-sandbox', '--disable-dev-shm-usage'] });
try {
  const context = await browser.newContext({
    viewport: { width: 430, height: 930 }, deviceScaleFactor: 3,
    isMobile: true, hasTouch: true,
  });
  const page = await context.newPage();
  await page.addInitScript(() => {
    try {
      localStorage.setItem('bw-starter-v1-complete', '1');
      indexedDB.deleteDatabase('bw-machines');
    } catch { /* private mode */ }
  });
  await page.goto(base, { waitUntil: 'domcontentloaded', timeout: 90000 });
  await page.waitForFunction("document.querySelectorAll('[role=\"tab\"]').length >= 4",
    null, { timeout: 90000, polling: 250 });

  const boxes = await page.evaluate(() => ({
    layout: { w: innerWidth, h: innerHeight },
    visual: window.visualViewport
      ? { w: Math.round(window.visualViewport.width), h: Math.round(window.visualViewport.height) }
      : null,
  }));
  check(!!boxes.visual, 'the browser reports a visual viewport', JSON.stringify(boxes));
  check(boxes.visual && boxes.layout.w - boxes.visual.w > 8,
    'the page really is wider than the screen (else this gate proves nothing)',
    `layout ${boxes.layout.w} vs visual ${boxes.visual && boxes.visual.w}`);

  await page.getByRole('tab').nth(3).click();
  await page.waitForFunction("document.querySelectorAll('[data-testid=\"bw-device-select\"]').length > 0",
    null, { timeout: 60000, polling: 250 });
  await page.getByTestId('bw-device-select').selectOption('__manage__');
  await page.waitForFunction("document.querySelectorAll('[data-testid=\"bw-mm-import\"]').length > 0",
    null, { timeout: 30000, polling: 250 });

  const within = await page.evaluate(() => {
    const el = document.querySelector('[data-testid="bw-mm-import"]');
    const vv = window.visualViewport;
    if (!el || !vv) return null;
    const r = el.getBoundingClientRect();
    // BOTH AXES. The first version of this check tested only left/right and
    // passed on the broken build - the button was horizontally on screen and
    // 177px BELOW it, because `inset: 0` centres in a 2215-tall layout
    // viewport while the reader sees a 930-tall band. A containment check on
    // one axis is not a containment check.
    return {
      rect: { left: Math.round(r.left), right: Math.round(r.right),
              top: Math.round(r.top), bottom: Math.round(r.bottom) },
      screen: { left: Math.round(vv.offsetLeft), right: Math.round(vv.offsetLeft + vv.width),
                top: Math.round(vv.offsetTop), bottom: Math.round(vv.offsetTop + vv.height) },
      inside: r.left >= vv.offsetLeft - 1 && r.right <= vv.offsetLeft + vv.width + 1 &&
              r.top >= vv.offsetTop - 1 && r.bottom <= vv.offsetTop + vv.height + 1,
    };
  });
  check(within && within.inside,
    'the import button is inside the visible screen, on both axes',
    within
      ? `button x ${within.rect.left}-${within.rect.right} y ${within.rect.top}-${within.rect.bottom}; `
        + `screen x ${within.screen.left}-${within.screen.right} y ${within.screen.top}-${within.screen.bottom}`
      : 'not found');

  let clicked = true;
  try {
    await page.getByTestId('bw-mm-import').click({ timeout: 15000 });
  } catch {
    clicked = false;
  }
  check(clicked, 'and it can be pressed without panning the page');
} finally {
  await browser.close();
}

if (failures.length) {
  console.error(`\n${failures.length} check(s) failed`);
  process.exit(1);
}
console.log('\nthe Machine Manager is reachable on a phone-sized screen');
