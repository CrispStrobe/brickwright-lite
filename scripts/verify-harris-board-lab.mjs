#!/usr/bin/env node
// PROOF_URL tests the real Settings entry in a built app; otherwise isolated modules.
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {readFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {resolve, sep} from 'node:path';
const {chromium} = await import(process.env.PLAYWRIGHT_MODULE || 'playwright');
const root = fileURLToPath(new URL('../overlay/scratch-gui/src/lib/bw-286-lab/', import.meta.url));
const server = createServer(async (req, res) => {
    try {
        if (req.url === '/') {
            res.setHeader('content-type', 'text/html');
            res.end('<!doctype html><button id="open">Open lab</button><script type="module">import {openHarrisLab} from "/panel.js"; document.querySelector("#open").onclick = openHarrisLab;</script>');
            return;
        }
        const file = resolve(root, `.${decodeURIComponent(req.url.split('?')[0])}`);
        if (!file.startsWith(root.endsWith(sep) ? root : root + sep)) throw new Error('path');
        res.setHeader('content-type', 'text/javascript'); res.end(await readFile(file));
    } catch { res.writeHead(404); res.end(); }
});
const production = process.env.PROOF_URL;
if (!production) await new Promise(done => server.listen(0, '127.0.0.1', done));
let browser;
try {
    browser = await chromium.launch({headless: true});
    const page = await browser.newPage(); page.setDefaultTimeout(30000);
    if (production) await page.addInitScript(() => localStorage.setItem('bw-starter-v1-complete', '1'));
    const errors = [], requests = [];
    page.on('pageerror', error => errors.push(error.message));
    page.on('request', req => requests.push(req.url()));
    await page.goto(production || `http://127.0.0.1:${server.address().port}/`, {waitUntil: 'domcontentloaded', timeout: 60000});
    const click = async name => {
        await page.getByRole('button', {name, exact: true}).click();
        if (name === 'Edit board draft') await page.getByTestId('harris-draft').waitFor({state: 'visible'});
    };
    const state = () => page.getByTestId('harris-state').textContent().then(JSON.parse);
    const open = async () => {
        if (!production) return click('Open lab');
        await page.getByText('Settings', {exact: true}).waitFor({timeout: 60000});
        await page.getByText('Settings', {exact: true}).click();
        await page.getByText('8086 execution diagnostics…', {exact: true}).click();
        await click('Open experimental 286 board lab');
    };
    await open();
    assert.equal(await page.getByRole('button', {name: 'Load owned loop demo', exact: true}).isDisabled(), true);
    const engineRequested = () => requests.some(url => production ? /bw-286-engine/.test(url) : /runtime.js|\/engine\//.test(url));
    assert.equal(engineRequested(), false, 'engine stays unloaded before enable');
    await click('Enable experimental board lab');
    await click('Load owned loop demo');
    assert.equal(engineRequested(), true, 'engine-request detector must also see the positive case');
    assert.equal((await state()).retired, 0);
    await click('Set breakpoint');
    await click('Run up to 4096 clocks');
    await page.getByTestId('harris-status').filter({hasText: 'breakpoint; 0'}).waitFor();
    await click('Step instruction'); assert.equal((await state()).retired, 1);
    await click('Run up to 4096 clocks');
    await page.getByTestId('harris-status').filter({hasText: 'halted'}).waitFor();
    assert.equal((await state()).retired, 47);
    await click('Load Paterson FAT12 routines');
    assert.match(await page.getByTestId('harris-status').textContent(), /routine test, not DOS/);
    await click('Run up to 4096 clocks');
    await page.getByTestId('harris-status').filter({hasText:'halted'}).waitFor();
    assert.equal((await state()).registers.di, 0xabc);
    await click('Load owned loop demo');
    await click('Run up to 4096 clocks');
    await page.getByTestId('harris-status').filter({hasText:'halted'}).waitFor();
    await click('Inspect bank');
    assert.match(await page.getByTestId('harris-inspection').textContent(), /01 02 03 04 00 00 00 00 0a/);
    await click('Inspect net');
    assert.equal(JSON.parse(await page.getByTestId('harris-inspection').textContent()).value, 0);
    await click('Export recipe JSON');
    const text = await page.getByRole('textbox', {name: 'Board recipe JSON'}).inputValue();
    const doc = JSON.parse(text); assert.equal(doc.format, 'bw-experimental-circuit');
    assert.equal(doc.snapshot, undefined);
    await click('Edit board draft');
    assert.equal(await page.locator('[data-testid="harris-draft"] rect[data-part]').count(), 12);
    assert.equal(await page.locator('[data-testid="harris-draft"] line[data-wire]').count(), doc.wires.length);
    await page.getByLabel('Part X', {exact: true}).fill('555'); await click('Move part');
    assert.equal(await page.locator('rect[data-part="cpu"]').getAttribute('x'), '555');
    await click('Export draft JSON');
    const staged = JSON.parse(await page.getByLabel('Editor draft JSON', {exact: true}).inputValue());
    assert.equal(staged.circuit.parts[0].x, 555);
    await click('Close draft'); assert.equal((await state()).retired, 47);
    await click('Edit board draft');
    assert.equal(await page.locator('rect[data-part="cpu"]').getAttribute('x'), '0', 'close discards staging');
    await page.getByLabel('Editor draft JSON', {exact: true}).fill(JSON.stringify(staged));
    await click('Import draft JSON');
    const power = staged.circuit.wires.find(w => w.to.part === 'rom0' && w.to.terminal === 'vcc');
    await page.getByLabel('Wire to inspect or remove', {exact: true}).selectOption(power.id);
    await click('Remove wire'); await click('Apply draft to fresh board');
    assert.match(await page.getByTestId('draft-status').textContent(), /Refused/);
    assert.equal((await state()).retired, 47, 'bad electrical draft preserves prior board');
    await page.getByLabel('From part', {exact: true}).selectOption('inputs');
    await page.getByLabel('From terminal', {exact: true}).selectOption('vcc');
    await page.getByLabel('To part', {exact: true}).selectOption('rom0');
    // Changing a part refreshes both pin lists; select pins after both parts.
    await page.getByLabel('From terminal', {exact: true}).selectOption('vcc');
    await page.getByLabel('To terminal', {exact: true}).selectOption('vcc');
    await click('Connect terminals'); await click('Apply draft to fresh board');
    assert.equal(await page.getByTestId('harris-draft').count(), 0);
    assert.equal((await state()).retired, 0);
    await click('Edit board draft');
    assert.equal(await page.locator('rect[data-part="cpu"]').getAttribute('x'), '555', 'applied layout survives reopening');
    await click('Close draft');
    await click('Run up to 4096 clocks');
    await page.getByTestId('harris-status').filter({hasText: 'halted'}).waitFor();
    assert.equal((await state()).retired, 47);
    const downloadPromise = page.waitForEvent('download'); await click('Download recipe');
    assert.equal((await downloadPromise).suggestedFilename(), 'experimental-286.circuit.json');
    const bad = {...doc, backend: 'v86'};
    await page.getByRole('textbox', {name: 'Board recipe JSON'}).fill(JSON.stringify(bad));
    await click('Load recipe JSON');
    assert.match(await page.getByTestId('harris-status').textContent(), /UNSUPPORTED_BACKEND/);
    assert.equal((await state()).retired, 47, 'failed load preserves existing board');
    await page.getByLabel('Import recipe file').setInputFiles({name: 'board.json', mimeType: 'application/json', buffer: Buffer.from(text)});
    await page.getByTestId('harris-status').filter({hasText: 'Fresh board initialized'}).waitFor();
    assert.equal((await state()).retired, 0);
    await click('Run up to 4096 clocks'); await click('Pause');
    await page.getByTestId('harris-status').filter({hasText: 'Paused'}).waitFor();
    assert.equal((await state()).status, 'running');
    await click('Run up to 4096 clocks'); await click('Close board lab');
    assert.equal(await page.getByTestId('harris-lab').count(), 0);
    await open();
    assert.equal(await page.getByRole('button', {name: 'Load owned loop demo', exact: true}).isDisabled(), true);
    assert.equal(await page.getByTestId('harris-state').textContent(), 'No board loaded.');
    await click('Close board lab');
    assert.deepEqual(errors, []);
    console.log(`PASS: ${production ? 'built application Settings entry and' : 'isolated'} 286 browser panel — execution, debugger, visual layout, wire removal/reconnection, staged apply/refusal, import/export and lifecycle`);
} finally {
    await browser?.close(); if (!production) await new Promise(done => server.close(done));
}
