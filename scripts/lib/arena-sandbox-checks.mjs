// SPDX-License-Identifier: BSD-3-Clause
// Copyright (c) 2026 Brickwright contributors
import assert from 'node:assert/strict';

export async function verifyArenaSandbox (page, check, evidence) {
    await page.getByTestId('bw-spike-arena-sandbox').click();
    await page.waitForFunction(() => window.__bwSpikeArena?.mode === 'sandbox');
    assert.equal(await page.getByTestId('bw-spike-arena-load-solution').count(), 0);
    await page.getByTestId('bw-spike-sandbox-drive-forward').click();
    await page.waitForFunction(() => window.__bwSpikeArena.snapshot.pose.x > 35);
    await page.getByTestId('bw-spike-sandbox-drive-stop').click();
    await page.waitForFunction(() => window.__bwSpikeArena._pane.hubState.data.motors[0].degPerSec === 0);
    assert.equal(await page.evaluate(() => window.__bwSpikeArena.verdict.status), 'running');
    await page.getByTestId('bw-spike-arena-reset').click();
    check('sandbox manual driving works without starting a challenge program');
    if (await page.evaluate(() => window.__bwSpikeArena.view) === '3d') await page.getByTestId('bw-spike-arena-view-toggle').click();
    const canvas = page.getByTestId('bw-spike-arena-canvas');
    await page.getByTestId('bw-spike-sandbox-tool').selectOption('paint');
    const box = await canvas.boundingBox();
    await canvas.click({position: {x: box.width * 37 / 180, y: box.height * 40 / 120}});
    await page.waitForFunction(() => window.__bwSpikeArena._pane.hubState.backend.readSensor('C', 'color').color === 3);
    await page.getByTestId('bw-spike-sandbox-tool').selectOption('wall');
    await canvas.click({position: {x: box.width * 65 / 180, y: box.height * 40 / 120}});
    await page.waitForFunction(() => window.__bwSpikeArena._pane.hubState.backend.readSensor('D', 'distance').distance < 300);
    const world = await page.evaluate(() => window.__bwSpikeArena.bridge.world);
    assert.equal(world.success.length, 0);
    assert.equal(world.timeLimitMs, undefined);
    check('editing the 2D mat changes the shared colour and distance sensor inputs');
    const download = page.waitForEvent('download');
    await page.getByTestId('bw-spike-sandbox-save').click();
    const file = `${evidence}/synthetic-sandbox.json`;
    await (await download).saveAs(file);
    await page.getByTestId('bw-spike-arena-challenges').click();
    await page.waitForFunction(() => window.__bwSpikeArena.mode === 'challenge');
    await page.getByTestId('bw-spike-arena-sandbox').click();
    await page.waitForFunction(() => window.__bwSpikeArena.mode === 'sandbox');
    assert.deepEqual(await page.evaluate(() => window.__bwSpikeArena.bridge.world), world);
    await page.getByTestId('bw-spike-sandbox-file').setInputFiles(file);
    await page.waitForFunction(() => window.__bwSpikeArena.status === 'ready');
    assert.deepEqual(await page.evaluate(() => window.__bwSpikeArena.bridge.world), world);
    check('edited sandbox survives mode changes and a real save/open round trip');
    await page.getByTestId('bw-spike-arena-view-toggle').click();
    await page.waitForFunction(() => window.__bwSpikeArena.view3d === 'webgl');
    assert.deepEqual(await page.evaluate(() => window.__bwSpikeArena.bridge.world), world);
    await page.getByTestId('bw-spike-arena-camera').selectOption('follow');
    await page.getByTestId('bw-spike-arena-camera').selectOption('top');
    await page.screenshot({path: `${evidence}/sandbox-3d.png`});
    check('3D cameras use the same edited sandbox world');
}

export async function verifyEmptyArena (browser, url, check, evidence) {
    const context = await browser.newContext({viewport: {width: 1100, height: 800}, serviceWorkers: 'block'});
    const page = await context.newPage();
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    try {
        await page.addInitScript(() => localStorage.setItem('bw-starter-v1-complete', '1'));
        await page.route('**/static/spike-arena/**', route => route.abort());
        await page.goto(url, {waitUntil: 'domcontentloaded'});
        await page.getByRole('tab', {name: 'Code', exact: true}).click();
        const devices = page.getByTestId('bw-device-select');
        await devices.waitFor({timeout: 60000});
        await page.getByTestId('bw-open-spike-arena').click();
        await page.getByTestId('bw-spike-arena-sandbox').click();
        await page.waitForFunction(() => window.__bwSpikeArena?.mode === 'sandbox');
        await page.getByTestId('bw-spike-sandbox-drive-forward').click();
        await page.waitForFunction(() => window.__bwSpikeArena.snapshot.pose.x > 35);
        await page.getByTestId('bw-spike-sandbox-drive-stop').click();
        assert.deepEqual(errors, []);
        await page.screenshot({path: `${evidence}/empty-project-sandbox.png`});
        check('empty project sandbox is usable with all challenge downloads unavailable');
    } finally { await context.close(); }
}
