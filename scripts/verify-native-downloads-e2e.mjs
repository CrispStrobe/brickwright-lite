#!/usr/bin/env node
/** Launch a real Tauri binary and exercise the normal allow-profile download paths in its WebView. */
import {spawn} from 'node:child_process';
import {existsSync} from 'node:fs';
import path from 'node:path';

const binary = process.argv[2];
if (!binary || !existsSync(binary)) throw new Error(`app binary not found: ${binary}`);
const port = Number(process.env.TAURI_DRIVER_PORT || 4445);
const base = `http://127.0.0.1:${port}`;
const nativeDriver = process.env.NATIVE_DRIVER ||
    ['/usr/bin/WebKitWebDriver', '/usr/lib/x86_64-linux-gnu/webkit2gtk-4.1/WebKitWebDriver',
        '/usr/bin/webkitwebdriver'].find(existsSync) || '/usr/bin/WebKitWebDriver';
const cargoBin = path.join(process.env.CARGO_HOME || path.join(process.env.HOME || '', '.cargo'), 'bin');
const driverBin = [path.join(cargoBin, 'tauri-driver'), '/usr/local/bin/tauri-driver'].find(existsSync);
if (!driverBin) throw new Error('tauri-driver is not installed');

const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
const call = async (method, route, body) => {
    const response = await fetch(base + route, {
        method,
        headers: {'content-type': 'application/json'},
        body: body === undefined ? undefined : JSON.stringify(body)
    });
    const text = await response.text();
    return {status: response.status, body: JSON.parse(text)};
};

const logs = [];
const driver = spawn(driverBin, ['--port', String(port), '--native-driver', nativeDriver],
    {stdio: ['ignore', 'pipe', 'pipe']});
driver.stdout.on('data', chunk => logs.push(String(chunk)));
driver.stderr.on('data', chunk => logs.push(String(chunk)));
let session;
const finish = async () => {
    if (session) await call('DELETE', `/session/${session}`).catch(() => {});
    driver.kill('SIGTERM');
};
const fail = async message => {
    await finish();
    throw new Error(`${message}\n${logs.join('').slice(-3000)}`);
};

try {
    let ready = false;
    for (let attempt = 0; attempt < 60 && !ready; attempt++) {
        try { await call('GET', '/status'); ready = true; } catch { await sleep(500); }
        if (driver.exitCode !== null) await fail(`tauri-driver exited ${driver.exitCode}`);
    }
    if (!ready) await fail('tauri-driver did not become ready');
    const created = await call('POST', '/session', {
        capabilities: {alwaysMatch: {'tauri:options': {application: path.resolve(binary)}}}
    });
    session = created.body?.value?.sessionId;
    if (!session) await fail(`no WebDriver session: ${JSON.stringify(created.body)}`);

    let editor;
    for (let attempt = 0; attempt < 120 && !editor; attempt++) {
        const handles = (await call('GET', `/session/${session}/window/handles`)).body?.value || [];
        for (const handle of handles) {
            await call('POST', `/session/${session}/window`, {handle});
            const identity = await call('POST', `/session/${session}/execute/sync`, {
                script: `return {href:String(location.href), title:String(document.title),
                    tauri:typeof (globalThis.__TAURI_INTERNALS__||{}).invoke,
                    vm:!!(globalThis.__vm && globalThis.__vm.extensionManager)};`, args: []
            });
            const value = identity.body?.value || {};
            if (!/capability-broker\.html/.test(value.href || '') && value.tauri === 'function' && value.vm) {
                editor = {handle, ...value};
                break;
            }
        }
        if (!editor) await sleep(500);
    }
    if (!editor) await fail('the real editor WebView never exposed its VM');
    await call('POST', `/session/${session}/window`, {handle: editor.handle});

    const result = await call('POST', `/session/${session}/execute/async`, {
        script: `
            const done = arguments[arguments.length - 1];
            const sha256 = async bytes => Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', bytes)))
                .map(x => x.toString(16).padStart(2, '0')).join('');
            (async () => {
                const manifestResponse = await fetch('brickwright-build.json', {cache:'no-store'});
                const manifest = await manifestResponse.json();
                const galleryResponse = await fetch(
                    'https://crispstrobe.github.io/extensions/generated-metadata/extensions-v0.json', {cache:'no-store'});
                const gallery = await galleryResponse.json();
                const extensionURL = 'https://crispstrobe.github.io/extensions/true-fantom/math.js';
                const extensionResponse = await fetch(extensionURL, {cache:'no-store'});
                const extensionBytes = (await extensionResponse.arrayBuffer()).byteLength;
                let extensionLoaded = false, extensionError = null;
                try {
                    await globalThis.__vm.extensionManager.loadExtensionURL(extensionURL);
                    extensionLoaded = globalThis.__vm.extensionManager.isExtensionLoaded(extensionURL);
                } catch (error) { extensionError = String(error && error.message || error); }
                const toolchainResponse = await fetch(
                    'https://crispstrobe.github.io/sdcc-wasm/runtime.json', {cache:'no-store'});
                const toolchainBytes = (await toolchainResponse.arrayBuffer()).byteLength;
                const kernelResponse = await fetch(
                    'https://raw.githubusercontent.com/CrispStrobe/brickwright-media-lab/' +
                    '5b257a33fb748885bd952d8b8b281c76f0b36516/riscv32-linux/Image', {cache:'no-store'});
                const kernel = await kernelResponse.arrayBuffer();
                done({
                    manifestStatus: manifestResponse.status,
                    policy: manifest?.distributionPolicy?.remoteCode,
                    galleryStatus: galleryResponse.status,
                    galleryEntries: gallery?.extensions?.length || 0,
                    extensionStatus: extensionResponse.status,
                    extensionBytes,
                    extensionLoaded,
                    extensionError,
                    toolchainStatus: toolchainResponse.status,
                    toolchainBytes,
                    kernelStatus: kernelResponse.status,
                    kernelBytes: kernel.byteLength,
                    kernelSha256: await sha256(kernel),
                    nativeInvoke: typeof globalThis.__TAURI_INTERNALS__.invoke
                });
            })().catch(error => done({fatal:String(error && error.stack || error)}));`,
        args: []
    });
    const proof = result.body?.value;
    if (!proof || proof.fatal) await fail(proof?.fatal || 'native download probe returned no result');
    const expected = {
        manifestStatus: 200,
        policy: 'allow',
        galleryStatus: 200,
        extensionStatus: 200,
        toolchainStatus: 200,
        kernelStatus: 200,
        kernelBytes: 4876836,
        kernelSha256: '9130ceb4be18d10560cf49ac495d7f2d5dde23c33972d7a522c077cc523de1a9',
        nativeInvoke: 'function'
    };
    const failures = Object.entries(expected)
        .filter(([key, value]) => proof[key] !== value)
        .map(([key, value]) => `${key}: got ${JSON.stringify(proof[key])}, expected ${JSON.stringify(value)}`);
    if (proof.galleryEntries < 100) failures.push(`galleryEntries: ${proof.galleryEntries}`);
    if (proof.extensionBytes < 100) failures.push(`extensionBytes: ${proof.extensionBytes}`);
    if (!proof.extensionLoaded) failures.push(`extension did not load: ${proof.extensionError || 'no reason'}`);
    if (proof.toolchainBytes < 100000) failures.push(`toolchainBytes: ${proof.toolchainBytes}`);
    if (failures.length) await fail(`${failures.join('\n')}\nproof=${JSON.stringify(proof)}`);
    console.log(`PASS real native allow-profile downloads: ${JSON.stringify(proof)}`);
} finally {
    await finish();
}
