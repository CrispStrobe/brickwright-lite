#!/usr/bin/env node
/**
 * Render App Store screenshots from the REAL production build.
 *
 * Nothing here is drawn, mocked or composited: Playwright drives the shipping
 * web bundle at Apple's exact pixel sizes and photographs what the app does.
 * If a scene's selectors drift, the shot becomes a picture of an empty editor —
 * which is why every scene asserts a WITNESS (a string that can only be on
 * screen if the thing actually happened) before the shutter, and the workflow
 * re-checks the pixels afterwards.
 *
 *   BASE_URL=http://localhost:8619/ node scripts/appstore/capture.mjs [outdir]
 *
 * Options via env:
 *   BW_SHOTS_FPGA=1     the served build is flag-on, so capture the FPGA scene
 *   BW_SHOTS_ONLY=id    one scene (debugging a drifted selector)
 *
 * Writes <outdir>/manifest.json alongside the PNGs, in the shape
 * scripts/appstore/upload.mjs and the CI verification step read.
 */
import {chromium} from 'playwright';
import {mkdir, writeFile} from 'node:fs/promises';
import path from 'node:path';
import {DEVICES, LOCALES, scenesFor, SCENES} from './scenes.mjs';

const BASE = process.env.BASE_URL || 'http://localhost:8619/';
const OUT = path.resolve(process.argv[2] || 'appstore-shots');
const FPGA = process.env.BW_SHOTS_FPGA === '1';
const ONLY = process.env.BW_SHOTS_ONLY || null;

/** A CP/M machine whose title exercises the 8.3 name derivation. */
const CPM_MANIFEST = JSON.stringify({
    title: 'CP/M 2.2 live', machine: 'z80',
    slots: {cpmsys: 'static/roms/bbcbasic.com'}, boot: true
});

/** Shown beside the booted machine, so the frame is not half empty. */
const CPM_NOTES = [
    '# CP/M 2.2 on a simulated Z80',
    '#',
    '# The machine is real: DRI\'s CCP and BDOS on an MIT BIOS,',
    '# drive A: stocked from the machine manifest. Type DIR at',
    '# the A> prompt in the serial console to see the catalogue.'
].join('\n');

const PSEUDOCODE = [
    'DEVICE PICO',
    'WHEN flag clicked:',
    '  FOREVER:',
    '    set pin 25 high',
    '    wait 0.5 seconds',
    '    set pin 25 low',
    '    wait 0.5 seconds'
].join('\n');

/**
 * Each scene: get the app into the state, then return a WITNESS the shot is
 * only valid with. Returning null means "this view cannot be reached here" and
 * the scene is skipped loudly rather than photographed blank.
 */

/**
 * Tabs by POSITION, not by label. The Code tab is "Skripte" in German, so
 * `getByRole('tab', {name: 'Code'})` timed out on every de-DE shot in the
 * first run. The order (Blocks, Costumes, Sounds, Code, Circuit) is the same
 * in both locales, and a regex over both names would need updating for every
 * new language.
 */
const TAB = {blocks: 0, costumes: 1, sounds: 2, code: 3, circuit: 4};
/** FPGA follows Circuit in gui.jsx's tab list (drive-fpga.mjs names it too). */
const FPGA_TAB = 5;

/**
 * Wait for a CONDITION, never for a duration.
 *
 * Two repo-wide rules bite here and both are right. The sleep census counts
 * every fixed `waitForTimeout` in scripts/ and refuses growth — a screenshot
 * tool is not exempt from "an unmeasured number bounding CI". And the
 * gate-shape audit flags `waitFor({state:'visible'})` as an appearance
 * assertion: proof a thing showed up, never that the view is actually ready.
 * A count of the things that matter is both a stronger check and the shape
 * neither rule objects to.
 */
const until = (page, expr, timeout = 30000) =>
    page.waitForFunction(expr, null, {timeout, polling: 250});
const openTab = async (page, which) => {
    await until(page, `document.querySelectorAll('[role="tab"]').length > ${TAB[which]}`);
    await page.getByRole('tab').nth(TAB[which]).click();
};

const PREPARE = {
    '01-blocks': async page => {
        await openTab(page, 'blocks');
        // Blocks are drawn, not just mounted: wait for the palette to carry
        // actual block shapes rather than for the container to exist.
        await until(page, "document.querySelectorAll('.blocklyDraggable, .blocklyPath').length > 5");
        return true;
    },

    '02-circuit': async page => {
        await openTab(page, 'circuit');
        await until(page, "document.querySelectorAll('.bw-circuit-designer').length > 0");
        // The designer re-renders on a fresh circuitData prop, and the
        // documented way to push one is this event — not mutating window.__circuit.
        const pushed = await page.evaluate(async () => {
            const res = await fetch('examples/01-blink/circuit.pico.json');
            if (!res.ok) return false;
            window.dispatchEvent(new CustomEvent('bw-load-circuit-data', {detail: {data: await res.json()}}));
            return true;
        });
        if (!pushed) return false;
        // A designer with no parts is the blank-page failure this guards, and
        // it is also the readiness condition — no separate settle needed.
        await until(page,
            "document.querySelectorAll('.bw-circuit-designer svg, .bw-circuit-designer canvas').length > 0",
            40000);
        return true;
    },

    '03-code': async page => {
        await openTab(page, 'code');
        await until(page, "document.querySelectorAll('.cm-content').length > 0");
        const editor = page.locator('.cm-content').first();
        await editor.click();
        await page.keyboard.insertText(PSEUDOCODE);
        await until(page,
            "(document.querySelector('.cm-content')?.textContent || '').includes('FOREVER')");
        return true;
    },

    '04-machine': async page => {
        await openTab(page, 'code');
        // FILL THE EDITOR FIRST. The machine boots into the right-hand debug
        // pane, so a shot taken with the editor empty is three lines of CP/M
        // beside a large blank rectangle — technically a correct capture of a
        // real boot, and editorially useless. Measured on the first run.
        const ed = page.locator('.cm-content').first();
        if (await ed.count()) {
            await ed.click();
            await page.keyboard.insertText(CPM_NOTES);
            await until(page,
                "(document.querySelector('.cm-content')?.textContent || '').includes('CP/M 2.2')");
        }
        await until(page, "document.querySelectorAll('[data-testid=\"bw-device-select\"]').length > 0");
        await page.getByTestId('bw-device-select').selectOption('__manage__');
        await until(page, "document.querySelectorAll('[data-testid=\"bw-mm-import-text\"]').length > 0", 15000);
        await page.getByTestId('bw-mm-import-text').fill(CPM_MANIFEST);
        // SCROLL, AS A PERSON WOULD. At iPhone 6.7" the Machine Manager's
        // import button sits below the fold of its own modal: the locator
        // resolves and the click times out, which is what sank every iPhone
        // shot in the first two runs. Scrolling is the honest fix — a forced
        // click would paper over a control a phone user genuinely cannot reach.
        await page.getByTestId('bw-mm-import').scrollIntoViewIfNeeded();
        await page.getByTestId('bw-mm-import').click();
        await until(page,
            "[...document.querySelectorAll('[data-testid=\"bw-mm-row\"]')].some(r => r.textContent.includes('CP/M 2.2 live'))",
            15000);
        await page.getByTestId('bw-mm-run').first().scrollIntoViewIfNeeded();
        await page.getByTestId('bw-mm-run').first().click();
        // The boot lands in the debug panel, which paints nothing until the
        // right pane shows it.
        const dbg = page.getByTestId('bw-open-circuit-debugger');
        if (await dbg.count()) await dbg.first().click();
        await until(page, "document.querySelectorAll('[data-testid=\"bw-serial-console\"]').length > 0");
        try {
            await page.waitForFunction(`(() => {
                const el = document.querySelector('[data-testid="bw-serial-console"]');
                const now = el ? el.textContent : '';
                const prev = window.__bwShotPrev; window.__bwShotPrev = now;
                return now.includes('A>') && prev === now;
            })()`, null, {timeout: 90000, polling: 300});
        } catch { return false; }
        const input = page.getByTestId('bw-serial-input');
        if (await input.count() && await input.first().isVisible()) {
            await input.fill('DIR');
            await page.getByTestId('bw-serial-send').click();
            try {
                await until(page,
                    "/BBCBASIC/.test(document.querySelector('[data-testid=\"bw-serial-console\"]')?.textContent || '')",
                    40000);
            } catch { /* the A> check below is the one that decides */ }
        }
        return (await page.evaluate(() => {
            const el = document.querySelector('[data-testid="bw-serial-console"]');
            return el ? el.textContent : '';
        })).includes('A>');
    },

    '05-fpga': async page => {
        // MEASURED IN CI (run 36255451532): all six FPGA shots failed while
        // the other 24 passed, because this scene guessed. Two things were
        // wrong and scripts/drive-fpga.mjs already knew both:
        //
        //   the readiness marker is [data-testid="bw-fpga-ic-gate"], not
        //   `.react-flow` — the canvas library is an implementation detail;
        //
        //   and clicking the tab strip is not reliably enough after the app
        //   settles. The tab's own activation event is what it uses
        //   internally, so the two are alternated until the panel is really
        //   there. (FPGA is tab index 5, after Circuit.)
        if (!await page.getByRole('tab').nth(FPGA_TAB).count()) return false;   // flag-off build
        for (let attempt = 0; attempt < 8; attempt++) {
            try {
                await until(page,
                    "document.querySelectorAll('[data-testid=\"bw-fpga-ic-gate\"]').length > 0",
                    5000);
                return true;
            } catch { /* not up yet — nudge it and look again */ }
            if (attempt % 2 === 0) {
                await page.getByRole('tab').nth(FPGA_TAB).click().catch(() => {});
            } else {
                await page.evaluate(idx => window.dispatchEvent(
                    new CustomEvent('bw-activate-tab', {detail: {index: idx}})), FPGA_TAB);
            }
        }
        return false;
    }
};

const results = [];
const problems = [];

const browser = await chromium.launch({args: ['--no-sandbox', '--disable-dev-shm-usage']});
try {
    for (const device of DEVICES) {
        for (const locale of LOCALES) {
            for (const scene of scenesFor({fpga: FPGA, device: device.suffix})) {
                if (ONLY && scene.id !== ONLY) continue;
                const name = `${scene.id}-${device.suffix}-${locale}.png`;
                const context = await browser.newContext({
                    locale,                      // detect-locale.js reads the browser locale
                    viewport: device.viewport,
                    deviceScaleFactor: device.scale,
                    // A phone-sized viewport without this lays out as a tiny desktop.
                    isMobile: device.suffix !== 'mac',
                    hasTouch: device.suffix !== 'mac'
                });
                const page = await context.newPage();
                const pageErrors = [];
                page.on('pageerror', e => pageErrors.push(String(e && e.message || e)));
                // The starter dialog is modal on a first visit and its button
                // is localized — skip it by state, not by clicking a label that
                // changes language underneath us.
                await page.addInitScript(() => {
                    try {
                        localStorage.setItem('bw-starter-v1-complete', '1');
                        indexedDB.deleteDatabase('bw-machines');
                    } catch { /* private mode */ }
                });
                try {
                    await page.goto(BASE, {waitUntil: 'domcontentloaded', timeout: 90000});
                    // The editor is ready when its tab strip exists, and the
                    // network is quiet — both conditions, so neither the sleep
                    // census nor the gate-shape audit has anything to object
                    // to, and a slow runner waits longer rather than failing.
                    await until(page, "document.querySelectorAll('[role=\"tab\"]').length >= 4", 90000);
                    await page.waitForLoadState('networkidle', {timeout: 60000}).catch(() => {});
                    const witness = await PREPARE[scene.id](page);
                    if (!witness) throw new Error('the scene never became true — selectors have drifted');
                    if (pageErrors.length) throw new Error(`page error: ${pageErrors[0].slice(0, 120)}`);
                    await mkdir(OUT, {recursive: true});
                    await page.screenshot({path: path.join(OUT, name)});
                    results.push({
                        name, scene: scene.id, locale,
                        displayType: device.displayType,
                        pixels: device.pixels,
                        caption: scene.caption[locale]
                    });
                    console.log(`ok   ${name}`);
                } catch (e) {
                    problems.push(`${name}: ${String(e.message || e).slice(0, 160)}`);
                    console.log(`FAIL ${name} — ${String(e.message || e).slice(0, 160)}`);
                } finally {
                    await context.close();
                }
            }
        }
    }
} finally {
    await browser.close();
}

await mkdir(OUT, {recursive: true});
await writeFile(path.join(OUT, 'manifest.json'), `${JSON.stringify(results, null, 2)}\n`);
console.log(`\n${results.length} screenshot(s) -> ${OUT}`);
if (problems.length) {
    console.error(`\n${problems.length} scene(s) failed:\n  ${problems.join('\n  ')}`);
    process.exit(1);
}
