#!/usr/bin/env node
/**
 * The whole editor is on screen on a phone, in both orientations.
 *
 * This app is 1024 CSS px wide and cannot be narrower: playground/index.css
 * floors html, body and .app there, and the floor is load-bearing - removing
 * it collapses the circuit designer, which the "floor holds" browser gate
 * catches. The question for a phone is therefore not "does it reflow" but
 * "does the browser SCALE it to fit", and that is decided by one meta tag.
 *
 * Measured on the shipping build before the fix, at 430x930:
 *   layout 1024, visual 430, scale 1  ->  4 of 6 tabs reachable,
 *   circuit designer 586px off the right, paint 593px, code 577px.
 *
 * After declaring `width=1024`: scale 0.42, 6 of 6 tabs, nothing off the side.
 *
 *   PROOF_URL=http://localhost:8617/ node scripts/verify-phone-fit.mjs
 */
import { chromium } from 'playwright';

const base = process.env.PROOF_URL || 'http://localhost:8617/';
const failures = [];
const check = (ok, msg, detail = '') => {
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${msg}${detail ? ` - ${detail}` : ''}`);
  if (!ok) failures.push(msg);
};

const ORIENTATIONS = [
  ['portrait', 430, 930],
  ['landscape', 930, 430],
];

const browser = await chromium.launch({ args: ['--no-sandbox', '--disable-dev-shm-usage'] });
try {
  for (const [orientation, w, h] of ORIENTATIONS) {
    const context = await browser.newContext({
      viewport: { width: w, height: h }, deviceScaleFactor: 2,
      isMobile: true, hasTouch: true,
    });
    const page = await context.newPage();
    await page.addInitScript(() => {
      try {
        localStorage.setItem('bw-starter-v1-complete', '1');
        localStorage.setItem('bw-fpga-enabled', '1');
        localStorage.setItem('bw-fpga-guide-done', '1');
      } catch { /* private mode */ }
    });
    await page.goto(base, { waitUntil: 'domcontentloaded', timeout: 90000 });
    await page.waitForFunction("document.querySelectorAll('[role=\"tab\"]').length >= 4",
      null, { timeout: 90000, polling: 250 });

    const shell = await page.evaluate(() => {
      const vv = window.visualViewport;
      return {
        layoutW: innerWidth,
        visualW: vv ? Math.round(vv.width) : innerWidth,
        scale: vv ? Math.round(vv.scale * 100) / 100 : 1,
      };
    });
    // The browser must be SCALING, not cropping: a visual viewport as wide as
    // the layout is what "the whole app is on screen" means here.
    check(shell.visualW >= shell.layoutW - 1,
      `${orientation}: the visible box is as wide as the layout (scaled, not cropped)`,
      `layout ${shell.layoutW}, visual ${shell.visualW}, scale ${shell.scale}`);

    const tabs = await page.evaluate(() => {
      const t = [...document.querySelectorAll('[role="tab"]')];
      const vv = window.visualViewport;
      const right = vv ? vv.offsetLeft + vv.width : innerWidth;
      const fit = t.filter(e => {
        const r = e.getBoundingClientRect();
        return r.width > 0 && r.right <= right + 1;
      });
      return { total: t.length, fit: fit.length,
               names: t.map(e => e.textContent.trim().slice(0, 14)) };
    });
    check(tabs.fit === tabs.total, `${orientation}: every editor tab is reachable`,
      `${tabs.fit}/${tabs.total} — ${tabs.names.join(' | ')}`);

    // The surfaces themselves: each must sit inside the visible box. Before the
    // fix these hung 577-593px off the right in portrait.
    for (const [label, idx, sel] of [
      ['circuit designer', 4, '.bw-circuit-designer'],
      ['paint editor', 1, '[class*="paint-editor"]'],
      ['code editor', 3, '.cm-content'],
    ]) {
      try {
        await page.getByRole('tab').nth(idx).click({ timeout: 10000 });
        await page.waitForFunction(
          `document.querySelectorAll('${sel.replace(/'/g, "\\'")}').length > 0`,
          null, { timeout: 30000, polling: 250 });
        const off = await page.evaluate((s) => {
          const el = document.querySelector(s);
          const vv = window.visualViewport;
          const right = vv ? vv.offsetLeft + vv.width : innerWidth;
          const r = el.getBoundingClientRect();
          return Math.max(0, Math.round(r.right - right));
        }, sel);
        check(off <= 2, `${orientation}: the ${label} is not off the side`, `${off}px past the edge`);
      } catch (e) {
        check(false, `${orientation}: the ${label} is reachable`,
          String(e.message).slice(0, 70));
      }
    }
    await context.close();
  }
} finally {
  await browser.close();
}

if (failures.length) {
  console.error(`\n${failures.length} check(s) failed`);
  process.exit(1);
}
console.log('\nthe editor fits a phone in both orientations');
