#!/usr/bin/env node
import assert from 'node:assert/strict';
import {chromium} from 'playwright';

const browser = await chromium.launch(process.env.BW_BROWSER ?
    {executablePath: process.env.BW_BROWSER} : {});
const key = 'bw-pixel-colour-slots-v1';

try {
    const page = await browser.newPage({viewport: {width: 834, height: 1194}, hasTouch: true});
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.addInitScript(() => localStorage.setItem('bw-starter-v1-complete', '1'));
    const openEditor = async () => {
        await page.locator('[role="tab"]', {hasText: /Costume|Kost/}).first().click();
        await page.getByTestId('bw-pixel-toggle').click();
        await page.getByTestId('bw-pixel-canvas').waitFor();
    };
    const saved = () => page.evaluate(storageKey => JSON.parse(localStorage.getItem(storageKey)), key);
    const primary = async index => assert.equal(
        await page.getByTestId(`bw-pixel-colour-${index}`).getAttribute('aria-checked'), 'true');
    const secondary = async index => assert.equal(
        await page.getByTestId(`bw-pixel-colour-${index}`).evaluate(button =>
            getComputedStyle(button).outlineStyle), 'dashed');

    await page.goto(process.env.PROOF_URL || 'http://127.0.0.1:8620/', {waitUntil: 'domcontentloaded'});
    await openEditor();
    assert.equal(await page.evaluate(storageKey => localStorage.getItem(storageKey), key), null,
        'opening the editor alone does not write a preference');
    await page.getByTestId('bw-pixel-colour-10').tap();
    await page.getByTestId('bw-pixel-secondary-colour').tap();
    await page.getByTestId('bw-pixel-colour-3').tap();
    assert.deepEqual(await saved(), {colour: 10, secondaryColour: 3});

    await page.reload({waitUntil: 'domcontentloaded'});
    await openEditor();
    await primary(10);
    await secondary(3);
    await page.getByTestId('bw-pixel-swap-colours').tap();
    assert.deepEqual(await saved(), {colour: 3, secondaryColour: 10}, 'swap persists both slots');

    await page.reload({waitUntil: 'domcontentloaded'});
    await openEditor();
    await primary(3);
    await secondary(10);
    await page.evaluate(storageKey => localStorage.setItem(storageKey,
        JSON.stringify({colour: 999, secondaryColour: 7})), key);
    await page.reload({waitUntil: 'domcontentloaded'});
    await openEditor();
    await primary(2);
    await secondary(7);
    assert.deepEqual(errors, []);
    console.log('pixel colour slots: touch changes, reload, swap and invalid-value fallback passed');
} finally {
    await browser.close();
}
