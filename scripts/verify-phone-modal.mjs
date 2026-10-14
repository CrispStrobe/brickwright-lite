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
 * SINCE THE PHONE-FIT VIEWPORT META (width=1024, minimum-scale=0.25) the
 * browser scales the whole 1024 layout down to fit, so on first load the visual
 * viewport COVERS the layout and layout == visual == 1024. That is the point of
 * that change — nothing is cropped — but it also means a gate that only looks
 * at first load no longer exercises the overlay arithmetic at all: containment
 * passes because everything is visible. Its original precondition ("the page
 * really is wider than the screen") started failing for exactly that reason.
 *
 * So this gate now checks BOTH states, and names them:
 *   fitted — as shipped, the whole layout on screen;
 *   zoomed — the reader has pinched in, and the visible box is a genuine
 *            ~430-wide window onto a 1024 layout. This is the geometry that
 *            broke, and the only one where `overlayStyleFor` earns its keep.
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
  // The phone-fit outcome, asserted rather than assumed: the reader sees the
  // whole declared width, not a 430pt crop of it.
  check(boxes.visual && boxes.visual.w >= boxes.layout.w - 8,
    'FITTED: the visible band covers the declared layout width (nothing cropped)',
    `layout ${boxes.layout.w} vs visual ${boxes.visual && boxes.visual.w}`);

  await page.getByRole('tab').nth(3).click();
  await page.waitForFunction("document.querySelectorAll('[data-testid=\"bw-device-select\"]').length > 0",
    null, { timeout: 60000, polling: 250 });
  await page.getByTestId('bw-device-select').selectOption('__manage__');
  await page.waitForFunction("document.querySelectorAll('[data-testid=\"bw-mm-import\"]').length > 0",
    null, { timeout: 30000, polling: 250 });

  const probe = () => page.evaluate(() => {
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

  const describe = (w) => w
    ? `button x ${w.rect.left}-${w.rect.right} y ${w.rect.top}-${w.rect.bottom}; `
      + `screen x ${w.screen.left}-${w.screen.right} y ${w.screen.top}-${w.screen.bottom}`
    : 'not found';

  const fitted = await probe();
  check(fitted && fitted.inside,
    'FITTED: the import button is inside the visible screen, on both axes',
    describe(fitted));

  let clicked = true;
  try {
    await page.getByTestId('bw-mm-import').click({ timeout: 15000 });
  } catch {
    clicked = false;
  }
  check(clicked, 'FITTED: and it can be pressed without panning the page');

  // ── ZOOMED: recreate the geometry that actually broke ────────────────────
  // setPageScaleFactor is how a pinch looks to the page: the layout viewport
  // stays 1024 and the visual one becomes a ~427-wide window onto it, which is
  // precisely the pre-phone-fit situation in which `inset: 0` put this button
  // 289px below the visible band. Playwright's touchscreen cannot express a
  // pinch, so drive it over CDP.
  const cdp = await context.newCDPSession(page);
  const scale = 1024 / 427;
  await cdp.send('Emulation.setPageScaleFactor', { pageScaleFactor: scale });
  const zoomBoxes = await page.evaluate(() => ({
    layout: innerWidth,
    visual: window.visualViewport ? Math.round(window.visualViewport.width) : null,
  }));
  check(zoomBoxes.visual !== null && zoomBoxes.layout - zoomBoxes.visual > 8,
    'ZOOMED: the page really is wider than the visible band now (else the rest proves nothing)',
    `layout ${zoomBoxes.layout} vs visual ${zoomBoxes.visual}`);

  // WHAT IS ASSERTED AT ZOOM, and why it is not button containment: a page
  // scale of 2.4 composes with the fit the meta already applied, so the visible
  // band came out 179x388 - a 5.7x zoom in which NOTHING but the top-left
  // corner of a centred dialog could sit in an unscrolled band, and a
  // containment check there would fail on a correct build. The overlay is
  // `position: fixed`, so it cannot be scrolled to either.
  //
  // The contract `overlayStyleFor` actually has is scale-independent and is the
  // one that broke: the overlay must cover the VISIBLE BAND, not the layout
  // viewport. `inset: 0` covered a 1024x2215 layout and centred the dialog
  // 289px below what the reader could see. So compare the two rects.
  // WAIT FOR IT, do not race it. The overlay resizes in response to a
  // VisualViewport event that React then renders, so there is no moment at
  // which the new geometry is synchronously true. Probing straight after the
  // CDP call passed locally and FAILED IN CI with overlay 1024x2215 against a
  // 179x388 band — the event had not yet arrived in that Chromium. A control
  // that never converges (inset: 0) still fails here, it just takes the
  // timeout to say so.
  const probeOverlay = () => page.evaluate(() => {
    const el = document.querySelector('[data-testid="bw-machine-manager"]');
    const vv = window.visualViewport;
    if (!el || !vv) return null;
    const r = el.getBoundingClientRect();
    const near = (a, b) => Math.abs(a - b) <= 2;
    return {
      el: { left: Math.round(r.left), top: Math.round(r.top),
            w: Math.round(r.width), h: Math.round(r.height) },
      vv: { left: Math.round(vv.offsetLeft), top: Math.round(vv.offsetTop),
            w: Math.round(vv.width), h: Math.round(vv.height) },
      tracks: near(r.left, vv.offsetLeft) && near(r.top, vv.offsetTop) &&
              near(r.width, vv.width) && near(r.height, vv.height),
    };
  });

  let overlay = await probeOverlay();
  const deadline = Date.now() + 10000;
  while ((!overlay || !overlay.tracks) && Date.now() < deadline) {
    await page.evaluate(() => new Promise(r => requestAnimationFrame(() => r())));
    overlay = await probeOverlay();
  }
  check(overlay && overlay.tracks,
    'ZOOMED: the overlay covers the VISIBLE band, not the layout viewport',
    overlay
      ? `overlay ${overlay.el.left},${overlay.el.top} ${overlay.el.w}x${overlay.el.h}; `
        + `band ${overlay.vv.left},${overlay.vv.top} ${overlay.vv.w}x${overlay.vv.h}`
      : 'not found');
  // And the dialog inside it is therefore centred on something the reader sees.
  const zoomed = await probe();
  check(zoomed && zoomed.rect.left >= zoomed.screen.left - 1 &&
        zoomed.rect.right <= zoomed.screen.right + 1,
    'ZOOMED: the import button is within the band horizontally',
    describe(zoomed));
  await cdp.send('Emulation.setPageScaleFactor', { pageScaleFactor: 1 });
} finally {
  await browser.close();
}

if (failures.length) {
  console.error(`\n${failures.length} check(s) failed`);
  process.exit(1);
}
console.log('\nthe Machine Manager is reachable on a phone-sized screen');
