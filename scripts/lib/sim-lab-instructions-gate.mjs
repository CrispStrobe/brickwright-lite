// SPDX-License-Identifier: BSD-3-Clause
// Copyright (c) 2026 Brickwright contributors
//
// The Robot Lab's building instructions, for scripts/verify-sim-lab-browser.mjs,
// with real clicks and keys only. Internal APIs (window.__bwSimLabInstructions)
// are used to READ results — the step plan and what the 3D page shows — never
// to perform the interaction.
//
//   1. "Instructions" opens the manual on step 1: the counter reads "1 / N", the
//      3D page draws the new parts in the highlight orange (pixels counted in a
//      screenshot), and the "parts needed" callout counts exactly that step's
//      new parts, each with its picture;
//   2. Next and the → key turn the page (the counter and the drawn step follow,
//      parts built before are on the page, the new ones are orange), ← turns back;
//      step 2 is the hub's pins on their own (pins first), with its note, both pins drawn
//      pulled out with an arrow home (the gate runs with reduced motion: no fly-in);
//   3. the last page is the parts list, counting every part of the model;
//   4. "Print / Save as PDF" opens a page with one picture per step (each a real
//      image, decoded) and the parts list;
//   5. Esc closes the manual.

import assert from 'node:assert/strict';
import {resolve} from 'node:path';

/** Pixels of the highlight orange (#ff7a00, lit or as edge lines) in a screenshot, decoded by the page. */
const orangePixels = async (page, locator) => {
    const png = await locator.screenshot();
    return page.evaluate(async b64 => {
        const img = new Image();
        img.src = `data:image/png;base64,${b64}`;
        await img.decode();
        const c = document.createElement('canvas');
        c.width = img.width;
        c.height = img.height;
        const g = c.getContext('2d');
        g.drawImage(img, 0, 0);
        const d = g.getImageData(0, 0, c.width, c.height).data;
        let n = 0;
        for (let i = 0; i < d.length; i += 4) {
            const [r, gr, b] = [d[i], d[i + 1], d[i + 2]];
            if (r > 190 && gr > 70 && gr < 185 && b < 90 && r - gr > 60) n++;
        }
        return n;
    }, png.toString('base64'));
};

const info = page => page.evaluate(() => {
    const ins = window.__bwSimLabInstructions;
    return {status: ins.status, page: ins.page, steps: ins.steps, stats: ins.stats,
        plan: ins.plan && ins.plan.steps.map(s => s.parts.length)};
});

/** Waits until the manual shows page `n` (0-based) and its 3D page has drawn that step. */
const onPage = (page, n) => page.waitForFunction(want => {
    const ins = window.__bwSimLabInstructions;
    return ins && ins.status === 'ready' && ins.page === want && (want >= ins.steps || (ins.stats && ins.stats.step === want));
}, n, {timeout: 15000});

export const instructionsInteractions = async (page, {shotsDir, printFullPage = true}) => {
    await page.getByTestId('bw-sim-lab-3d-canvas').waitFor({timeout: 30000});
    const modelParts = await page.evaluate(() => window.__bwSimLab._pane.session.model.parts.length);

    // ---- 1. open on step 1 ----------------------------------------------------------------
    await page.getByTestId('bw-sim-lab-instructions').click();
    const dialog = page.getByTestId('bw-sim-instructions');
    await dialog.waitFor({timeout: 15000});
    await onPage(page, 0);
    const first = await info(page);
    assert.ok(first.steps >= 3, `the driving base has ${first.steps} steps`);
    const counter = page.getByTestId('bw-sim-instructions-counter');
    assert.equal(await counter.textContent(), `1 / ${first.steps}`);
    assert.equal(first.stats.built, 0, 'nothing is built before step 1');
    assert.equal(first.stats.fresh, first.plan[0], 'step 1 draws its new parts');
    const canvas = page.getByTestId('bw-sim-instructions-canvas');
    const orange1 = await orangePixels(page, canvas);
    assert.ok(orange1 > 300, `step 1's new parts are drawn in the highlight orange (${orange1} px)`);
    const callout = async () => page.getByTestId('bw-sim-instructions-callout').getByTestId('bw-sim-instructions-part').evaluateAll(els =>
        els.map(el => ({count: Number(el.dataset.count), picture: Boolean(el.querySelector('img') && el.querySelector('img').naturalWidth > 0)})));
    const c1 = await callout();
    assert.equal(c1.reduce((n, r) => n + r.count, 0), first.plan[0], `the callout counts step 1's new parts: ${JSON.stringify(c1)}`);
    assert.ok(c1.every(r => r.picture), 'every part in the callout has its picture');
    await dialog.screenshot({path: resolve(shotsDir, 'sim-lab-instructions-step1.png')});
    console.log(`PASS Instructions opens on step 1 of ${first.steps}: ${first.stats.fresh} new parts, ${orange1} orange px, callout of ${c1.length} kinds`);

    // ---- 2. Next, →, ← ------------------------------------------------------------------
    await page.getByTestId('bw-sim-instructions-next').click();
    await onPage(page, 1);
    assert.equal(await counter.textContent(), `2 / ${first.steps}`);
    const second = await info(page);
    assert.equal(second.stats.built, first.plan[0], 'step 2 shows what step 1 built');
    assert.equal(second.stats.fresh, first.plan[1]);
    const orange2 = await orangePixels(page, canvas);
    assert.ok(orange2 > 300, `step 2's new parts are orange (${orange2} px)`);
    const step2 = await page.evaluate(() => window.__bwSimLabInstructions.plan.steps[1]);
    assert.equal(step2.pins, true, 'step 2 puts the hub\'s pins in first');
    assert.match((await page.getByTestId('bw-sim-instructions-note').allTextContents()).join(' '), /First push these pins and axles into the model/);
    assert.equal(second.stats.moved, step2.parts.length, `every pin slides in: ${JSON.stringify(second.stats)}`);
    assert.equal(second.stats.exploded, true, 'reduced motion: pulled out with arrows, not flying');
    assert.notDeepEqual(second.stats.camera, first.stats.camera, 'the camera frames the new parts of each step');
    await dialog.screenshot({path: resolve(shotsDir, 'sim-lab-instructions-step2.png')});
    await page.keyboard.press('ArrowRight');
    await onPage(page, 2);
    assert.equal(await counter.textContent(), `3 / ${first.steps}`);
    const third = await info(page);
    assert.equal(third.stats.built, first.plan[0] + first.plan[1]);
    assert.ok(await orangePixels(page, canvas) > 300, 'step 3\'s new parts are orange');
    await dialog.screenshot({path: resolve(shotsDir, 'sim-lab-instructions-step3.png')});
    await page.keyboard.press('ArrowLeft');
    await onPage(page, 1);
    assert.equal(await counter.textContent(), `2 / ${first.steps}`);
    console.log(`PASS Next and → turn to steps 2 and 3, ← back to 2: the counter and the drawn step follow (${orange2} orange px on step 2); ` +
        `step 2 puts the hub's ${step2.parts.length} pins in first, each pulled out with its arrow home`);

    // ---- 3. the parts list ---------------------------------------------------------------
    for (let n = 2; n <= first.steps; n++) {
        await page.keyboard.press('ArrowRight');
        await onPage(page, n);
    }
    const bom = page.getByTestId('bw-sim-instructions-bom');
    await bom.waitFor({timeout: 5000});
    const rows = await bom.getByTestId('bw-sim-instructions-part').evaluateAll(els => els.map(el => Number(el.dataset.count)));
    assert.equal(rows.reduce((a, b) => a + b, 0), modelParts, `the parts list counts all ${modelParts} parts`);
    assert.ok(await page.getByTestId('bw-sim-instructions-length').count() > 0, 'lengths are printed (the axles\' "4")');
    await dialog.screenshot({path: resolve(shotsDir, 'sim-lab-instructions-parts-list.png')});
    assert.equal(await page.getByTestId('bw-sim-instructions-next').isDisabled(), true, 'the parts list is the last page');
    console.log(`PASS the last page is the parts list: ${rows.length} kinds, ${modelParts} parts`);

    // ---- 4. Print / Save as PDF ------------------------------------------------------------
    const popupOpened = page.waitForEvent('popup', {timeout: 30000});
    await page.getByTestId('bw-sim-instructions-print').click();
    const printed = await popupOpened;
    await printed.waitForFunction(n => document.querySelectorAll('img.shot[data-step]').length === n &&
        document.querySelector('[data-bom]'), first.steps, {timeout: 30000});
    const shots = await printed.evaluate(async () => {
        const imgs = [...document.querySelectorAll('img.shot[data-step]')];
        await Promise.all(imgs.map(i => i.decode()));
        return imgs.map(i => ({step: Number(i.dataset.step), w: i.naturalWidth, h: i.naturalHeight}));
    });
    assert.deepEqual(shots.map(s => s.step), Array.from({length: first.steps}, (_, i) => i + 1), 'one picture per step, in order');
    assert.ok(shots.every(s => s.w === 1200 && s.h === 800), `every step picture is drawn: ${JSON.stringify(shots)}`);
    await page.waitForFunction(() => window.__bwSimLabInstructions.printing === false, null, {timeout: 30000});
    // Long manuals can exceed Chromium's full-page capture limits; decoded step images above
    // remain the acceptance check even when the evidence picture shows only the viewport.
    await printed.screenshot({path: resolve(shotsDir, 'sim-lab-instructions-print.png'), fullPage: printFullPage});
    await printed.close();
    console.log(`PASS Print / Save as PDF opens a page with one picture per step (${shots.length}) and the parts list`);

    // ---- 5. Esc closes -------------------------------------------------------------------
    await dialog.focus();
    await page.keyboard.press('Escape');
    await dialog.waitFor({state: 'detached', timeout: 5000});
    assert.equal(await page.evaluate(() => window.__bwSimLabInstructions === undefined), true);
    console.log('PASS Esc closes the instructions');
};
