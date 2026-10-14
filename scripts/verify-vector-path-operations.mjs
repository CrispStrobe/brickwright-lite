#!/usr/bin/env node
import assert from 'node:assert/strict';
import {mkdtempSync} from 'node:fs';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {chromium} from 'playwright';

// Poll the same accessible locator used for the subsequent assertion.
const enabled = async (locator, label, timeout = 15000) => {
    const deadline = Date.now() + timeout;
    for (;;) {
        const cls = (await locator.getAttribute('class')) || '';
        if (!/mod-disabled/.test(cls)) return;
        if (Date.now() > deadline) throw new Error(`${label} stayed disabled (class: ${cls})`);
        await new Promise(resolve => setTimeout(resolve, 100));
    }
};

const browser = await chromium.launch(process.env.BW_BROWSER ?
    {executablePath: process.env.BW_BROWSER} : {});
const url = process.env.PROOF_URL || 'http://127.0.0.1:8620/';
const saved = path.join(mkdtempSync(path.join(tmpdir(), 'bw-vector-path-')), 'path.sb3');

const lastPath = page => page.evaluate(() => {
    const costume = window.__brickwrightStore.getState().scratchGui.vm.editingTarget.getCostumes()[0];
    const svg = new TextDecoder().decode(costume.asset.data);
    const paths = [...new DOMParser().parseFromString(svg, 'image/svg+xml').querySelectorAll('path')];
    return paths.at(-1)?.getAttribute('d');
});
const pathCount = page => page.evaluate(() => {
    const costume = window.__brickwrightStore.getState().scratchGui.vm.editingTarget.getCostumes()[0];
    const svg = new TextDecoder().decode(costume.asset.data);
    return new DOMParser().parseFromString(svg, 'image/svg+xml').querySelectorAll('path').length;
});

try {
    const page = await browser.newPage({viewport: {width: 1194, height: 834}, acceptDownloads: true});
    await page.addInitScript(() => localStorage.setItem('bw-starter-v1-complete', '1'));
    await page.goto(url, {waitUntil: 'domcontentloaded'});
    await page.locator('[role="tab"]', {hasText: /Costume|Kost/}).first().click();
    const canvas = page.locator('canvas[resize="true"]:visible');
    await canvas.waitFor();
    const box = await canvas.boundingBox();
    const from = {x: box.x + box.width * .16, y: box.y + box.height * .15};
    const to = {x: box.x + box.width * .26, y: box.y + box.height * .28};

    await page.locator('[class*="paint-editor_mode-selector"] [role="button"][title="Rectangle"]').first().click();
    await page.mouse.move(from.x, from.y);
    await page.mouse.down();
    await page.mouse.move(to.x, to.y, {steps: 8});
    await page.mouse.up();
    assert.match(await lastPath(page), /z$/i, 'a drawn rectangle starts closed');

    await page.locator('[class*="paint-editor_mode-selector"] [role="button"][title="Reshape"]').click();
    await page.mouse.click((from.x + to.x) / 2, (from.y + to.y) / 2);
    const open = page.getByRole('button', {name: 'Open path'});
    const close = page.getByRole('button', {name: 'Close path'});
    assert.doesNotMatch(await open.getAttribute('class'), /mod-disabled/,
        'selected closed path can be opened');
    assert.match(await close.getAttribute('class'), /mod-disabled/,
        'close is disabled for a closed path');
    await open.click();
    const openD = await lastPath(page);
    assert.doesNotMatch(openD, /z$/i, 'open removes the SVG closing command');
    assert.doesNotMatch(await close.getAttribute('class'), /mod-disabled/,
        'open path can be closed again');

    await page.getByText('File', {exact: true}).click();
    const download = page.waitForEvent('download');
    await page.getByText('Save to your computer', {exact: true}).click();
    await (await download).saveAs(saved);
    await page.getByText('File', {exact: true}).click();
    await page.getByText('Load from your computer', {exact: true}).click();
    await page.locator('body > input[type="file"][accept*=".sb3"]').setInputFiles(saved);
    await page.locator('[role="tab"]', {hasText: /Costume|Kost/}).first().click();
    await canvas.waitFor();
    assert.equal(await lastPath(page), openD, 'the open SVG path survives SB3 save and reopen');

    const newBox = await canvas.boundingBox();
    await page.locator('[class*="paint-editor_mode-selector"] [role="button"][title="Reshape"]').click();
    await page.mouse.click(newBox.x + newBox.width * .21, newBox.y + newBox.height * .21);
    assert.doesNotMatch(await close.getAttribute('class'), /mod-disabled/,
        'the reopened path remains editable');
    await close.click();
    assert.match(await lastPath(page), /z$/i, 'closing again writes an SVG closing command');
    const beforeSplit = await pathCount(page);
    await page.mouse.click(newBox.x + newBox.width * .26, newBox.y + newBox.height * .15);
    const split = page.getByRole('button', {name: 'Split at node'});
    await enabled(split, 'Split at node');
    assert.doesNotMatch(await split.getAttribute('class'), /mod-disabled/,
        'one selected node enables splitting');
    await split.click();
    assert.equal(await pathCount(page), beforeSplit,
        'splitting a closed path opens it at the selected node without changing object count');
    assert.doesNotMatch(await lastPath(page), /z$/i, 'the split closed path becomes open');
    await page.mouse.click(newBox.x + newBox.width * .26, newBox.y + newBox.height * .15);
    assert.doesNotMatch(await close.getAttribute('class'), /mod-disabled/,
        'the split path can be closed again');
    await close.click();
    await page.close();

    const tablet = await browser.newPage({viewport: {width: 834, height: 1194}, hasTouch: true});
    await tablet.addInitScript(() => localStorage.setItem('bw-starter-v1-complete', '1'));
    await tablet.goto(url, {waitUntil: 'domcontentloaded'});
    await tablet.locator('[role="tab"]', {hasText: /Costume|Kost/}).first().tap();
    const tabletCanvas = tablet.locator('canvas[resize="true"]:visible');
    await tabletCanvas.waitFor();
    const tabletBox = await tabletCanvas.boundingBox();
    const a = {x: tabletBox.x + tabletBox.width * .16, y: tabletBox.y + tabletBox.height * .15};
    const b = {x: tabletBox.x + tabletBox.width * .26, y: tabletBox.y + tabletBox.height * .28};
    await tablet.locator('[class*="paint-editor_mode-selector"] [role="button"][title="Rectangle"]').first().tap();
    await tablet.mouse.move(a.x, a.y);
    await tablet.mouse.down();
    await tablet.mouse.move(b.x, b.y, {steps: 8});
    await tablet.mouse.up();
    await tablet.locator('[class*="paint-editor_mode-selector"] [role="button"][title="Reshape"]').tap();
    await tablet.mouse.click((a.x + b.x) / 2, (a.y + b.y) / 2);
    const tabletOpen = tablet.getByRole('button', {name: 'Open path'});
    await tabletOpen.scrollIntoViewIfNeeded();
    const target = await tabletOpen.boundingBox();
    assert.ok(target.width >= 44 && target.height >= 44, 'path controls need iPad-sized touch targets');
    await tabletOpen.tap();
    assert.doesNotMatch(await lastPath(tablet), /z$/i, 'touch opens a vector path');
    await tablet.close();
    console.log('PASS: vector path open/close and node split remain editable across SB3 save/reopen');
    console.log('PASS: vector path control is touch-sized and works at iPad width');
} finally {
    await browser.close();
}
