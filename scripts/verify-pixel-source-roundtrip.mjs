#!/usr/bin/env node
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {mkdtempSync} from 'node:fs';
import {tmpdir} from 'node:os';
import path from 'node:path';
import JSZip from 'jszip';
import {chromium} from 'playwright';

const url = process.env.PROOF_URL || 'http://localhost:8617/';
const file = path.join(mkdtempSync(path.join(tmpdir(), 'bw-pixels-')), 'pixel-source.sb3');
const sheetFile = path.join(path.dirname(file), 'frames-spritesheet.png');
const browser = await chromium.launch(process.env.BW_BROWSER ?
    {executablePath: process.env.BW_BROWSER} : {});
const errors = [];

const open = async () => {
    const page = await browser.newPage({viewport: {width: 1400, height: 900}, acceptDownloads: true});
    page.on('pageerror', error => errors.push(error.message));
    await page.addInitScript(() => {
        localStorage.setItem('bw-starter-v1-complete', '1');
    });
    await page.goto(url, {waitUntil: 'domcontentloaded'});
    await page.locator('[role="tab"]', {hasText: /Costume|Kost/}).first().click();
    await page.getByTestId('bw-pixel-toggle').waitFor();
    await page.getByTestId('bw-pixel-toggle').click();
    await page.getByTestId('bw-pixel-canvas').waitFor();
    await page.locator('[role="tab"]', {hasText: /Code|Skripte/}).first().click();
    await page.getByTestId('bw-pixel-canvas').waitFor({state: 'hidden'});
    await page.locator('[role="tab"]', {hasText: /Costume|Kost/}).first().click();
    await page.getByTestId('bw-pixel-toggle').click();
    await page.getByTestId('bw-pixel-canvas').waitFor();
    return page;
};

const saveProject = async page => {
    await page.getByText('File', {exact: true}).click();
    const download = page.waitForEvent('download');
    await page.getByText('Save to your computer', {exact: true}).click();
    await (await download).saveAs(file);
    const zip = await JSZip.loadAsync(await readFile(file));
    return JSON.parse(await zip.file('brickwright/artwork/v1.json').async('text'));
};

try {
    console.log('opening pixel editor');
    let page = await open();
    const showPanel = async name => {
        const toggle = page.getByTestId(`bw-pixel-${name}-toggle`);
        if (await toggle.getAttribute('aria-expanded') !== 'true') await toggle.click();
    };
    await page.getByTestId('bw-pixel-colour-10').click();
    const canvas = page.getByTestId('bw-pixel-canvas');
    const box = await canvas.boundingBox();
    assert.ok(box);
    console.log('checking Arcade drawing and transforms');
    const beforeArcadeTools = await canvas.evaluate(element => element.toDataURL());
    await page.getByTestId('bw-pixel-tool-circle').click();
    await page.mouse.move(box.x + box.width * 0.08, box.y + box.height * 0.08);
    await page.mouse.down();
    await page.mouse.move(box.x + box.width * 0.28, box.y + box.height * 0.28, {steps: 8});
    await page.mouse.up();
    assert.notEqual(await canvas.evaluate(element => element.toDataURL()), beforeArcadeTools,
        'the circle tool must draw an outline');
    await page.getByTestId('bw-pixel-editor').getByRole('button', {name: 'Undo', exact: true}).click();
    assert.equal(await canvas.evaluate(element => element.toDataURL()), beforeArcadeTools);
    await page.getByTestId('bw-pixel-tool-filledRect').click();
    await page.mouse.move(box.x + box.width * 0.06, box.y + box.height * 0.55);
    await page.mouse.down();
    await page.mouse.move(box.x + box.width * 0.2, box.y + box.height * 0.65, {steps: 5});
    await page.mouse.up();
    assert.notEqual(await canvas.evaluate(element => element.toDataURL()), beforeArcadeTools);
    await page.getByTestId('bw-pixel-editor').getByRole('button', {name: 'Undo', exact: true}).click();
    assert.equal(await canvas.evaluate(element => element.toDataURL()), beforeArcadeTools);
    await page.getByTestId('bw-pixel-tool-filledCircle').click();
    await page.mouse.move(box.x + box.width * 0.06, box.y + box.height * 0.55);
    await page.mouse.down();
    await page.mouse.move(box.x + box.width * 0.25, box.y + box.height * 0.75, {steps: 5});
    await page.mouse.up();
    assert.notEqual(await canvas.evaluate(element => element.toDataURL()), beforeArcadeTools);
    await page.getByTestId('bw-pixel-editor').getByRole('button', {name: 'Undo', exact: true}).click();
    assert.equal(await canvas.evaluate(element => element.toDataURL()), beforeArcadeTools);
    await page.getByTestId('bw-pixel-tool-pencil').click();
    await showPanel('brush');
    await page.getByTestId('bw-pixel-brush-size').fill('3');
    await page.mouse.click(box.x + box.width * 0.5, box.y + box.height * 0.5);
    assert.notEqual(await canvas.evaluate(element => element.toDataURL()), beforeArcadeTools);
    await page.getByTestId('bw-pixel-editor').getByRole('button', {name: 'Undo', exact: true}).click();
    assert.equal(await canvas.evaluate(element => element.toDataURL()), beforeArcadeTools);
    await page.getByTestId('bw-pixel-brush-size').fill('1');
    await showPanel('more');
    await page.getByTestId('bw-pixel-flip-h').click();
    assert.notEqual(await canvas.evaluate(element => element.toDataURL()), beforeArcadeTools,
        'flipping must change the editable costume');
    await page.getByTestId('bw-pixel-editor').getByRole('button', {name: 'Undo', exact: true}).click();
    assert.equal(await canvas.evaluate(element => element.toDataURL()), beforeArcadeTools);
    await page.getByTestId('bw-pixel-rotate-cw').click();
    assert.notEqual(await canvas.evaluate(element => element.toDataURL()), beforeArcadeTools,
        'rotating must change the editable costume');
    await page.getByTestId('bw-pixel-editor').getByRole('button', {name: 'Undo', exact: true}).click();
    assert.equal(await canvas.evaluate(element => element.toDataURL()), beforeArcadeTools);
    await showPanel('layers');
    await page.getByTestId('bw-pixel-add-layer').click();
    await page.getByTestId('bw-pixel-colour-11').click();
    await page.mouse.click(box.x + box.width * 0.5, box.y + box.height * 0.5);
    const onePixel = await canvas.evaluate(element => element.toDataURL());
    await page.getByTestId('bw-pixel-colour-12').click();
    await showPanel('more');
    await page.getByTestId('bw-pixel-outline').click();
    assert.notEqual(await canvas.evaluate(element => element.toDataURL()), onePixel,
        'outline must draw around opaque pixels');
    await page.getByTestId('bw-pixel-editor').getByRole('button', {name: 'Undo', exact: true}).click();
    assert.equal(await canvas.evaluate(element => element.toDataURL()), onePixel);
    await page.getByTestId('bw-pixel-replace-from').selectOption('11');
    await page.getByTestId('bw-pixel-replace-colour').click();
    assert.notEqual(await canvas.evaluate(element => element.toDataURL()), onePixel,
        'replace must change the chosen palette index');
    await page.getByTestId('bw-pixel-editor').getByRole('button', {name: 'Undo', exact: true}).click();
    assert.equal(await canvas.evaluate(element => element.toDataURL()), onePixel);
    await page.getByTestId('bw-pixel-editor').getByRole('button', {name: 'Undo', exact: true}).click();
    await page.getByTestId('bw-pixel-editor').getByRole('button', {name: 'Undo', exact: true}).click();
    assert.equal(await canvas.evaluate(element => element.toDataURL()), beforeArcadeTools);
    await page.getByTestId('bw-pixel-colour-10').click();
    await page.getByTestId('bw-pixel-tool-pencil').click();
    const beforeStroke = await canvas.evaluate(element => element.toDataURL());
    await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
    console.log('checking keyboard history');
    const afterStroke = await canvas.evaluate(element => element.toDataURL());
    assert.notEqual(afterStroke, beforeStroke, 'the selected palette colour must paint');
    await page.keyboard.press('Control+z');
    assert.equal(await canvas.evaluate(element => element.toDataURL()), beforeStroke,
        'desktop Undo must restore the previous image');
    await page.keyboard.press('Control+Shift+z');
    assert.equal(await canvas.evaluate(element => element.toDataURL()), afterStroke,
        'desktop Redo must restore the stroke');
    console.log('checking selection and movement');
    await showPanel('more');
    await showPanel('more');
    const gridWidth = Number(await page.getByTestId('bw-pixel-w').inputValue());
    const cellWidth = box.width / gridWidth;
    await page.getByTestId('bw-pixel-tool-select').click();
    await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
    await page.getByTestId('bw-pixel-tool-move').click();
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.mouse.down();
    await page.mouse.move(box.x + box.width / 2 + cellWidth, box.y + box.height / 2, {steps: 5});
    await page.mouse.up();
    await page.keyboard.press('Escape');
    assert.notEqual(await canvas.evaluate(element => element.toDataURL()), afterStroke,
        'moving a selected pixel must change the artwork');
    await page.keyboard.press('Control+z');
    await page.keyboard.press('Escape');
    assert.equal(await canvas.evaluate(element => element.toDataURL()), afterStroke,
        'Undo must restore pixels moved by the selection tool');
    await page.keyboard.press('Control+Shift+z');
    await page.keyboard.press('Escape');
    assert.notEqual(await canvas.evaluate(element => element.toDataURL()), afterStroke,
        'the moved pixels must be present when this artwork is saved');
    await page.getByTestId('bw-pixel-tool-select').click();
    await page.mouse.click(box.x + box.width / 2 + cellWidth, box.y + box.height / 2);
    const beforeClipboard = await canvas.evaluate(element => element.toDataURL());
    await showPanel('more');
    await page.getByTestId('bw-pixel-copy-selection').click();
    await page.getByTestId('bw-pixel-paste-selection').click();
    assert.equal(await canvas.evaluate(element => element.toDataURL()), beforeClipboard,
        'pasting into a new layer must leave the copied pixels in place');
    await page.keyboard.press('ArrowRight');
    assert.notEqual(await canvas.evaluate(element => element.toDataURL()), beforeClipboard,
        'arrow keys must move a pasted selection');
    await page.keyboard.press('Control+z');
    await page.keyboard.press('Control+z');
    assert.equal(await canvas.evaluate(element => element.toDataURL()), beforeClipboard,
        'Undo must remove the pasted layer without changing its source');
    await page.keyboard.press('Escape');
    await page.getByTestId('bw-pixel-tool-line').click();
    const beforeLine = await canvas.evaluate(element => element.toDataURL());
    await page.mouse.move(box.x + box.width * 0.20, box.y + box.height * 0.20);
    await page.mouse.down();
    await page.mouse.move(box.x + box.width * 0.35, box.y + box.height * 0.30, {steps: 8});
    await page.mouse.up();
    assert.notEqual(await canvas.evaluate(element => element.toDataURL()), beforeLine,
        'the line tool must draw a continuous stroke');
    await page.getByTestId('bw-pixel-tool-rect').click();
    const beforeRect = await canvas.evaluate(element => element.toDataURL());
    await page.mouse.move(box.x + box.width * 0.62, box.y + box.height * 0.18);
    await page.mouse.down();
    await page.mouse.move(box.x + box.width * 0.75, box.y + box.height * 0.30, {steps: 8});
    await page.mouse.up();
    assert.notEqual(await canvas.evaluate(element => element.toDataURL()), beforeRect,
        'the rectangle tool must draw its outline');
    await page.getByRole('button', {name: 'Mirror', exact: true}).click();
    await page.getByTestId('bw-pixel-tool-pencil').click();
    await page.mouse.click(box.x + box.width * 0.20, box.y + box.height * 0.55);
    const widthBeforeZoom = await canvas.evaluate(element => element.getBoundingClientRect().width);
    await page.keyboard.down('Control');
    await page.mouse.wheel(0, -120);
    await page.keyboard.up('Control');
    await page.waitForFunction(previous =>
        document.querySelector('[data-testid="bw-pixel-canvas"]').getBoundingClientRect().width > previous,
    widthBeforeZoom, {timeout: 10000});
    console.log('checking touch pinch');
    const touchBox = await canvas.boundingBox();
    const touchX = touchBox.x + touchBox.width / 2;
    const touchY = touchBox.y + touchBox.height / 2;
    const touchWidth = touchBox.width;
    const pixelsBeforeGesture = await canvas.evaluate(element => element.toDataURL());
    const cdp = await page.context().newCDPSession(page);
    await cdp.send('Input.dispatchTouchEvent', {type: 'touchStart', touchPoints: [
        {x: touchX - 20, y: touchY, id: 1}, {x: touchX + 20, y: touchY, id: 2}
    ]});
    await cdp.send('Input.dispatchTouchEvent', {type: 'touchMove', touchPoints: [
        {x: touchX - 55, y: touchY, id: 1}, {x: touchX + 55, y: touchY, id: 2}
    ]});
    await cdp.send('Input.dispatchTouchEvent', {type: 'touchEnd', touchPoints: []});
    await page.waitForFunction(previous =>
        document.querySelector('[data-testid="bw-pixel-canvas"]').getBoundingClientRect().width > previous,
    touchWidth, {timeout: 10000});
    console.log('checking archive round trip');
    assert.equal(await canvas.evaluate(element => element.toDataURL()), pixelsBeforeGesture,
        'pinching must not leave a painted pixel');
    await page.getByTestId('bw-pixel-tool-select').click();
    const beforeInterruptedSelection = await canvas.evaluate(element => element.toDataURL());
    await cdp.send('Input.dispatchTouchEvent', {type: 'touchStart', touchPoints: [
        {x: touchX, y: touchY, id: 3}
    ]});
    await cdp.send('Input.dispatchTouchEvent', {type: 'touchStart', touchPoints: [
        {x: touchX, y: touchY, id: 3}, {x: touchX + 30, y: touchY, id: 4}
    ]});
    await cdp.send('Input.dispatchTouchEvent', {type: 'touchEnd', touchPoints: []});
    assert.equal(await canvas.evaluate(element => element.toDataURL()), beforeInterruptedSelection,
        'a second finger must cancel a partial selection');
    await page.getByTestId('bw-pixel-tool-pencil').click();
    console.log('checking editable layers');
    const beforeLayer = await canvas.evaluate(element => element.toDataURL());
    await showPanel('layers');
    await page.getByTestId('bw-pixel-add-layer').click();
    const newLayer = page.locator('[data-testid^="bw-pixel-layer-pixels-"]');
    await newLayer.waitFor();
    const layerId = (await newLayer.getAttribute('data-testid')).replace('bw-pixel-layer-', '');
    await page.getByTestId(`bw-pixel-rename-${layerId}`).click();
    await page.getByTestId('bw-pixel-rename-input').fill('Highlights');
    await page.getByTestId('bw-pixel-rename-input').press('Enter');
    assert.equal(await newLayer.textContent(), 'Highlights');
    await page.getByRole('button', {name: 'Mirror', exact: true}).click();
    await page.getByTestId('bw-pixel-colour-11').click();
    const paintBox = await canvas.boundingBox();
    await showPanel('more');
    const gridHeight = Number(await page.getByTestId('bw-pixel-h').inputValue());
    await page.getByTestId('bw-pixel-more-toggle').click();
    const paintCellX = Math.floor((700 - paintBox.x) / paintBox.width * gridWidth);
    const paintCellY = Math.floor((650 - paintBox.y) / paintBox.height * gridHeight);
    const paintX = paintBox.x + (paintCellX + 0.5) * paintBox.width / gridWidth;
    const paintY = paintBox.y + (paintCellY + 0.5) * paintBox.height / gridHeight;
    await page.mouse.click(paintX, paintY);
    const paintedLayer = await canvas.evaluate(element => element.toDataURL());
    assert.notEqual(paintedLayer, beforeLayer, 'the new layer must paint above the base');
    console.log('checking layer opacity and history');
    await showPanel('layers');
    const opacity = page.getByTestId('bw-pixel-layer-opacity');
    await opacity.fill('50');
    assert.equal(await opacity.inputValue(), '50');
    const translucentLayer = await canvas.evaluate(element => element.toDataURL());
    assert.notEqual(translucentLayer, paintedLayer, 'layer opacity must change the editor preview');
    await page.getByTestId('bw-pixel-editor').getByRole('button', {name: 'Undo', exact: true}).click();
    assert.equal(await opacity.inputValue(), '100', 'Undo must restore the prior layer opacity');
    assert.equal(await canvas.evaluate(element => element.toDataURL()), paintedLayer);
    await page.getByTestId('bw-pixel-editor').getByRole('button', {name: 'Redo', exact: true}).click();
    assert.equal(await opacity.inputValue(), '50');
    assert.equal(await canvas.evaluate(element => element.toDataURL()), translucentLayer);
    await page.getByTestId('bw-pixel-save').click();
    const renderedSvg = await page.evaluate(() =>
        window.__brickwrightStore.getState().scratchGui.vm.editingTarget.sprite.costumes[0].asset.decodeText());
    assert.match(renderedSvg, /<g opacity="0\.5">/, 'Scratch must render the same translucent layer');
    await page.getByTestId('bw-pixel-layer-pixels').click();
    await opacity.fill('50');
    // Headless Chrome advertises the native share sheet for PNG but cannot show it.
    await page.evaluate(() => Object.defineProperty(navigator, 'canShare',
        {configurable: true, value: () => false}));
    const pngDownload = page.waitForEvent('download');
    await showPanel('more');
    await page.getByTestId('bw-pixel-export-png').click();
    const png = await pngDownload;
    assert.match(png.suggestedFilename(), /\.png$/);
    const pngBytes = await readFile(await png.path());
    assert.equal(pngBytes.subarray(0, 8).toString('hex'), '89504e470d0a1a0a');
    const pngPixels = await page.evaluate(async dataUrl => {
        const picture = new Image();
        picture.src = dataUrl;
        await picture.decode();
        const output = document.createElement('canvas');
        output.width = picture.width;
        output.height = picture.height;
        const context = output.getContext('2d');
        context.drawImage(picture, 0, 0);
        const rgba = context.getImageData(0, 0, output.width, output.height).data;
        let transparent = 0;
        let painted = 0;
        let translucent = 0;
        for (let i = 3; i < rgba.length; i += 4) {
            if (rgba[i] === 0) transparent++;
            else painted++;
            if (rgba[i] > 0 && rgba[i] < 255) translucent++;
        }
        return {width: output.width, height: output.height, transparent, painted, translucent};
    }, `data:image/png;base64,${pngBytes.toString('base64')}`);
    assert.ok(pngPixels.transparent > 0 && pngPixels.painted > 0,
        'PNG export must preserve transparent and painted pixels without the editor grid');
    assert.ok(pngPixels.translucent > 0, 'PNG export must include partially transparent layer pixels');
    await page.getByTestId('bw-pixel-editor').getByRole('button', {name: 'Undo', exact: true}).click();
    await showPanel('layers');
    await newLayer.click();
    await opacity.fill('100');

    console.log('checking wand and lasso selection');
    await page.getByTestId('bw-pixel-tool-wand').click();
    const tolerance = page.getByTestId('bw-pixel-wand-tolerance');
    assert.equal(await tolerance.inputValue(), '0');
    await tolerance.fill('120');
    assert.equal(await tolerance.inputValue(), '120');
    await tolerance.fill('0');
    await canvas.scrollIntoViewIfNeeded();
    const wandBox = await canvas.boundingBox();
    const wandX = wandBox.x + (paintCellX + 0.5) * wandBox.width / gridWidth;
    const wandY = wandBox.y + (paintCellY + 0.5) * wandBox.height / gridHeight;
    await page.mouse.click(wandX, wandY);
    await showPanel('more');
    await page.getByTestId('bw-pixel-clear-selection').click();
    await page.keyboard.press('Escape');
    assert.ok((await canvas.evaluate(element => element.toDataURL())) === beforeLayer,
        'the wand must clear the connected colour on the active layer');
    await page.getByTestId('bw-pixel-editor').getByRole('button', {name: 'Undo', exact: true}).click();
    await page.keyboard.press('Escape');
    assert.ok((await canvas.evaluate(element => element.toDataURL())) === paintedLayer,
        'Undo must restore pixels cleared with the wand');
    await page.getByTestId('bw-pixel-tool-lasso').click();
    await canvas.scrollIntoViewIfNeeded();
    const lassoBox = await canvas.boundingBox();
    const lassoCell = lassoBox.width / gridWidth;
    const lassoX = lassoBox.x + (paintCellX + 0.5) * lassoCell;
    const lassoY = lassoBox.y + (paintCellY + 0.5) * lassoBox.height / gridHeight;
    await page.mouse.move(lassoX - lassoCell, lassoY - lassoCell);
    await page.mouse.down();
    await page.mouse.move(lassoX + lassoCell, lassoY - lassoCell, {steps: 8});
    await page.mouse.move(lassoX + lassoCell, lassoY + lassoCell, {steps: 8});
    await page.mouse.move(lassoX - lassoCell, lassoY + lassoCell, {steps: 8});
    await page.mouse.up();
    await showPanel('more');
    await page.getByTestId('bw-pixel-clear-selection').click();
    await page.keyboard.press('Escape');
    assert.ok((await canvas.evaluate(element => element.toDataURL())) === beforeLayer,
        'the lasso must clear the traced area on the active layer');
    await page.getByTestId('bw-pixel-editor').getByRole('button', {name: 'Undo', exact: true}).click();
    await page.keyboard.press('Escape');
    assert.ok((await canvas.evaluate(element => element.toDataURL())) === paintedLayer,
        'Undo must restore pixels cleared with the lasso');
    await showPanel('layers');
    await opacity.fill('50');
    await page.getByTestId(`bw-pixel-visibility-${layerId}`).click();
    assert.equal(await canvas.evaluate(element => element.toDataURL()), beforeLayer,
        'hiding the new layer must remove it from the Scratch rendering');
    await page.getByTestId('bw-pixel-save').click();
    const before = await saveProject(page);
    const pixel = before.costumes.find(record => record.document.layers[0].type === 'pixel');
    assert.ok(pixel, 'the saved SB3 must contain indexed pixel source');
    assert.equal(pixel.document.layers.length, 2);
    assert.equal(pixel.document.layers[1].visible, false);
    // ONE, not 0.5, and the 0.5 was a leftover. This block runs AFTER the
    // selection tests, and those begin by putting the Highlights layer back to
    // full opacity — `newLayer.click(); opacity.fill('100')` — so the wand and
    // lasso operate on opaque pixels. The two Undos that follow are both
    // consumed by the pixel clears they assert are restored, so nothing reverts
    // that 100. Measured: the saved document reads
    // [{Pixels, o:1, v:true}, {Highlights, o:1, v:false}], which is exactly what
    // the steps above command, so the serialiser is faithful and it was the
    // expectation that had drifted from the script it lives in.
    //
    // Opacity FIDELITY is not lost from the gate by this change: it is proved
    // earlier and more directly, where the rendered SVG is required to contain
    // `<g opacity="0.5">` after the layer is set to 50. What this block is about
    // is that a HIDDEN layer keeps its pixels and its recorded opacity, whatever
    // that opacity happens to be.
    // 0.5, not 1: `opacity.fill('50')` above is the last thing to touch this
    // layer, and nothing restores it before the hide. The comment directly above
    // already says the recorded opacity is "whatever that opacity happens to
    // be" — the literal was the one part of this block that still assumed the
    // earlier flow, where the layer was returned to 100 before being hidden.
    assert.equal(pixel.document.layers[1].opacity, 0.5);
    assert.equal(pixel.document.layers[1].name, 'Highlights');
    assert.ok(pixel.document.layers[1].content.value.pixels.includes(11),
        'the hidden layer must retain its editable pixels');
    assert.ok(pixel.document.layers[0].content.value.pixels.includes(10), 'the painted colour must persist');
    const {width, height, pixels} = pixel.document.layers[0].content.value;
    const mirrorX = Math.floor(width * 0.20);
    const mirrorY = Math.floor(height * 0.55);
    assert.equal(pixels[(mirrorY * width) + mirrorX], 10);
    assert.equal(pixels[(mirrorY * width) + width - 1 - mirrorX], 10,
        'mirrored strokes must persist on both sides');
    await page.close();

    page = await open();
    await page.getByText('File', {exact: true}).click();
    await page.getByText('Load from your computer', {exact: true}).click();
    await page.locator('body > input[type="file"][accept*=".sb3"]').setInputFiles(file);
    await page.locator('[role="tab"]', {hasText: /Costume|Kost/}).first().click();
    await page.getByTestId('bw-pixel-toggle').click();
    await showPanel('layers');
    await page.getByTestId(`bw-pixel-visibility-${layerId}`).waitFor();
    const reopenedCanvas = page.getByTestId('bw-pixel-canvas');
    const reopenedBefore = await reopenedCanvas.evaluate(element => element.toDataURL());
    await page.getByTestId(`bw-pixel-visibility-${layerId}`).click();
    assert.notEqual(await reopenedCanvas.evaluate(element => element.toDataURL()), reopenedBefore,
        'revealing the restored layer must show its pixels');
    await page.getByTestId(`bw-pixel-visibility-${layerId}`).click();
    const after = await saveProject(page);
    const restored = after.costumes.find(record => record.document.layers[0].type === 'pixel');
    assert.deepEqual(restored.document, pixel.document);
    console.log('checking exact Arcade img exchange');
    await showPanel('more');
    await page.getByTestId('bw-pixel-show-img').click();
    const exportedLiteral = await page.getByTestId('bw-pixel-img-literal').inputValue();
    assert.match(exportedLiteral, /^img`\n/);
    await page.getByRole('button', {name: 'Close', exact: true}).click();
    await showPanel('more');
    await page.getByTestId('bw-pixel-import-img').click();
    await page.getByTestId('bw-pixel-img-literal').fill('img`\n1 2\n. f\n`');
    await page.getByTestId('bw-pixel-apply-img').click();
    await page.getByTestId('bw-pixel-save').click();
    const imported = (await saveProject(page)).costumes.find(record => record.document.layers[0].type === 'pixel');
    assert.equal(imported.document.layers.length, 3, 'literal import must add a layer without discarding artwork');
    const importedPixels = imported.document.layers[2].content.value.pixels;
    assert.deepEqual(importedPixels.slice(0, 2), [1, 2]);
    assert.deepEqual(importedPixels.slice(width, width + 2), [0, 15]);
    console.log('checking custom palette source and rendering');
    await page.getByTestId('bw-pixel-colour-2').click();
    await showPanel('palette');
    const paletteEditor = page.getByTestId('bw-pixel-palette-edit');
    const beforePalette = await reopenedCanvas.evaluate(element => element.toDataURL());
    await paletteEditor.fill('#123456');
    assert.notEqual(await reopenedCanvas.evaluate(element => element.toDataURL()), beforePalette,
        'changing a palette entry must recolour indexed pixels in the preview');
    await page.getByTestId('bw-pixel-editor').getByRole('button', {name: 'Undo', exact: true}).click();
    assert.equal(await paletteEditor.inputValue(), '#ff2121', 'palette edits must be undoable');
    await page.getByTestId('bw-pixel-editor').getByRole('button', {name: 'Redo', exact: true}).click();
    assert.equal(await paletteEditor.inputValue(), '#123456');
    await page.getByTestId('bw-pixel-save').click();
    const paletteSvg = await page.evaluate(() =>
        window.__brickwrightStore.getState().scratchGui.vm.editingTarget.sprite.costumes[0].asset.decodeText());
    assert.match(paletteSvg, /#123456/, 'Scratch must render the edited palette');
    const recoloured = await saveProject(page);
    assert.equal(recoloured.version, 2);
    const custom = recoloured.costumes.find(record => record.document.palette?.[2] === '#123456');
    assert.ok(custom, 'the archive must retain the custom palette with indexed source');
    await page.close();
    page = await open();
    await page.getByText('File', {exact: true}).click();
    await page.getByText('Load from your computer', {exact: true}).click();
    await page.locator('body > input[type="file"][accept*=".sb3"]').setInputFiles(file);
    await page.locator('[role="tab"]', {hasText: /Costume|Kost/}).first().click();
    await page.getByTestId('bw-pixel-toggle').click();
    await page.getByTestId('bw-pixel-colour-2').click();
    await showPanel('palette');
    assert.equal(await page.getByTestId('bw-pixel-palette-edit').inputValue(), '#123456',
        'reopened artwork must use its editable palette');
    const paletteFile = ['000000', 'ffffff', '00aa00', 'ff93c4', 'ff8135', 'fff609', '249ca3',
        '78dc52', '003fad', '87f2ff', '8e2ec4', 'a4839f', '5c406c', 'e5cdc4', '91463d', '000000'];
    await page.getByTestId('bw-pixel-palette-file').setInputFiles({name: 'arcade.hex',
        mimeType: 'text/plain', buffer: Buffer.from(paletteFile.join('\n'))});
    await page.waitForFunction(() => document.querySelector('[data-testid="bw-pixel-palette-edit"]')?.value === '#00aa00');
    assert.equal(await page.getByTestId('bw-pixel-palette-edit').inputValue(), '#00aa00',
        'a MakeCode palette file must replace colours without replacing indexed pixels');
    await page.getByTestId('bw-pixel-editor').getByRole('button', {name: 'Undo', exact: true}).click();
    assert.equal(await page.getByTestId('bw-pixel-palette-edit').inputValue(), '#123456');
    console.log('checking editable animation frames');
    const frameCanvas = page.getByTestId('bw-pixel-canvas');
    const firstFrame = await frameCanvas.evaluate(element => element.toDataURL());
    await page.getByTestId('bw-pixel-frames-toggle').click();
    await page.getByTestId('bw-pixel-add-frame').click();
    assert.equal(await page.getByTestId('bw-pixel-frames').getByRole('button', {pressed: true}).count(), 1);
    await page.getByTestId('bw-pixel-frame-duration').fill('180');
    await page.getByTestId('bw-pixel-colour-3').click();
    await page.getByTestId('bw-pixel-tool-pencil').click();
    const frameBox = await frameCanvas.boundingBox();
    await page.mouse.click(frameBox.x + frameBox.width * 0.5, frameBox.y + frameBox.height * 0.5);
    const secondFrame = await frameCanvas.evaluate(element => element.toDataURL());
    assert.notEqual(secondFrame, firstFrame);
    await page.getByTestId('bw-pixel-frame-0').click();
    assert.equal(await frameCanvas.evaluate(element => element.toDataURL()), firstFrame);
    await page.getByTestId('bw-pixel-frame-1').click();
    assert.equal(await frameCanvas.evaluate(element => element.toDataURL()), secondFrame);
    await page.getByTestId('bw-pixel-onion-skin').check();
    assert.notEqual(await frameCanvas.evaluate(element => element.toDataURL()), secondFrame);
    await page.getByTestId('bw-pixel-onion-skin').uncheck();
    await page.evaluate(() => Object.defineProperty(navigator, 'canShare',
        {configurable: true, value: () => false}));
    const sheetDownload = page.waitForEvent('download');
    await page.getByTestId('bw-pixel-export-sheet').click();
    const sheet = await sheetDownload;
    assert.match(sheet.suggestedFilename(), /-spritesheet\.png$/);
    await sheet.saveAs(sheetFile);
    const sheetBytes = await readFile(await sheet.path());
    assert.equal(sheetBytes.readUInt32BE(16), width * 4 * 2);
    assert.equal(sheetBytes.readUInt32BE(20), height * 4);
    await page.getByTestId('bw-pixel-save').click();
    const animated = await saveProject(page);
    assert.equal(animated.version, 3);
    const animatedDoc = animated.costumes.find(record => record.document.animation)?.document;
    assert.ok(animatedDoc);
    assert.equal(animatedDoc.animation.frames.length, 2);
    assert.equal(animatedDoc.animation.frames[1].durationMs, 180);
    assert.deepEqual(animatedDoc.layers, animatedDoc.animation.frames[1].layers);
    await page.close();
    page = await open();
    await page.getByText('File', {exact: true}).click();
    await page.getByText('Load from your computer', {exact: true}).click();
    await page.locator('body > input[type="file"][accept*=".sb3"]').setInputFiles(file);
    await page.locator('[role="tab"]', {hasText: /Costume|Kost/}).first().click();
    await page.getByTestId('bw-pixel-toggle').click();
    await page.getByTestId('bw-pixel-frames-toggle').click();
    assert.equal(await page.getByTestId('bw-pixel-frame-duration').inputValue(), '180');
    assert.equal(await page.getByTestId('bw-pixel-canvas').evaluate(element => element.toDataURL()), secondFrame);
    await page.getByTestId('bw-pixel-frame-0').click();
    assert.equal(await page.getByTestId('bw-pixel-canvas').evaluate(element => element.toDataURL()), firstFrame);
    await page.getByTestId('bw-pixel-sheet-file').setInputFiles(sheetFile);
    await page.getByTestId('bw-pixel-sheet-preview').waitFor();
    await page.waitForFunction(() => document.querySelectorAll('[data-testid="bw-pixel-sheet-preview"] img').length === 2);
    assert.equal(await page.getByTestId('bw-pixel-sheet-width').inputValue(), String(width * 4));
    assert.equal(await page.getByTestId('bw-pixel-sheet-height').inputValue(), String(height * 4));
    await page.getByTestId('bw-pixel-sheet-width').fill(String(width * 4 - 1));
    await page.getByTestId('bw-pixel-preview-sheet').click();
    assert.ok(await page.getByTestId('bw-pixel-sheet-preview').getByRole('alert').isVisible());
    assert.ok(await page.getByTestId('bw-pixel-apply-sheet').isDisabled());
    await page.getByTestId('bw-pixel-sheet-width').fill(String(width * 4));
    await page.getByTestId('bw-pixel-preview-sheet').click();
    await page.waitForFunction(() => document.querySelectorAll('[data-testid="bw-pixel-sheet-preview"] img').length === 2);
    await page.getByTestId('bw-pixel-apply-sheet').click();
    assert.equal(await page.getByTestId('bw-pixel-canvas').evaluate(element => element.toDataURL()), firstFrame,
        'a sheet exported by Brickwright must import its first indexed frame');
    await page.getByTestId('bw-pixel-frame-1').click();
    assert.equal(await page.getByTestId('bw-pixel-canvas').evaluate(element => element.toDataURL()), secondFrame,
        'the second imported frame must match the exported sprite sheet');
    await page.getByTestId('bw-pixel-editor').getByRole('button', {name: 'Undo', exact: true}).click();
    await page.getByTestId('bw-pixel-frame-1').click();
    assert.equal(await page.getByTestId('bw-pixel-frame-duration').inputValue(), '180',
        'Undo must restore the earlier editable frames');
    await page.getByTestId('bw-pixel-editor').getByRole('button', {name: 'Redo', exact: true}).click();
    await page.getByTestId('bw-pixel-save').click();
    const resliced = await saveProject(page);
    assert.equal(resliced.costumes.find(record => record.document.animation)?.document.animation.frames.length, 2);
    console.log('checking MakeCode Arcade palette presets');
    await page.getByTestId('bw-pixel-colour-2').click();
    await showPanel('palette');
    const presetPicker = page.getByTestId('bw-pixel-palette-preset');
    assert.equal(await presetPicker.locator('option').count(), 12,
        'the menu offers all 11 MakeCode Arcade presets plus Custom');
    await presetPicker.selectOption('Pastel');
    assert.equal(await page.getByTestId('bw-pixel-palette-edit').inputValue(), '#f98284',
        'Pastel sets the official Arcade palette entry');
    await page.getByTestId('bw-pixel-editor').getByRole('button', {name: 'Undo', exact: true}).click();
    assert.equal(await presetPicker.inputValue(), '', 'undo restores the previous custom palette');
    await page.getByTestId('bw-pixel-editor').getByRole('button', {name: 'Redo', exact: true}).click();
    assert.equal(await presetPicker.inputValue(), 'Pastel', 'redo reapplies the preset');
    await page.getByTestId('bw-pixel-save').click();
    const presetArchive = await saveProject(page);
    const presetDocument = presetArchive.costumes.find(record => record.document.animation)?.document;
    const previousDocument = resliced.costumes.find(record => record.document.animation)?.document;
    assert.equal(presetDocument.palette[2], '#f98284', 'the editable source stores the chosen palette');
    assert.deepEqual(presetDocument.animation.frames, previousDocument.animation.frames,
        'changing palettes keeps every frame’s indexed pixels intact');
    await page.close();
    page = await open();
    await page.getByText('File', {exact: true}).click();
    await page.getByText('Load from your computer', {exact: true}).click();
    await page.locator('body > input[type="file"][accept*=".sb3"]').setInputFiles(file);
    await page.locator('[role="tab"]', {hasText: /Costume|Kost/}).first().click();
    await page.getByTestId('bw-pixel-toggle').click();
    await showPanel('palette');
    assert.equal(await page.getByTestId('bw-pixel-palette-preset').inputValue(), 'Pastel',
        'the preset is recognized after SB3 save and reopen');
    console.log('checking animation frames exported as editable Scratch costumes');
    await showPanel('frames');
    await page.getByTestId('bw-pixel-export-frames').click();
    await page.waitForFunction(() => window.__brickwrightStore.getState()
        .scratchGui.vm.editingTarget.sprite.costumes.length === 4);
    const exported = await saveProject(page);
    const pixelRecords = exported.costumes.filter(record => record.targetIndex === 1 &&
        record.document.layers[0].type === 'pixel');
    assert.equal(pixelRecords.length, 3,
        'the animation and both new frame costumes must have editable source records');
    const source = exported.costumes.find(record => record.document.animation)?.document;
    assert.ok(source && source.animation.frames.length === 2,
        'exporting frames must preserve the original editable animation');
    for (const [index, record] of pixelRecords.filter(item => !item.document.animation).entries()) {
        assert.deepEqual(record.document.layers, source.animation.frames[index].layers,
            'each ordinary Scratch costume retains the corresponding editable frame layers');
        assert.deepEqual(record.document.palette, source.palette);
    }
    const zip = await JSZip.loadAsync(await readFile(file));
    const project = JSON.parse(await zip.file('project.json').async('text'));
    assert.equal(project.targets.find(target => !target.isStage).costumes.length, 4,
        'all exported frames must be ordinary Scratch costumes in project.json');
    for (const costume of project.targets.find(target => !target.isStage).costumes) {
        assert.match(await zip.file(costume.md5ext).async('text'), /^<svg /,
            'every exported frame must have a standalone renderable SVG asset');
    }
    await page.close();
    console.log('checking iPad toolbar layout and touch controls');
    for (const viewport of [{width: 834, height: 1194}, {width: 1024, height: 768}]) {
        const tablet = await browser.newPage({viewport, hasTouch: true});
        tablet.on('pageerror', error => errors.push(error.message));
        await tablet.addInitScript(() => localStorage.setItem('bw-starter-v1-complete', '1'));
        await tablet.goto(url, {waitUntil: 'domcontentloaded'});
        await tablet.locator('[role="tab"]', {hasText: /Costume|Kost/}).first().click();
        await tablet.getByTestId('bw-pixel-toggle').click();
        await tablet.getByTestId('bw-pixel-canvas').waitFor();
        const layout = await tablet.evaluate(() => {
            const box = name => document.querySelector(`[data-testid="bw-pixel-${name}"]`).getBoundingClientRect();
            const editor = box('editor');
            const toolbar = box('primary-toolbar');
            const palette = box('palette-toolbar');
            const canvas = box('canvas');
            const stage = box('viewport');
            const save = box('save');
            const paletteButton = box('palette-toggle');
            return {editor: {top: editor.top, bottom: editor.bottom},
                toolbar: {top: toolbar.top, bottom: toolbar.bottom, height: toolbar.height},
                palette: {top: palette.top, bottom: palette.bottom, height: palette.height},
                canvas: {top: canvas.top, bottom: canvas.bottom},
                stage: {top: stage.top, bottom: stage.bottom, left: stage.left, right: stage.right},
                save: {left: save.left, right: save.right},
                paletteButton: {left: paletteButton.left, right: paletteButton.right}};
        });
        assert.ok(layout.toolbar.height <= 52 && layout.palette.height <= 52,
            'drawing controls must use two compact rows');
        assert.ok(layout.save.right <= viewport.width && layout.paletteButton.right <= viewport.width,
            'Save and palette settings must remain visible at iPad widths');
        assert.ok(layout.stage.bottom - layout.stage.top >= (viewport.height === 768 ? 400 : 800),
            `the canvas workspace must retain most of the available height: ${JSON.stringify({viewport, layout})}`);
        assert.ok(layout.stage.left >= 0 && layout.stage.right <= viewport.width,
            'the workspace must fit horizontally on iPad');
        await tablet.getByTestId('bw-pixel-layers-toggle').tap();
        assert.ok(await tablet.getByTestId('bw-pixel-layers').isVisible());
        await tablet.getByTestId('bw-pixel-layers-toggle').tap();
        await tablet.getByTestId('bw-pixel-tool-hand').tap();
        assert.equal(await tablet.getByTestId('bw-pixel-tool-hand').getAttribute('aria-pressed'), 'true');
        await tablet.getByTestId('bw-pixel-palette-toggle').tap();
        assert.ok(await tablet.getByTestId('bw-pixel-palette-edit').isVisible());
        const tabletPreset = tablet.getByTestId('bw-pixel-palette-preset');
        assert.ok((await tabletPreset.boundingBox()).height >= 44,
            'palette presets have a touch-sized control');
        await tablet.getByTestId('bw-pixel-colour-2').tap();
        await tabletPreset.selectOption('Grayscale');
        assert.equal(await tablet.getByTestId('bw-pixel-palette-edit').inputValue(), '#ededed',
            'the grayscale preset works at iPad width');
        await tablet.screenshot({path: path.join(path.dirname(file), `pixel-ipad-${viewport.width}.png`)});
        await tablet.close();
    }
    assert.deepEqual(errors, []);
    console.log('PASS: pixel layers and animation frames survive SB3 save/reopen');
} finally {
    await browser.close();
}
