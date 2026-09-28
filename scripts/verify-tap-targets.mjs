#!/usr/bin/env node
/**
 * Controls are big enough to hit on a phone, and flooring them costs no width.
 *
 * Two claims, and the second is why this is a browser gate and not a unit test:
 * a CSS floor on min-width can widen a dense toolbar row until its content
 * runs off the pane, and only a real layout can say whether it did.
 *
 * The floor is in CSS pixels. It cannot be in on-screen points: the app
 * declares a 1024px layout, so a phone renders it at ~0.42 and 44 CSS px shows
 * as 18.5pt. See lib/touch-targets.js for why that is the reachable goal.
 *
 *   PROOF_URL=http://localhost:8617/ node scripts/verify-tap-targets.mjs
 */
import {chromium} from 'playwright';
import {FLOOR_PX} from '../overlay/scratch-gui/src/lib/touch-targets.js';

const base = process.env.PROOF_URL || 'http://localhost:8617/';
const failures = [];
const check = (ok, msg, detail = '') => {
    console.log(`${ok ? 'ok  ' : 'FAIL'} ${msg}${detail ? ` - ${detail}` : ''}`);
    if (!ok) failures.push(msg);
};

// Below this, a control is not a near miss, it is unhittable. Kept separate
// from FLOOR_PX so a future floor change cannot quietly relax the hard limit.
const UNHITTABLE = 24;

const browser = await chromium.launch({args: ['--no-sandbox', '--disable-dev-shm-usage']});
try {
    const context = await browser.newContext({
        viewport: {width: 430, height: 930}, deviceScaleFactor: 3,
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
    await page.goto(base, {waitUntil: 'domcontentloaded', timeout: 90000});
    await page.waitForFunction("document.querySelectorAll('[role=\"tab\"]').length >= 4",
        null, {timeout: 90000, polling: 250});

    // The flag is what makes the rule apply at all; if it is missing, every
    // size assertion below would be measuring the unfloored build and passing
    // or failing for reasons that have nothing to do with this change.
    const flagged = await page.evaluate(() =>
        document.documentElement.getAttribute('data-bw-touch'));
    check(flagged === '1',
        'the app recognises a phone and set the touch flag on <html>',
        `data-bw-touch=${JSON.stringify(flagged)}`);
    const styled = await page.evaluate(() =>
        !!document.getElementById('bw-touch-targets'));
    check(styled, 'and installed the floor stylesheet');

    const tabs = await page.evaluate(() => document.querySelectorAll('[role="tab"]').length);
    check(tabs >= 4, `the tab strip is present (${tabs} tabs)`);

    for (let i = 0; i < tabs; i++) {
        await page.getByRole('tab').nth(i).click().catch(() => {});
        // Settle on the pane rendering rather than a fixed sleep.
        await page.waitForFunction(
            'document.querySelectorAll(\'[role="tab"][aria-selected="true"]\').length === 1',
            null, {timeout: 20000, polling: 100});
        const r = await page.evaluate(() => {
            const visible = el => {
                const b = el.getBoundingClientRect();
                const s = getComputedStyle(el);
                return b.width > 0 && b.height > 0 &&
                    s.visibility !== 'hidden' && s.display !== 'none';
            };
            const name = document.querySelector('[role="tab"][aria-selected="true"]')
                ?.textContent.trim() || '?';
            const els = [...document.querySelectorAll(
                'button,select,[role="button"],[role="tab"],input[type=checkbox],input[type=radio]'
            )].filter(visible);
            const tiny = [];
            for (const el of els) {
                const b = el.getBoundingClientRect();
                const m = Math.min(b.width, b.height);
                if (m < 24) {
                    tiny.push({
                        px: Math.round(m), tag: el.tagName.toLowerCase(),
                        label: (el.getAttribute('aria-label') || el.textContent ||
                                el.getAttribute('title') || '').trim().slice(0, 30),
                    });
                }
            }
            return {
                name, controls: els.length, tiny,
                docScrollW: document.documentElement.scrollWidth,
                layoutW: window.innerWidth,
            };
        });
        check(r.tiny.length === 0,
            `${r.name}: no visible control is under ${UNHITTABLE}px (${r.controls} controls)`,
            r.tiny.length
                ? r.tiny.slice(0, 5).map(t => `${t.px}px ${t.tag} "${t.label}"`).join('; ')
                  + (r.tiny.length > 5 ? ` (+${r.tiny.length - 5} more)` : '')
                : '');
        // The cost side of the trade, measured rather than assumed.
        check(r.docScrollW <= r.layoutW + 1,
            `${r.name}: flooring the controls did not widen the page`,
            `scrollWidth ${r.docScrollW} vs layout ${r.layoutW}`);
    }
    console.log(`\n(floor is ${FLOOR_PX} CSS px; hard limit asserted at ${UNHITTABLE})`);
} finally {
    await browser.close();
}

if (failures.length) {
    console.error(`\n${failures.length} check(s) failed`);
    process.exit(1);
}
console.log('\ncontrols are hittable on a phone, and the floor costs no width');
