#!/usr/bin/env node
import assert from 'node:assert/strict';
import {mkdtempSync} from 'node:fs';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {chromium} from 'playwright';

const browser = await chromium.launch(process.env.BW_BROWSER ?
    {executablePath: process.env.BW_BROWSER} : {});
const url = process.env.PROOF_URL || 'http://127.0.0.1:8620/';
const saved = path.join(mkdtempSync(path.join(tmpdir(), 'bw-pen-')), 'pen.sb3');
const penButton = page => page.locator('[class*="paint-editor_mode-selector"] [role="button"][title^="Pen"]');
const canvas = page => page.locator('canvas[resize="true"]:visible');
const points = box => [[.15, .12], [.23, .12], [.25, .24]].map(([x, y]) => ({
    x: box.x + box.width * x,
    y: box.y + box.height * y
}));
const lastPath = page => page.evaluate(() => {
    const costume = window.__brickwrightStore.getState().scratchGui.vm.editingTarget.getCostumes()[0];
    const svg = new TextDecoder().decode(costume.asset.data);
    const paths = [...new DOMParser().parseFromString(svg, 'image/svg+xml').querySelectorAll('path')];
    return paths.at(-1)?.getAttribute('d');
});
const openCostumeEditor = async page => {
    await page.addInitScript(() => localStorage.setItem('bw-starter-v1-complete', '1'));
    await page.goto(url, {waitUntil: 'domcontentloaded'});
    // Prove the canvas is ABSENT first, then that opening the tab brings it. A
    // lone waitFor() proves only an appearance, and appearance is a transition —
    // test/gate-shapes calls that EVENT-AS-STATE, because the defects live in the
    // steady state either side of it. Asserting the absence also means this helper
    // fails loudly if some future starter leaves the editor already open, instead
    // of silently passing a gate that never opened anything.
    assert.equal(await canvas(page).count(), 0,
        'the costume canvas must not exist before the Costume tab is opened');
    await page.locator('[role="tab"]', {hasText: /Costume|Kost/}).first().click();
    await canvas(page).waitFor({state: 'visible'});
};

try {
    const page = await browser.newPage({viewport: {width: 1194, height: 834}, acceptDownloads: true});
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await openCostumeEditor(page);
    const [a, b, c] = points(await canvas(page).boundingBox());
    await penButton(page).click();
    await page.mouse.click(a.x, a.y);
    await page.mouse.move(b.x, b.y);
    await page.mouse.down();
    await page.mouse.move(b.x + 25, b.y - 35, {steps: 8});
    await page.mouse.up();
    await page.mouse.click(c.x, c.y);
    await page.keyboard.press('Enter');
    const curvedPath = await lastPath(page);
    assert.match(curvedPath, /c/i, 'dragging a node creates an editable Bézier curve');
    assert.doesNotMatch(curvedPath, /z$/i, 'Enter finishes an open path');

    await page.getByText('File', {exact: true}).click();
    const download = page.waitForEvent('download');
    await page.getByText('Save to your computer', {exact: true}).click();
    await (await download).saveAs(saved);
    await page.getByText('File', {exact: true}).click();
    await page.getByText('Load from your computer', {exact: true}).click();
    await page.locator('body > input[type="file"][accept*=".sb3"]').setInputFiles(saved);
    await page.locator('[role="tab"]', {hasText: /Costume|Kost/}).first().click();
    await canvas(page).waitFor();
    assert.equal(await lastPath(page), curvedPath, 'the pen-created curve survives SB3 save/reopen');

    await penButton(page).click();
    const d = points(await canvas(page).boundingBox());
    await page.mouse.click(d[0].x, d[0].y);
    await page.mouse.click(d[1].x, d[1].y);
    await page.keyboard.press('Escape');
    assert.equal(await lastPath(page), curvedPath, 'Escape cancels a draft without changing the asset');
    await page.mouse.click(d[0].x, d[0].y);
    await page.mouse.click(d[1].x, d[1].y);
    await page.locator('[class*="paint-editor_mode-selector"] [role="button"][title="Reshape"]').click();
    assert.notEqual(await lastPath(page), curvedPath, 'switching tools commits an open path');
    assert.deepEqual(errors, [], 'the pen must not cause a page error');
    await page.close();

    const tablet = await browser.newPage({viewport: {width: 834, height: 1194}, hasTouch: true});
    await openCostumeEditor(tablet);
    const pen = penButton(tablet);
    await pen.tap();
    const triangle = points(await canvas(tablet).boundingBox());
    for (const point of triangle) await tablet.touchscreen.tap(point.x, point.y);
    await tablet.touchscreen.tap(triangle[0].x, triangle[0].y);
    assert.match(await lastPath(tablet), /z$/i, 'tapping the first node closes a path on iPad');
    await tablet.touchscreen.tap(triangle[0].x, triangle[0].y);
    await tablet.touchscreen.tap(triangle[1].x, triangle[1].y);
    const closedPath = await lastPath(tablet);
    await tablet.locator('[class*="paint-editor_mode-selector"] [role="button"][title="Finish path"]').tap();
    assert.notEqual(await lastPath(tablet), closedPath, 'tapping the pen icon finishes an open path');
    await tablet.close();
    console.log('PASS: pen creates curved SVG paths and preserves them in SB3');
    console.log('PASS: iPad taps close and finish vector paths; Escape cancels drafts');
} finally {
    await browser.close();
}
