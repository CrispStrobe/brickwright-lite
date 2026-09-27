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
    await page.getByTestId('bw-pixel-save').click();
    const before = await saveProject(page);
    const pixel = before.costumes.find(record => record.document.layers[0].type === 'pixel');
    assert.ok(pixel, 'the saved SB3 must contain indexed pixel source');
    assert.ok(pixel.document.layers[0].content.value.pixels.includes(10), 'the painted colour must persist');
    await page.close();

    page = await open();
    await page.getByText('File', {exact: true}).click();
    await page.getByText('Load from your computer', {exact: true}).click();
    await page.locator('body > input[type="file"][accept*=".sb3"]').setInputFiles(file);
    await page.getByTestId('bw-pixel-canvas').waitFor();
    const after = await saveProject(page);
    const restored = after.costumes.find(record => record.document.layers[0].type === 'pixel');
    assert.deepEqual(restored.document, pixel.document);
    assert.deepEqual(errors, []);
    console.log('PASS: indexed pixels survive SB3 save/reopen; trackpad zoom and touch pinch preserve artwork');
} finally {
    await browser.close();
}
