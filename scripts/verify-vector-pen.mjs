#!/usr/bin/env node
import assert from 'node:assert/strict';
import {mkdtempSync} from 'node:fs';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {chromium} from 'playwright';

/**
 * Wait for a mode-tools button to leave its disabled state, polling THE SAME
 * locator the assertion uses.
 *
 * Replaces a fixed 300 ms sleep. The click that selects a node and the class
 * change that enables the button are separate turns, so asserting straight after
 * the click read `mod-disabled`.
 *
 * An earlier attempt polled `document.querySelector('[title=...]')` inside the
 * page and timed out at 15 s against a button that was fine: getByRole resolves
 * an accessible name from aria-label OR title OR text, and guessing which one
 * the component renders is how a wait becomes a 15 s lie. Polling the locator
 * asks the same question the assertion does. The interval is a node-side sleep,
 * not a page-context fixed pause: this is a condition wait with a poll, not a blind
 * pause, and a genuinely disabled button still fails — by timeout, with the
 * class in the message.
 */
const enabled = async (locator, label, timeout = 15000) => {
    const deadline = Date.now() + timeout;
    for (;;) {
        const cls = (await locator.getAttribute('class')) || '';
        if (!/mod-disabled/.test(cls)) return;
        if (Date.now() > deadline) {
            throw new Error(`${label} stayed disabled for ${timeout}ms (class: ${cls})`);
        }
        await new Promise(r => setTimeout(r, 100));
    }
};

const browser = await chromium.launch(process.env.BW_BROWSER ?
    {executablePath: process.env.BW_BROWSER} : {});
const url = process.env.PROOF_URL || 'http://127.0.0.1:8620/';
const work = mkdtempSync(path.join(tmpdir(), 'bw-pen-'));
const saved = path.join(work, 'pen.sb3');
const splitSaved = path.join(work, 'split.sb3');
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
const pathCount = page => page.evaluate(() => {
    const costume = window.__brickwrightStore.getState().scratchGui.vm.editingTarget.getCostumes()[0];
    const svg = new TextDecoder().decode(costume.asset.data);
    return new DOMParser().parseFromString(svg, 'image/svg+xml').querySelectorAll('path').length;
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
    await canvas(page).boundingBox();
    assert.equal(await lastPath(page), curvedPath, 'the pen-created curve survives SB3 save/reopen');

    const reloadedPoints = points(await canvas(page).boundingBox());
    await page.locator('[class*="paint-editor_mode-selector"] [role="button"][title="Reshape"]').click();
    await page.mouse.click(reloadedPoints[0].x, reloadedPoints[0].y);
    await page.mouse.click(reloadedPoints[1].x, reloadedPoints[1].y);
    const split = page.getByRole('button', {name: 'Split at node'});
    await enabled(split, 'Split at node');
    assert.doesNotMatch(await split.getAttribute('class'), /mod-disabled/,
        'a selected interior Bézier node can be split');
    const countBeforeSplit = await pathCount(page);
    await split.click();
    assert.equal(await pathCount(page), countBeforeSplit + 1, 'split creates two editable paths');
    await page.getByText('File', {exact: true}).click();
    const splitDownload = page.waitForEvent('download');
    await page.getByText('Save to your computer', {exact: true}).click();
    await (await splitDownload).saveAs(splitSaved);
    const join = page.getByRole('button', {name: 'Join paths'});
    assert.doesNotMatch(await join.getAttribute('class'), /mod-disabled/,
        'the two new ends remain selected for touch joining');
    await join.click();
    assert.equal(await pathCount(page), countBeforeSplit, 'join reunites the two paths');
    assert.equal(await lastPath(page), curvedPath, 'split and join preserve the original Bézier geometry');
    const workspace = page.getByTestId('bw-paint-workspace');
    await workspace.getByRole('button', {name: 'Undo'}).click();
    await waitForPathCount(page, countBeforeSplit + 1);
    assert.equal(await pathCount(page), countBeforeSplit + 1, 'undo restores the two split paths');
    await workspace.getByRole('button', {name: 'Redo'}).click();
    await waitForPathCount(page, countBeforeSplit);
    const redoPath = await lastPath(page);
    const numbers = data => [...data.matchAll(/-?\d+(?:\.\d+)?/g)].map(match => Number(match[0]));
    const originalNumbers = numbers(curvedPath);
    const redoNumbers = numbers(redoPath);
    assert.equal(redoNumbers.length, originalNumbers.length, 'redo keeps the Bézier command structure');
    assert.ok(redoNumbers.every((value, index) => Math.abs(value - originalNumbers[index]) < .001),
        'redo rejoins the path without meaningful geometric drift');

    await penButton(page).click();
    const d = points(await canvas(page).boundingBox());
    await page.mouse.click(d[0].x, d[0].y);
    await page.mouse.click(d[1].x, d[1].y);
    await page.keyboard.press('Escape');
    assert.equal(await lastPath(page), redoPath, 'Escape cancels a draft without changing the asset');
    await page.mouse.click(d[0].x, d[0].y);
    await page.mouse.click(d[1].x, d[1].y);
    await page.locator('[class*="paint-editor_mode-selector"] [role="button"][title="Reshape"]').click();
    assert.notEqual(await lastPath(page), redoPath, 'switching tools commits an open path');
    assert.deepEqual(errors, [], 'the pen must not cause a page error');
    await page.close();

    const splitPage = await browser.newPage({viewport: {width: 1194, height: 834}});
    await openCostumeEditor(splitPage);
    await splitPage.getByText('File', {exact: true}).click();
    await splitPage.getByText('Load from your computer', {exact: true}).click();
    await splitPage.locator('body > input[type="file"][accept*=".sb3"]').setInputFiles(splitSaved);
    await splitPage.locator('[role="tab"]', {hasText: /Costume|Kost/}).first().click();
    await canvas(splitPage).boundingBox();
    assert.equal(await pathCount(splitPage), countBeforeSplit + 1,
        'both split Bézier paths remain editable after SB3 save and reopen');
    await splitPage.close();

    const tablet = await browser.newPage({viewport: {width: 834, height: 1194}, hasTouch: true});
    await openCostumeEditor(tablet);
    const pen = penButton(tablet);
    await pen.tap();
    const tabletBox = await canvas(tablet).boundingBox();
    const triangle = points(tabletBox);
    for (const point of triangle) await tablet.touchscreen.tap(point.x, point.y);
    await tablet.touchscreen.tap(triangle[0].x, triangle[0].y);
    assert.match(await lastPath(tablet), /z$/i, 'tapping the first node closes a path on iPad');
    const second = [[.35, .12], [.43, .12], [.45, .24]].map(([x, y]) => ({
        x: tabletBox.x + tabletBox.width * x,
        y: tabletBox.y + tabletBox.height * y
    }));
    for (const point of second) await tablet.touchscreen.tap(point.x, point.y);
    const closedPath = await lastPath(tablet);
    await tablet.locator('[class*="paint-editor_mode-selector"] [role="button"][title="Finish path"]').tap();
    assert.notEqual(await lastPath(tablet), closedPath, 'tapping the pen icon finishes an open path');
    const touchPath = await lastPath(tablet);
    await tablet.locator('[class*="paint-editor_mode-selector"] [role="button"][title="Reshape"]').tap();
    await tablet.touchscreen.tap(second[0].x, second[0].y);
    await tablet.touchscreen.tap(second[1].x, second[1].y);
    const touchSplit = tablet.getByRole('button', {name: 'Split at node'});
    await enabled(touchSplit, 'Split at node');
    const touchTarget = await touchSplit.boundingBox();
    assert.ok(touchTarget.width >= 44 && touchTarget.height >= 44,
        'split has an iPad-sized touch target');
    const touchCount = await pathCount(tablet);
    await touchSplit.tap();
    assert.equal(await pathCount(tablet), touchCount + 1, 'touch splits an open path');
    await tablet.getByRole('button', {name: 'Join paths'}).tap();
    assert.equal(await lastPath(tablet), touchPath, 'touch joins the two path ends');
    await tablet.close();
    console.log('PASS: pen creates curved SVG paths; split and join preserve Bézier geometry');
    console.log('PASS: iPad taps close, finish, split and join paths; Escape cancels drafts');
} finally {
    await browser.close();
}
