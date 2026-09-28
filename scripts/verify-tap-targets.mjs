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
        await page.waitForFunction(
            'document.querySelectorAll(\'[role="tab"][aria-selected="true"]\').length === 1',
            null, {timeout: 20000, polling: 100});

        // WAIT FOR THE PANE TO FILL, not merely to be selected. aria-selected
        // flips before the pane's contents mount, and measuring there is how a
        // gate passes because there is nothing to measure: on the Circuit tab
        // this counted 9 controls where a settled pane has ~489 — so the pane
        // holding 317 of the sub-24px controls in the original audit would have
        // been waved through. Found by running this gate against a build with
        // no floor at all and noticing the count, not the verdict.
        //
        // Stabilisation rather than a fixed sleep: poll until the count stops
        // changing across three consecutive samples.
        const settled = await (async () => {
            let last = -1;
            let stable = 0;
            const deadline = Date.now() + 25000;
            while (Date.now() < deadline) {
                const n = await page.evaluate(() => document.querySelectorAll(
                    'button,select,[role="button"],[role="tab"],input[type=checkbox],input[type=radio]'
                ).length);
                stable = n === last ? stable + 1 : 0;
                last = n;
                if (stable >= 3) return {n, stable: true};
                await page.evaluate(() => new Promise(r => setTimeout(r, 200)));
            }
            return {n: last, stable: false};
        })();
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
                        // One decimal, not rounded: Math.round(23.6) prints "24px"
                        // beside a message saying the control is under 24, which
                        // reads as a bug in the gate rather than in the control.
                        px: Number(m.toFixed(1)), tag: el.tagName.toLowerCase(),
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
        check(settled.stable,
            `${r.name}: the pane settled before measuring (${settled.n} controls)`,
            settled.stable ? '' : 'count still changing at the deadline — the numbers below are a snapshot of a moving pane');
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

        // AND THAT NOTHING BECAME UNCLICKABLE. A min-width can push a control
        // under a neighbour, which costs no page width and would pass the check
        // above while making the control impossible to tap — a worse outcome
        // than the small target it replaced.
        //
        // Measured as an A/B in this one page rather than against a stored
        // baseline: the whole rule hangs off one attribute on <html>, so it can
        // be switched off, measured, switched back on and measured again with
        // the same pane in the same state. That asks exactly the right question
        // — "did MY rule cover anything" — and needs no number to maintain.
        // Several controls have a covered centre already, unfloored (the editor
        // overlays some Code-tab buttons at this width); those are not this
        // change's doing and this comparison does not blame them on it.
        const overlap = await page.evaluate(() => {
            const countCovered = () => {
                const visible = el => {
                    const b = el.getBoundingClientRect();
                    const s = getComputedStyle(el);
                    return b.width > 0 && b.height > 0 &&
                        s.visibility !== 'hidden' && s.display !== 'none';
                };
                const els = [...document.querySelectorAll(
                    'button,select,[role="button"],[role="tab"]')].filter(visible);
                const hits = [];
                for (const el of els) {
                    const b = el.getBoundingClientRect();
                    const cx = b.left + (b.width / 2);
                    const cy = b.top + (b.height / 2);
                    if (cx < 0 || cy < 0 || cx > innerWidth || cy > innerHeight) continue;
                    const top = document.elementFromPoint(cx, cy);
                    if (!top || top === el || el.contains(top) || top.contains(el)) continue;
                    hits.push((el.getAttribute('aria-label') || el.textContent || '')
                        .trim().slice(0, 24));
                }
                return hits;
            };
            const root = document.documentElement;
            const had = root.getAttribute('data-bw-touch');
            root.removeAttribute('data-bw-touch');
            void root.offsetHeight;                  // force the reflow
            const without = countCovered();
            if (had !== null) root.setAttribute('data-bw-touch', had);
            void root.offsetHeight;
            const with_ = countCovered();
            return {
                without: without.length, with: with_.length,
                added: with_.filter(n => !without.includes(n)).slice(0, 5),
            };
        });
        check(overlap.with <= overlap.without,
            `${r.name}: the floor covered no control that was reachable without it`,
            `covered centres: ${overlap.without} unfloored -> ${overlap.with} floored`
              + (overlap.added.length ? `; newly covered: ${overlap.added.map(n => `"${n}"`).join(', ')}` : ''));
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
