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
    await page.getByTestId('bw-pixel-brush-size').fill('3');
    await page.mouse.click(box.x + box.width * 0.5, box.y + box.height * 0.5);
    assert.notEqual(await canvas.evaluate(element => element.toDataURL()), beforeArcadeTools);
    await page.getByTestId('bw-pixel-editor').getByRole('button', {name: 'Undo', exact: true}).click();
    assert.equal(await canvas.evaluate(element => element.toDataURL()), beforeArcadeTools);
    await page.getByTestId('bw-pixel-brush-size').fill('1');
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
    await page.getByTestId('bw-pixel-add-layer').click();
    await page.getByTestId('bw-pixel-colour-11').click();
    await page.mouse.click(box.x + box.width * 0.5, box.y + box.height * 0.5);
    const onePixel = await canvas.evaluate(element => element.toDataURL());
    await page.getByTestId('bw-pixel-colour-12').click();
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
    await page.getByTestId('bw-pixel-add-layer').click();
    const newLayer = page.locator('[data-testid^="bw-pixel-layer-pixels-"]');
    await newLayer.waitFor();
    const layerId = (await newLayer.getAttribute('data-testid')).replace('bw-pixel-layer-', '');
    await page.getByTestId(`bw-pixel-rename-${layerId}`).click();
    await page.getByTestId('bw-pixel-rename-input').fill('Highlights');
    await page.getByTestId('bw-pixel-rename-input').press('Enter');
    assert.equal(await newLayer.textContent(), 'Highlights');
    await page.getByTestId('bw-pixel-colour-11').click();
    await page.mouse.click(touchBox.x + touchBox.width * 0.85, touchBox.y + touchBox.height * 0.85);
    const paintedLayer = await canvas.evaluate(element => element.toDataURL());
    assert.notEqual(paintedLayer, beforeLayer, 'the new layer must paint above the base');
    console.log('checking layer opacity and history');
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
    await newLayer.click();
    await page.getByTestId(`bw-pixel-visibility-${layerId}`).click();
    assert.equal(await canvas.evaluate(element => element.toDataURL()), beforeLayer,
        'hiding the new layer must remove it from the Scratch rendering');
    await page.getByTestId('bw-pixel-save').click();
    const before = await saveProject(page);
    const pixel = before.costumes.find(record => record.document.layers[0].type === 'pixel');
    assert.ok(pixel, 'the saved SB3 must contain indexed pixel source');
    assert.equal(pixel.document.layers.length, 2);
    assert.equal(pixel.document.layers[1].visible, false);
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
    await page.getByTestId('bw-pixel-show-img').click();
    const exportedLiteral = await page.getByTestId('bw-pixel-img-literal').inputValue();
    assert.match(exportedLiteral, /^img`\n/);
    await page.getByRole('button', {name: 'Close', exact: true}).click();
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
    assert.deepEqual(errors, []);
    console.log('PASS: pixel layers and animation frames survive SB3 save/reopen');
} finally {
    await browser.close();
}
