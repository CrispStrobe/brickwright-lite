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
            if (process.env.BW_EDITOR_MUTATION === 'lost-image-draft') {
                await canvas.evaluate(element => {
                    const key = Object.keys(element).find(name => /^__react(?:Fiber|InternalInstance)\$/.test(name));
                    let fiber = element[key];
                    while (fiber && typeof fiber.stateNode?.hasUnsavedChanges !== 'function') fiber = fiber.return;
                    if (!fiber) throw new Error('The pixel editor instance was not found for the mutation');
                    fiber.stateNode.save = () => {};
                });
            }
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

/** Real tab/menu actions, including an app locale different from the browser's. */
export async function verifyEditorChrome (browser, url, evidence, check) {
    for (const language of ['en', 'de']) {
        const context = await browser.newContext({viewport: {width: 1024, height: 768},
            isMobile: true, hasTouch: true, locale: 'en-US', serviceWorkers: 'block'});
        const page = await context.newPage();
        const errors = [];
        page.on('pageerror', error => errors.push(error.message));
        const settle = () => page.evaluate(() => new Promise(done => requestAnimationFrame(() => requestAnimationFrame(done))));
        try {
            await page.addInitScript(() => localStorage.setItem('bw-starter-v1-complete', '1'));
            await page.goto(url, {waitUntil: 'domcontentloaded'});
            const settings = page.getByTestId('bw-settings-menu-trigger');
            if (language === 'de') {
                await settings.click();
                await page.getByText('Preferences', {exact: true}).click();
                await page.getByText('Language', {exact: true}).locator('..').locator('select').selectOption('de');
            }
            const names = language === 'de' ? ['Blöcke', 'Kostüme', 'Klänge', 'Skripte', 'Schaltung'] :
                ['Blocks', 'Costumes', 'Sounds', 'Code', 'Circuit'];
            const toggle = page.getByTestId('bw-chrome-toggle');
            for (const viewport of [{width: 1024, height: 768}, {width: 768, height: 1024}]) {
                await page.setViewportSize(viewport);
                for (const compact of [false, true]) {
                    if ((await toggle.getAttribute('aria-pressed')) !== String(compact)) await toggle.tap();
                    await settle();
                    const geometry = await page.locator('[role="tablist"]').evaluate(list => {
                        const items = [list, ...list.querySelectorAll('[role="tab"],button')];
                        return {layoutWidth: innerWidth, items: items.map(element => {
                            const r = element.getBoundingClientRect();
                            const hit = document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2);
                            return {label: element.getAttribute('aria-label') || element.textContent,
                                x: r.x, right: r.right, width: r.width, height: r.height,
                                scroll: element.scrollWidth, client: element.clientWidth,
                                hit: element === list || element.contains(hit)};
                        })};
                    });
                    for (const item of geometry.items) {
                        assert.ok(item.x >= 0 && item.right <= geometry.layoutWidth + 1, JSON.stringify(item));
                        assert.ok(item.height >= 32 && item.width >= 32, JSON.stringify(item));
                        assert.ok(item.scroll <= item.client + 2, JSON.stringify(item));
                        assert.ok(item.hit, JSON.stringify(item));
                    }
                    for (const name of names) {
                        const tab = page.getByRole('tab', {name, exact: true});
                        await tab.tap();
                        assert.equal(await tab.getAttribute('aria-selected'), 'true');
                    }
                    await page.screenshot({path: `${evidence}/chrome-${language}-${viewport.width}-${compact ? 'compact' : 'expanded'}.png`});
                    check(`chrome ${language} ${viewport.width}: ${compact ? 'collapsed' : 'expanded'} tabs and expand control fit and switch`, geometry);
                }
            }
            if ((await toggle.getAttribute('aria-pressed')) === 'true') await toggle.tap();
            await settings.click();
            await page.getByText(language === 'de' ? 'Arbeitsbereich' : 'Workspace', {exact: true}).click();
            const debuggerRow = page.getByText('Debugger', {exact: true}).locator('..');
            const debuggerSelect = debuggerRow.locator('select');
            assert.deepEqual(await debuggerSelect.locator('option').allTextContents(), language === 'de' ?
                ['Oben', 'Rechts', 'Ganzes Fenster', 'Aus'] : ['Top', 'Right', 'Full pane', 'Off']);
            await debuggerSelect.selectOption('off');
            assert.equal(await page.evaluate(() => localStorage.getItem('bw-debug-dock')), 'off');
            await settings.click();
            assert.equal(await page.getByText(language === 'de' ? 'Erste Schritte…' : 'Getting started…', {exact: true}).count(), 1);
            assert.equal(await page.getByText(language === 'de' ? 'Lektionen…' : 'Lessons…', {exact: true}).count(), 1);
            await settings.click();
            // Close Settings by clicking the same trigger's backdrop-independent tab.
            await page.getByRole('tab', {name: names[4], exact: true}).tap();
            await page.evaluate(() => {
                window.__chromeFileActions = [];
                window.addEventListener('bw-circuit-file', event => window.__chromeFileActions.push(event.detail.action));
            });
            // The caption is hidden on touch screens; click its visible icon container.
            await page.getByText(language === 'de' ? 'Datei' : 'File', {exact: true})
                .locator('xpath=ancestor::div[contains(@class, "menu-bar_menu-bar-item")][1]').click();
            await page.getByText(language === 'de' ? 'Schaltung speichern' : 'Save circuit', {exact: true}).click();
            assert.deepEqual(await page.evaluate(() => window.__chromeFileActions), ['save']);
            check(`chrome ${language}: selected app locale translates Settings and File; menu actions preserve values`);
            assert.deepEqual(errors, []);
        } catch (error) {
            await page.screenshot({path: `${evidence}/chrome-${language}-failure.png`}).catch(() => {});
            throw error;
        } finally { await context.close(); }
    }
}
