#!/usr/bin/env node
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {mkdtempSync} from 'node:fs';
import {readFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import JSZip from 'jszip';
import {chromium} from 'playwright';

const browser = await chromium.launch(process.env.BW_BROWSER ?
    {executablePath: process.env.BW_BROWSER} : {});
const url = process.env.PROOF_URL || 'http://127.0.0.1:8620/';
const work = mkdtempSync(path.join(tmpdir(), 'bw-bitmap-layers-'));
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const editor = page => page.locator('canvas[resize="true"]:visible');
const showLayers = async page => {
    const panel = page.getByTestId('bw-bitmap-layers-panel');
    if (!await panel.isVisible().catch(() => false)) await page.getByTestId('bw-bitmap-layers-toggle').click();
    await panel.waitFor();
};
const openEditor = async page => {
    await page.addInitScript(() => localStorage.setItem('bw-starter-v1-complete', '1'));
    await page.goto(url, {waitUntil: 'domcontentloaded'});
    // Prove the editor canvas is ABSENT first, then that the tab brings it. A lone
    // waitFor() proves an appearance only, and appearance is a transition — the
    // shape test/gate-shapes calls EVENT-AS-STATE. The absence check also fails
    // loudly if a future starter leaves the editor already open, rather than
    // passing a gate that never opened anything.
    assert.equal(await editor(page).count(), 0,
        'the costume editor canvas must not exist before the Costume tab is opened');
    await page.locator('[role="tab"]', {hasText: /Costume|Kost/}).first().click();
    await editor(page).waitFor({state: 'visible'});
};
let projectTargetIndex;
let projectCostumeIndex;
let serial = 0;
const save = async page => {
    await page.getByText('File', {exact: true}).click();
    const download = page.waitForEvent('download');
    await page.getByText('Save to your computer', {exact: true}).click();
    const file = path.join(work, `layers-${++serial}.sb3`);
    await (await download).saveAs(file);
    const zip = await JSZip.loadAsync(await readFile(file));
    const project = JSON.parse(await zip.file('project.json').async('text'));
    const artwork = JSON.parse(await zip.file('brickwright/artwork/v1.json').async('text'));
    let record = artwork.costumes.find(item => item.document.layers.length > 1);
    if (record) {
        projectTargetIndex = record.targetIndex;
        projectCostumeIndex = record.costumeIndex;
    } else {
        record = artwork.costumes.find(item => item.targetIndex === projectTargetIndex &&
            item.costumeIndex === projectCostumeIndex);
    }
    assert.ok(record, 'the edited costume has an artwork document');
    const costume = project.targets[record.targetIndex].costumes[record.costumeIndex];
    const sources = await Promise.all(record.document.layers.map(async layer =>
        layer.content.kind === 'asset' ? hash(await zip.file(layer.content.value).async('nodebuffer')) :
            hash(layer.content.value)));
    return {file, document: record.document, sources,
        pngHash: hash(await zip.file(costume.md5ext).async('nodebuffer'))};
};

try {
    const page = await browser.newPage({viewport: {width: 1194, height: 834}, acceptDownloads: true});
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await openEditor(page);
    await page.getByRole('button', {name: /Convert to Bitmap/}).click();
    await showLayers(page);
    await page.getByTestId('bw-bitmap-layer-add').click();
    const initial = await save(page);
    assert.equal(initial.document.layers.length, 2, 'adding a layer stores two editable rasters');
    assert.ok(initial.document.layers.every(layer => layer.content.kind === 'asset' &&
        layer.content.value.startsWith('brickwright/layers/')),
    'both layers have their own PNG asset in the SB3');

    await page.locator('[class*="paint-editor_mode-selector"] [role="button"][title="Brush"]').click();
    const box = await editor(page).boundingBox();
    await page.mouse.click(box.x + box.width * .36, box.y + box.height * .16);
    const paintedTop = await save(page);
    assert.equal(paintedTop.sources[0], initial.sources[0],
        'painting the top layer leaves the base pixels intact');
    assert.notEqual(paintedTop.sources[1], initial.sources[1],
        'painting changes the active layer pixels');
    assert.notEqual(paintedTop.pngHash, initial.pngHash, 'the Scratch PNG includes the new layer');

    const liveAsset = () => page.evaluate(() => window.__brickwrightStore.getState().scratchGui.vm
        .editingTarget.getCostumes()[0].asset.assetId);
    const paintedAssetId = await liveAsset();
    await page.getByTestId('bw-paint-workspace').getByRole('button', {name: 'Undo'}).click();
    await page.waitForFunction(previous => window.__brickwrightStore.getState().scratchGui.vm
        .editingTarget.getCostumes()[0].asset.assetId !== previous, paintedAssetId);
    const undone = await save(page);
    assert.equal(undone.sources[1], initial.sources[1], 'undo restores the top layer pixels');
    const undoneAssetId = await liveAsset();
    await page.getByTestId('bw-paint-workspace').getByRole('button', {name: 'Redo'}).click();
    await page.waitForFunction(previous => window.__brickwrightStore.getState().scratchGui.vm
        .editingTarget.getCostumes()[0].asset.assetId !== previous, undoneAssetId);
    const redone = await save(page);
    assert.equal(redone.sources[1], paintedTop.sources[1], 'redo restores the painted top layer');

    await page.getByText('File', {exact: true}).click();
    await page.getByText('Load from your computer', {exact: true}).click();
    await page.locator('body > input[type="file"][accept*=".sb3"]').setInputFiles(paintedTop.file);
    await page.locator('[role="tab"]', {hasText: /Costume|Kost/}).first().click();
    await page.getByTestId('bw-bitmap-layers-toggle').waitFor();
    await showLayers(page);
    assert.equal(await page.locator('[data-testid^="bw-bitmap-layer-item-"]').count(), 2,
        'both editable layers reopen');
    await page.getByTestId('bw-bitmap-layer-item-base').click();
    await page.getByTestId('bw-bitmap-layer-close').click();
    const reopenedBox = await editor(page).boundingBox();
    await page.mouse.click(reopenedBox.x + reopenedBox.width * .42,
        reopenedBox.y + reopenedBox.height * .17);
    const paintedBase = await save(page);
    assert.notEqual(paintedBase.sources[0], paintedTop.sources[0],
        'painting the base changes its own pixels');
    assert.equal(paintedBase.sources[1], paintedTop.sources[1],
        'painting the base leaves the top pixels intact');

    await showLayers(page);
    await page.getByTestId(`bw-bitmap-layer-item-${paintedBase.document.layers[1].id}`).click();
    await page.getByTestId(`bw-bitmap-layer-visibility-${paintedBase.document.layers[1].id}`).click();
    const hidden = await save(page);
    assert.equal(hidden.document.layers[1].visible, false, 'visibility remains in editable source');
    assert.equal(hidden.sources[1], paintedBase.sources[1],
        'hiding does not erase layer pixels');
    assert.notEqual(hidden.pngHash, paintedBase.pngHash, 'hiding changes the flattened Scratch PNG');
    await showLayers(page);
    await page.getByTestId(`bw-bitmap-layer-visibility-${paintedBase.document.layers[1].id}`).click();
    await page.getByTestId('bw-bitmap-layer-opacity').fill('50');
    const translucent = await save(page);
    assert.equal(translucent.document.layers[1].opacity, .5, 'layer opacity remains in editable source');
    assert.notEqual(translucent.pngHash, paintedBase.pngHash, 'opacity changes the flattened Scratch PNG');
    await showLayers(page);
    await page.getByTestId('bw-bitmap-layer-down').click();
    const reordered = await save(page);
    assert.deepEqual(reordered.document.layers.map(layer => layer.name), ['Layer 2', 'Artwork'],
        'reordering changes the source layer order');
    await showLayers(page);
    await page.getByTestId('bw-bitmap-layer-delete').click();
    const deleted = await save(page);
    assert.equal(deleted.document.layers.length, 1, 'deleting a layer returns to one Scratch-compatible raster');
    assert.ok(deleted.pngHash, 'the flattened PNG remains after layer deletion');
    assert.deepEqual(errors, [], 'layer editing causes no page errors');
    await page.close();

    const tablet = await browser.newPage({viewport: {width: 834, height: 1194}, hasTouch: true});
    await openEditor(tablet);
    await tablet.getByRole('button', {name: /Convert to Bitmap/}).tap();
    const toggle = tablet.getByTestId('bw-bitmap-layers-toggle');
    await toggle.scrollIntoViewIfNeeded();
    const target = await toggle.boundingBox();
    assert.ok(target.width >= 44 && target.height >= 44, 'layer controls need iPad-sized touch targets');
    await toggle.tap();
    const add = tablet.getByTestId('bw-bitmap-layer-add');
    await add.tap();
    assert.equal(await tablet.locator('[data-testid^="bw-bitmap-layer-item-"]').count(), 2,
        'touch adds an editable bitmap layer');
    await tablet.close();
    console.log('PASS: bitmap layers retain independent pixels and flatten into a Scratch PNG');
    console.log('PASS: layers, order, visibility and opacity survive SB3; iPad touch adds a layer');
} finally {
    await browser.close();
}
