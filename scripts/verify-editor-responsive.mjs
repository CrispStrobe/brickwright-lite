#!/usr/bin/env node
// SPDX-License-Identifier: BSD-3-Clause
// Copyright (c) 2026 Brickwright contributors
import assert from 'node:assert/strict';
import {mkdir, writeFile} from 'node:fs/promises';
import {chromium, firefox} from 'playwright';
import {privateSpikeEvidenceDirectory} from './lib/private-spike-evidence.mjs';

const browserName = process.env.BW_BROWSER || 'chromium';
assert.ok(['chromium', 'firefox'].includes(browserName));
const mutation = process.env.BW_EDITOR_MUTATION || '';
assert.ok(['', 'rigid-column'].includes(mutation));
const evidence = `${privateSpikeEvidenceDirectory()}/editor-responsive-${browserName}${mutation ? `-${mutation}` : ''}`;
await mkdir(evidence, {recursive: true});
const browser = await (browserName === 'firefox' ? firefox : chromium).launch({headless: true,
    ...(browserName === 'chromium' ? {args: ['--disable-dev-shm-usage', '--enable-unsafe-swiftshader']} : {})});
const page = await browser.newPage({viewport: {width: 1400, height: 1000}, serviceWorkers: 'block'});
const errors = [], checks = [];
page.on('pageerror', error => errors.push(error.message));
page.on('dialog', dialog => dialog.accept());
const check = (name, detail = null) => { checks.push({name, detail}); console.log(`PASS ${name}`); };
try {
    await page.addInitScript(() => {
        localStorage.clear(); sessionStorage.clear();
        localStorage.setItem('bw-starter-v1-complete', '1');
        localStorage.setItem('bw-right-pane-hidden', '0');
    });
    await page.goto(process.env.PROOF_URL || 'http://127.0.0.1:8617/', {waitUntil: 'domcontentloaded'});
    await page.getByRole('tab', {name: /Costumes|Backdrops/, exact: true}).click();
    const targets = page.getByTestId('bw-image-target');
    await targets.waitFor({timeout: 60000});
    const choices = await targets.locator('option').evaluateAll(options =>
        options.map(option => ({id: option.value, name: option.textContent})));
    const backdrop = choices.find(option => option.name === 'Backdrops');
    const sprite = choices.find(option => option.id !== backdrop?.id);
    assert.ok(sprite && backdrop, 'both sprite costumes and stage backdrops must be available');
    await targets.selectOption(backdrop.id);
    await page.getByRole('tab', {name: 'Backdrops', exact: true}).waitFor();
    await targets.selectOption(sprite.id);
    await page.getByRole('tab', {name: 'Costumes', exact: true}).waitFor();
    check('image editor manually switches between sprite costumes and stage backdrops');

    await page.getByRole('tab', {name: 'Code', exact: true}).click();
    await page.getByTestId('bw-device-select').waitFor();
    await page.evaluate(() => window.dispatchEvent(new CustomEvent('bw-load-pseudocode', {detail: {
        code: 'DEVICE SPIKE\nWHEN flag clicked:\n  set motor speed A 30\n  start motor A forward\n',
        source: 'responsive-editor-proof'
    }})));
    await page.getByTestId('bw-open-spike-arena').waitFor();
    await page.getByRole('button', {name: /To blocks/}).click();
    await page.getByTestId('bw-conversion-report').waitFor({timeout: 60000});
    assert.match(await page.getByTestId('bw-code-status').innerText(), /Blocks loaded/);
    if (mutation === 'rigid-column') {
        await page.addStyleTag({content: '[data-editor-pane] {flex: 1 0 620px !important; min-width: 620px !important;}'});
    }
    const editor = page.getByTestId('bw-code-editor');
    const divider = page.getByRole('separator', {name: 'Resize the stage column'});
    for (const fraction of [0.5, 0.75]) {
        const row = await page.locator('[data-workspace-columns]').boundingBox();
        const grab = await divider.boundingBox();
        await page.mouse.move(grab.x + grab.width / 2, grab.y + grab.height / 2);
        await page.mouse.down();
        await page.mouse.move(row.x + row.width * (1 - fraction), grab.y + grab.height / 2, {steps: 12});
        await page.mouse.up();
        await page.waitForTimeout(500);
        const widths = await page.locator('[data-workspace-columns]').evaluate(element => ({
            row: element.getBoundingClientRect().width,
            right: element.querySelector('[data-right-pane]').getBoundingClientRect().width,
            left: element.querySelector('[data-editor-pane]').getBoundingClientRect().width
        }));
        assert.ok(Math.abs(widths.right / widths.row - fraction) < 0.025, JSON.stringify(widths));
        const dimensions = await editor.evaluate(element => ({width: element.clientWidth, scroll: element.scrollWidth}));
        assert.ok(dimensions.scroll <= dimensions.width + 2, JSON.stringify(dimensions));
        assert.ok(widths.left > 120, 'the main editor remains usable');
        check(`right pane reaches ${fraction * 100}% with conversion messages visible`, widths);
    }
    await page.screenshot({path: `${evidence}/right-pane-75-percent.png`});
    await page.getByTestId('bw-dismiss-code-status').click();
    assert.equal(await page.getByTestId('bw-code-status').count(), 0);
    await page.getByTestId('bw-dismiss-conversion-report').click();
    assert.equal(await page.getByTestId('bw-conversion-report').count(), 0);
    check('status and conversion report can both be dismissed');
    await page.setViewportSize({width: 900, height: 800});
    await page.waitForTimeout(300);
    const narrow = await editor.evaluate(element => ({width: element.clientWidth, scroll: element.scrollWidth,
        codeHeight: element.querySelector('.cm-editor')?.getBoundingClientRect().height}));
    assert.ok(narrow.scroll <= narrow.width + 2, JSON.stringify(narrow));
    assert.ok(narrow.codeHeight > 120, JSON.stringify(narrow));
    await page.getByRole('tab', {name: 'Code', exact: true}).click();
    check('narrow main editor keeps its tabs and code usable', narrow);
    await page.setViewportSize({width: 1400, height: 1000});

    await page.evaluate(() => window.dispatchEvent(new CustomEvent('bw-open-lessons')));
    const library = page.getByTestId('bw-lessons-library');
    await library.waitFor();
    const handle = page.getByTestId('bw-lessons-drag-handle');
    const before = await library.boundingBox();
    const header = await handle.boundingBox();
    await page.mouse.move(header.x + 75, header.y + 20);
    await page.mouse.down();
    await page.mouse.move(header.x + 575, header.y + 20, {steps: 12});
    await page.mouse.up();
    const after = await library.boundingBox();
    assert.ok(after.x - before.x > 400, 'lessons move away from the left editor');
    await page.getByTestId('bw-lessons-collapse').click();
    await page.getByTestId('bw-lessons-collapsed').waitFor();
    assert.ok((await page.getByTestId('bw-lessons-collapsed').boundingBox()).height < 90);
    await page.getByTestId('bw-lessons-collapse').click();
    await library.waitFor();
    assert.ok(Math.abs((await library.boundingBox()).x - after.x) < 2);
    check('lessons move, collapse and expand without returning to the left edge');
    await handle.focus();
    await page.keyboard.press('ArrowRight');
    assert.ok((await library.boundingBox()).x > after.x);
    await page.getByRole('button', {name: 'Close lessons', exact: true}).click();
    await page.evaluate(() => window.dispatchEvent(new CustomEvent('bw-open-lessons')));
    await library.waitFor();
    assert.ok((await library.boundingBox()).x >= after.x, 'lesson position survives close and reopen');
    check('lesson position supports keyboard movement and survives reopening');
    await page.getByRole('button', {name: 'Close lessons', exact: true}).click();
    assert.equal(await page.getByTestId('bw-global-undo').locator('svg').count(), 1);
    assert.deepEqual(errors, [], 'no uncaught browser exceptions');
} catch (error) {
    process.exitCode = 1;
    console.error(error);
    await page.screenshot({path: `${evidence}/failure.png`}).catch(() => {});
    checks.push({failure: error.stack});
} finally {
    await writeFile(`${evidence}/result.json`, JSON.stringify({browserName, mutation, checks, errors, success: !process.exitCode}, null, 2));
    await browser.close();
}
