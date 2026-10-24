#!/usr/bin/env node
/** Built/deployed proof: exports, captures and scope display preserve their public contracts. */
import {chromium} from 'playwright';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {mkdir, writeFile} from 'node:fs/promises';
import path from 'node:path';

const proofUrl = process.env.PROOF_URL || 'https://crispstrobe.github.io/brickwright-lite/';
// This flat directory is already collected by the Instruments artifact upload.
const outDir = path.resolve(process.env.PROOF_DIR || 'artifacts/chrome-sweep');
const proofFile = name => path.join(outDir, `circuit-export-${name}`);
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
    const scopeElement = await scope.elementHandle();
    // A deterministic capture: display controls must not silently advance it.
    await designer.getByRole('button', {name: /Pause simulation/i}).press('Enter');
    await designer.getByRole('button', {name: /Resume simulation/i}).waitFor();
    await scope.getByTestId('bw-scope-record').selectOption('100000');
    const netSelect = scope.locator('select').last();
    const options = await netSelect.locator('option').count();
    if (options < 2) throw new Error('scope has no solved net to export');
    const signalNet = await page.evaluate(() => window.__board.getNets().find(net =>
        net.terminals.some(t => t.part === 'fg1' && t.terminal === 'pos'))?.id);
    assert.ok(signalNet, 'named RC example must expose its actual source net');
    await netSelect.selectOption(signalNet);
    // ScopePanel's visible contract is deliberately compact ("+ channel" / "+ Kanal");
    // it has never exposed the prose label "Add channel". Keep this selector
    // bilingual because production may inherit either supported GUI locale.
    await scope.getByRole('button', {name: /^\+ (?:channel|Kanal)$/}).click();
    const scopeHandle = await page.evaluate(() => {
        const handles = window.__board.getScopeChannels();
        if (handles.length !== 1) throw new Error('ambiguous scope fixture');
        return handles[0];
    });
    const stepCapture = async expectedCount => {
        const control = designer.getByRole('button', {name: /Step one tick|Advance one 50/i});
        const ready = async () => page.waitForFunction(button =>
            !!button && button.isConnected && !button.disabled, await control.elementHandle());
        await ready();
        const before = await page.evaluate(() => String(window.__board.getTime()));
        const target = String(BigInt(before) + 50000000n);
        await control.click();
        try {
            await page.waitForFunction(({h, count, time}) => {
                const b = window.__board;
                return String(b.getTime()) === time && b.getScopeData(h).count === count;
            }, {h: scopeHandle, count: expectedCount, time: target});
            await ready();
        } catch (error) {
            const actual = await page.evaluate(h => {
                try {return {time: String(window.__board.getTime()), count: window.__board.getScopeData(h).count};}
                catch (e) {return {error: String(e)};}
            }, scopeHandle);
            throw new Error(`scope step expected time=${target}/count=${expectedCount}, actual=${JSON.stringify(actual)}: ${String(error).split('\n')[0]}`);
        }
    };
    await stepCapture(5000);
    await page.waitForFunction(root => root.querySelector('[data-testid="bw-scope-acquisition-0"]')
        ?.getAttribute('data-retained') === '5000', scopeElement);
    await page.waitForFunction(root => {
        const canvas = root.querySelector('canvas');
        if (!canvas) return false;
        const context = canvas.getContext('2d');
        // The voltage-axis labels are green too. Exclude two text heights at
        // each edge so an empty plot cannot pass by rendering its labels.
        const inset = Math.ceil(Number.parseFloat(context.font) * 2);
        if (!Number.isFinite(inset) || canvas.height <= inset * 2) return false;
        const pixels = context.getImageData(0, inset, canvas.width, canvas.height - inset * 2).data;
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
    const csvBytes = await readDownload(csvDownload);
    await writeFile(proofFile('scope-before-display.csv'), csvBytes, {flag: 'wx'});
    const csv = csvBytes.toString('utf8');
    if (!/^# net=.* capture=envelope .*points=\d+\nelapsed_seconds,min_volts,max_volts\n/m.test(csv)) {
        throw new Error(`scope CSV has no truthful envelope header: ${csv.slice(0, 180)}`);
    }
    const numericRows = csv.split('\n').filter(line => /^\d+(?:\.\d+)?,(?:NaN|-?\d)/.test(line));
    if (!numericRows.length) throw new Error('scope CSV has no numeric measurement row');

    const acq = scope.getByTestId('bw-scope-acquisition-0');
    const prefix = await page.evaluate(() => {
        const board = window.__board, handles = board.getScopeChannels();
        if (handles.length !== 1) throw new Error('ambiguous scope fixture');
        const data = board.getScopeData(handles[0]);
        return {handle: handles[0], count: data.count, intervalNs: String(data.sampleIntervalNs),
            depth: data.samples.length / 2, capture: data.capture,
            timeNs: String(board.getTime()), startTimeNs: String(data.startTNs)};
    });
    assert.equal(prefix.handle, scopeHandle);
    assert.equal(prefix.count, 5000);
    assert.equal(BigInt(prefix.startTimeNs) + BigInt(prefix.count) * BigInt(prefix.intervalNs), BigInt(prefix.timeNs),
        'late-attached envelope origin must join its actual clock');
    const retainObservation = async (stage, value) => writeFile(proofFile(`scope-observation-${stage}.json`),
        JSON.stringify(value, null, 2) + '\n', {flag: 'wx'});
    const observeCapture = async () => page.evaluate(h => {
        const b = window.__board, d = b.getScopeData(h), depth = d.samples.length / 2;
        const last = ((d.writeIndex - 1 + depth) % depth) * 2;
        const pair = [d.samples[last], d.samples[last + 1]];
        if (!pair.every(Number.isFinite)) throw new Error('nonfinite actual scope witness');
        return {timeNs: String(b.getTime()), startTimeNs: String(d.startTNs), count: d.count,
            intervalNs: String(d.sampleIntervalNs), depth, capture: d.capture, lastPair: pair};
    }, scopeHandle);
    const retainCanvas = async (name, data) => {
        assert.ok(data.startsWith('data:image/png;base64,'), 'actual canvas must produce PNG');
        const bytes = Buffer.from(data.slice('data:image/png;base64,'.length), 'base64');
        await writeFile(proofFile(name), bytes, {flag: 'wx'});
        return {name: path.basename(proofFile(name)), bytes: bytes.length, sha256: createHash('sha256').update(bytes).digest('hex')};
    };
    await writeFile(proofFile('scope-observed-circuit.json'),
        JSON.stringify(await page.evaluate(() => window.__circuit.toJSON()), null, 2) + '\n', {flag: 'wx'});
    await retainObservation('prefix', {...prefix, selectedNet: signalNet,
        readoutStartTimeNs: await acq.getAttribute('data-start-time-ns'), readout: await acq.textContent()});
    assert.equal(await acq.getAttribute('data-capture'), prefix.capture);
    assert.equal(await acq.getAttribute('data-interval-ns'), prefix.intervalNs);
    assert.equal(await acq.getAttribute('data-depth'), String(prefix.depth));
    assert.ok(!/Nyquist/.test(await acq.textContent()), 'an envelope cannot claim a point Nyquist');
    const signalValues = numericRows.flatMap(line => line.split(',').slice(1).map(Number));
    assert.ok(Math.max(...signalValues) > Math.min(...signalValues), 'the selected source capture must actually vary');
    assert.match(await scope.getByTestId('bw-scope-sampling-limits').textContent(),
        /no analog anti-alias filter|kein analoger Anti-Aliasing-Filter/i);
    await scope.getByTestId('bw-scope-vdiv-0').selectOption('0.05');
    await scope.getByTestId('bw-scope-center-0').fill('0');
    const warning = scope.getByTestId('bw-scope-overrange-0');
    await warning.filter({hasText: /Above viewport|Über dem Anzeigebereich/}).waitFor();
    await warning.scrollIntoViewIfNeeded();
    await page.screenshot({path: proofFile('scope-viewport-warning.png'), fullPage: true});
    await scope.getByTestId('bw-scope-vdiv-0').selectOption('5');
    await warning.waitFor({state: 'detached'});
    const [afterDownload] = await Promise.all([page.waitForEvent('download', {timeout: 10000}),
        scope.getByTestId('bw-scope-trace-csv-download').click()]);
    const afterCsvBytes = await readDownload(afterDownload);
    await writeFile(proofFile('scope-after-display.csv'), afterCsvBytes, {flag: 'wx'});
    assert.ok(afterCsvBytes.equals(csvBytes), 'display scale must preserve every raw CSV byte');

    await stepCapture(10000);
    await page.waitForFunction(root => root.querySelector('[data-testid="bw-scope-acquisition-0"]')
        ?.getAttribute('data-wrapped') === 'true', scopeElement);
    const wrappedStart = await acq.getAttribute('data-start-time-ns');
    const wrappedCapture = await observeCapture();
    assert.equal(wrappedStart, wrappedCapture.startTimeNs);
    await retainObservation('wrapped', {...wrappedCapture, readoutStartTimeNs: wrappedStart,
        readout: await acq.textContent()});
    await scope.getByTestId('bw-scope-hold').click();
    const heldText = await acq.textContent();
    const heldPixels = await scope.locator('canvas').evaluate(canvas => canvas.toDataURL());
    const heldImage = await retainCanvas('scope-held-before.png', heldPixels);
    await retainObservation('held-before', {...await observeCapture(), readout: heldText,
        readoutStartTimeNs: await acq.getAttribute('data-start-time-ns'), image: heldImage});
    // This source repeats after a 50ms tick. A viewport change makes the
    // frozen-picture check sensitive even when two waveform phases coincide.
    await scope.getByTestId('bw-scope-center-0').fill('2');
    await stepCapture(15000);
    assert.equal(await page.evaluate(h => window.__board.getScopeData(h).count, prefix.handle), 15000);
    const heldAfterPixels = await scope.locator('canvas').evaluate(canvas => canvas.toDataURL());
    const heldAfterImage = await retainCanvas('scope-held-after-step.png', heldAfterPixels);
    await retainObservation('held-after', {...await observeCapture(), readout: await acq.textContent(),
        readoutStartTimeNs: await acq.getAttribute('data-start-time-ns'), requestedViewportCenter: 2, image: heldAfterImage});
    assert.equal(await acq.textContent(), heldText, 'HOLD metadata must stay with its frozen picture');
    assert.equal(heldAfterPixels, heldPixels);
    const freshStart = await page.evaluate(h => String(window.__board.getScopeData(h).startTNs), prefix.handle);
    assert.notEqual(freshStart, wrappedStart, 'actual acquired record must advance during HOLD');
    await scope.getByTestId('bw-scope-hold').click();
    await page.waitForFunction(({root, expected}) => {
        const el = root.isConnected && root.querySelector('[data-testid="bw-scope-acquisition-0"]');
        return !!el && el.getAttribute('data-start-time-ns') === expected;
    }, {root: scopeElement, expected: freshStart});
    await page.waitForFunction(({root, old}) => {
        const canvas = root.isConnected && root.querySelector('canvas');
        return !!canvas && canvas.toDataURL() !== old;
    }, {root: scopeElement, old: heldPixels});
    const resumedImage = await retainCanvas('scope-resumed.png',
        await scope.locator('canvas').evaluate(canvas => canvas.toDataURL()));
    await retainObservation('resumed', {...await observeCapture(), readout: await acq.textContent(),
        readoutStartTimeNs: await acq.getAttribute('data-start-time-ns'), image: resumedImage});
    await scope.getByTestId('bw-scope-view-spectrum').click();
    await page.waitForFunction(() => window.__board.getScopeChannels()
        .some(h => window.__board.getScopeData(h).capture === 'sample'));
    await stepCapture(20000);
    await page.waitForFunction(root => {
        const el = root.querySelector('[data-testid="bw-scope-acquisition-0"]');
        return el?.getAttribute('data-capture') === 'sample' && /Nyquist/.test(el.textContent)
            && Number(el.getAttribute('data-retained')) > 0;
    }, scopeElement);
    assert.equal(await acq.getAttribute('data-retained'), '500', 'completed point capture must contain all 50ms samples');
    const pointText = await acq.textContent(), frequency = pointText.match(/Nyquist ([0-9.]+) (MHz|kHz|Hz)/);
    assert.ok(frequency, 'actual point record must disclose numeric Nyquist');
    const nyquistHz = Number(frequency[1]) * ({MHz: 1e6, kHz: 1e3, Hz: 1}[frequency[2]]);
    assert.equal(nyquistHz, 1e9 / Number(await acq.getAttribute('data-interval-ns')) / 2);
    const pointCapture = await page.evaluate(() => {
        const b = window.__board, d = b.getScopeChannels().map(h => b.getScopeData(h)).find(data => data.capture === 'sample');
        if (!d) throw new Error('actual point tap missing');
        return {timeNs: String(b.getTime()), startTimeNs: String(d.startTNs), count: d.count,
            intervalNs: String(d.sampleIntervalNs), depth: d.samples.length / 2, capture: d.capture};
    });
    assert.equal(pointCapture.count, 500);
    assert.equal(BigInt(pointCapture.startTimeNs) + BigInt(pointCapture.count - 1) * BigInt(pointCapture.intervalNs), BigInt(pointCapture.timeNs));
    await retainObservation('point', {...pointCapture, nyquistHz,
        readoutStartTimeNs: await acq.getAttribute('data-start-time-ns'), readout: pointText});
    const scopeDisplay = {actualPrefix: prefix.count, ringWrap: true, viewportWarningAndClear: true,
        rawCsvByteIdentical: true, holdWhileAcquiring: true, holdDespiteViewportChange: true, resumeVisiblyRedraws: true, pointSampleNyquistHz: nyquistHz,
        rawCsvBytes: csvBytes.length, rawCsvBeforeSha256: createHash('sha256').update(csvBytes).digest('hex'),
        rawCsvAfterSha256: createHash('sha256').update(afterCsvBytes).digest('hex'),
        analogAntiAliasModeled: false, physicalAccuracyClaim: false};

    assert.equal(pageErrors.length, 0, 'the complete scope interaction must remain free of page errors');

    const assets = await page.locator('script[src],link[rel="stylesheet"][href]').evaluateAll(nodes =>
        nodes.map(node => node.getAttribute('src') || node.getAttribute('href'))
            .filter(value => /\.[a-f0-9]{8,32}\.(?:js|css)/.test(value)));
    assert.equal(downloadNames.length, 8, 'three File saves plus three TeX exports and two unchanged scope CSV exports');
    result = {url: proofUrl, fileMenu, example: '50-rc-scope', views: 3, downloads: downloadNames.length, downloadNames, bytes: artifacts[0].length,
        sha256: hashes[0], scopeRows: numericRows.length, scopeDisplay, pageErrors, assets};
    await page.screenshot({path: proofFile('board-view.png'), fullPage: true});
    await writeFile(proofFile('result.json'), `${JSON.stringify(result, null, 2)}\n`);
    console.log(JSON.stringify(result));
} catch (error) {
    await writeFile(proofFile('failure.json'), JSON.stringify({url: proofUrl,
        error: String(error), pageErrors}, null, 2) + '\n');
    await page.screenshot({path: proofFile('failure.png')}).catch(() => {});
    throw error;
} finally {
    await browser.close();
}
