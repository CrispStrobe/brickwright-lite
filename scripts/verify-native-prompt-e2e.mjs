#!/usr/bin/env node
/**
 * Task E8: in the macOS/iOS app `window.prompt` answers null at once (wry 0.55.1 implements no
 * WKWebView text-input panel), so the app asks for text with its own modal (lib/prompt-modal.jsx
 * through promptAsync in lib/native-dialog.js) on every platform.
 *
 * Launches the real Tauri binary and, in the editor WebView, takes "Extension from URL" through
 * the extension library:
 *   1. `window.prompt` is replaced by a recorder that answers null (WKWebView's behaviour; on this
 *      Linux runner the real one would open a GTK dialog nobody can answer);
 *   2. the tile must open the in-app modal (role=dialog, aria-modal, the field focused), never
 *      window.prompt; a URL typed into it and OK must reach the untrusted-code question, which is
 *      answered Cancel through a pass-through copy of `window.__TAURI__.core` (as the E6 e2e
 *      does), so nothing loads;
 *   3. the tile again, Escape in the modal: no question, nothing loads, the modal is gone.
 * On a tree without the fix step 2 reads "no modal; window.prompt asked once".
 */
import {spawnOwnedDriver} from './lib/owned-driver.mjs';
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
const mark = stage => console.log(`[native-prompt] ${stage}`);
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
const {child: driver, stop: stopDriver} = spawnOwnedDriver(driverBin, ['--port', String(port), '--native-driver', nativeDriver],
    {stdio: ['ignore', 'pipe', 'pipe']});
driver.stdout.on('data', chunk => logs.push(String(chunk)));
driver.stderr.on('data', chunk => logs.push(String(chunk)));
let session;
const finish = async () => {
    if (session) await call('DELETE', `/session/${session}`, undefined, 5000).catch(() => {});
    stopDriver();
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
        stopDriver();
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
    mark(`editor ready at ${editor.href}; starting the Extension-from-URL prompt probe`);
    await call('POST', `/session/${session}/window`, {handle: editor.handle});

    // The in-page probe, written as a real function so it is linted and read as code; WebDriver
    // receives its body. `done` is WebDriver's async-script callback (the last argument).
    const probe = function () {
        const done = arguments[arguments.length - 1];
        const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
        const out = {stage: 'start'};
        const waitFor = async (predicate, ms, label) => {
            const until = Date.now() + ms;
            while (Date.now() < until) { const value = predicate(); if (value) return value; await sleep(100); }
            throw new Error(`timed out after ${ms}ms waiting for ${label}`);
        };
        const URL_TYPED = 'https://example.invalid/brickwright-e8-probe.js';
        (async () => {
            const store = globalThis.__brickwrightStore;
            const vm = store.getState().scratchGui.vm;
            const tauri = window.__TAURI__;
            const original = tauri.core;
            const originalPrompt = window.prompt;
            const asked = [];
            const prompted = [];
            tauri.core = Object.assign({}, original, {
                invoke: (command, args, options) => {
                    if (command === 'plugin:dialog|message') { asked.push(args); return Promise.resolve('Cancel'); }
                    return original.invoke(command, args, options);
                }
            });
            window.prompt = (...args) => { prompted.push(args.map(String)); return null; };
            out.intercepted = window.__TAURI__.core !== original;
            try {
                out.stage = 'default project';
                await waitFor(() => {
                    const state = store.getState().scratchGui.projectState;
                    return vm.runtime.getTargetForStage() &&
                        /^SHOWING_W/.test(String(state && state.loadingState));
                }, 60000, 'the default project');
                await sleep(1000);
                const modal = () => document.querySelector('[data-bw-prompt-modal]');
                const openTile = async () => {
                    const button = await waitFor(() => [...document.querySelectorAll('button')]
                        .find(b => ['Add Extension', 'Erweiterung hinzufügen'].includes(b.getAttribute('title'))),
                    10000, 'the Add Extension button');
                    button.click();
                    const tile = await waitFor(() => [...document.querySelectorAll('span')]
                        .find(span => /Extension from URL|Erweiterung per URL/.test(span.textContent)),
                    20000, 'the Extension from URL tile');
                    tile.click();
                };
                out.stage = 'ok';
                await openTile();
                const dialog = await waitFor(() => modal() || (prompted.length && 'prompted'), 15000,
                    'the in-app text dialog');
                out.promptedBeforeAnswer = prompted.length;
                if (dialog === 'prompted') throw new Error('window.prompt was asked instead of the in-app dialog');
                const input = dialog.querySelector('[data-bw-prompt-input]');
                out.dialog = {role: dialog.getAttribute('role'), modal: dialog.getAttribute('aria-modal'),
                    message: dialog.querySelector('p').textContent, focused: document.activeElement === input,
                    buttons: [...dialog.querySelectorAll('button')].map(b => b.textContent),
                    width: dialog.getBoundingClientRect().width, viewport: window.innerWidth};
                // React 16 reads a controlled field's value through the native setter + an input event.
                Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(input, URL_TYPED);
                input.dispatchEvent(new Event('input', {bubbles: true}));
                dialog.querySelector('[data-bw-prompt-ok]').click();
                await waitFor(() => asked.length >= 1, 10000, 'the untrusted-code question after OK');
                await sleep(1500);
                out.askedAfterOk = asked.slice();
                out.loadedAfterOk = vm.extensionManager.isExtensionLoaded(URL_TYPED);
                out.modalGoneAfterOk = !modal();

                out.stage = 'escape';
                await openTile();
                const again = await waitFor(() => modal() || (prompted.length && 'prompted'), 15000,
                    'the in-app text dialog, again');
                if (again === 'prompted') throw new Error('window.prompt was asked instead of the in-app dialog');
                again.querySelector('[data-bw-prompt-input]')
                    .dispatchEvent(new KeyboardEvent('keydown', {key: 'Escape', bubbles: true}));
                await waitFor(() => !modal(), 5000, 'the dialog to close on Escape');
                await sleep(1500);
                out.askedTotal = asked.length;
                out.prompted = prompted.length;
                out.loadedAfterEscape = vm.extensionManager.isExtensionLoaded(URL_TYPED);
                out.stage = 'done';
            } finally {
                tauri.core = original;
                window.prompt = originalPrompt;
            }
            done(out);
        })().catch(error => done({...out,
            fatal: `${out.stage}: ${String(error && error.message || error)} @ ${String(error && error.stack)}`}));
    };
    const body = String(probe);
    const result = await call('POST', `/session/${session}/execute/async`, {
        script: body.slice(body.indexOf('{') + 1, body.lastIndexOf('}')),
        args: []
    }, 125000);
    mark('prompt probe returned');
    const proof = result.body?.value;
    if (!proof || proof.fatal) await fail(`${proof?.fatal || 'the prompt probe returned no result'}\nproof=${JSON.stringify(proof)}`);
    const failures = [];
    const expect = (ok, what) => { if (!ok) failures.push(what); };
    expect(proof.intercepted === true, 'window.__TAURI__.core could not be replaced, so the question cannot be answered');
    expect(proof.promptedBeforeAnswer === 0, `window.prompt was asked ${proof.promptedBeforeAnswer} time(s) ` +
        'instead of the in-app dialog (on macOS/iOS that answers null)');
    const dialog = proof.dialog || {};
    expect(dialog.role === 'dialog' && dialog.modal === 'true', `the dialog is ${JSON.stringify(dialog)}, ` +
        'expected role=dialog aria-modal=true');
    expect(/URL/.test(dialog.message || ''), `the dialog asked ${JSON.stringify(dialog.message)}, expected the extension URL question`);
    expect(dialog.focused === true, 'the text field did not have focus when the dialog opened');
    expect(Array.isArray(dialog.buttons) && dialog.buttons.length === 2, `the dialog buttons are ${JSON.stringify(dialog.buttons)}`);
    expect(dialog.width > 0 && dialog.width <= dialog.viewport, `the dialog is ${dialog.width}px wide in a ${dialog.viewport}px window`);
    expect(Array.isArray(proof.askedAfterOk) && proof.askedAfterOk.length === 1,
        `OK asked ${proof.askedAfterOk?.length ?? 'no'} untrusted-code question(s), expected 1`);
    const question = proof.askedAfterOk?.[0] || {};
    expect(question.buttons === 'OkCancel' && (question.message || '').includes('https://example.invalid/brickwright-e8-probe.js'),
        `the question after OK was ${JSON.stringify(question)}, expected an OK/Cancel question naming the typed URL`);
    expect(proof.loadedAfterOk === false, 'the extension loaded although its question was answered Cancel');
    expect(proof.modalGoneAfterOk === true, 'the dialog stayed open after OK');
    expect(proof.askedTotal === 1, `${proof.askedTotal} questions in total: Escape in the dialog went on to ask`);
    expect(proof.prompted === 0, `window.prompt was asked ${proof.prompted} time(s)`);
    expect(proof.loadedAfterEscape === false, 'the extension loaded after Escape');
    if (failures.length) await fail(`${failures.join('\n')}\nproof=${JSON.stringify(proof)}`);
    console.log(`PASS Extension from URL asks through the in-app dialog in the real app: ${JSON.stringify(proof)}`);
} finally {
    await finish();
}
