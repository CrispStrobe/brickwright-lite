#!/usr/bin/env node
/**
 * ESP32-S3 merged-flash acceptance through the production Lite controls.
 *
 * Fetch the installed supplier's retained inputs first:
 *   node node_modules/bw-board/scripts/fetch-esp32s3-firmware-fixtures.mjs \
 *     --out artifacts/esp32s3/m1-inputs
 * Then build the app with its pinned LabWired and ESP32-S3 ROM assets.
 *
 * BW_ESP32S3_INPUTS selects that input directory; PROOF_URL selects an already
 * served build (otherwise this script serves packages/scratch-gui/build).
 * Both modes require the corresponding local build for response byte checks.
 * ESP32S3_BROWSER_ARTIFACTS selects the evidence directory. BW_BROWSER_PATH is
 * an explicit local browser override, reported as provisional; without it the
 * installed, lockfile-pinned Playwright browser is required. Missing inputs,
 * assets, controls or markers fail: there is no skipped acceptance branch.
 *
 * Firmware enters only through input[type=file]. Run, Stop and both selectors
 * are real controls. No target, VM, engine, serial output or project state is
 * injected. Network substitution is restricted to the named ROM negative
 * controls; positive journeys use the deployed engine and ROM bytes.
 */
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {createServer} from 'node:http';
import {mkdir, readFile, writeFile} from 'node:fs/promises';
import {basename, dirname, extname, join, resolve, sep} from 'node:path';
import {fileURLToPath} from 'node:url';
import {chromium} from 'playwright';
import {ESP32S3_FLASH_BOOT_ROMS, ESP32S3_FLASH_BOOT_ROM_SOURCE} from 'bw-board/labwired-firmware-boot.js';
import {captureFirmwareBrowserSource, fetchFirmwareBrowserProducer, verifyFirmwareBrowserBuild,
    verifyFirmwareBrowserSourceUnchanged} from './lib/firmware-browser-build.mjs';
import {admitEsp32S3FirmwareIdentity} from './lib/esp32s3-firmware-identity.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const build = join(root, 'packages/scratch-gui/build');
const inputs = resolve(process.env.BW_ESP32S3_INPUTS || join(root, 'artifacts/esp32s3/m1-inputs'));
const artifacts = resolve(process.env.ESP32S3_BROWSER_ARTIFACTS || join(root, 'artifacts/esp32s3-firmware-browser'));
const supplier = dirname(fileURLToPath(import.meta.resolve('bw-board/package.json')));
const manifestFile = join(supplier, 'test/fixtures/labwired/esp32s3-flash/manifest.json');
const explicitTarget = 'firmware:esp32s3-merged-flash';
const timeout = 90_000;
const sha256 = bytes => createHash('sha256').update(bytes).digest('hex');
const results = [];
const diagnostics = [];
const assets = new Map();
let assetSequence = 0;
const pendingResponses = [];
const report = {schema: 1, started: new Date().toISOString(), inputs, results, diagnostics, journeys: [],
    runtime: {node: process.version, platform: process.platform, arch: process.arch}};
let browser;
let page;
let server;
let appUrl = process.env.PROOF_URL || null;
let failure;

function check (name, ok, detail) {
    results.push({name, ok: Boolean(ok), ...(detail === undefined ? {} : {detail})});
    console.log(`${ok ? 'PASS' : 'FAIL'}: ${name}`);
    assert.ok(ok, `${name}${detail === undefined ? '' : `: ${JSON.stringify(detail)}`}`);
}

async function pinnedInput (entry) {
    assert.match(entry.sha256, /^[0-9a-f]{64}$/);
    assert.ok(Number.isSafeInteger(entry.bytes) && entry.bytes > 0 && entry.bytes <= 16 * 1024 * 1024);
    const file = resolve(inputs, entry.file);
    assert.ok(file.startsWith(inputs + sep), 'fixture path must stay within the input directory');
    const bytes = await readFile(file); // Absence is a hard failure, never a skip.
    check(`${entry.file}: retained size and SHA-256`, bytes.length === entry.bytes && sha256(bytes) === entry.sha256);
    return {...entry, path: file, buffer: bytes};
}

async function sourceIdentity () {
    const paths = [
        'vendor-pins.json', 'package.json', 'package-lock.json',
        'packages/scratch-gui/package.json', 'packages/scratch-gui/package-lock.json',
        'scripts/sync-labwired-wasm.mjs', 'scripts/sync-esp32s3-roms.mjs', 'scripts/integrate.mjs',
        'scripts/verify-esp32s3-firmware-browser.mjs', 'scripts/lib/firmware-browser-build.mjs',
        'scripts/lib/esp32s3-firmware-identity.mjs',
        'overlay/scratch-gui/webpack.config.js', 'packages/scratch-gui/webpack.config.js',
        'overlay/scratch-gui/src/components/tw-pseudocode/debug-panel.jsx',
        'overlay/scratch-gui/src/components/tw-pseudocode/circuit-tab.jsx',
        'overlay/scratch-gui/src/lib/bw-debug/debug-runner.js',
        'overlay/scratch-gui/src/lib/bw-debug/esp32s3-firmware.js',
        'packages/scratch-gui/src/components/tw-pseudocode/debug-panel.jsx',
        'packages/scratch-gui/src/components/tw-pseudocode/circuit-tab.jsx',
        'packages/scratch-gui/src/lib/bw-debug/debug-runner.js',
        'packages/scratch-gui/src/lib/bw-debug/esp32s3-firmware.js'
    ];
    const pins = JSON.parse(await readFile(join(root, 'vendor-pins.json'), 'utf8'));
    const lock = JSON.parse(await readFile(join(root, 'package-lock.json'), 'utf8'));
    const resolvedSupplier = lock.packages?.['node_modules/bw-board']?.resolved;
    check('installed supplier is named by the exact Lite pin',
        /^[0-9a-f]{40}$/.test(pins['bw-board']) && resolvedSupplier?.endsWith(`#${pins['bw-board']}`), resolvedSupplier);
    return {...await captureFirmwareBrowserSource({root, paths}), pins, resolvedSupplier, supplierPath: supplier};
}

async function serveBuild () {
    await readFile(join(build, 'index.html'));
    const mime = {'.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css',
        '.json': 'application/json', '.wasm': 'application/wasm', '.svg': 'image/svg+xml',
        '.png': 'image/png', '.woff': 'font/woff', '.woff2': 'font/woff2'};
    server = createServer(async (req, res) => {
        try {
            let path = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
            if (path.endsWith('/')) path += 'index.html';
            const file = resolve(build, `.${path}`);
            if (!file.startsWith(build + sep)) throw new Error('path escaped build');
            const bytes = await readFile(file);
            res.writeHead(200, {'content-type': mime[extname(file)] || 'application/octet-stream',
                'content-length': bytes.length, 'cache-control': 'no-store'});
            res.end(req.method === 'HEAD' ? undefined : bytes);
        } catch {
            if (!res.headersSent) res.writeHead(404);
            res.end('not found');
        }
    });
    await new Promise((done, reject) => {
        server.once('error', reject);
        server.listen(0, '127.0.0.1', done);
    });
    return `http://127.0.0.1:${server.address().port}/`;
}

async function observe (currentPage, journey) {
    journey.compileRequests = [];
    // The real WASM response exceeds Chromium's ordinary inspector body cache.
    // Observe it through a separate, bounded CDP buffer. This is read-only:
    // no request is rerouted, fulfilled, changed or answered by the observer.
    const cdp = await currentPage.context().newCDPSession(currentPage);
    const largeRequests = new Set();
    const largeResponses = new Map();
    await cdp.send('Network.enable', {maxTotalBufferSize: 96 * 1024 * 1024,
        maxResourceBufferSize: 64 * 1024 * 1024});
    cdp.on('Network.requestWillBeSent', event => {
        if (event.request.method === 'GET' && new URL(event.request.url).pathname.endsWith('/static/labwired/labwired_wasm_bg.wasm')) {
            largeRequests.add(event.requestId);
        }
    });
    cdp.on('Network.responseReceived', event => {
        const {url, status} = event.response;
        if (!largeRequests.has(event.requestId) || status !== 200) return;
        const key = `${journey.id}:${++assetSequence}:${url}`;
        largeResponses.set(event.requestId, {key, url, status});
        assets.set(key, {journey: journey.id, url, status, resourceType: 'fetch', pending: true});
    });
    cdp.on('Network.loadingFinished', event => {
        const observed = largeResponses.get(event.requestId);
        if (!observed) return;
        largeRequests.delete(event.requestId);
        largeResponses.delete(event.requestId);
        pendingResponses.push(cdp.send('Network.getResponseBody', {requestId: event.requestId}).then(body => {
            const bytes = Buffer.from(body.body, body.base64Encoded ? 'base64' : 'utf8');
            assets.set(observed.key, {journey: journey.id, url: observed.url, status: observed.status,
                resourceType: 'fetch', bytes: bytes.length, sha256: sha256(bytes), observedVia: 'passive CDP response buffer'});
        }).catch(error => {
            assets.set(observed.key, {journey: journey.id, url: observed.url, status: observed.status,
                resourceType: 'fetch', error: String(error)});
        }));
    });
    currentPage.on('pageerror', error => diagnostics.push({journey: journey.id, kind: 'pageerror', message: String(error.stack || error)}));
    currentPage.on('console', message => {
        if (message.type() === 'error') diagnostics.push({journey: journey.id, kind: 'console.error', message: message.text()});
    });
    currentPage.on('request', request => {
        if (/\/static\/esp32s3\//.test(request.url())) journey.romRequests.push({url: request.url(), method: request.method()});
        if (new URL(request.url()).pathname.endsWith('/compile')) {
            journey.compileRequests.push({url: request.url(), method: request.method()});
        }
    });
    currentPage.on('requestfailed', request => {
        const reason = request.failure()?.errorText || '';
        if (request.method() === 'HEAD' && /labwired_wasm_bg\.wasm/.test(request.url()) && reason === 'net::ERR_ABORTED') return;
        diagnostics.push({journey: journey.id, kind: 'requestfailed', url: request.url(), reason});
    });
    currentPage.on('response', response => {
        const request = response.request();
        if (request.method() !== 'GET' || !response.ok()) return;
        const url = response.url();
        if (new URL(url).origin !== new URL(appUrl).origin) return;
        if (new URL(url).pathname.endsWith('/static/labwired/labwired_wasm_bg.wasm')) return; // Captured above, with an adequate body buffer.
        if (!['document', 'script'].includes(request.resourceType()) && !/\/static\/(labwired|esp32s3)\//.test(url)) return;
        const key = `${journey.id}:${++assetSequence}:${url}`;
        const identity = {journey: journey.id, url, status: response.status(), resourceType: request.resourceType(),
            mainDocument: request.resourceType() === 'document' && request.frame() === currentPage.mainFrame()};
        assets.set(key, {...identity, pending: true});
        pendingResponses.push(response.body().then(bytes => {
            assets.set(key, {...identity, bytes: bytes.length, sha256: sha256(bytes)});
        }).catch(error => {
            assets.set(key, {...identity, error: String(error)});
        }));
    });
}

async function openApp (journey, fault) {
    const context = await browser.newContext({viewport: {width: 1600, height: 1100}, locale: 'en-US', serviceWorkers: 'block'});
    if (fault) {
        const suffix = `/static/esp32s3/${ESP32S3_FLASH_BOOT_ROMS[fault.name].filename}`;
        await context.route(url => url.pathname.endsWith(suffix), async route => {
            journey.withheld.push({url: route.request().url(), mode: fault.mode, name: fault.name});
            if (fault.mode === 'missing') return route.fulfill({status: 404, body: 'ROM deliberately unavailable in acceptance control'});
            return route.fulfill({status: 200, contentType: 'application/octet-stream', body: fault.bytes});
        });
    }
    page = await context.newPage();
    await observe(page, journey);
    await page.addInitScript(() => {
        localStorage.clear();
        localStorage.setItem('bw-starter-v1-complete', '1');
        localStorage.setItem('bw-right-pane-hidden', '0');
        localStorage.setItem('bw-debug-dock', 'right');
    });
    const navigation = await page.goto(appUrl, {waitUntil: 'domcontentloaded', timeout});
    assert.ok(navigation?.ok(), 'The application navigation must return its main document');
    journey.documentUrl = navigation.url();
    await page.getByRole('tab', {name: 'Code', exact: true}).click();
    // A fresh, empty project must expose the real picker without creating
    // PIN/PART declarations or compiling an unrelated block program.
    await page.getByTestId('bw-open-circuit-debugger').click();
    const panel = page.locator('[data-debug-panel]:visible');
    await panel.waitFor({state: 'visible', timeout: 45_000});
    check(`${journey.id}: one visible production debugger`, await panel.count() === 1);
    check(`${journey.id}: firmware entry requires no program declaration`,
        await page.locator('[data-no-code-indicator]:visible').count() === 0);
    check(`${journey.id}: empty debugger reports that no image is loaded`,
        await panel.locator('[data-debug-no-image]:visible').count() === 1);
    const engine = panel.locator('select').filter({has: page.locator('option[value="labwired"]')});
    await engine.waitFor({state: 'visible', timeout: 30_000});
    await engine.selectOption('labwired');
    const chips = panel.locator('select').filter({has: page.locator(`option[value="${explicitTarget}"]`)});
    await chips.waitFor({state: 'visible', timeout: 30_000});
    await chips.selectOption(explicitTarget);
    await panel.locator('[data-esp32s3-console]').selectOption('uart0');
    check(`${journey.id}: explicit firmware target and UART0 selected`,
        await engine.inputValue() === 'labwired' && await chips.inputValue() === explicitTarget &&
        await panel.locator('[data-esp32s3-console]').inputValue() === 'uart0');
    const consoleBounds = await panel.locator('[data-esp32s3-console]').boundingBox();
    const panelBounds = await panel.boundingBox();
    const viewport = page.viewportSize();
    check(`${journey.id}: console control fits the debugger pane and viewport`, consoleBounds && panelBounds &&
        consoleBounds.x >= panelBounds.x && consoleBounds.x + consoleBounds.width <= panelBounds.x + panelBounds.width &&
        consoleBounds.x >= 0 && consoleBounds.x + consoleBounds.width <= viewport.width &&
        consoleBounds.y >= 0 && consoleBounds.y + consoleBounds.height <= viewport.height,
    {consoleBounds, panelBounds, viewport});
    return {context, panel, chips};
}

async function chooseFile (panel, file) {
    // A running target also exposes a debugger-session import input. Select
    // the firmware picker by its admitted file types, not by its current order.
    const picker = panel.locator('input[type="file"][accept*=".bin"]');
    check(`${file.name}: one firmware file picker`, await picker.count() === 1);
    await picker.setInputFiles(file.path || {name: file.name, mimeType: 'application/octet-stream', buffer: file.buffer});
    await page.waitForFunction(name => document.querySelector('[data-firmware-chip]')?.textContent.includes(name), file.name);
    check(`${file.name}: picker reaches idle with no stale UART text`,
        await panel.getAttribute('data-debug-phase') === 'idle' && await serialText(panel) === '');
    check(`${file.name}: loaded firmware clears the empty-image status`,
        await panel.locator('[data-debug-no-image]').count() === 0);
}

async function serialText (panel) {
    const consoleBox = panel.getByTestId('bw-serial-console');
    return await consoleBox.count() ? (await consoleBox.textContent()) || '' : '';
}

async function run (panel) {
    await panel.locator('[data-debug-run]').click();
    await page.waitForFunction(() => ['running', 'error'].includes(
        document.querySelector('[data-debug-panel]')?.getAttribute('data-debug-phase')), null, {timeout});
}

async function capture (id, panel) {
    const serial = await serialText(panel);
    await writeFile(join(artifacts, `${id}.txt`), await panel.innerText());
    const consoleBox = panel.getByTestId('bw-serial-console');
    if (await consoleBox.count()) await consoleBox.evaluate(el => { el.scrollTop = el.scrollHeight; });
    await page.screenshot({path: join(artifacts, `${id}.png`), fullPage: false});
    return serial;
}

async function awaitMarkers (panel, markers, previous = '') {
    await page.waitForFunction(({needles, before}) => {
        const text = document.querySelector('[data-testid="bw-serial-console"]')?.textContent || '';
        return needles.every(marker => text.split(marker).length > before.split(marker).length);
    }, {needles: markers, before: previous}, {timeout});
    const serial = await serialText(panel);
    const fresh = previous ? serial.slice(previous.length) : serial;
    let last = -1;
    for (const marker of markers) {
        const at = fresh.indexOf(marker, last + 1);
        check(`UART0 emits fresh ${marker}`, at >= 0);
        last = at;
    }
    return serial;
}

async function positive (panel, fw, journey) {
    const file = {name: basename(fw.file), path: fw.path};
    await chooseFile(panel, file);
    await run(panel);
    check(`${fw.id}: image starts`, await panel.getAttribute('data-debug-phase') === 'running', await panel.innerText());
    const first = await awaitMarkers(panel, fw.markers);
    const bootBanner = first.split('\n').find(line => line.startsWith('ESP-ROM:'));
    check(`${fw.id}: actual reset ROM announces itself`, Boolean(bootBanner));
    journey.firmware = {id: fw.id, file: fw.file, bytes: fw.bytes, sha256: fw.sha256,
        markers: fw.markers, provenance: fw.provenance || null};
    journey.serialSha256 = sha256(first);
    await capture(`${fw.id}-first-boot`, panel);
    const stop = panel.getByRole('button', {name: /^⏹\s*Stop$/});
    await stop.click();
    await page.waitForFunction(() => document.querySelector('[data-debug-panel]')?.dataset.debugPhase === 'idle');
    const stopped = await serialText(panel);
    check(`${fw.id}: Stop returns to idle and reenables file loading`,
        await stop.isDisabled() && await panel.locator('input[type="file"][accept*=".bin"]').isEnabled());
    await run(panel);
    check(`${fw.id}: restart runs`, await panel.getAttribute('data-debug-phase') === 'running', await panel.innerText());
    const restarted = await awaitMarkers(panel, [bootBanner, ...fw.markers], stopped);
    journey.restartSerialSha256 = sha256(restarted);
    await capture(`${fw.id}-restart`, panel);
    await stop.click();
    await page.waitForFunction(() => document.querySelector('[data-debug-panel]')?.dataset.debugPhase === 'idle');
}

async function refusal (panel, file, expected, id, journey) {
    await chooseFile(panel, file);
    const romsBefore = journey.romRequests.length;
    await run(panel);
    const text = await panel.innerText();
    check(`${id}: visible refusal`, await panel.getAttribute('data-debug-phase') === 'error' && expected.test(text), text);
    check(`${id}: no UART success output`, await serialText(panel) === '');
    check(`${id}: refused file is labeled loaded, not running`,
        /\bloaded\b/.test(await panel.locator('[data-firmware-chip]').textContent()) &&
        !/\brunning\b/.test(await panel.locator('[data-firmware-chip]').textContent()));
    check(`${id}: image rejected before ROM fetch`, journey.romRequests.length === romsBefore);
    journey.refusals = [...(journey.refusals || []), {id, name: file.name,
        sha256: sha256(file.buffer || await readFile(file.path)), message: text}];
    await capture(id, panel);
}

function extractApp (firmware) {
    for (let at = 0x8000; at < 0x8c00; at += 32) {
        if (firmware.readUInt16LE(at) !== 0x50aa) break;
        if (firmware[at + 2] !== 0) continue;
        const offset = firmware.readUInt32LE(at + 4);
        if (offset >= firmware.length || firmware[offset] !== 0xe9) continue;
        let end = offset + 24;
        for (let segment = 0; segment < firmware[offset + 1]; segment++) {
            const bytes = firmware.readUInt32LE(end + 4);
            end += 8 + bytes;
            assert.ok(end < firmware.length, 'retained application segments must fit');
        }
        end = offset + Math.ceil((end - offset + 1) / 16) * 16 + (firmware[offset + 23] === 1 ? 32 : 0);
        assert.ok(end <= firmware.length);
        return {offset, end, buffer: Buffer.from(firmware.subarray(offset, end))};
    }
    throw new Error('retained fixture has no extractable app image');
}

await mkdir(artifacts, {recursive: true});
try {
    if (!process.env.CI && process.env.BW_ALLOW_LOCAL_BROWSER_PROOF !== '1') {
        throw new Error('Set BW_ALLOW_LOCAL_BROWSER_PROOF=1 explicitly for this local full-app proof');
    }
    report.source = await sourceIdentity();
    const rawManifest = await readFile(manifestFile);
    const manifest = JSON.parse(rawManifest.toString('utf8'));
    report.fixtureSourceIdentity = admitEsp32S3FirmwareIdentity({manifest,
        romSource: ESP32S3_FLASH_BOOT_ROM_SOURCE,
        engineSyncSource: await readFile(join(root, 'scripts/sync-labwired-wasm.mjs'), 'utf8')});
    check('retained firmware and ROM provenance agrees independently of the pinned engine release', true,
        report.fixtureSourceIdentity);
    check('both retained firmware inputs are required', JSON.stringify(manifest.firmware.map(f => f.file).sort()) ===
        JSON.stringify(['firmware/esp32s3-arduino-flash.bin', 'firmware/esp32s3-flash.bin']));
    for (const fw of manifest.firmware) {
        assert.match(fw.id, /^[a-z0-9-]+$/);
        assert.equal(fw.id, fw.file === 'firmware/esp32s3-flash.bin' ? 'rust-tier1' : 'arduino',
            'use the corrected supplier provenance: the tier-1 application is Rust esp-hal, with an ESP-IDF bootloader');
        assert.equal(fw.console, 'uart0');
        assert.ok(fw.markers.length > 0 && fw.markers.every(marker => typeof marker === 'string' && marker.length));
    }
    report.fixtureManifest = {path: manifestFile, sha256: sha256(rawManifest), content: manifest};
    const firmware = await Promise.all(manifest.firmware.map(pinnedInput));
    const roms = Object.fromEntries(await Promise.all(Object.entries(ESP32S3_FLASH_BOOT_ROMS).map(async ([name, descriptor]) =>
        [name, await pinnedInput({...descriptor, file: `roms/${descriptor.filename}`})])));
    report.roms = ESP32S3_FLASH_BOOT_ROMS;
    await readFile(join(build, 'index.html')); // Remote proof also needs the corresponding local build.
    if (!appUrl) appUrl = await serveBuild();
    report.url = appUrl;
    const executablePath = process.env.BW_BROWSER_PATH || undefined;
    browser = await chromium.launch({headless: true, ...(executablePath ? {executablePath} : {})});
    const playwrightPackage = JSON.parse(await readFile(fileURLToPath(import.meta.resolve('playwright/package.json')), 'utf8'));
    const browserManifest = JSON.parse(await readFile(join(dirname(fileURLToPath(import.meta.resolve('playwright-core/package.json'))), 'browsers.json'), 'utf8'));
    report.browser = {version: browser.version(), playwright: playwrightPackage.version,
        requestedExecutable: executablePath || null, playwrightDefaultExecutable: chromium.executablePath(), override: Boolean(executablePath),
        qualification: executablePath ? 'provisional explicit browser override' : 'installed Playwright browser',
        pinnedChromium: browserManifest.browsers.filter(b => ['chromium', 'chromium-headless-shell'].includes(b.name))};
    const main = {id: 'firmware-controls', romRequests: [], withheld: []};
    report.journeys.push(main);
    const {context, panel, chips} = await openApp(main);
    const compileBefore = main.compileRequests.length;
    const romsBefore = main.romRequests.length;
    await run(panel);
    const noFileText = await panel.innerText();
    check('empty firmware picker reports the explicit merged-image requirement',
        await panel.getAttribute('data-debug-phase') === 'error' &&
        noFileText.includes('load a merged .bin firmware file before starting ROM boot'), noFileText);
    check('empty firmware picker neither compiles unrelated code nor fetches ROMs',
        main.compileRequests.length === compileBefore && main.romRequests.length === romsBefore,
    {compileBefore, compileAfter: main.compileRequests.length, romsBefore, romsAfter: main.romRequests.length});
    await capture('no-firmware-refused', panel);
    report.servedBuild = await fetchFirmwareBrowserProducer({request: context.request, documentUrl: main.documentUrl});
    for (const fw of firmware) {
        const journey = {id: fw.id};
        report.journeys.push(journey);
        await positive(panel, fw, journey);
    }
    const retained = firmware.find(fw => fw.file === 'firmware/esp32s3-flash.bin');
    await chips.selectOption('esp32s3');
    check('ordinary ESP32-S3 selector is separate and hides merged-flash console controls',
        await chips.inputValue() === 'esp32s3' && await panel.locator('[data-esp32s3-console]').count() === 0);
    await refusal(panel, {name: basename(retained.file), path: retained.path}, /LabWired engine takes an ELF.*raw \.bin/s,
        'ordinary-s3-refuses-raw-bin', main);
    await chips.selectOption(explicitTarget);
    const wrongChip = Buffer.from(retained.buffer);
    wrongChip.writeUInt16LE(0, 12);
    await refusal(panel, {name: 'wrong-chip.bin', buffer: wrongChip}, /bootloader is not an ESP32-S3 image \(chip id 9\)/,
        'wrong-chip-refused', main);
    const appOnly = extractApp(retained.buffer);
    report.appOnlyControl = {sourceSha256: retained.sha256, offset: appOnly.offset, end: appOnly.end,
        bytes: appOnly.buffer.length, sha256: sha256(appOnly.buffer)};
    await refusal(panel, {name: 'app-only.bin', buffer: appOnly.buffer}, /app-only|partition|bootloader.*bounds/s,
        'app-only-refused', main);
    await Promise.all(pendingResponses);
    await context.close();

    for (const name of ['irom', 'drom']) for (const mode of ['missing', 'corrupt']) {
        const journey = {id: `${mode}-${name}`, romRequests: [], withheld: []};
        report.journeys.push(journey);
        const corrupt = Buffer.from(roms[name].buffer);
        corrupt[Math.floor(corrupt.length / 2)] ^= 1; // Same length, wrong identity.
        const view = await openApp(journey, {name, mode, bytes: corrupt});
        await chooseFile(view.panel, {name: basename(retained.file), path: retained.path});
        await run(view.panel);
        const text = await view.panel.innerText();
        const expected = mode === 'missing' ? `${name} ROM is unavailable` : `${name} ROM SHA-256 does not match the pinned ROM`;
        check(`${journey.id}: named visible ROM refusal`,
            await view.panel.getAttribute('data-debug-phase') === 'error' && text.includes(expected), text);
        check(`${journey.id}: actual ROM request was withheld`, journey.withheld.length > 0);
        check(`${journey.id}: no firmware output escapes`, await serialText(view.panel) === '');
        journey.message = text;
        if (mode === 'corrupt') journey.substituted = {bytes: corrupt.length, sha256: sha256(corrupt)};
        await capture(journey.id, view.panel);
        await Promise.all(pendingResponses);
        await view.context.close();
    }
    // Bind the engine that the browser actually fetched to the existing
    // synchronizer's immutable pins; Node glue is not a web-engine substitute.
    const sync = await readFile(join(root, 'scripts/sync-labwired-wasm.mjs'), 'utf8');
    for (const name of ['labwired_wasm.js', 'labwired_wasm_bg.wasm']) {
        const expected = sync.match(new RegExp(`'web-${name.replaceAll('.', '\\.')}': '([0-9a-f]{64})'`))?.[1];
        assert.ok(expected, `missing existing web asset pin: ${name}`);
        const observed = [...assets.values()].filter(asset => asset.journey === main.id &&
            new URL(asset.url).pathname.endsWith(`/static/labwired/${name}`));
        check(`browser used pinned ${name}`, observed.length > 0 && observed.every(asset => asset.sha256 === expected), observed);
    }
    for (const [name, descriptor] of Object.entries(ESP32S3_FLASH_BOOT_ROMS)) {
        const observed = [...assets.values()].filter(asset => asset.journey === main.id &&
            new URL(asset.url).pathname.endsWith(`/static/esp32s3/${descriptor.filename}`));
        check(`positive firmware boot fetched admitted ${name}`, observed.length > 0 &&
            observed.every(asset => asset.bytes === descriptor.bytes && asset.sha256 === descriptor.sha256), observed);
    }
    check('all full-app journeys completed without an uncaught page error',
        !diagnostics.some(entry => entry.kind === 'pageerror'), diagnostics.filter(entry => entry.kind === 'pageerror'));
    await Promise.all(pendingResponses);
    report.sourceAfter = await verifyFirmwareBrowserSourceUnchanged({root, source: report.source});
    report.buildEvidence = await verifyFirmwareBrowserBuild({build, appUrl, assets: [...assets.values()],
        source: {...report.source, dirty: report.source.dirty || report.sourceAfter.dirty},
        producer: report.servedBuild, browserOverride: Boolean(executablePath)});
    check('observed application and web-engine bytes match the local build with unchanged proof source', true,
        {mode: report.buildEvidence.mode, qualification: report.buildEvidence.qualification,
            responses: report.buildEvidence.responses.length});
    report.ok = true;
} catch (error) {
    failure = error;
    report.ok = false;
    report.error = String(error.stack || error);
    console.error(report.error);
    if (page && !page.isClosed()) {
        try { await page.screenshot({path: join(artifacts, 'failure.png'), fullPage: false}); }
        catch (screenshotError) { diagnostics.push({kind: 'screenshot-error', message: String(screenshotError)}); }
    }
} finally {
    await Promise.all(pendingResponses);
    report.assets = [...assets.values()];
    report.finished = new Date().toISOString();
    await writeFile(join(artifacts, 'report.json'), JSON.stringify(report, null, 2) + '\n');
    if (browser) await browser.close();
    if (server) await new Promise(done => server.close(done));
    console.log(`Evidence: ${join(artifacts, 'report.json')}`);
}
if (failure) process.exitCode = 1;
