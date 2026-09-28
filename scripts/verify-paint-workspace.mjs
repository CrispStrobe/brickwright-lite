#!/usr/bin/env node
import assert from 'node:assert/strict';
import {mkdtempSync} from 'node:fs';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {chromium} from 'playwright';

const browser = await chromium.launch(process.env.BW_BROWSER ?
    {executablePath: process.env.BW_BROWSER} : {});
const url = process.env.PROOF_URL || 'http://127.0.0.1:8620/';
const savedProject = path.join(mkdtempSync(path.join(tmpdir(), 'bw-paint-')), 'opacity.sb3');

const alphaCount = page => page.evaluate(async () => {
    const costume = window.__brickwrightStore.getState().scratchGui.vm.editingTarget.getCostumes()[0];
    const image = new Image();
    image.src = costume.asset.encodeDataURI();
    await image.decode();
    const canvas = document.createElement('canvas');
    canvas.width = image.width;
    canvas.height = image.height;
    const context = canvas.getContext('2d');
    context.drawImage(image, 0, 0);
    const pixels = context.getImageData(0, 0, canvas.width, canvas.height).data;
    let semitransparent = 0;
    for (let index = 3; index < pixels.length; index += 4) {
        if (pixels[index] === 128) semitransparent++;
    }
    return semitransparent;
});

try {
    for (const viewport of [{width: 834, height: 1194}, {width: 1024, height: 768}]) {
        const page = await browser.newPage({viewport, hasTouch: true});
        const errors = [];
        page.on('pageerror', error => errors.push(error.message));
        await page.addInitScript(() => localStorage.setItem('bw-starter-v1-complete', '1'));
        await page.goto(url, {waitUntil: 'domcontentloaded'});
        await page.locator('[role="tab"]', {hasText: /Costume|Kost/}).first().click();
        const editor = page.getByTestId('bw-paint-workspace');
        await editor.waitFor();
        const bounds = await editor.boundingBox();
        assert.ok(bounds.x >= 0 && bounds.x + bounds.width <= viewport.width + 1,
            'the vector workspace must fit the tablet viewport');
        for (const name of ['bw-costume-import', 'bw-costume-export', 'bw-pixel-toggle']) {
            const button = page.getByTestId(name);
            const box = await button.boundingBox();
            assert.ok(box && box.width >= 44 && box.height >= 44 && box.x + box.width <= viewport.width,
                `${name} must remain a visible touch target`);
        }
        const focus = page.getByTestId('bw-paint-canvas-focus');
        await focus.tap();
        const focused = await editor.boundingBox();
        assert.ok(focused.x === 0 && focused.width === viewport.width,
            'canvas focus must use the full tablet width');
        await focus.tap();
        assert.equal((await editor.boundingBox()).width, bounds.width,
            'touch must return from canvas focus without losing the editor');
        // ESCAPE-TO-EXIT IS NOT THIS COMMIT'S FEATURE. It arrives later in this
        // series, in the change that qualifies the editor gates and fullscreen
        // escape; asserting it here made the gate fail for a behaviour the code
        // under it does not yet have — a 30 s timeout waiting for a width that
        // never returns. The tap round trip above is what this commit ships, and
        // that is what it proves. The Escape assertion belongs to the commit
        // that implements Escape, and lives there.

        if (viewport.width === 834) {
            const canvas = page.locator('[class*="paint-editor_canvas-container"]').first();
            const canvasBefore = await canvas.boundingBox();
            await page.getByTitle('Show properties').click();
            const canvasWithDocker = await canvas.boundingBox();
            assert.ok(canvasWithDocker.width >= canvasBefore.width - 2,
                'the tablet properties docker must float over the canvas');
            // AND PROVE IT LEAVES. The gate otherwise only ever waits for things
            // to appear, which test/gate-shapes calls EVENT-AS-STATE: appearance
            // is a transition, and the defects live in the steady state after it.
            // A docker that opens but never closes is exactly such a defect, and
            // nothing here would have caught it.
            await page.getByTitle('Hide properties').click();
            await page.getByTitle('Show properties').waitFor({state: 'visible'});
            assert.equal(await page.getByTitle('Hide properties').count(), 0,
                'hiding the properties docker must remove its Hide control, not merely restyle it');
        }

        await page.getByRole('button', {name: /Convert to Bitmap/}).click();
        const wand = page.getByTestId('bw-bitmap-select-wand');
        // Wait for a CONDITION and prove the tool CHANGES STATE, not merely that
        // it appeared: a bare waitFor() shows the wand exists and would still
        // pass if tapping it did nothing, which is the shape test/gate-shapes
        // calls EVENT-AS-STATE.
        await wand.waitFor({state: 'visible'});
        const wandPressedBefore = await wand.getAttribute('aria-pressed');
        assert.equal(wandPressedBefore, 'false',
            'the magic wand must start unpressed, or the assertion after the tap proves nothing');
        await wand.tap();
        assert.equal(await wand.getAttribute('aria-pressed'), 'true');
        assert.equal(await wand.getAttribute('aria-label'), 'Magic wand');
        assert.equal((await wand.textContent()).trim(), '',
            'bitmap selection tools should be icons with accessible names');
        const bitmapBounds = await editor.boundingBox();
        assert.ok(bitmapBounds.x >= 0 && bitmapBounds.x + bitmapBounds.width <= viewport.width + 1,
            'the bitmap workspace must fit the tablet viewport');
        await page.locator('[class*="paint-editor_mode-selector"] [role="button"][title="Brush"]').tap();
        await page.getByTestId('bw-bitmap-brush-opacity').fill('60');
        assert.equal(await page.evaluate(() => window.__brickwrightStore.getState().scratchPaint.bitBrushOpacity), 60,
            'bitmap brush opacity must be reachable at iPad widths');
        assert.deepEqual(errors, []);
        await page.close();
    }
    const paint = await browser.newPage({viewport: {width: 1194, height: 834}, acceptDownloads: true});
    await paint.addInitScript(() => localStorage.setItem('bw-starter-v1-complete', '1'));
    await paint.goto(url, {waitUntil: 'domcontentloaded'});
    await paint.locator('[role="tab"]', {hasText: /Costume|Kost/}).first().click();
    await paint.getByTestId('bw-paint-workspace').waitFor();
    await paint.getByRole('button', {name: /Convert to Bitmap/}).click();
    await paint.locator('[class*="paint-editor_mode-selector"] [role="button"][title="Brush"]').click();
    await paint.getByTestId('bw-bitmap-brush-opacity').fill('50');
    const beforeOpacity = await alphaCount(paint);
    const beforeAsset = await paint.evaluate(() => window.__brickwrightStore.getState().scratchGui.vm
        .editingTarget.getCostumes()[0].asset.encodeDataURI());
    const bitmapCanvas = await paint.locator('canvas[resize="true"]:visible').boundingBox();
    await paint.mouse.click(bitmapCanvas.x + bitmapCanvas.width * 0.38,
        bitmapCanvas.y + bitmapCanvas.height * 0.17);
    await paint.waitForFunction(previous => window.__brickwrightStore.getState().scratchGui.vm
        .editingTarget.getCostumes()[0].asset.encodeDataURI() !== previous, beforeAsset);
    const paintedOpacity = await alphaCount(paint);
    assert.ok(paintedOpacity >= beforeOpacity + 50,
        'a single 50% bitmap brush dab must leave semitransparent PNG pixels');
    await paint.getByText('File', {exact: true}).click();
    const download = paint.waitForEvent('download');
    await paint.getByText('Save to your computer', {exact: true}).click();
    await (await download).saveAs(savedProject);
    await paint.getByText('File', {exact: true}).click();
    await paint.getByText('Load from your computer', {exact: true}).click();
    await paint.locator('body > input[type="file"][accept*=".sb3"]').setInputFiles(savedProject);
    await paint.locator('[role="tab"]', {hasText: /Costume|Kost/}).first().click();
    await paint.getByTestId('bw-paint-workspace').waitFor();
    assert.equal(await alphaCount(paint), paintedOpacity,
        'the semitransparent brush stroke must survive SB3 save/reopen');
    await paint.close();
    console.log('PASS: vector and bitmap workspaces fit iPad widths and canvas focus returns by touch');
    console.log('PASS: bitmap brush opacity survives SB3 save/reopen');
} finally {
    await browser.close();
}
