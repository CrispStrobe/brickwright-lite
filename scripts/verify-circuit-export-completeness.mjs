#!/usr/bin/env node
/** Deployed proof: one circuit document downloads identically from every view. */
import {chromium} from 'playwright';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {mkdir, writeFile} from 'node:fs/promises';
import path from 'node:path';

const proofUrl = process.env.PROOF_URL || 'https://crispstrobe.github.io/brickwright-lite/';
const outDir = path.resolve(process.env.PROOF_DIR || 'artifacts/circuit-export-completeness');
await mkdir(outDir, {recursive: true});

const browser = await chromium.launch();
const page = await browser.newPage({viewport: {width: 1440, height: 900}, acceptDownloads: true});
const pageErrors = [];
const downloadNames = [];
page.on('download', download => downloadNames.push(download.suggestedFilename()));
page.on('pageerror', error => pageErrors.push(String(error)));

const readDownload = async download => {
    const stream = await download.createReadStream();
    const chunks = [];
    for await (const chunk of stream) chunks.push(chunk);
    return Buffer.concat(chunks);
};

const exportTex = async designer => {
    await page.evaluate(() => window.dispatchEvent(new CustomEvent('bw-circuit-file', {
        detail: {action: 'export'}
    })));
    const dialog = designer.locator('[data-host-file-command]');
    // gate-shapes-allow: precondition for the download that follows; an absent dialog throws here.
    await dialog.waitFor({state: 'visible', timeout: 10000});
    const [download] = await Promise.all([
        page.waitForEvent('download', {timeout: 10000}),
        dialog.getByRole('button', {name: /LaTeX schematic/}).click()
    ]);
    if (download.suggestedFilename() !== 'schematic.tex') {
        throw new Error(`wrong filename: ${download.suggestedFilename()}`);
    }
    return readDownload(download);
};

let result;
try {
    await page.addInitScript(() => {
        localStorage.clear();
        localStorage.setItem('bw-starter-v1-complete', '1');
        sessionStorage.clear();
    });
    await page.goto(proofUrl, {waitUntil: 'domcontentloaded', timeout: 60000});
    const saveCircuit = async () => {
        await page.getByText('File', {exact: true}).first().click();
        const [download] = await Promise.all([
            page.waitForEvent('download', {timeout: 10000}),
            page.getByText('Save circuit', {exact: true}).click()
        ]);
        assert.equal(download.suggestedFilename(), 'circuit.json');
        return JSON.parse((await readDownload(download)).toString('utf8'));
    };
    await page.getByRole('tab', {name: 'Code', exact: true}).click();
    const coldCircuit = await saveCircuit();
    assert.ok(coldCircuit.parts.length > 0, 'cold Code-menu Save must reach an actual designer');
    const resistor = coldCircuit.parts.find(part => part.kind === 'resistor');
    assert.ok(resistor, 'the original starter supplies the authored resistor control');
    resistor.params = {...resistor.params, ohms: 1234};
    await page.getByRole('tab', {name: 'Code', exact: true}).click();
    await page.getByText('File', {exact: true}).first().click();
    const [chooser] = await Promise.all([
        page.waitForEvent('filechooser', {timeout: 10000}),
        page.getByText('Open circuit…', {exact: true}).click()
    ]);
    await chooser.setFiles({name: 'owned-file-menu.json', mimeType: 'application/json',
        buffer: Buffer.from(JSON.stringify(coldCircuit))});
    await page.waitForFunction(() => window.__circuit?.parts.some(part =>
        part.kind === 'resistor' && part.params?.ohms === 1234));
    const canonical = await saveCircuit();
    await page.getByRole('tab', {name: 'Code', exact: true}).click();
    const warmCircuit = await saveCircuit();
    assert.deepEqual(warmCircuit, canonical, 'warm Code-menu Save must preserve the authored circuit');
    assert.ok(warmCircuit.parts.some(part => part.kind === 'resistor' && part.params?.ohms === 1234));
    assert.deepEqual(downloadNames, ['circuit.json', 'circuit.json', 'circuit.json'],
        'each File-menu Save must download exactly once');
    const fileMenu = {coldSave: true, warmOpen: true, warmSave: true, authoredOhms: 1234};
    await page.getByRole('tab', {name: /Circuit/}).click();
    const designer = page.locator('.bw-circuit-designer:visible').last();
    await designer.waitFor({state: 'visible', timeout: 60000});

    // Load a named, time-varying fixture through CircuitTab's production host
    // callback. A blank project's DC net can render the scope controls before
    // the engine has produced even one capture, making a click truthfully yield
    // no CSV and proving nothing about trace bytes.
    const loadedExample = await page.evaluate(async () => {
        const response = await fetch('examples/index.json');
        const examples = await response.json();
        const example = examples.find(item => item.id === '50-rc-scope');
        if (!example) return {ok: false, error: '50-rc-scope is absent from examples/index.json'};
        const root = document.querySelector('[class*="gui_body"]') || document.querySelector('[class*="gui"]');
        const key = Object.keys(root || {}).find(name =>
            name.startsWith('__reactFiber') || name.startsWith('__reactInternalInstance'));
        const queue = key ? [root[key]] : [];
        for (let seen = 0; seen < 10000 && queue.length; seen++) {
            const fiber = queue.shift();
            if (fiber?.stateNode?.loadExample && Object.hasOwn(fiber.stateNode.state || {}, 'circuitData')) {
                return fiber.stateNode.loadExample(example, {circuitOnly: true});
            }
            if (fiber?.child) queue.push(fiber.child);
            if (fiber?.sibling) queue.push(fiber.sibling);
        }
        return {ok: false, error: 'CircuitTab host is unavailable'};
    });
    if (!loadedExample?.ok) throw new Error(`cannot load named circuit: ${loadedExample?.error || 'unknown error'}`);
    await designer.getByRole('radio', {name: 'Sim mode'}).click();
    await designer.getByRole('radio', {name: 'Sim mode'}).waitFor({state: 'attached'});
    await page.waitForFunction(root =>
        root.querySelector('[role="radio"][aria-label="Sim mode"]')?.getAttribute('aria-checked') === 'true',
    await designer.elementHandle(), {timeout: 10000});

    const artifacts = [];
    for (const view of ['Realistic view', 'Schematic view', 'Board view']) {
        if (view !== 'Realistic view') {
            await designer.getByLabel(view, {exact: true}).first().click();
        }
        artifacts.push(await exportTex(designer));
    }
    const hashes = artifacts.map(bytes => createHash('sha256').update(bytes).digest('hex'));
    if (new Set(hashes).size !== 1) throw new Error(`view-dependent bytes: ${hashes.join(', ')}`);
    const text = artifacts[0].toString('utf8');
    if (!text.startsWith('\\documentclass{article}') || !text.includes('\\usepackage{circuitikz}')) {
        throw new Error('download is not a complete Circuitikz document');
    }
    if (pageErrors.length) throw new Error(`page errors: ${pageErrors.join(' | ')}`);

    const expand = designer.getByRole('button', {name: 'Expand instruments panel'});
    if (await expand.count()) await expand.click({force: true});
    await designer.getByRole('button', {name: /Scope$/}).click({force: true});
    const scope = designer.locator('[data-scope-module]');
    await scope.waitFor({state: 'visible', timeout: 10000});
    const netSelect = scope.locator('select').last();
    const options = await netSelect.locator('option').count();
    if (options < 2) throw new Error('scope has no solved net to export');
    await netSelect.selectOption({index: 1});
    // ScopePanel's visible contract is deliberately compact ("+ channel" / "+ Kanal");
    // it has never exposed the prose label "Add channel". Keep this selector
    // bilingual because production may inherit either supported GUI locale.
    await scope.getByRole('button', {name: /^\+ (?:channel|Kanal)$/}).click();
    await page.waitForFunction(root => {
        const canvas = root.querySelector('canvas');
        if (!canvas) return false;
        const pixels = canvas.getContext('2d').getImageData(0, 0, canvas.width, canvas.height).data;
        for (let index = 0; index < pixels.length; index += 4) {
            // The CH1 trace is #2ecc71. Tolerate antialiasing while requiring
            // green dominance, which the empty graticule/background lacks.
            if (pixels[index + 1] > 140 && pixels[index + 1] > pixels[index] * 1.5 &&
                pixels[index + 1] > pixels[index + 2] * 1.2) return true;
        }
        return false;
    }, await scope.elementHandle(), {timeout: 10000});
    const [csvDownload] = await Promise.all([
        page.waitForEvent('download', {timeout: 10000}),
        scope.locator('[data-testid="bw-scope-trace-csv-download"]').click()
    ]);
    const csv = (await readDownload(csvDownload)).toString('utf8');
    if (!/^# net=.* capture=envelope .*points=\d+\nelapsed_seconds,min_volts,max_volts\n/m.test(csv)) {
        throw new Error(`scope CSV has no truthful envelope header: ${csv.slice(0, 180)}`);
    }
    const numericRows = csv.split('\n').filter(line => /^\d+(?:\.\d+)?,(?:NaN|-?\d)/.test(line));
    if (!numericRows.length) throw new Error('scope CSV has no numeric measurement row');

    const assets = await page.locator('script[src],link[rel="stylesheet"][href]').evaluateAll(nodes =>
        nodes.map(node => node.getAttribute('src') || node.getAttribute('href'))
            .filter(value => /\.[a-f0-9]{8,32}\.(?:js|css)/.test(value)));
    assert.equal(downloadNames.length, 7, 'three File saves plus three TeX exports and scope CSV');
    result = {url: proofUrl, fileMenu, example: '50-rc-scope', views: 3, downloads: downloadNames.length, downloadNames, bytes: artifacts[0].length,
        sha256: hashes[0], scopeRows: numericRows.length, pageErrors, assets};
    await page.screenshot({path: path.join(outDir, 'circuit-export-board-view.png'), fullPage: true});
    await writeFile(path.join(outDir, 'result.json'), `${JSON.stringify(result, null, 2)}\n`);
    console.log(JSON.stringify(result));
} catch (error) {
    await writeFile(path.join(outDir, 'failure.json'), JSON.stringify({url: proofUrl,
        error: String(error), pageErrors}, null, 2) + '\n');
    await page.screenshot({path: path.join(outDir, 'failure.png')}).catch(() => {});
    throw error;
} finally {
    await browser.close();
}
