#!/usr/bin/env node
/**
 * The arrays extension draws a stored array onto the stage as a table.
 *
 * `test/arrays-table-display.test.mjs` asserts the SVG and the mark state as
 * pure values. What it cannot see is whether the renderer ACCEPTS that SVG:
 * a skin that fails to parse, or a drawable created in a layer group the
 * renderer does not have, throws inside the extension's own try/catch and the
 * table simply never appears — with the unit suite still green, because every
 * value it checks is still correct. Where code lives is not whether it runs.
 *
 * It is asserted on SKIN GEOMETRY rather than on pixels, and that is a
 * deliberate limit. In headless Chromium the stage canvas keeps a 0x0 backing
 * store while the right pane is collapsed, so EVERYTHING paints into nothing --
 * the default sprite included -- and a screenshot of a working stage is
 * indistinguishable from a screenshot of a broken one. A rasterised skin size
 * is the last honest signal before that cliff.
 *
 * The size is not a magic number. For a 5-column, 3-row grid at 40x26 with a
 * 14pt title the builder produces 5*40 + 2*4 = 208 wide and 3*26 + 2*4 +
 * (14 + 8) = 108 high. Nothing else in the app produces that pair, so a skin
 * reporting [208, 108] is this table and not some other drawable arriving late.
 *
 * Driven through `runtime._primitives`, which is the same entry point an
 * executing block uses -- not through the extension object, which would prove
 * only that a method returns.
 */
import {mkdir, writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {chromium} from 'playwright';

const url = process.env.PROOF_URL || 'http://localhost:8617/';
const artifacts = resolve('artifacts/arrays-table-display');
await mkdir(artifacts, {recursive: true});
const EXPECTED = [208, 108];

const browser = await chromium.launch({headless: true});
const page = await browser.newPage({viewport: {width: 1280, height: 900}});
const pageErrors = [];
page.on('pageerror', error => pageErrors.push(error.message));
const skins = () => page.evaluate(() => Object.entries(window.__vm.renderer._allSkins || {})
    .map(([id, skin]) => ({id, size: skin && skin.size})));

try {
    await page.addInitScript(() => {
        localStorage.clear();
        sessionStorage.clear();
        localStorage.setItem('bw-starter-v1-complete', '1');
    });
    await page.goto(url, {waitUntil: 'domcontentloaded', timeout: 60000});
    await page.waitForFunction(() => {
        const vm = window.__brickwrightStore?.getState?.()?.scratchGui?.vm;
        if (!vm?.runtime) return false;
        window.__vm = vm;
        return true;
    }, null, {timeout: 60000});

    await page.evaluate(() => window.__vm.extensionManager.loadExtensionURL('arrays'));
    await page.waitForFunction(() =>
        typeof window.__vm.runtime._primitives?.arrays_showTable === 'function',
        null, {timeout: 30000});

    // The VM being ready is not the project being drawn. `__vm.runtime` exists
    // before the stage and the default sprite have their drawables, so sampling
    // a baseline here races the project's own load: against a fast local server
    // the count has settled by now, against an origin over the network it has
    // not. Measured 2026-09-05 on the deployed site — this gate read 0 and then
    // asserted `0 -> 3`, reporting a table that had in fact drawn correctly.
    // Wait for the project's own drawables before counting the one we add.
    await page.waitForFunction(() => Object.values(window.__vm.renderer?._allDrawables || {})
        .filter(Boolean).length >= 2, null, {timeout: 60000});
    const before = await skins();
    const drawablesBefore = await page.evaluate(() =>
        Object.values(window.__vm.renderer._allDrawables || {}).filter(Boolean).length);

    const reported = await page.evaluate(() => {
        const p = window.__vm.runtime._primitives;
        p.arrays_create2D({NAME: 'card', JSON:
            '[["B","I","N","G","O"],[7,14,21,48,62],[3,19,"free",55,70]]'});
        p.arrays_setTableTitle({NAME: 'card', TITLE: 'Player 1'});
        p.arrays_setTableStyle({NAME: 'card', W: 40, H: 26, SIZE: 14});
        p.arrays_showTable({NAME: 'card', X: -110, Y: 20});
        p.arrays_markCell({NAME: 'card', ROW: 3, COL: 3});
        return {
            marked: p.arrays_isMarked({NAME: 'card', ROW: 3, COL: 3}),
            unmarked: p.arrays_isMarked({NAME: 'card', ROW: 1, COL: 1}),
            count: p.arrays_markedCount({NAME: 'card'})
        };
    });

    // The SVG rasterises asynchronously. Wait for the geometry, not for a moment.
    await page.waitForFunction(expected => Object.values(window.__vm.renderer._allSkins || {})
        .some(skin => Array.isArray(skin?.size) &&
            skin.size[0] === expected[0] && skin.size[1] === expected[1]),
    EXPECTED, {timeout: 30000});

    const after = await skins();
    const drawablesAfter = await page.evaluate(() =>
        Object.values(window.__vm.renderer._allDrawables || {}).filter(Boolean).length);

    if (drawablesAfter !== drawablesBefore + 1) {
        throw new Error(`showTable should add exactly one drawable, went ` +
            `${drawablesBefore} -> ${drawablesAfter}`);
    }
    if (reported.marked !== true || reported.unmarked !== false || reported.count !== 1) {
        throw new Error(`mark reporters disagree with the marks set: ${JSON.stringify(reported)}`);
    }

    // A second table must be independent, not a second view of the first.
    await page.evaluate(() => {
        const p = window.__vm.runtime._primitives;
        p.arrays_create2D({NAME: 'card2', JSON: '[[1,2],[3,4]]'});
        p.arrays_showTable({NAME: 'card2', X: 110, Y: 20});
    });
    await page.waitForFunction(n => Object.values(window.__vm.renderer._allDrawables || {})
        .filter(Boolean).length === n, drawablesBefore + 2, {timeout: 15000});
    const isolated = await page.evaluate(() => ({
        first: window.__vm.runtime._primitives.arrays_markedCount({NAME: 'card'}),
        second: window.__vm.runtime._primitives.arrays_markedCount({NAME: 'card2'})
    }));
    if (isolated.first !== 1 || isolated.second !== 0) {
        throw new Error(`tables share mark state: ${JSON.stringify(isolated)}`);
    }

    // Hiding must take the drawable out of view without destroying the table:
    // the reporters still have to answer, because a win check can run while
    // the card is hidden.
    const hidden = await page.evaluate(() => {
        window.__vm.runtime._primitives.arrays_hideTable({NAME: 'card2'});
        const invisible = Object.values(window.__vm.renderer._allDrawables || {})
            .filter(Boolean).filter(d => d._visible === false).length;
        return {invisible, stillAnswers: window.__vm.runtime._primitives
            .arrays_markedCount({NAME: 'card'})};
    });
    if (hidden.invisible < 1) throw new Error('hideTable left every drawable visible');
    if (hidden.stillAnswers !== 1) throw new Error('hiding a table lost another table\'s marks');

    if (pageErrors.length) throw new Error(`page errors: ${pageErrors.join(' | ')}`);
    await writeFile(resolve(artifacts, 'result.json'), JSON.stringify({
        url, expected: EXPECTED, drawablesBefore, drawablesAfter,
        skinsBefore: before, skinsAfter: after, reported, isolated, hidden, pageErrors
    }, null, 2));
    console.log(`  ok: table skin rasterised at ${EXPECTED.join('x')}, one drawable added`);
    console.log('  ok: two tables stay independent; hide keeps the reporters answering');
    console.log('Arrays table display: the renderer accepts the table the blocks describe.');
} finally {
    await browser.close();
}
