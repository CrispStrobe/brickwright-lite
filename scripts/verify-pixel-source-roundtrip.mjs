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
    console.log('checking editable layers');
    const beforeLayer = await canvas.evaluate(element => element.toDataURL());
    await page.getByTestId('bw-pixel-add-layer').click();
    const newLayer = page.locator('[data-testid^="bw-pixel-layer-pixels-"]');
    await newLayer.waitFor();
    await page.getByTestId('bw-pixel-colour-11').click();
    await page.mouse.click(touchBox.x + touchBox.width * 0.85, touchBox.y + touchBox.height * 0.85);
    const paintedLayer = await canvas.evaluate(element => element.toDataURL());
    assert.notEqual(paintedLayer, beforeLayer, 'the new layer must paint above the base');
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
    console.log('PASS: editable pixel layers survive SB3 save/reopen; zoom and pinch preserve artwork');
} finally {
    await browser.close();
}
