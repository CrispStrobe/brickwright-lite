// SPDX-License-Identifier: BSD-3-Clause
// Copyright (c) 2026 Brickwright contributors
import assert from 'node:assert/strict';

export async function verifyEditorTouch (browser, url, evidence, check) {
    for (const [name, viewport] of [['portrait', {width: 390, height: 844}], ['landscape', {width: 844, height: 390}]]) {
        const context = await browser.newContext({viewport, isMobile: true, hasTouch: true, serviceWorkers: 'block'});
        const page = await context.newPage();
        const errors = [];
        page.on('pageerror', error => errors.push(error.message));
        try {
            await page.addInitScript(() => localStorage.setItem('bw-starter-v1-complete', '1'));
            await page.goto(url, {waitUntil: 'domcontentloaded'});
            await page.getByRole('tab', {name: 'Code', exact: true}).tap();
            await page.getByTestId('bw-device-select').waitFor({timeout: 60000});
            await page.evaluate(() => window.dispatchEvent(new CustomEvent('bw-open-lessons')));
            await page.getByTestId('bw-lessons-library').waitFor();
            await page.getByTestId('bw-lessons-collapse').tap();
            assert.ok((await page.getByTestId('bw-lessons-collapsed').boundingBox()).height < 90);
            const handle = page.getByTestId('bw-lessons-drag-handle');
            const beforeMove = await handle.boundingBox();
            const input = await context.newCDPSession(page);
            const start = {x: beforeMove.x + 60, y: beforeMove.y + 15};
            await input.send('Input.dispatchTouchEvent', {type: 'touchStart', touchPoints: [start]});
            await input.send('Input.dispatchTouchEvent', {type: 'touchMove', touchPoints: [{x: start.x + 160, y: start.y + 160}]});
            await input.send('Input.dispatchTouchEvent', {type: 'touchEnd', touchPoints: []});
            const afterMove = await handle.boundingBox();
            assert.ok(afterMove.x - beforeMove.x > 100 && afterMove.y - beforeMove.y > 100,
                'a real touch drag moves the collapsed lesson away from the editor');
            await input.detach();
            await page.getByTestId('bw-lessons-collapse').tap();
            await page.getByRole('button', {name: 'Close lessons', exact: true}).tap();
            await page.getByRole('tab', {name: /Costumes|Backdrops/, exact: true}).tap();
            await page.getByTestId('bw-pixel-toggle').tap();
            const canvas = page.getByTestId('bw-pixel-canvas');
            await canvas.waitFor({timeout: 60000});
            await page.getByTestId('bw-pixel-more-toggle').tap();
            const targets = page.getByTestId('bw-image-target-pixel');
            const options = await targets.locator('option').evaluateAll(elements => elements.map(element =>
                ({id: element.value, name: element.textContent})));
            const backdrop = options.find(option => option.name === 'Backdrops');
            const spriteId = await targets.inputValue();
            assert.notEqual(spriteId, backdrop.id);
            await page.getByTestId('bw-pixel-colour-10').tap();
            await page.getByTestId('bw-pixel-tool-pencil').tap();
            const before = await canvas.evaluate(element => element.toDataURL());
            await canvas.tap({position: {x: 30, y: 30}});
            const drawn = await canvas.evaluate(element => element.toDataURL());
            assert.notEqual(drawn, before, 'a real touch tap draws pixels');
            // No Save click: changing the target must preserve the draft.
            await page.getByTestId('bw-pixel-more-toggle').tap();
            await targets.selectOption(backdrop.id);
            await page.getByRole('tab', {name: 'Backdrops', exact: true}).waitFor();
            assert.equal(await page.getByRole('tab', {name: 'Costumes', exact: true}).count(), 0);
            await page.getByTestId('bw-pixel-more-toggle').tap();
            await targets.selectOption(spriteId);
            await page.getByRole('tab', {name: 'Costumes', exact: true}).waitFor();
            assert.equal(await page.getByRole('tab', {name: 'Backdrops', exact: true}).count(), 0);
            await page.waitForFunction(expected => document.querySelector('[data-testid="bw-pixel-canvas"]')?.toDataURL() === expected,
                drawn, {timeout: 10000});
            assert.deepEqual(errors, []);
            await page.screenshot({path: `${evidence}/touch-${name}.png`});
            check(`touch ${name}: lesson controls, image target switching and unsaved pixel edits survive`);
        } catch (error) {
            await page.screenshot({path: `${evidence}/touch-${name}-failure.png`}).catch(() => {});
            throw error;
        } finally { await context.close(); }
    }
}
