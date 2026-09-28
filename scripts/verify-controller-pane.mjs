#!/usr/bin/env node
/**
 * The widgets/controller pane is usable on a phone, in both orientations, and
 * full screen has a way back.
 *
 * Driven through the Redux store rather than the UI because the pane is
 * populated by a project's blocks at runtime: there is no faceplate to load in
 * a bare editor, and an empty pane measures 0x0 and would pass everything.
 * WIDGETS ARE GIVEN EXPLICIT POSITIONS — an earlier version passed `{}` as the
 * layout, every widget stacked at the default spot, and the resulting overlaps
 * looked exactly like a product defect. They were the fixture's.
 *
 *   PROOF_URL=http://localhost:8617/ node scripts/verify-controller-pane.mjs
 */
import {chromium} from 'playwright';

const base = process.env.PROOF_URL || 'http://localhost:8617/';
const fails = [];
const ok = [];
const check = (c, m, d = '') => {
    console.log(`${c ? 'ok  ' : 'FAIL'} ${m}${d ? ` - ${d}` : ''}`);
    if (!c) fails.push(m);
    else ok.push(m);
};

const WIDGETS = [
    ['throttle', 'slider', {min: 0, max: 100, value: 40}, {x: 20, y: 20}],
    ['steer', 'dial', {min: -90, max: 90, value: 0}, {x: 20, y: 150}],
    ['go', 'button', {}, {x: 20, y: 280}],
    ['level', 'bargraph', {min: 0, max: 10, value: 6}, {x: 20, y: 380}],
];

const browser = await chromium.launch({args: ['--no-sandbox', '--disable-dev-shm-usage']});
try {
    for (const o of [
        {name: 'portrait', w: 430, h: 930},
        {name: 'landscape', w: 930, h: 430},
    ]) {
        const ctx = await browser.newContext({
            viewport: {width: o.w, height: o.h},
            deviceScaleFactor: 3, isMobile: true, hasTouch: true,
        });
        const page = await ctx.newPage();
        await page.addInitScript(() => {
            try {
                localStorage.setItem('bw-starter-v1-complete', '1');
                localStorage.setItem('bw-debug-dock', 'controller');
                localStorage.setItem('bw-stage-circuit', '1');
                localStorage.setItem('bw-right-pane-hidden', '0');
            } catch { /* private mode */ }
        });
        await page.goto(base, {waitUntil: 'domcontentloaded', timeout: 90000});
        await page.waitForFunction("document.querySelectorAll('[role=\"tab\"]').length >= 4",
            null, {timeout: 90000, polling: 250});

        const seeded = await page.evaluate(specs => {
            const store = window.__brickwrightStore;
            if (!store) return {error: 'no store'};
            const vm = store.getState().scratchGui.vm;
            const panel = vm && vm.runtime && vm.runtime.controllerPanel;
            if (!panel) return {error: 'no controllerPanel'};
            window.__bwStore = store;
            let n = 0;
            for (const [name, type, cfg, layout] of specs) {
                try { panel.addWidget(name, type, cfg, layout); n++; } catch { /* type absent */ }
            }
            return {n};
        }, WIDGETS);
        check(!seeded.error && seeded.n > 0,
            `${o.name}: the pane accepts widgets (${seeded.error || `${seeded.n} added`})`);
        if (seeded.error) { await ctx.close(); continue; }

        await page.waitForFunction(
            "(document.querySelector('[data-testid=\"bw-controller-canvas\"]')||{}).clientHeight > 0",
            null, {timeout: 20000, polling: 150}).catch(() => {});

        // `scoped` restricts the sweep to the pane's own subtree. Necessary in
        // full screen: the editor behind the overlay keeps its controls in the
        // DOM, and they are legitimately covered BY the overlay — counting them
        // reported "Undo; text; ⌃; Blocks" as defects on a correct build.
        const survey = (scoped = false) => page.evaluate(onlyPane => {
            const vis = el => (el.checkVisibility
                ? el.checkVisibility({contentVisibilityAuto: true, opacityProperty: true, visibilityProperty: true})
                : true);
            const panel = document.querySelector('[data-testid="bw-controller-canvas"]');
            const root = onlyPane
                ? (panel && panel.closest('[data-widgets-toolbar]') ? panel.parentElement : (panel || document))
                : document;
            const sel = 'button,select,[role="button"],[role="tab"],input,textarea';
            const els = [...(onlyPane && panel
                ? [...panel.parentElement.querySelectorAll(sel)]
                : root.querySelectorAll(sel))].filter(vis);
            const tiny = [];
            const covered = [];
            for (const el of els) {
                const b = el.getBoundingClientRect();
                const name = (el.getAttribute('aria-label') || el.textContent || el.type || '').trim().slice(0, 22);
                if (Math.min(b.width, b.height) < 24) tiny.push(`${name} ${Math.round(b.width)}x${Math.round(b.height)}`);
                const cx = b.left + (b.width / 2);
                const cy = b.top + (b.height / 2);
                if (cx < 0 || cy < 0 || cx > innerWidth || cy > innerHeight) continue;
                const top = document.elementFromPoint(cx, cy);
                if (top && top !== el && !el.contains(top) && !top.contains(el)) covered.push(name);
            }
            return {
                panelH: panel ? panel.clientHeight : 0,
                panelW: panel ? panel.clientWidth : 0,
                controls: els.length, tiny, covered,
                docScrollW: document.documentElement.scrollWidth, innerW: innerWidth,
            };
        }, scoped);

        const s = await survey(false);
        check(s.panelH > 0 && s.panelW > 0,
            `${o.name}: the pane has a size (${s.panelW}x${s.panelH})`);
        check(s.tiny.length === 0,
            `${o.name}: every control clears 24px (${s.controls} controls)`,
            s.tiny.slice(0, 4).join('; '));
        check(s.covered.length === 0,
            `${o.name}: no control is covered by another`,
            s.covered.slice(0, 4).join('; '));
        check(s.docScrollW <= s.innerW + 1,
            `${o.name}: the page does not overflow sideways`,
            `scrollWidth ${s.docScrollW} vs ${s.innerW}`);

        // FULL SCREEN MUST HAVE A WAY BACK. Entered through the store because
        // the stage header that normally offers it is capped in this dock mode.
        await page.evaluate(() => window.__bwStore.dispatch(
            {type: 'scratch-gui/mode/SET_FULL_SCREEN', isFullScreen: true}));
        await page.waitForFunction(
            "!!document.querySelector('[data-testid=\"bw-widgets-exit-fullscreen\"]')",
            null, {timeout: 10000, polling: 100}).catch(() => {});
        const exit = await page.evaluate(() => {
            const vis = el => (el.checkVisibility ? el.checkVisibility({
                contentVisibilityAuto: true, opacityProperty: true, visibilityProperty: true,
            }) : true);
            const el = document.querySelector('[data-testid="bw-widgets-exit-fullscreen"]');
            if (!el) return {found: false};
            const b = el.getBoundingClientRect();
            const top = document.elementFromPoint(b.left + (b.width / 2), b.top + (b.height / 2));
            return {
                found: true, visible: vis(el),
                w: Math.round(b.width), h: Math.round(b.height),
                hittable: !!(top && (top === el || el.contains(top))),
                onScreen: b.top >= 0 && b.left >= 0 && b.right <= innerWidth && b.bottom <= innerHeight,
            };
        });
        check(exit.found && exit.visible && exit.hittable && exit.onScreen,
            `${o.name}: FULL SCREEN HAS A WAY BACK — the exit control is on screen and clickable`,
            JSON.stringify(exit));

        const fs = await survey(true);
        check(fs.tiny.length === 0,
            `${o.name}: full screen — every control IN THE PANE clears 24px (${fs.controls} controls)`,
            fs.tiny.slice(0, 4).join('; '));
        check(fs.covered.length === 0,
            `${o.name}: full screen — no control IN THE PANE is covered`,
            fs.covered.slice(0, 4).join('; '));
        await ctx.close();
    }
} finally {
    await browser.close();
}
console.log(`\n${ok.length} passed, ${fails.length} failed`);
process.exit(fails.length ? 1 : 0);
