#!/usr/bin/env node
// Isolated browser component gate, NOT a full application/webpack acceptance.
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
await new Promise(done => server.listen(0, '127.0.0.1', done));
let browser;
try {
    browser = await chromium.launch({headless: true});
    const page = await browser.newPage(); page.setDefaultTimeout(30000);
    const errors = [], requests = [];
    page.on('pageerror', error => errors.push(error.message));
    page.on('request', req => requests.push(req.url()));
    await page.goto(`http://127.0.0.1:${server.address().port}/`);
    const click = name => page.getByRole('button', {name, exact: true}).click();
    const state = () => page.getByTestId('harris-state').textContent().then(JSON.parse);
    await click('Open lab');
    assert.equal(await page.getByRole('button', {name: 'Load owned loop demo', exact: true}).isDisabled(), true);
    assert.equal(requests.some(url => /runtime.js|\/engine\//.test(url)), false, 'engine stays unloaded before enable');
    await click('Enable experimental board lab');
    await click('Load owned loop demo');
    assert.equal((await state()).retired, 0);
    await click('Set breakpoint');
    await click('Run up to 4096 clocks');
    await page.getByTestId('harris-status').filter({hasText: 'breakpoint; 0'}).waitFor();
    await click('Step instruction'); assert.equal((await state()).retired, 1);
    await click('Run up to 4096 clocks');
    await page.getByTestId('harris-status').filter({hasText: 'halted'}).waitFor();
    assert.equal((await state()).retired, 47);
    await click('Inspect bank');
    assert.match(await page.getByTestId('harris-inspection').textContent(), /01 02 03 04 00 00 00 00 0a/);
    await click('Inspect net');
    assert.equal(JSON.parse(await page.getByTestId('harris-inspection').textContent()).value, 0);
    await click('Export recipe JSON');
    const text = await page.getByRole('textbox', {name: 'Board recipe JSON'}).inputValue();
    const doc = JSON.parse(text); assert.equal(doc.format, 'bw-experimental-circuit');
    assert.equal(doc.snapshot, undefined);
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
    await click('Open lab');
    assert.equal(await page.getByRole('button', {name: 'Load owned loop demo', exact: true}).isDisabled(), true);
    assert.equal(await page.getByTestId('harris-state').textContent(), 'No board loaded.');
    await click('Close board lab');
    assert.deepEqual(errors, []);
    console.log('PASS: isolated 286 browser panel — enable gate, execution, breakpoints, inspection, JSON/file import/export, rejection, pause, close and fresh reopen');
} finally {
    await browser?.close(); await new Promise(done => server.close(done));
}
