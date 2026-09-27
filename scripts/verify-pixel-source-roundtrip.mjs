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
    await page.getByRole('button', {name: 'Mirror', exact: true}).click();
    await page.getByTestId('bw-pixel-colour-11').click();
    const paintBox = await canvas.boundingBox();
    const gridHeight = Number(await page.getByTestId('bw-pixel-h').inputValue());
    const paintCellX = Math.floor((700 - paintBox.x) / paintBox.width * gridWidth);
    const paintCellY = Math.floor((650 - paintBox.y) / paintBox.height * gridHeight);
    const paintX = paintBox.x + (paintCellX + 0.5) * paintBox.width / gridWidth;
    const paintY = paintBox.y + (paintCellY + 0.5) * paintBox.height / gridHeight;
    await page.mouse.click(paintX, paintY);
    const paintedLayer = await canvas.evaluate(element => element.toDataURL());
    assert.notEqual(paintedLayer, beforeLayer, 'the new layer must paint above the base');
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
    await page.getByTestId('bw-pixel-clear-selection').click();
    await page.keyboard.press('Escape');
    assert.ok((await canvas.evaluate(element => element.toDataURL())) === beforeLayer,
        'the lasso must clear the traced area on the active layer');
    await page.getByTestId('bw-pixel-editor').getByRole('button', {name: 'Undo', exact: true}).click();
    await page.keyboard.press('Escape');
    assert.ok((await canvas.evaluate(element => element.toDataURL())) === paintedLayer,
        'Undo must restore pixels cleared with the lasso');
    const layerId = (await newLayer.getAttribute('data-testid')).replace('bw-pixel-layer-', '');
    await page.getByTestId(`bw-pixel-visibility-${layerId}`).click();
    assert.equal(await canvas.evaluate(element => element.toDataURL()), beforeLayer,
        'hiding the new layer must remove it from the Scratch rendering');
    await page.getByTestId('bw-pixel-save').click();
    const before = await saveProject(page);
    const pixel = before.costumes.find(record => record.document.layers[0].type === 'pixel');
    assert.ok(pixel, 'the saved SB3 must contain indexed pixel source');
    assert.equal(pixel.document.layers.length, 2);
    assert.equal(pixel.document.layers[1].visible, false);
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
    assert.deepEqual(errors, []);
    console.log('PASS: moved pixels and layers survive SB3 save/reopen; zoom and pinch preserve artwork');
} finally {
    await browser.close();
}
