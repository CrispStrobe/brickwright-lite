#!/usr/bin/env node
import assert from 'node:assert/strict';
import {mkdtempSync} from 'node:fs';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {chromium} from 'playwright';

const browser = await chromium.launch(process.env.BW_BROWSER ?
    {executablePath: process.env.BW_BROWSER} : {});
const url = process.env.PROOF_URL || 'http://127.0.0.1:8620/';
const saved = path.join(mkdtempSync(path.join(tmpdir(), 'bw-handles-')), 'handles.sb3');
const canvas = page => page.locator('canvas[resize="true"]:visible');
const curve = page => page.evaluate(() => {
    const costume = window.__brickwrightStore.getState().scratchGui.vm.editingTarget.getCostumes()[0];
    const svg = new TextDecoder().decode(costume.asset.data);
    return [...new DOMParser().parseFromString(svg, 'image/svg+xml').querySelectorAll('path')].at(-1)?.getAttribute('d');
});
const handleState = page => page.evaluate(() => {
    const selected = window.__brickwrightStore.getState().scratchPaint.selectedItems[0];
    const segment = selected?.segments?.find(item => item.selected && item.handleIn.length && item.handleOut.length);
    if (!segment) return null;
    const view = selected.project.view;
    const handle = view.projectToView(segment.point.add(segment.handleOut));
    return {in: [segment.handleIn.x, segment.handleIn.y], out: [segment.handleOut.x, segment.handleOut.y],
        handle: [handle.x, handle.y]};
});
const openEditor = async page => {
    await page.addInitScript(() => localStorage.setItem('bw-starter-v1-complete', '1'));
    await page.goto(url, {waitUntil: 'domcontentloaded'});
    await page.locator('[role="tab"]', {hasText: /Costume|Kost/}).first().click();
    await canvas(page).waitFor();
};

try {
    const page = await browser.newPage({viewport: {width: 1194, height: 834}, acceptDownloads: true});
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await openEditor(page);
    const box = await canvas(page).boundingBox();
    const a = {x: box.x + box.width * .15, y: box.y + box.height * .30};
    const b = {x: box.x + box.width * .23, y: box.y + box.height * .30};
    const c = {x: box.x + box.width * .25, y: box.y + box.height * .42};
    await page.locator('[class*="paint-editor_mode-selector"] [role="button"][title^="Pen"]').click();
    await page.mouse.click(a.x, a.y);
    await page.mouse.move(b.x, b.y);
    await page.mouse.down();
    await page.mouse.move(b.x + 25, b.y - 35, {steps: 8});
    await page.mouse.up();
    await page.mouse.click(c.x, c.y);
    await page.keyboard.press('Enter');
    const initialCurve = await curve(page);

    await page.locator('[class*="paint-editor_mode-selector"] [role="button"][title="Reshape"]').click();
    await page.mouse.click(b.x, b.y);
    await page.waitForTimeout(300);
    await page.mouse.click(b.x, b.y);
    const before = await handleState(page);
    assert.ok(before, 'one curved node exposes two handles');
    const toggle = page.getByRole('button', {name: /Independent handles/});
    assert.equal(await toggle.getAttribute('aria-pressed'), 'false', 'handles start in linked mode');
    await toggle.click();
    assert.equal(await toggle.getAttribute('aria-pressed'), 'true', 'independent-handle mode is visibly active');
    assert.equal(await curve(page), initialCurve, 'changing handle mode does not alter the artwork');

    await page.mouse.move(box.x + before.handle[0], box.y + before.handle[1]);
    await page.mouse.down();
    await page.mouse.move(box.x + before.handle[0] + 32, box.y + before.handle[1] + 18, {steps: 8});
    await page.mouse.up();
    const after = await handleState(page);
    assert.ok(after, 'the curved node remains selected after dragging its handle');
    assert.ok(after.in.every((value, index) => Math.abs(value - before.in[index]) < .001),
        'dragging one handle leaves the opposite handle in place');
    assert.ok(after.out.some((value, index) => Math.abs(value - before.out[index]) > 1),
        'the dragged handle moves independently');
    const editedCurve = await curve(page);
    assert.notEqual(editedCurve, initialCurve, 'the asymmetric curve is rendered into SVG');

    await page.getByText('File', {exact: true}).click();
    const download = page.waitForEvent('download');
    await page.getByText('Save to your computer', {exact: true}).click();
    await (await download).saveAs(saved);
    await page.getByText('File', {exact: true}).click();
    await page.getByText('Load from your computer', {exact: true}).click();
    await page.locator('body > input[type="file"][accept*=".sb3"]').setInputFiles(saved);
    await page.locator('[role="tab"]', {hasText: /Costume|Kost/}).first().click();
    await canvas(page).waitFor();
    assert.equal(await curve(page), editedCurve, 'the asymmetric Bézier curve survives SB3 save/reopen');
    assert.deepEqual(errors, [], 'handle editing causes no page errors');
    await page.close();

    const tablet = await browser.newPage({viewport: {width: 834, height: 1194}, hasTouch: true});
    await openEditor(tablet);
    await tablet.locator('[class*="paint-editor_mode-selector"] [role="button"][title="Reshape"]').tap();
    const touchToggle = tablet.getByRole('button', {name: /Independent handles/});
    const target = await touchToggle.boundingBox();
    assert.ok(target.width >= 44 && target.height >= 44, 'the toggle has an iPad-sized touch target');
    await touchToggle.tap();
    assert.equal(await touchToggle.getAttribute('aria-pressed'), 'true', 'touch enables independent handles');
    const tabletBox = await canvas(tablet).boundingBox();
    const ta = {x: tabletBox.x + tabletBox.width * .18, y: tabletBox.y + tabletBox.height * .30};
    const tb = {x: tabletBox.x + tabletBox.width * .30, y: tabletBox.y + tabletBox.height * .30};
    const tc = {x: tabletBox.x + tabletBox.width * .34, y: tabletBox.y + tabletBox.height * .42};
    await tablet.locator('[class*="paint-editor_mode-selector"] [role="button"][title^="Pen"]').tap();
    await tablet.mouse.click(ta.x, ta.y);
    await tablet.mouse.move(tb.x, tb.y);
    await tablet.mouse.down();
    await tablet.mouse.move(tb.x + 25, tb.y - 35, {steps: 8});
    await tablet.mouse.up();
    await tablet.mouse.click(tc.x, tc.y);
    await tablet.locator('[class*="paint-editor_mode-selector"] [role="button"][title="Finish path"]').tap();
    await tablet.locator('[class*="paint-editor_mode-selector"] [role="button"][title="Reshape"]').tap();
    await tablet.touchscreen.tap(tb.x, tb.y);
    await tablet.waitForTimeout(300);
    await tablet.touchscreen.tap(tb.x, tb.y);
    const touchBefore = await handleState(tablet);
    assert.ok(touchBefore, 'touch selects a curved node');
    const touchStart = {x: tabletBox.x + touchBefore.handle[0], y: tabletBox.y + touchBefore.handle[1]};
    const cdp = await tablet.context().newCDPSession(tablet);
    await cdp.send('Input.dispatchTouchEvent', {type: 'touchStart', touchPoints: [touchStart]});
    for (let step = 1; step <= 8; step++) {
        await cdp.send('Input.dispatchTouchEvent', {type: 'touchMove', touchPoints: [{
            x: touchStart.x + step * 4, y: touchStart.y + step * 2
        }]});
    }
    await cdp.send('Input.dispatchTouchEvent', {type: 'touchEnd', touchPoints: []});
    const touchAfter = await handleState(tablet);
    assert.ok(touchAfter.in.every((value, index) => Math.abs(value - touchBefore.in[index]) < .001),
        'finger drag leaves the opposite handle in place');
    assert.ok(touchAfter.out.some((value, index) => Math.abs(value - touchBefore.out[index]) > 1),
        'finger drag moves only the chosen handle');
    await tablet.close();
    console.log('PASS: independent handle drag preserves the opposite tangent and survives SB3');
    console.log('PASS: iPad touch can activate and drag an independent Bézier handle');
} finally {
    await browser.close();
}
