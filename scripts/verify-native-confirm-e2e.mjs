#!/usr/bin/env node
/**
 * Task E6: in the real app, `window.confirm` is tauri-plugin-dialog's (an always-truthy Promise),
 * and File > New must still wait for the user's answer.
 *
 * Launches the real Tauri binary and, in the editor WebView:
 *   1. proves the mechanism: `window.confirm(...)` returns a thenable, and in 2.7.1 it rejects
 *      (the plugin has no `confirm` command), so it never shows a dialog;
 *   2. answers the native message box from script — `window.__TAURI__.core` is replaced by a copy
 *      whose invoke answers `plugin:dialog|message` and passes every other command through (the
 *      real GTK dialog would block a headless run) — then marks the project changed, clicks
 *      File > New, and checks: on Cancel the question was asked once (OK/Cancel) and the project
 *      is still there; on OK the project is replaced.
 * On a tree without the fix step 2 reads "no question, project replaced on Cancel".
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
const mark = stage => console.log(`[native-confirm] ${stage}`);
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
    mark(`editor ready at ${editor.href}; starting the File > New confirm probe`);
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
        (async () => {
            const store = globalThis.__brickwrightStore;
            const vm = store.getState().scratchGui.vm;
            out.stage = 'mechanism';
            let raw;
            try { raw = window.confirm('Brickwright E6 probe: the dialog plugin\'s confirm'); } catch (error) { raw = {threw: String(error)}; }
            out.rawType = raw === null ? 'null' : typeof raw;
            out.rawThenable = !!(raw && typeof raw.then === 'function');
            if (out.rawThenable) {
                out.rawOutcome = await Promise.race([
                    raw.then(value => `resolved:${JSON.stringify(value)}`, error => `rejected:${String(error && error.message || error)}`),
                    sleep(5000).then(() => 'pending')
                ]);
            } else out.rawOutcome = JSON.stringify(raw);

            out.stage = 'intercept';
            const tauri = window.__TAURI__;
            const original = tauri.core;
            let answer = 'Cancel';
            const asked = [];
            tauri.core = Object.assign({}, original, {
                invoke: (command, args, options) => {
                    if (command === 'plugin:dialog|message') { asked.push(args); return Promise.resolve(answer); }
                    return original.invoke(command, args, options);
                }
            });
            out.intercepted = window.__TAURI__.core !== original;
            try {
                const marker = () => {
                    const stage = vm.runtime.getTargetForStage();
                    return !!(stage && stage.variables['bw-e6-marker']);
                };
                const dirty = () => {
                    vm.runtime.getTargetForStage().createVariable('bw-e6-marker', 'bw e6 marker', '');
                    store.dispatch({type: 'scratch-gui/project-changed/SET_PROJECT_CHANGED', changed: true});
                };
                const clickNew = async () => {
                    const fileLabel = await waitFor(() => [...document.querySelectorAll('span')]
                        .find(span => ['File', 'Datei'].includes(span.textContent.trim())), 10000, 'the File menu');
                    fileLabel.dispatchEvent(new MouseEvent('mouseup', {bubbles: true}));
                    const item = await waitFor(() => [...document.querySelectorAll('li')]
                        .find(li => ['New', 'Neu'].includes(li.textContent.trim())), 10000, 'File > New');
                    item.click();
                };
                // The editor exposes its VM before the default project has loaded; marking the
                // project changed before then would be undone by that first load.
                out.stage = 'default project';
                await waitFor(() => {
                    const state = store.getState().scratchGui.projectState;
                    return vm.runtime.getTargetForStage() &&
                        /^SHOWING_W/.test(String(state && state.loadingState));
                }, 60000, 'the default project');
                await sleep(1000);
                out.stage = 'cancel';
                dirty();
                out.markerBefore = marker();
                out.changedBefore = store.getState().scratchGui.projectChanged;
                await clickNew();
                await waitFor(() => asked.length >= 1 || !marker(), 10000, 'the question or a replacement');
                await sleep(2000);
                out.askedOnCancel = asked.slice();
                out.markerAfterCancel = marker();
                out.stage = 'ok';
                answer = 'Ok';
                if (!marker()) dirty();
                await clickNew();
                await waitFor(() => !marker(), 30000, 'the project to be replaced after OK');
                out.askedTotal = asked.length;
                out.lastAsk = asked[asked.length - 1];
                out.markerAfterOk = marker();
                out.stage = 'done';
            } finally {
                tauri.core = original;
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
    mark('confirm probe returned');
    const proof = result.body?.value;
    if (!proof || proof.fatal) await fail(`${proof?.fatal || 'the confirm probe returned no result'}\nproof=${JSON.stringify(proof)}`);
    const failures = [];
    const expect = (ok, what) => { if (!ok) failures.push(what); };
    expect(proof.rawThenable === true, `window.confirm returned ${proof.rawType}, not the plugin's Promise ` +
        '(the mechanism this gate is about is gone: re-read guest-js/init.ts of the pinned plugin)');
    expect(/^rejected:/.test(proof.rawOutcome || ''), `the plugin's confirm ${proof.rawOutcome}, expected a rejection ` +
        '(2.7.1 registers no confirm command)');
    expect(proof.intercepted === true, 'window.__TAURI__.core could not be replaced, so the dialog cannot be answered');
    expect(proof.markerBefore === true && proof.changedBefore === true, 'the project was not marked changed');
    expect(Array.isArray(proof.askedOnCancel) && proof.askedOnCancel.length === 1,
        `File > New asked ${proof.askedOnCancel?.length ?? 'no'} question(s) through plugin:dialog|message, expected 1`);
    const asked = proof.askedOnCancel?.[0] || {};
    expect(asked.buttons === 'OkCancel' && asked.kind === 'warning' && /Replace/i.test(asked.message || ''),
        `the question was ${JSON.stringify(asked)}, expected an OK/Cancel warning about replacing the project`);
    expect(proof.markerAfterCancel === true, 'the project was replaced although the answer was Cancel');
    expect(proof.askedTotal === 2, `${proof.askedTotal} questions in total, expected 2`);
    expect(proof.markerAfterOk === false, 'the project was not replaced after OK');
    if (failures.length) await fail(`${failures.join('\n')}\nproof=${JSON.stringify(proof)}`);
    console.log(`PASS File > New waits for the native answer in the real app: ${JSON.stringify(proof)}`);
} finally {
    await finish();
}
