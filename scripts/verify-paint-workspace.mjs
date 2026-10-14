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
        // ESCAPE-TO-EXIT IS THIS COMMIT'S FEATURE, so this is where it is proved.
        // It was asserted earlier in the series, against code that did not yet
        // have it, and timed out for 30 s waiting on a width that never returned.
        await focus.tap();
        await page.waitForFunction(width => Math.abs(document.querySelector('[data-testid="bw-paint-workspace"]')
            .getBoundingClientRect().width - width) < 1, viewport.width);
        await page.keyboard.press('Escape');
        // Both transitions get a condition. Escape STARTS a layout change; an
        // assertion straight after the keypress read the still-focused width.
        await page.waitForFunction(width => Math.abs(document.querySelector('[data-testid="bw-paint-workspace"]')
            .getBoundingClientRect().width - width) < 1, bounds.width);
        assert.equal((await editor.boundingBox()).width, bounds.width,
            'Escape must return from canvas focus');

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
        const sampler = page.getByTestId('bw-bitmap-sample-color');
        const samplerTarget = await sampler.boundingBox();
        assert.ok(samplerTarget.width >= 44 && samplerTarget.height >= 44,
            'the color sampler has an iPad-sized touch target');
        await sampler.tap();
        assert.equal(await sampler.getAttribute('aria-pressed'), 'true', 'touch starts color sampling');
        await sampler.tap();
        assert.equal(await sampler.getAttribute('aria-pressed'), 'false', 'touch can cancel color sampling');
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
        const preset = page.getByTestId('bw-bitmap-brush-preset');
        const presetBox = await preset.boundingBox();
        assert.ok(presetBox.width >= 44 && presetBox.height >= 44 &&
            presetBox.x >= 0 && presetBox.x + presetBox.width <= viewport.width,
        'bitmap brush presets have a visible touch-sized control');
        await preset.selectOption('light');
        assert.deepEqual(await page.evaluate(() => {
            const state = window.__brickwrightStore.getState().scratchPaint;
            return [state.bitBrushSize, state.bitBrushOpacity];
        }), [24, 35], 'the light preset sets both brush size and opacity');
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
    const navigationCanvas = paint.locator('canvas[resize="true"]:visible');
    const matrix = () => paint.evaluate(() => {
        const view = window.__brickwrightStore.getState().scratchPaint.viewBounds;
        return {tx: view.tx, ty: view.ty};
    });
    const panAndCheck = async (format, dx, dy) => {
        await paint.getByAltText('Zoom In').click();
        const before = await matrix();
        const asset = await paint.evaluate(() => window.__brickwrightStore.getState().scratchGui.vm
            .editingTarget.getCostumes()[0].asset.encodeDataURI());
        const box = await navigationCanvas.boundingBox();
        const start = {x: box.x + box.width * .45, y: box.y + box.height * .45};
        await paint.mouse.move(start.x, start.y);
        await paint.evaluate(() => document.activeElement.blur());
        await paint.keyboard.down('Space');
        assert.equal(await navigationCanvas.evaluate(canvas => getComputedStyle(canvas).cursor), 'grab',
            'Space over the costume canvas offers the pan cursor');
        await paint.mouse.down();
        await paint.mouse.move(start.x + dx, start.y + dy, {steps: 8});
        await paint.mouse.up();
        await paint.keyboard.up('Space');
        const after = await matrix();
        assert.ok(Math.abs(after.tx - before.tx) > 5 || Math.abs(after.ty - before.ty) > 5,
            `Space-drag pans the ${format} costume`);
        assert.equal(await paint.evaluate(() => window.__brickwrightStore.getState().scratchGui.vm
            .editingTarget.getCostumes()[0].asset.encodeDataURI()), asset,
        `panning with the ${format} tool does not edit the costume`);
        if (format === 'bitmap brush') {
            await paint.getByTestId('bw-bitmap-brush-opacity').focus();
            await paint.keyboard.down('Space');
            assert.notEqual(await navigationCanvas.evaluate(canvas => getComputedStyle(canvas).cursor), 'grab',
                'Space keeps its input behavior when a paint setting has focus');
            await paint.keyboard.up('Space');
        }
    };
    await paint.getByRole('button', {name: /Convert to Bitmap/}).click();
    await paint.locator('[class*="paint-editor_mode-selector"] [role="button"][title="Brush"]').click();
    await paint.getByTestId('bw-bitmap-brush-preset').selectOption('fine');
    assert.deepEqual(await paint.evaluate(() => {
        const state = window.__brickwrightStore.getState().scratchPaint;
        return [state.bitBrushSize, state.bitBrushOpacity];
    }), [2, 100]);
    await paint.getByTestId('bw-bitmap-brush-preset').selectOption('light');
    assert.equal(await paint.getByTestId('bw-bitmap-brush-preset').inputValue(), 'light');
    await paint.getByTestId('bw-bitmap-brush-opacity').fill('50');
    assert.equal(await paint.getByTestId('bw-bitmap-brush-preset').inputValue(), 'custom',
        'manual adjustment remains available after choosing a preset');
    await paint.evaluate(() => window.__brickwrightStore.dispatch({
        type: 'scratch-paint/fill-style/CHANGE_FILL_COLOR', color: '#ff0000'
    }));
    const beforeOpacity = await alphaCount(paint);
    const beforeAsset = await paint.evaluate(() => window.__brickwrightStore.getState().scratchGui.vm
        .editingTarget.getCostumes()[0].asset.encodeDataURI());
    const bitmapCanvas = await paint.locator('canvas[resize="true"]:visible').boundingBox();
    await paint.mouse.move(bitmapCanvas.x + bitmapCanvas.width * 0.38,
        bitmapCanvas.y + bitmapCanvas.height * 0.17);
    await paint.mouse.down();
    await paint.mouse.move(bitmapCanvas.x + bitmapCanvas.width * 0.48,
        bitmapCanvas.y + bitmapCanvas.height * 0.17, {steps: 20});
    await paint.mouse.up();
    await paint.waitForFunction(previous => window.__brickwrightStore.getState().scratchGui.vm
        .editingTarget.getCostumes()[0].asset.encodeDataURI() !== previous, beforeAsset);
    const strokeAlpha = await paint.evaluate(async () => {
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
        let red = 0;
        let darkest = 0;
        for (let index = 0; index < pixels.length; index += 4) {
            if (pixels[index] > 245 && pixels[index + 1] < 10 && pixels[index + 2] < 10 &&
                pixels[index + 3] > 0) {
                red++;
                darkest = Math.max(darkest, pixels[index + 3]);
            }
        }
        return {red, darkest};
    });
    assert.ok(strokeAlpha.red > 100 && strokeAlpha.darkest <= 129,
        `one 50% drag must not accumulate opacity where its own brush stamps overlap: ${JSON.stringify(strokeAlpha)}`);
    const paintedOpacity = await alphaCount(paint);
    assert.ok(paintedOpacity >= beforeOpacity + 50,
        'a single 50% bitmap brush dab must leave semitransparent PNG pixels');
    await paint.evaluate(() => window.__brickwrightStore.dispatch({
        type: 'scratch-paint/fill-style/CHANGE_FILL_COLOR', color: '#0000ff'
    }));
    const sampler = paint.getByTestId('bw-bitmap-sample-color');
    await sampler.click();
    assert.equal(await sampler.getAttribute('aria-pressed'), 'true', 'the sampler shows its active state');
    await paint.mouse.move(bitmapCanvas.x + bitmapCanvas.width * 0.38,
        bitmapCanvas.y + bitmapCanvas.height * 0.17);
    await paint.locator('[class*="color-picker-wrapper"]').waitFor();
    await paint.mouse.click(bitmapCanvas.x + bitmapCanvas.width * 0.38,
        bitmapCanvas.y + bitmapCanvas.height * 0.17);
    await paint.waitForFunction(() => window.__brickwrightStore.getState().scratchPaint.color.fillColor.primary === '#ff0000');
    assert.equal(await sampler.getAttribute('aria-pressed'), 'false', 'sampling returns to the brush');
    await paint.getByText('File', {exact: true}).click();
    const download = paint.waitForEvent('download');
    await paint.getByText('Save to your computer', {exact: true}).click();
    await (await download).saveAs(savedProject);
    await paint.getByText('File', {exact: true}).click();
    await paint.getByText('Load from your computer', {exact: true}).click();
    await paint.locator('body > input[type="file"][accept*=".sb3"]').setInputFiles(savedProject);
    await paint.locator('[role="tab"]', {hasText: /Costume|Kost/}).first().click();
    await paint.getByTestId('bw-paint-workspace').waitFor();
    assert.ok(await paint.getByTestId('bw-paint-workspace').boundingBox(),
        'the paint workspace reopens with the project');
    assert.equal(await alphaCount(paint), paintedOpacity,
        'the semitransparent brush stroke must survive SB3 save/reopen');
    await paint.locator('[class*="paint-editor_mode-selector"] [role="button"][title="Brush"]').click();
    await panAndCheck('bitmap brush', -80, -45);
    await paint.getByRole('button', {name: /Convert to Vector/}).click();
    await panAndCheck('vector', 80, 45);
    await paint.close();
    console.log('PASS: vector and bitmap workspaces fit iPad widths and canvas focus returns by touch');
    console.log('PASS: bitmap brush opacity survives SB3 save/reopen');
} finally {
    await browser.close();
}
