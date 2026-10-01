#!/usr/bin/env node
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {mkdtempSync} from 'node:fs';
import {tmpdir} from 'node:os';
import path from 'node:path';
import JSZip from 'jszip';
import {chromium} from 'playwright';

const browser = await chromium.launch(process.env.BW_BROWSER ?
    {executablePath: process.env.BW_BROWSER} : {});
const projectFile = path.join(mkdtempSync(path.join(tmpdir(), 'bw-pixel-crop-')), 'crop.sb3');
const openEditor = async page => {
    await page.locator('[role="tab"]', {hasText: /Costume|Kost/}).first().click();
    await page.getByTestId('bw-pixel-toggle').click();
    await page.getByTestId('bw-pixel-canvas').waitFor();
};
const canvasDimensions = page => page.getByTestId('bw-pixel-canvas')
    .evaluate(canvas => [canvas.width, canvas.height]);
const point = async (page, x, y, width, height) => {
    const bounds = await page.getByTestId('bw-pixel-canvas').boundingBox();
    return {x: bounds.x + (x + 0.5) * bounds.width / width,
        y: bounds.y + (y + 0.5) * bounds.height / height};
};
const drawPixel = async (page, x, y) => {
    const location = await point(page, x, y, 8, 8);
    await page.mouse.click(location.x, location.y);
};

try {
    const page = await browser.newPage({viewport: {width: 1024, height: 768}, hasTouch: true,
        acceptDownloads: true});
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.addInitScript(() => localStorage.setItem('bw-starter-v1-complete', '1'));
    await page.goto(process.env.PROOF_URL || 'http://127.0.0.1:8620/', {waitUntil: 'domcontentloaded'});
    await openEditor(page);
    await page.getByTestId('bw-pixel-more-toggle').click();
    await page.getByTestId('bw-pixel-w').fill('8');
    await page.getByTestId('bw-pixel-h').fill('8');
    await page.getByTestId('bw-pixel-more-toggle').click();
    assert.deepEqual(await canvasDimensions(page), [192, 192]);

    await page.getByTestId('bw-pixel-layers-toggle').click();
    await page.getByTestId('bw-pixel-add-layer').click();
    await page.getByTestId('bw-pixel-layers-toggle').click();
    await page.getByTestId('bw-pixel-colour-10').click();
    await drawPixel(page, 3, 3);
    await page.getByTestId('bw-pixel-frames-toggle').click();
    await page.getByTestId('bw-pixel-add-frame').click();
    await page.getByTestId('bw-pixel-frames-toggle').click();
    await page.getByTestId('bw-pixel-colour-11').click();
    await drawPixel(page, 4, 4);

    await page.getByTestId('bw-pixel-tool-select').click();
    const start = await point(page, 2, 2, 8, 8);
    const end = await point(page, 5, 5, 8, 8);
    await page.mouse.move(start.x, start.y);
    await page.mouse.down();
    await page.mouse.move(end.x, end.y, {steps: 5});
    await page.mouse.up();
    await page.getByTestId('bw-pixel-more-toggle').click();
    const cropButton = page.getByTestId('bw-pixel-crop-selection');
    const cropBounds = await cropButton.boundingBox();
    assert.ok(cropBounds.height >= 44 && cropBounds.width >= 44, 'crop stays touch-sized');
    await cropButton.tap();
    assert.deepEqual(await canvasDimensions(page), [96, 96], 'crop changes the canvas to 4×4');
    await page.getByTestId('bw-pixel-editor').getByRole('button', {name: 'Undo', exact: true}).click();
    assert.deepEqual(await canvasDimensions(page), [192, 192], 'undo restores the whole canvas');
    await page.getByTestId('bw-pixel-editor').getByRole('button', {name: 'Redo', exact: true}).click();
    assert.deepEqual(await canvasDimensions(page), [96, 96]);

    await page.getByTestId('bw-pixel-save').click();
    await page.setViewportSize({width: 1400, height: 900});
    await page.getByText('File', {exact: true}).click();
    const download = page.waitForEvent('download');
    await page.getByText('Save to your computer', {exact: true}).click();
    await (await download).saveAs(projectFile);
    const zip = await JSZip.loadAsync(await readFile(projectFile));
    const artwork = JSON.parse(await zip.file('brickwright/artwork/v1.json').async('text'));
    const record = artwork.costumes.find(item => item.document.animation);
    const document = record?.document;
    assert.ok(document, 'the SB3 keeps editable animation source');
    assert.equal(document.version, 3);
    assert.equal(document.animation.frames.length, 2);
    for (const frame of document.animation.frames) {
        for (const layer of frame.layers) {
            assert.deepEqual([layer.content.value.width, layer.content.value.height], [4, 4]);
        }
    }
    assert.equal(document.animation.frames[0].layers.at(-1).content.value.pixels[(1 * 4) + 1], 10);
    assert.equal(document.animation.frames[1].layers.at(-1).content.value.pixels[(2 * 4) + 2], 11);
    const project = JSON.parse(await zip.file('project.json').async('text'));
    assert.equal(project.targets[record.targetIndex].costumes[record.costumeIndex].md5ext,
        record.renderedMd5ext, 'Scratch references the cropped render');
    const svg = await zip.file(record.renderedMd5ext).async('text');
    assert.match(svg, /width="16" height="16"/, 'the regular SVG render has cropped dimensions');

    await page.reload({waitUntil: 'domcontentloaded'});
    await page.getByText('File', {exact: true}).click();
    await page.getByText('Load from your computer', {exact: true}).click();
    await page.locator('body > input[type="file"][accept*=".sb3"]').setInputFiles(projectFile);
    await openEditor(page);
    await page.setViewportSize({width: 1024, height: 768});
    assert.deepEqual(await canvasDimensions(page), [96, 96], 'reopened source keeps cropped dimensions');
    await page.getByTestId('bw-pixel-frames-toggle').click();
    await page.getByTestId('bw-pixel-frame-0').click();
    assert.deepEqual(await canvasDimensions(page), [96, 96], 'earlier frame keeps the same crop');
    assert.deepEqual(errors, []);
    console.log('pixel crop: layers, frames, undo/redo, SB3 source and reopen passed');
} finally {
    await browser.close();
}
