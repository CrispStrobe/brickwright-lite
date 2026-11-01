import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {EventEmitter} from 'node:events';
import {mkdtemp, mkdir, readFile, rm, writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {dirname, join} from 'node:path';
import {captureFirmwareBrowserSource, fetchFirmwareBrowserProducer, verifyFirmwareBrowserBuild,
    verifyFirmwareBrowserSourceUnchanged} from '../scripts/lib/firmware-browser-build.mjs';

const sha256 = bytes => createHash('sha256').update(bytes).digest('hex');
const observed = (url, bytes, resourceType, mainDocument = false) => ({url, resourceType,
    mainDocument, status: 200, bytes: bytes.length, sha256: sha256(bytes)});

async function fixture (t) {
    const root = await mkdtemp(join(tmpdir(), 'bw-firmware-browser-build-'));
    t.after(() => rm(root, {recursive: true, force: true}));
    const build = join(root, 'build'), appUrl = 'https://proof.invalid/lite/';
    const files = {
        'index.html': Buffer.from('<!doctype html><script defer src="gui.123.js"></script>'),
        'gui.123.js': Buffer.from('app-A'),
        'chunks/debug.js': Buffer.from('debug-A'),
        'static/labwired/labwired_wasm.js': Buffer.from('engine-A'),
        'static/labwired/labwired_wasm_bg.wasm': Buffer.from([0, 97, 115, 109, 1, 0, 0, 0])
    };
    for (const [file, bytes] of Object.entries(files)) {
        await mkdir(dirname(join(build, file)), {recursive: true});
        await writeFile(join(build, file), bytes);
    }
    const assets = Object.entries(files).map(([file, bytes]) => observed(
        file === 'index.html' ? appUrl : new URL(file, appUrl).href, bytes,
        file === 'index.html' ? 'document' : file.endsWith('.js') ? 'script' : 'fetch', file === 'index.html'));
    const source = {head: 'a'.repeat(40), tree: 'b'.repeat(40), dirty: ''};
    const manifestUrl = new URL('bw-gui-build-source.json', appUrl).href;
    return {root, build, appUrl, assets, source,
        producer: {documentUrl: appUrl, requestedUrl: manifestUrl, url: manifestUrl, manifest: null, status: 404}};
}

test('all served document, application chunks and web-engine bytes bind to the mounted local build', async t => {
    const f = await fixture(t);
    const result = await verifyFirmwareBrowserBuild(f);
    assert.equal(result.responses.length, 5);
    assert.deepEqual(result.applicationScripts, ['gui.123.js']);
    assert.equal(result.responses[0].file, 'index.html');
    assert.equal(result.responses.at(-1).file, 'static/labwired/labwired_wasm_bg.wasm');
    assert.equal(result.mode, 'observed served bytes match local build; source chain relies on invoking build job');
    assert.equal(result.qualification, 'observed-byte-match');
    assert.deepEqual(result.provisionalReasons, []);
});

test('a same-size wrong served application bundle is rejected by its bytes', async t => {
    const f = await fixture(t);
    f.assets[1] = observed(f.assets[1].url, Buffer.from('app-B'), 'script');
    await assert.rejects(verifyFirmwareBrowserBuild(f), /Served response SHA-256 differs from local build/);
});

test('later responses at the same URL cannot hide behind an earlier matching response', async t => {
    const f = await fixture(t);
    f.assets.push(observed(f.assets[2].url, Buffer.from('debug-B'), 'script'));
    await assert.rejects(verifyFirmwareBrowserBuild(f), /Served response SHA-256 differs from local build/);
});

test('a remote proof without the corresponding local build fails', async t => {
    const f = await fixture(t);
    await rm(f.build, {recursive: true});
    await assert.rejects(verifyFirmwareBrowserBuild(f), /requires the corresponding local build and index.html/);
});

test('a missing local lazy chunk or mismatched web engine cannot qualify', async t => {
    const f = await fixture(t);
    await rm(join(f.build, 'chunks/debug.js'));
    await assert.rejects(verifyFirmwareBrowserBuild(f), /Local build cannot supply observed response: chunks\/debug.js/);
    await writeFile(join(f.build, 'chunks/debug.js'), 'debug-A');
    f.assets.at(-1).sha256 = sha256(Buffer.from([0, 97, 115, 109, 2, 0, 0, 0]));
    await assert.rejects(verifyFirmwareBrowserBuild(f), /Served response SHA-256 differs from local build/);
});

test('the actual index and its app entry are required; engine glue alone is insufficient', async t => {
    const f = await fixture(t);
    await assert.rejects(verifyFirmwareBrowserBuild({...f, assets: f.assets.slice(1)}), /actual index document/);
    await assert.rejects(verifyFirmwareBrowserBuild({...f, assets: f.assets.filter((_, i) => i !== 1)}),
        /did not observe the index application script: gui.123.js/);
});

test('missing or incomplete observed bodies cannot become a byte match', async t => {
    const f = await fixture(t);
    for (const change of [{error: 'response buffer evicted'}, {pending: true}, {sha256: undefined}, {status: 500}]) {
        const assets = f.assets.map((asset, i) => i === 2 ? {...asset, ...change} : asset);
        await assert.rejects(verifyFirmwareBrowserBuild({...f, assets}),
            /Observed response (body is unavailable|lacks a complete byte identity|did not succeed)/);
    }
});

test('ROM substitutions remain with their dedicated controls and cross-origin scripts cannot count as the app', async t => {
    const f = await fixture(t);
    f.assets.push({url: new URL('static/esp32s3/irom.bin', f.appUrl).href,
        resourceType: 'fetch', status: 404, error: 'deliberately withheld ROM'});
    f.assets.push(observed(new URL('static/esp32s3/drom.bin', f.appUrl).href, Buffer.from('corrupt ROM'), 'fetch'));
    f.assets.push(observed('https://other.invalid/script.js', Buffer.from('external'), 'script'));
    const result = await verifyFirmwareBrowserBuild(f);
    assert.equal(result.responses.length, 5);
    f.assets[1].url = 'https://other.invalid/gui.123.js';
    await assert.rejects(verifyFirmwareBrowserBuild(f), /did not observe the index application script/);
});

test('scripts in the ROM directory must be observed and byte-checked along with the GUI entry', async t => {
    const f = await fixture(t);
    const index = Buffer.from('<!doctype html><script src="gui.123.js"></script>' +
        '<script src="static/esp32s3/extra.js"></script>');
    await writeFile(join(f.build, 'index.html'), index);
    await mkdir(join(f.build, 'static/esp32s3'), {recursive: true});
    await writeFile(join(f.build, 'static/esp32s3/extra.js'), 'extra-A');
    f.assets[0] = observed(f.appUrl, index, 'document', true);
    const url = new URL('static/esp32s3/extra.js', f.appUrl).href;
    f.assets.push(observed(url, Buffer.from('extra-A'), 'script'));
    const result = await verifyFirmwareBrowserBuild(f);
    assert.deepEqual(result.applicationScripts, ['gui.123.js', 'static/esp32s3/extra.js']);
    assert.equal(result.responses.at(-1).file, 'static/esp32s3/extra.js');
    f.assets[f.assets.length - 1] = observed(url, Buffer.from('extra-B'), 'script');
    await assert.rejects(verifyFirmwareBrowserBuild(f), /Served response SHA-256 differs from local build/);
    f.assets.pop();
    await assert.rejects(verifyFirmwareBrowserBuild(f),
        /did not observe the index application script: static\/esp32s3\/extra.js/);
});

test('document responses in the ROM directory cannot use the ROM data exemption', async t => {
    const f = await fixture(t);
    await mkdir(join(f.build, 'static/esp32s3'), {recursive: true});
    await writeFile(join(f.build, 'static/esp32s3/help.html'), '<p>doc-A</p>');
    f.assets.push(observed(new URL('static/esp32s3/help.html', f.appUrl).href,
        Buffer.from('<p>doc-B</p>'), 'document'));
    await assert.rejects(verifyFirmwareBrowserBuild(f), /Served response SHA-256 differs from local build/);
});

test('a producer manifest must name the exact verifier commit and tree, even when bytes match', async t => {
    const f = await fixture(t);
    const manifest = {schema: 1, sourceSha: f.source.head, treeSha: f.source.tree};
    const producer = {...f.producer, manifest, status: 200};
    const result = await verifyFirmwareBrowserBuild({...f, producer});
    assert.equal(result.mode, 'producer manifest names verifier source; observed served bytes match local build');
    for (const key of ['sourceSha', 'treeSha']) {
        await assert.rejects(verifyFirmwareBrowserBuild({...f,
            producer: {...producer, manifest: {...manifest, [key]: 'c'.repeat(40)}}}),
        new RegExp(`Producer ${key} does not match verifier checkout`));
    }
    await assert.rejects(verifyFirmwareBrowserBuild({...f, producer: {...f.producer, status: 500}}),
        /absence requires an explicit not-found response/);
});

test('redirected application URLs cannot hide a wrong producer behind a root-path 404', async t => {
    const f = await fixture(t);
    f.appUrl = 'https://proof.invalid/lite'; // Actual navigation ended at /lite/.
    const requested = [];
    const expectedUrl = 'https://proof.invalid/lite/bw-gui-build-source.json';
    const finalUrl = expectedUrl + '?cached=1';
    const producer = await fetchFirmwareBrowserProducer({documentUrl: f.assets[0].url, request: {
        get: async url => {
            requested.push(url);
            const correctDirectory = url === expectedUrl;
            return {url: () => correctDirectory ? finalUrl : url, status: () => correctDirectory ? 200 : 404,
                ok: () => correctDirectory,
                json: async () => ({schema: 1, sourceSha: 'c'.repeat(40), treeSha: f.source.tree})};
        }
    }});
    assert.deepEqual(requested, [expectedUrl]);
    assert.equal(producer.documentUrl, 'https://proof.invalid/lite/');
    assert.equal(producer.requestedUrl, expectedUrl);
    assert.equal(producer.url, finalUrl);
    assert.equal(producer.status, 200);
    await assert.rejects(verifyFirmwareBrowserBuild({...f, producer}), /Producer sourceSha does not match verifier checkout/);
    await assert.rejects(verifyFirmwareBrowserBuild({...f, producer: {...f.producer,
        requestedUrl: 'https://proof.invalid/bw-gui-build-source.json'}}), /wrong application directory/);
});

test('manifest absence after an application redirect uses only the correct directory response', async t => {
    const f = await fixture(t);
    f.appUrl = 'https://proof.invalid/lite';
    const expectedUrl = 'https://proof.invalid/lite/bw-gui-build-source.json';
    const requested = [];
    const producer = await fetchFirmwareBrowserProducer({documentUrl: f.assets[0].url, request: {
        get: async url => {
            requested.push(url);
            const absent = url === expectedUrl;
            return {url: () => url, status: () => absent ? 404 : 200, ok: () => !absent,
                json: async () => ({schema: 1, sourceSha: f.source.head, treeSha: f.source.tree})};
        }
    }});
    assert.deepEqual(requested, [expectedUrl]);
    assert.equal(producer.status, 404);
    const result = await verifyFirmwareBrowserBuild({...f, producer});
    assert.equal(result.mode, 'observed served bytes match local build; source chain relies on invoking build job');
    assert.equal(result.producer.url, expectedUrl);
});

test('dirty source and an explicit browser override remain visibly provisional', async t => {
    const f = await fixture(t);
    const result = await verifyFirmwareBrowserBuild({...f, source: {...f.source, dirty: ' M overlay/runner.js'},
        browserOverride: true});
    assert.equal(result.qualification, 'provisional');
    assert.deepEqual(result.provisionalReasons, ['verifier checkout has local changes', 'explicit browser override']);
});

for (const verifier of ['esp32s3', 'esp32s040']) {
    test(`${verifier} actual observer retains repeated script responses and excludes the WASM HEAD probe`, async t => {
        const f = await fixture(t);
        const source = await readFile(new URL(`../scripts/verify-${verifier}-firmware-browser.mjs`, import.meta.url), 'utf8');
        const start = source.indexOf('async function observe (');
        const end = source.indexOf('\n}\n', start) + 2;
        assert.ok(start >= 0 && end > start, 'actual response observer must exist');
        const cdp = new EventEmitter(), page = new EventEmitter(), frame = {};
        const bodyRequests = [], assets = new Map(), pending = [];
        const wasmBytes = Buffer.from([0, 97, 115, 109, 1, 0, 0, 0]);
        cdp.send = async (method, args) => {
            if (method === 'Network.enable') return {};
            assert.equal(method, 'Network.getResponseBody');
            bodyRequests.push(args.requestId);
            return {body: wasmBytes.toString('base64'), base64Encoded: true};
        };
        const context = {newCDPSession: async () => cdp};
        page.context = () => context;
        page.mainFrame = () => frame;
        const observe = new Function('deps', `
            const {context, page, assets, pending, sha256, appUrl} = deps;
            const pendingResponses = pending, diagnostics = [], requests = {compile: [], roms: []};
            let assetSequence = 0;
            ${source.slice(start, end)}
            return observe;
        `)({context, page, assets, pending, sha256, appUrl: f.appUrl});
        await observe(page, {id: 'proof', romRequests: []});
        const wasmUrl = new URL('static/labwired/labwired_wasm_bg.wasm?build=1', f.appUrl).href;
        for (const method of ['HEAD', 'GET']) {
            cdp.emit('Network.requestWillBeSent', {requestId: method, request: {method, url: wasmUrl}});
            cdp.emit('Network.responseReceived', {requestId: method, response: {url: wasmUrl, status: 200}});
            cdp.emit('Network.loadingFinished', {requestId: method});
        }
        const scriptUrl = new URL('gui.123.js', f.appUrl).href;
        for (const content of ['app-A', 'app-B']) {
            page.emit('response', {url: () => scriptUrl, ok: () => true, status: () => 200,
                body: async () => Buffer.from(content),
                request: () => ({method: () => 'GET', resourceType: () => 'script'})});
        }
        await Promise.all(pending);
        assert.deepEqual(bodyRequests, ['GET']);
        assert.equal(assets.size, 3, 'keep both script responses, plus the actual WASM GET');
        const responses = [...assets.values()];
        assert.equal(responses.filter(asset => asset.url === scriptUrl).length, 2);
        await assert.rejects(verifyFirmwareBrowserBuild({...f,
            assets: [f.assets[0], ...responses]}), /Served response SHA-256 differs from local build/);
    });
}

test('rehashing rejects source edits and checkout changes made during the proof', async t => {
    const root = await mkdtemp(join(tmpdir(), 'bw-firmware-browser-source-'));
    t.after(() => rm(root, {recursive: true, force: true}));
    const git = args => execFileSync('git', ['-c', 'user.name=Firmware proof test',
        '-c', 'user.email=firmware-proof@example.invalid', '-c', 'commit.gpgsign=false',
        '-c', 'core.hooksPath=/dev/null', ...args], {cwd: root, encoding: 'utf8', stdio: 'pipe'});
    git(['init', '-q']);
    await writeFile(join(root, 'runner.js'), 'original source');
    git(['add', 'runner.js']); git(['commit', '-qm', 'proof fixture']);
    const source = await captureFirmwareBrowserSource({root, paths: ['runner.js']});
    assert.equal(source.dirty, '');
    assert.equal((await verifyFirmwareBrowserSourceUnchanged({root, source})).unchanged, true);
    await writeFile(join(root, 'runner.js'), 'changed source');
    await assert.rejects(verifyFirmwareBrowserSourceUnchanged({root, source}), /source changed during the run: runner.js/);
    const dirty = await captureFirmwareBrowserSource({root, paths: ['runner.js']});
    assert.match(dirty.dirty, /M runner.js/);
    await writeFile(join(root, 'runner.js'), 'original source');
    git(['commit', '--allow-empty', '-qm', 'different checkout']);
    await assert.rejects(verifyFirmwareBrowserSourceUnchanged({root, source}), /HEAD changed during the browser proof/);
});
