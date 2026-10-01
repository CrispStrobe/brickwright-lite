#!/usr/bin/env node
import assert from 'node:assert/strict';
import {chromium} from 'playwright';

const browser = await chromium.launch(process.env.BW_BROWSER ?
    {executablePath: process.env.BW_BROWSER} : {});

try {
    const page = await browser.newPage({viewport: {width: 834, height: 1194}, hasTouch: true});
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.addInitScript(() => localStorage.setItem('bw-starter-v1-complete', '1'));
    await page.goto(process.env.PROOF_URL || 'http://127.0.0.1:8620/', {waitUntil: 'domcontentloaded'});
    await page.locator('[role="tab"]', {hasText: /Costume|Kost/}).first().click();
    await page.getByTestId('bw-paint-workspace').waitFor();

    const fill = page.locator('[class*="color-button_color-button"]:visible').first();
    const currentColor = () => page.evaluate(() =>
        window.__brickwrightStore.getState().scratchPaint.color.fillColor.primary);
    const closePicker = () => page.getByTestId('bw-paint-workspace').click({position: {x: 500, y: 400}});
    await fill.click();
    const hue = page.locator('.Popover-body [class*="slider_container"]').first();
    await hue.click({position: {x: 30, y: 10}});
    const intermediateColor = await currentColor();
    await hue.click({position: {x: 100, y: 10}});
    const completedColor = await currentColor();
    assert.notEqual(intermediateColor, completedColor);
    await closePicker();

    await fill.click();
    const swatches = page.locator('[data-testid^="bw-recent-color-"]');
    assert.equal(await swatches.count(), 1, 'a slider drag stores only its final colour');
    const swatch = page.getByTestId('bw-recent-color-0');
    const bounds = await swatch.boundingBox();
    assert.ok(bounds.width >= 44 && bounds.height >= 44, 'recent colours have touch-sized targets');
    assert.match(await swatch.getAttribute('aria-label'), new RegExp(completedColor, 'i'));

    await hue.click({position: {x: 50, y: 10}});
    await closePicker();
    await fill.click();
    await page.getByTestId('bw-recent-color-1').tap();
    assert.equal(await currentColor(), completedColor, 'touching a previous shade restores it');
    await closePicker();
    await fill.click();
    assert.equal(await swatches.count(), 2, 'reusing a colour does not duplicate it');
    assert.match(await page.getByTestId('bw-recent-color-0').getAttribute('aria-label'),
        new RegExp(completedColor, 'i'), 'reused colour moves to the front');
    assert.deepEqual(errors, []);
    console.log('recent paint colours: final choice, touch target, reuse, and deduplication passed');
} finally {
    await browser.close();
}
