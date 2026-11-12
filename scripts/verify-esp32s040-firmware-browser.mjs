#!/usr/bin/env node
/**
 * Actual Lite firmware -> placed S040 face -> GT911 -> guest redraw proof.
 *
 * Requires the installed supplier's QUALIFIED release fixture set, fetched by
 * node node_modules/bw-board/scripts/fetch-esp32s040-fixtures.mjs --out <dir>.
 * BW_ESP32S040_INPUTS selects that directory; PROOF_URL selects a served build.
 * Both modes require matching local packages/scratch-gui/build bytes; without
 * PROOF_URL that directory is also served here. All missing inputs,
 * controls, frames and release identities fail; candidate builds cannot pass.
 *
 * Circuits and firmware enter through real file pickers. Run/Stop, selectors
 * and pointer gestures use public controls. Page evaluation only observes DOM,
 * canvas pixels, the existing circuit and the existing runner. It never writes
 * VM, target, engine, project or input state. Expected pixels stay in Node.
 */
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {createServer} from 'node:http';
import {mkdir, readFile, writeFile} from 'node:fs/promises';
import {basename, dirname, extname, join, resolve, sep} from 'node:path';
import {fileURLToPath, pathToFileURL} from 'node:url';
import {chromium} from 'playwright';
import {openCircuitActions, circuitFileControl} from './lib/circuit-actions.mjs';
import {captureFirmwareBrowserSource, fetchFirmwareBrowserProducer, verifyFirmwareBrowserBuild,
    verifyFirmwareBrowserSourceUnchanged} from './lib/firmware-browser-build.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const build = join(root, 'packages/scratch-gui/build');
const supplier = dirname(fileURLToPath(import.meta.resolve('bw-board/package.json')));
const inputs = resolve(process.env.BW_ESP32S040_INPUTS || join(root, 'artifacts/esp32s040/inputs'));
const artifacts = resolve(process.env.ESP32S040_BROWSER_ARTIFACTS || join(root, 'artifacts/esp32s040-firmware-browser'));
const elfTarget = 'board:esp32-4848s040';
const flashTarget = 'firmware:esp32-4848s040-merged-flash';
const header = ['gnd', 'gnd2', 'gpio40', 'gpio44', 'gpio2', 'gpio43', 'gpio1', '5v'];
const timeout = 90_000;
const sha256 = bytes => createHash('sha256').update(bytes).digest('hex');
const results = [], diagnostics = [], assets = new Map(), pending = [];
let assetSequence = 0;
const requests = {compile: [], roms: []};
const report = {schema: 1, started: new Date().toISOString(), results, diagnostics, requests,
    frames: [], journeys: [], runtime: {node: process.version, platform: process.platform, arch: process.arch}};
let browser, context, page, server, panel, chips, designer, failure;
let appUrl = process.env.PROOF_URL || null;

function check (name, ok, detail) {
    results.push({name, ok: Boolean(ok), ...(detail === undefined ? {} : {detail})});
    console.log(`${ok ? 'PASS' : 'FAIL'}: ${name}`);
    assert.ok(ok, `${name}${detail === undefined ? '' : `: ${JSON.stringify(detail)}`}`);
}

async function sourceIdentity () {
    const pins = JSON.parse(await readFile(join(root, 'vendor-pins.json'), 'utf8'));
    const lock = JSON.parse(await readFile(join(root, 'package-lock.json'), 'utf8'));
    for (const name of ['bw-board', 'bw-circuit-ui']) {
        const resolved = lock.packages?.[`node_modules/${name}`]?.resolved;
        check(`exact ${name} supplier pin is recorded by the install`,
            /^[0-9a-f]{40}$/.test(pins[name]) && resolved?.endsWith(`#${pins[name]}`), resolved);
    }
    const paths = ['vendor-pins.json', 'package.json', 'package-lock.json',
        'packages/scratch-gui/package.json', 'packages/scratch-gui/package-lock.json',
        'scripts/sync-labwired-wasm.mjs', 'scripts/sync-esp32s3-roms.mjs', 'scripts/integrate.mjs',
        'scripts/verify-esp32s040-firmware-browser.mjs', 'scripts/lib/circuit-actions.mjs', 'scripts/lib/firmware-browser-build.mjs',
        'overlay/scratch-gui/webpack.config.js', 'packages/scratch-gui/webpack.config.js',
        'overlay/scratch-gui/src/components/tw-pseudocode/debug-panel.jsx',
        'overlay/scratch-gui/src/components/tw-pseudocode/circuit-tab.jsx',
        'overlay/scratch-gui/src/lib/bw-debug/debug-runner.js',
        'overlay/scratch-gui/src/lib/bw-debug/esp32s3-firmware.js',
        'packages/scratch-gui/src/components/tw-pseudocode/debug-panel.jsx',
        'packages/scratch-gui/src/components/tw-pseudocode/circuit-tab.jsx',
        'packages/scratch-gui/src/lib/bw-debug/debug-runner.js',
        'packages/scratch-gui/src/lib/bw-debug/esp32s3-firmware.js'];
    return {...await captureFirmwareBrowserSource({root, paths}), pins, supplierPath: supplier};
}

async function serveBuild () {
    await readFile(join(build, 'index.html'));
    const mime = {'.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json',
        '.wasm': 'application/wasm', '.svg': 'image/svg+xml', '.png': 'image/png', '.woff2': 'font/woff2'};
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
        } catch { if (!res.headersSent) res.writeHead(404); res.end('not found'); }
    });
    await new Promise((done, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', done); });
    return `http://127.0.0.1:${server.address().port}/`;
}

async function observe () {
    // The WASM is larger than Chromium's ordinary response-body cache. This
    // independent observer increases only its read buffer; it does not route.
    const cdp = await context.newCDPSession(page);
    const wasmRequests = new Set();
    const wasm = new Map();
    await cdp.send('Network.enable', {maxTotalBufferSize: 96 * 1024 * 1024, maxResourceBufferSize: 64 * 1024 * 1024});
    cdp.on('Network.requestWillBeSent', ({requestId, request}) => {
        if (request.method === 'GET' && new URL(request.url).pathname.endsWith('/static/labwired/labwired_wasm_bg.wasm')) {
            wasmRequests.add(requestId);
        }
    });
    cdp.on('Network.responseReceived', ({requestId, response}) => {
        if (wasmRequests.has(requestId) && response.status === 200) {
            const observed = {url: response.url, status: response.status, resourceType: 'fetch'};
            const key = `${++assetSequence}:${response.url}`;
            wasm.set(requestId, {key, observed});
            assets.set(key, {...observed, pending: true});
        }
    });
    cdp.on('Network.loadingFinished', ({requestId}) => {
        if (!wasm.has(requestId)) return;
        const {key, observed} = wasm.get(requestId); wasm.delete(requestId);
        wasmRequests.delete(requestId);
        pending.push(cdp.send('Network.getResponseBody', {requestId}).then(body => {
            const bytes = Buffer.from(body.body, body.base64Encoded ? 'base64' : 'utf8');
            assets.set(key, {...observed, bytes: bytes.length, sha256: sha256(bytes), observedVia: 'passive CDP response buffer'});
        }).catch(error => assets.set(key, {...observed, error: String(error)})));
    });
    page.on('pageerror', error => diagnostics.push({kind: 'pageerror', message: String(error.stack || error)}));
    page.on('console', message => {
        if (message.type() === 'error') diagnostics.push({kind: 'console.error', message: message.text()});
    });
    page.on('request', request => {
        const url = new URL(request.url());
        if (url.pathname.endsWith('/compile')) requests.compile.push({url: url.href, method: request.method()});
        if (url.pathname.includes('/static/esp32s3/')) requests.roms.push({url: url.href, method: request.method()});
    });
    page.on('response', response => {
        const request = response.request(), url = response.url();
        if (request.method() !== 'GET' || !response.ok() || new URL(url).origin !== new URL(appUrl).origin ||
            new URL(url).pathname.endsWith('/static/labwired/labwired_wasm_bg.wasm')) return;
        if (!['document', 'script'].includes(request.resourceType()) && !/\/static\/(labwired|esp32s3)\//.test(url)) return;
        const key = `${++assetSequence}:${url}`;
        const identity = {url, status: response.status(), resourceType: request.resourceType(),
            mainDocument: request.resourceType() === 'document' && request.frame() === page.mainFrame()};
        assets.set(key, {...identity, pending: true});
        pending.push(response.body().then(bytes => assets.set(key, {...identity, bytes: bytes.length, sha256: sha256(bytes)}))
            .catch(error => assets.set(key, {...identity, error: String(error)})));
    });
}

async function openApp () {
    context = await browser.newContext({viewport: {width: 1600, height: 1100}, locale: 'en-US', serviceWorkers: 'block'});
    page = await context.newPage();
    await observe();
    await page.addInitScript(() => {
        localStorage.clear();
        localStorage.setItem('bw-starter-v1-complete', '1');
        localStorage.setItem('bw-right-pane-hidden', '0');
        localStorage.setItem('bw-debug-dock', 'right');
    });
    const navigation = await page.goto(appUrl, {waitUntil: 'domcontentloaded', timeout});
    assert.ok(navigation?.ok(), 'The application navigation must return its main document');
    report.documentUrl = navigation.url();
    await page.getByRole('tab', {name: 'Code', exact: true}).click();
    await page.getByTestId('bw-open-circuit-debugger').click();
    panel = page.locator('[data-debug-panel]:visible');
    await panel.waitFor({state: 'visible', timeout: 45_000});
    check('empty project exposes one real debugger without PIN/PART declarations',
        await panel.count() === 1 && await page.locator('[data-no-code-indicator]:visible').count() === 0);
    const engine = panel.locator('select').filter({has: page.locator('option[value="labwired"]')});
    await engine.selectOption('labwired');
    chips = panel.locator('select').filter({has: page.locator(`option[value="${elfTarget}"]`)});
    await chips.waitFor({state: 'visible', timeout: 30_000});
    await chips.selectOption(elfTarget);
    check('both trusted S040 firmware selectors are production catalog options',
        await chips.locator(`option[value="${elfTarget}"]`).count() === 1 &&
        await chips.locator(`option[value="${flashTarget}"]`).count() === 1);
    await page.getByRole('tab', {name: /Circuit/}).click();
    designer = page.locator('.bw-circuit-designer:visible').last();
    await designer.locator('[data-canvas]').waitFor({timeout});
}

function circuit (ids) {
    return {vcc: 3.3, parts: ids.map((id, n) => ({id, kind: 'esp32_4848s040', params: {},
        x: 300 + n * 470, y: 260, terminals: header})), wires: [], holeWires: []};
}

async function loadCircuit (ids) {
    const fixture = circuit(ids);
    const menu = await openCircuitActions(page, designer);
    const choosing = page.waitForEvent('filechooser');
    await (await circuitFileControl(menu, 'open')).click();
    await (await choosing).setFiles({name: `s040-${ids.join('-') || 'empty'}.json`, mimeType: 'application/json',
        buffer: Buffer.from(JSON.stringify(fixture))});
    await page.waitForFunction(expected => {
        const actual = window.__circuit?.parts?.filter(p => p.kind === 'esp32_4848s040').map(p => p.id).sort();
        return JSON.stringify(actual) === JSON.stringify(expected.slice().sort());
    }, ids, {timeout});
    check(`real circuit file loads ${ids.join(', ') || 'no S040 parts'}`,
        await designer.locator('[data-board-face="esp32_4848s040"]').count() === ids.length);
    report.journeys.push({circuit: fixture, sha256: sha256(Buffer.from(JSON.stringify(fixture)))});
}

async function chooseFile (name, bytes) {
    const picker = panel.locator('input[type="file"][accept*=".bin"]');
    check(`${name}: one real firmware picker`, await picker.count() === 1);
    await picker.setInputFiles({name, mimeType: 'application/octet-stream', buffer: bytes});
    await page.waitForFunction(name => document.querySelector('[data-firmware-chip]')?.textContent.includes(name), name);
    check(`${name}: file load clears the prior run`, await panel.getAttribute('data-debug-phase') === 'idle');
}

async function run () {
    await panel.locator('[data-debug-run]').click();
    await page.waitForFunction(() => ['running', 'error'].includes(
        document.querySelector('[data-debug-panel]')?.dataset.debugPhase), null, {timeout});
}

async function stop ({held = false} = {}) {
    const button = panel.getByRole('button', {name: /^⏹\s*Stop$/});
    // Enter stops while the physical mouse button remains held; clicking would
    // first release pointer capture and would miss the host teardown case.
    if (held) { await button.focus(); await button.press('Enter'); }
    else await button.click();
    await page.waitForFunction(() => document.querySelector('[data-debug-panel]')?.dataset.debugPhase === 'idle');
    await page.waitForFunction(() => !document.querySelector('[data-esp32-s040-owner]:not([data-esp32-s040-owner=""])'));
    check('Stop removes the selected face owner and disables all touch surfaces',
        await designer.locator('[data-esp32-s040-touch][aria-disabled="false"]').count() === 0);
    if (held) await page.mouse.up();
}

// Observe the actual panel's existing public runner without adding a test
// global or invoking any state-changing runner method. React's private link is
// used only to find that owner; absence fails this proof rather than patching it.
async function snapshot () {
    return panel.evaluate(el => {
        const key = Object.keys(el).find(k => k.startsWith('__reactFiber$') || k.startsWith('__reactInternalInstance$'));
        let owner;
        for (let fiber = el[key]; fiber; fiber = fiber.return) {
            if (fiber.stateNode?.state?.runner && typeof fiber.stateNode.state.runner.readMem === 'function') {
                owner = fiber.stateNode; break;
            }
        }
        if (!owner) throw new Error('actual debugger runner cannot be observed');
        const runner = owner.state.runner;
        const frame = typeof runner.video === 'function' ? runner.video() : null;
        const counter = runner.readMem('sram', 0x3fc91800, 4);
        return {phase: owner.state.ui.phase, partId: runner.esp32S040PartId ?? null,
            guestFrames: counter.length === 4 ? new DataView(Uint8Array.from(counter).buffer).getUint32(0, true) : null,
            video: frame && {width: frame.width, height: frame.height, frame: frame.frame, signal: frame.signal, panel: frame.panel},
            runtimePartIds: owner.props.vm?.runtime?.bwRunBoard?.parts?.map(p => p.id) || [],
            actualCircuit: window.__circuit?.parts?.map(p => ({id: p.id, kind: p.kind, terminals: p.terminals}))};
    });
}

const rgba565 = value => Uint8ClampedArray.from([
    (value >>> 11) * 255 / 31, ((value >>> 5) & 63) * 255 / 63, (value & 31) * 255 / 31, 255]);
function expectedFrame (pixel0) {
    const bytes = new Uint8Array(480 * 480 * 4);
    for (let y = 0; y < 480; y++) for (let x = 0; x < 480; x++) {
        const color = y < 240 ? (x < 240 ? 0xf800 : 0x07e0) : (x < 240 ? 0x001f : 0xffff);
        bytes.set(rgba565(color), (y * 480 + x) * 4);
    }
    bytes.set(rgba565(pixel0), 0);
    return sha256(bytes);
}

async function frame (id, pixel0, label) {
    const owner = designer.locator(`[data-esp32-s040-owner=${JSON.stringify(id)}]`);
    const canvas = owner.locator('canvas');
    await owner.locator('[data-esp32-s040-live-face="live"]').waitFor({timeout});
    const expectedPixel = [...rgba565(pixel0)];
    await page.waitForFunction(({id, pixel}) => {
        const canvas = document.querySelector(`[data-esp32-s040-owner="${id}"] canvas`);
        return canvas && [...canvas.getContext('2d').getImageData(0, 0, 1, 1).data].every((v, n) => v === pixel[n]);
    }, {id, pixel: expectedPixel}, {timeout});
    const pixels = await canvas.evaluate(async el => {
        const data = el.getContext('2d').getImageData(0, 0, el.width, el.height).data;
        const hash = await crypto.subtle.digest('SHA-256', data);
        return {width: el.width, height: el.height, bytes: data.length,
            sha256: [...new Uint8Array(hash)].map(n => n.toString(16).padStart(2, '0')).join('')};
    });
    const actual = await snapshot();
    check(`${label}: all 480 × 480 visible pixels match the independent guest frame`,
        pixels.width === 480 && pixels.height === 480 && pixels.bytes === 480 * 480 * 4 &&
        pixels.sha256 === expectedFrame(pixel0), pixels);
    check(`${label}: one real selected part owns the live engine display and input`,
        actual.partId === id && actual.runtimePartIds.includes(id) && actual.video?.signal === true &&
        actual.video.panel?.powered === true && actual.video.panel?.displayOn === true &&
        actual.video.panel?.backlightOn === true && actual.video.panel?.sleeping === false &&
        await designer.locator('[data-esp32-s040-owner]:not([data-esp32-s040-owner=""])').count() === 1 &&
        await owner.locator('[data-esp32-s040-touch]').getAttribute('aria-disabled') === 'false', actual);
    report.frames.push({label, pixels, observed: actual});
    await page.screenshot({path: join(artifacts, `${label}.png`), fullPage: false});
    return actual;
}

async function pointer (id, x, y, down = false) {
    const touch = designer.locator(`[data-esp32-s040-owner=${JSON.stringify(id)}] [data-esp32-s040-touch]`);
    const point = await touch.evaluate((el, p) => {
        const transformed = new DOMPoint(16 + (p.x + 0.5) * 124 / 480, 16 + (p.y + 0.5) * 124 / 480)
            .matrixTransform(el.getScreenCTM());
        return {x: transformed.x, y: transformed.y};
    }, {x, y});
    await page.mouse.move(point.x, point.y);
    if (down) await page.mouse.down();
}

async function refused (label, pattern) {
    const before = requests.roms.length;
    await run();
    const text = await panel.innerText();
    check(`${label}: visible refusal`, await panel.getAttribute('data-debug-phase') === 'error' && pattern.test(text), text);
    check(`${label}: no ROM load or active face escapes the refusal`, requests.roms.length === before &&
        await designer.locator('[data-esp32-s040-owner]:not([data-esp32-s040-owner=""])').count() === 0);
    await writeFile(join(artifacts, `${label}.txt`), text);
}

await mkdir(artifacts, {recursive: true});
try {
    if (!process.env.CI && process.env.BW_ALLOW_LOCAL_BROWSER_PROOF !== '1') {
        throw new Error('Set BW_ALLOW_LOCAL_BROWSER_PROOF=1 explicitly for this local full-app proof');
    }
    report.source = await sourceIdentity();
    const fixtureModule = await import(pathToFileURL(join(supplier, 'scripts/fetch-esp32s040-fixtures.mjs')).href);
    const {esp32S040Manifest: manifest, admitEsp32S040Inputs} = fixtureModule;
    const admitted = await admitEsp32S040Inputs(inputs, {requireRelease: true});
    report.fixture = {manifest, admitted: admitted.identity};
    check('qualified immutable supplier release admits every engine, guest and ROM byte', admitted.identity.qualification === 'release');
    const sync = await readFile(join(root, 'scripts/sync-labwired-wasm.mjs'), 'utf8');
    check('production web engine uses the qualified S040 source and release',
        sync.includes(`const PIN = '${manifest.source.commit}';`) && sync.includes(`const TAG = '${manifest.engine.releaseTag}';`));
    await readFile(join(build, 'index.html')); // Remote proof also needs the corresponding local build.
    if (!appUrl) appUrl = await serveBuild();
    report.url = appUrl;
    const executablePath = process.env.BW_BROWSER_PATH || undefined;
    browser = await chromium.launch({headless: true, ...(executablePath ? {executablePath} : {})});
    const playwrightPackage = JSON.parse(await readFile(fileURLToPath(import.meta.resolve('playwright/package.json')), 'utf8'));
    report.browser = {version: browser.version(), playwright: playwrightPackage.version,
        requestedExecutable: executablePath || null, defaultExecutable: chromium.executablePath(),
        qualification: executablePath ? 'provisional explicit browser override' : 'installed Playwright browser'};
    await openApp();
    await refused('no-file', /load .*firmware|firmware.*before starting/i);
    check('empty picker does not invoke the blocks compiler', requests.compile.length === 0);
    await chooseFile('unsupported.uf2', Buffer.alloc(512));
    await refused('uf2-refused', /UF2.*not supported|does not support UF2/i);
    await chooseFile(basename(manifest.flashBoot.firmware.file), Buffer.from(admitted.mergedFlash));
    await refused('elf-selector-refuses-raw-bin', /ELF|merged.*BIN|merged.*\.bin/i);

    await loadCircuit(['panel-a']);
    await panel.locator('[data-esp32s040-part]').selectOption('panel-a');
    await chooseFile(basename(manifest.firmware.file), Buffer.from(admitted.firmware));
    await run();
    check('source-owned Xtensa ELF starts on the actual placed part', await panel.getAttribute('data-debug-phase') === 'running', await panel.innerText());
    const initial = await frame('panel-a', 0xf800, '01-initial-guest-frame');
    check('real placed part exposes exactly its physical H1 terminals',
        JSON.stringify(initial.actualCircuit.find(p => p.id === 'panel-a')?.terminals.slice().sort()) === JSON.stringify(header.slice().sort()));
    await pointer('panel-a', 123, 456, true);
    const down = await frame('panel-a', 123, '02-pointer-down');
    check('pointer down causes a new guest frame', down.guestFrames > initial.guestFrames);
    await pointer('panel-a', 321, 47);
    const moved = await frame('panel-a', 321, '03-held-pointer-move');
    check('held movement causes a later guest frame', moved.guestFrames > down.guestFrames);
    await page.mouse.up();
    const up = await frame('panel-a', 0xf800, '04-pointer-up');
    check('release reaches the guest and restores its original pixel', up.guestFrames > moved.guestFrames);
    await page.waitForFunction(() => {
        const text = document.querySelector('[data-testid="bw-serial-console"]')?.textContent || '';
        return text.includes('S040 READY') && text.includes('S040 TOUCH');
    }, null, {timeout});
    await writeFile(join(artifacts, 'probe-uart.txt'), await panel.getByTestId('bw-serial-console').innerText());

    await pointer('panel-a', 40, 50, true);
    await frame('panel-a', 40, '05-contact-held-before-stop');
    await stop({held: true});
    await run();
    const restarted = await frame('panel-a', 0xf800, '06-fresh-restart');
    check('restart has a fresh guest counter and no inherited held contact', restarted.guestFrames === 1);
    await stop();

    await loadCircuit(['panel-b']);
    await panel.locator('[data-esp32s040-part]').selectOption('panel-b');
    await run();
    await frame('panel-b', 0xf800, '07-replacement-owner');
    await pointer('panel-b', 200, 100, true);
    await frame('panel-b', 200, '08-replacement-pointer');
    await page.mouse.up();
    await frame('panel-b', 0xf800, '09-replacement-release');
    await stop();

    // The underlying Board still has a shared H1 namespace. Both automatic
    // ambiguity and explicit overlap must refuse, never filter another board
    // out of the real netlist to make this journey appear supported.
    await loadCircuit(['panel-a', 'panel-b']);
    await panel.locator('[data-esp32s040-part]').selectOption('');
    await refused('ambiguous-owner', /select exactly one|more than one|multiple/i);
    await panel.locator('[data-esp32s040-part]').selectOption('panel-a');
    await refused('overlapping-h1-controllers', /H1 pin namespace overlaps controller/);

    await loadCircuit(['panel-b']);
    await chips.selectOption(flashTarget);
    await panel.locator('[data-esp32s040-part]').selectOption('panel-b');
    await panel.locator('[data-esp32s3-console]').selectOption('uart0');
    await chooseFile(basename(manifest.flashBoot.firmware.file), Buffer.from(admitted.mergedFlash));
    await run();
    await page.waitForFunction(() => (document.querySelector('[data-testid="bw-serial-console"]')?.textContent || '').includes('SMOKE_OK'), null, {timeout});
    const smoke = await snapshot();
    check('retained Arduino image boots through S040 ROM route without inventing a display frame',
        smoke.partId === 'panel-b' && smoke.phase === 'running' && smoke.video === null &&
        await designer.locator('[data-esp32-s040-touch][aria-disabled="false"]').count() === 0, smoke);
    await writeFile(join(artifacts, 'merged-flash-uart.txt'), await panel.getByTestId('bw-serial-console').innerText());
    await page.screenshot({path: join(artifacts, '10-merged-flash-no-display.png'), fullPage: false});
    await stop();
    check('all firmware journeys avoid the blocks compiler', requests.compile.length === 0, requests.compile);
    await Promise.all(pending);
    for (const name of ['labwired_wasm.js', 'labwired_wasm_bg.wasm']) {
        const expected = sync.match(new RegExp(`'web-${name.replaceAll('.', '\\.')}': '([0-9a-f]{64})'`))?.[1];
        const observed = [...assets.values()].filter(a => new URL(a.url).pathname.endsWith(`/static/labwired/${name}`));
        check(`actual browser fetched the pinned web ${name}`, Boolean(expected) && observed.length > 0 &&
            observed.every(asset => asset.sha256 === expected), observed);
    }
    for (const entry of admitted.identity.files.filter(f => f.file.startsWith('roms/'))) {
        const observed = [...assets.values()].filter(a => new URL(a.url).pathname.endsWith(`/static/esp32s3/${basename(entry.file)}`));
        check(`actual ROM boot fetched admitted ${basename(entry.file)}`, observed.length > 0 &&
            observed.every(asset => asset.bytes === entry.bytes && asset.sha256 === entry.sha256), observed);
    }
    report.servedBuild = await fetchFirmwareBrowserProducer({request: context.request, documentUrl: report.documentUrl});
    check('all placed-part journeys have no uncaught page errors', !diagnostics.some(d => d.kind === 'pageerror'), diagnostics.filter(d => d.kind === 'pageerror'));
    await Promise.all(pending);
    report.sourceAfter = await verifyFirmwareBrowserSourceUnchanged({root, source: report.source});
    report.buildEvidence = await verifyFirmwareBrowserBuild({build, appUrl, assets: [...assets.values()],
        source: {...report.source, dirty: report.source.dirty || report.sourceAfter.dirty},
        producer: report.servedBuild, browserOverride: Boolean(executablePath)});
    check('observed application and web-engine bytes match the local build with unchanged proof source', true,
        {mode: report.buildEvidence.mode, qualification: report.buildEvidence.qualification,
            responses: report.buildEvidence.responses.length});
    report.ok = true;
} catch (error) {
    failure = error; report.ok = false; report.error = String(error.stack || error); console.error(report.error);
    if (page && !page.isClosed()) {
        try { await page.screenshot({path: join(artifacts, 'failure.png'), fullPage: false}); }
        catch (error) { diagnostics.push({kind: 'screenshot-error', message: String(error)}); }
    }
} finally {
    await Promise.all(pending);
    report.assets = [...assets.values()]; report.finished = new Date().toISOString();
    await writeFile(join(artifacts, 'report.json'), JSON.stringify(report, null, 2) + '\n');
    if (browser) await browser.close();
    if (server) await new Promise(done => server.close(done));
    console.log(`Evidence: ${join(artifacts, 'report.json')}`);
}
if (failure) process.exitCode = 1;
