#!/usr/bin/env node
/** Focused browser regression test for the Circuit Designer Instruments column. */
import {mkdir, writeFile} from 'node:fs/promises';
import path from 'node:path';
import {chromium} from 'playwright';

const URL = process.env.PROOF_URL || 'https://crispstrobe.github.io/brickwright-lite/';

const browser = await chromium.launch();
const page = await browser.newPage({viewport: {width: 1024, height: 768}});
const pageErrors = [];
page.on('pageerror', error => pageErrors.push(String(error)));
let ok = false;
try {
    await page.addInitScript(() => {
        localStorage.clear();
        localStorage.setItem('bw-starter-v1-complete', '1');
        sessionStorage.clear();
    });
    await page.goto(URL, {waitUntil: 'domcontentloaded', timeout: 60000});
    await page.waitForSelector('[role="tab"]', {timeout: 60000});

    const circuitTab = page.getByRole('tab', {name: /Circuit/});
    await circuitTab.click();
    await page.waitForSelector('.bw-circuit-designer:visible', {timeout: 60000});
    const designer = page.locator('.bw-circuit-designer:visible').last();
    const expand = designer.getByRole('button', {name: 'Expand instruments panel'});
    if (await expand.count()) await expand.click({force: true});
    const column = designer.locator('[data-instruments-column]');
    const scroll = designer.locator('[data-instruments-scroll]');
    if (await column.count() !== 1 || await scroll.count() !== 1) throw new Error('Instruments DOM is missing or duplicated');

    const scope = designer.getByRole('button', {name: /Scope$/});
    const meter = designer.getByRole('button', {name: /Meter$/});
    if (await scope.count() !== 1 || await meter.count() !== 1) throw new Error('Scope/Meter controls are missing');
    await scope.click({force: true});
    await meter.click({force: true});
    await scroll.locator('[data-scope-module]').waitFor({state: 'visible', timeout: 5000});
    await scroll.locator('[data-meter-module]').waitFor({state: 'visible', timeout: 5000});

    const before = await scroll.evaluate(el => ({
        clientHeight: el.clientHeight,
        scrollHeight: el.scrollHeight,
        overflowY: getComputedStyle(el).overflowY,
        bottom: el.getBoundingClientRect().bottom,
        viewport: window.innerHeight,
        designer: el.closest('.bw-circuit-designer')?.getBoundingClientRect().toJSON(),
        ancestors: (() => { const out = []; let n = el; for (let i = 0; i < 6 && n; i++, n = n.parentElement) out.push({tag: n.tagName, class: n.className, height: n.getBoundingClientRect().height, overflow: getComputedStyle(n).overflow}); return out; })(),
        scope: !!el.querySelector('[data-scope-module]'),
        meter: !!el.querySelector('[data-meter-module]')
    }));
    if (!before.scope || !before.meter || before.overflowY !== 'auto' || before.scrollHeight <= before.clientHeight || before.bottom > before.viewport + 1) {
        throw new Error(`Scope/Meter are not in a bounded scroll viewport: ${JSON.stringify(before)}`);
    }
    const after = await scroll.evaluate(el => {
        el.scrollTop = el.scrollHeight;
        const meterModule = el.querySelector('[data-meter-module]').getBoundingClientRect();
        return {scrollTop: el.scrollTop, meterTop: meterModule.top, viewportBottom: el.getBoundingClientRect().bottom};
    });
    if (after.scrollTop <= 0 || after.meterTop > after.viewportBottom + 1) {
        throw new Error(`Instruments did not scroll to Meter: ${JSON.stringify(after)}`);
    }

    // Debugger/no-code placement is exercised unconditionally by the wired
    // verify-circuit-ux gate. This focused proof owns the stricter instrument
    // overflow contract and must never make it conditional on a button label.
    if (pageErrors.length) throw new Error(`page errors: ${pageErrors.join(' | ')}`);
    console.log(`ok  scope+meter before=${JSON.stringify(before)} after=${JSON.stringify(after)}`);
    ok = true;
} finally {
    if (!ok) {
        await mkdir(path.resolve('artifacts'), {recursive: true});
        await page.screenshot({path: path.resolve('artifacts/verify-instruments-scroll-failure.png'), fullPage: true}).catch(() => {});
        await writeFile(path.resolve('artifacts/verify-instruments-scroll-page-errors.txt'), `${pageErrors.join('\n')}\n`).catch(() => {});
    }
    await browser.close();
}
