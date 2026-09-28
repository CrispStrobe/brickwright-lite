#!/usr/bin/env node
/** Launch a real Tauri binary and exercise the normal allow-profile download paths in its WebView. */
import {spawn} from 'node:child_process';
import {existsSync} from 'node:fs';
import path from 'node:path';

const binary = process.argv[2];
if (!binary || !existsSync(binary)) throw new Error(`app binary not found: ${binary}`);
// The installed tauri-driver/WebKitWebDriver pair is proven on its standard port by the broker
// harness immediately before this one. The steps are sequential and each driver is shut down, so
// reusing 4444 removes a needless transport difference without creating a concurrent bind.
const port = Number(process.env.TAURI_DRIVER_PORT || 4444);
const base = `http://127.0.0.1:${port}`;
const nativeDriver = process.env.NATIVE_DRIVER ||
    ['/usr/bin/WebKitWebDriver', '/usr/lib/x86_64-linux-gnu/webkit2gtk-4.1/WebKitWebDriver',
        '/usr/bin/webkitwebdriver'].find(existsSync) || '/usr/bin/WebKitWebDriver';
const cargoBin = path.join(process.env.CARGO_HOME || path.join(process.env.HOME || '', '.cargo'), 'bin');
const driverBin = [path.join(cargoBin, 'tauri-driver'), '/usr/local/bin/tauri-driver'].find(existsSync);
if (!driverBin) throw new Error('tauri-driver is not installed');

const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
const mark = stage => console.log(`[native-downloads] ${stage}`);
const call = async (method, route, body, timeout = 10000) => {
    try {
        const options = {
            method,
            headers: {'content-type': 'application/json'},
            body: body === undefined ? undefined : JSON.stringify(body)
        };
        if (timeout !== null) options.signal = AbortSignal.timeout(timeout);
        const response = await fetch(base + route, options);
        const text = await response.text();
        return {status: response.status, body: text ? JSON.parse(text) : null};
    } catch (error) {
        throw new Error(`${method} ${route} failed after at most ${timeout}ms: ${error.message}`, {cause: error});
    }
};

const logs = [];
const driver = spawn(driverBin, ['--port', String(port), '--native-driver', nativeDriver],
    {stdio: ['ignore', 'pipe', 'pipe']});
driver.stdout.on('data', chunk => logs.push(String(chunk)));
driver.stderr.on('data', chunk => logs.push(String(chunk)));
let session;
const finish = async () => {
    if (session) await call('DELETE', `/session/${session}`, undefined, 5000).catch(() => {});
    driver.kill('SIGTERM');
};
const fail = async message => {
    await finish();
    throw new Error(`${message}\n${logs.join('').slice(-3000)}`);
};

try {
    mark(`waiting for tauri-driver on ${base}`);
    let ready = false;
    let startupExpired = false;
    const startupWatchdog = setTimeout(() => {
        startupExpired = true;
        driver.kill('SIGTERM');
    }, 30000);
    while (!startupExpired && !ready) {
        // Match the working broker harness exactly here. Passing even a long AbortSignal makes
        // this tauri-driver/Hyper version immediately close each accepted request as
        // IncompleteMessage. The separate watchdog preserves the deadline by terminating the
        // server, which also breaks a genuinely stuck unsigned fetch.
        try { await call('GET', '/status', undefined, null); ready = true; }
        catch { if (!ready) await sleep(500); }
        if (driver.exitCode !== null) await fail(`tauri-driver exited ${driver.exitCode}`);
    }
    clearTimeout(startupWatchdog);
    if (!ready) await fail('tauri-driver did not become ready');
    mark('creating Tauri WebDriver session');
    const created = await call('POST', '/session', {
        capabilities: {alwaysMatch: {'tauri:options': {application: path.resolve(binary)}}}
    }, 60000);
    session = created.body?.value?.sessionId;
    if (!session) await fail(`no WebDriver session: ${JSON.stringify(created.body)}`);
    mark(`session ${session} created; setting script timeout`);
    const timeouts = await call('POST', `/session/${session}/timeouts`, {script: 120000});
    if (timeouts.status >= 400) await fail(`could not set WebDriver script timeout: ${JSON.stringify(timeouts.body)}`);

    mark('discovering the editor WebView');
    let editor;
    let lastObserved = {handles: [], pages: []};
    // Give the production webpack application up to two minutes to expose
    // its VM; this is a startup bound, not a fixed sleep.
    for (let attempt = 0; attempt < 240 && !editor; attempt++) {
        const handles = (await call('GET', `/session/${session}/window/handles`)).body?.value || [];
        const observed = {handles, pages: []};
        for (const handle of handles) {
            await call('POST', `/session/${session}/window`, {handle});
            const identity = await call('POST', `/session/${session}/execute/sync`, {
                script: `return {href:String(location.href), title:String(document.title),
                    tauri:typeof (globalThis.__TAURI_INTERNALS__||{}).invoke,
                    vm:!!(globalThis.__brickwrightStore && globalThis.__brickwrightStore.getState &&
                        globalThis.__brickwrightStore.getState().scratchGui &&
                        globalThis.__brickwrightStore.getState().scratchGui.vm &&
                        globalThis.__brickwrightStore.getState().scratchGui.vm.extensionManager)};`, args: []
            });
            const value = identity.body?.value || {};
            observed.pages.push({handle, href: value.href, title: value.title,
                tauri: value.tauri, vm: value.vm, status: identity.status,
                webdriverError: value.error,
                message: typeof value.message === 'string' ? value.message.slice(0, 200) : undefined});
            if (!/capability-broker\.html/.test(value.href || '') && value.tauri === 'function' && value.vm) {
                editor = {handle, ...value};
                break;
            }
        }
        // Keep the last nonempty snapshot if the app closes its windows before timeout.
        if (handles.length) lastObserved = observed;
        if (!editor) await sleep(500);
    }
    if (!editor) await fail(`the real editor WebView never exposed its VM; ` +
        `last observed: ${JSON.stringify(lastObserved)}`);
    mark(`editor ready at ${editor.href}; starting remote download probe`);
    await call('POST', `/session/${session}/window`, {handle: editor.handle});

    const result = await call('POST', `/session/${session}/execute/async`, {
        script: `
            const done = arguments[arguments.length - 1];
            let stage = 'starting';
            let finished = false;
            const finishProbe = value => {
                if (finished) return;
                finished = true;
                clearTimeout(watchdog);
                done(value);
            };
            const watchdog = setTimeout(() => finishProbe({
                fatal: 'native download probe timed out during ' + stage
            }), 110000);
            const within = (operation, label, milliseconds = 30000) => {
                stage = label;
                return Promise.race([
                    operation,
                    new Promise((_, reject) => setTimeout(
                        () => reject(new Error(label + ' timed out after ' + milliseconds + 'ms')),
                        milliseconds))
                ]);
            };
            const download = async (url, label, milliseconds = 30000) => {
                const response = await within(fetch(url, {cache:'no-store'}), label + ' fetch', milliseconds);
                const bytes = await within(response.arrayBuffer(), label + ' body', milliseconds);
                return {response, bytes};
            };
            const sha256 = async bytes => Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', bytes)))
                .map(x => x.toString(16).padStart(2, '0')).join('');
            (async () => {
                const vm = globalThis.__brickwrightStore.getState().scratchGui.vm;
                stage = 'build manifest';
                const manifestResponse = await within(fetch('brickwright-build.json', {cache:'no-store'}),
                    'build manifest fetch');
                const manifest = await within(manifestResponse.json(), 'build manifest body');
                stage = 'extension gallery';
                const galleryResponse = await within(fetch(
                    'https://crispstrobe.github.io/extensions/generated-metadata/extensions-v0.json',
                    {cache:'no-store'}), 'extension gallery fetch');
                const gallery = await within(galleryResponse.json(), 'extension gallery body');
                const extensionURL = 'https://crispstrobe.github.io/extensions/true-fantom/math.js';
                const extensionDownload = await download(extensionURL, 'extension source');
                const extensionResponse = extensionDownload.response;
                const extensionBytes = extensionDownload.bytes.byteLength;
                let extensionLoaded = false, extensionError = null;
                try {
                    await within(vm.extensionManager.loadExtensionURL(extensionURL),
                        'extension manager load', 40000);
                    extensionLoaded = vm.extensionManager.isExtensionLoaded(extensionURL);
                } catch (error) { extensionError = String(error && error.message || error); }
                const toolchainDownload = await download(
                    'https://crispstrobe.github.io/sdcc-wasm/static/sdcc-wasm/runtime.json',
                    'toolchain runtime');
                const toolchainResponse = toolchainDownload.response;
                const toolchainBytes = toolchainDownload.bytes.byteLength;
                const kernelDownload = await download(
                    'https://raw.githubusercontent.com/CrispStrobe/brickwright-media-lab/' +
                    '5b257a33fb748885bd952d8b8b281c76f0b36516/riscv32-linux/Image', 'machine image', 40000);
                const kernelResponse = kernelDownload.response;
                const kernel = kernelDownload.bytes;
                stage = 'machine image digest';
                finishProbe({
                    manifestStatus: manifestResponse.status,
                    remoteExtensionsPolicy: manifest?.distributionPolicy?.remoteExtensions,
                    executableToolchainsPolicy: manifest?.distributionPolicy?.executableToolchains,
                    machineImagesPolicy: manifest?.distributionPolicy?.machineImages,
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
            })().catch(error => finishProbe({
                fatal: stage + ': ' + String(error && error.stack || error)
            }));`,
        args: []
    }, 125000);
    mark('remote download probe returned');
    const proof = result.body?.value;
    if (!proof || proof.fatal) await fail(proof?.fatal || 'native download probe returned no result');
    const expected = {
        manifestStatus: 200,
        remoteExtensionsPolicy: 'allow',
        executableToolchainsPolicy: 'allow',
        machineImagesPolicy: 'allow',
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
