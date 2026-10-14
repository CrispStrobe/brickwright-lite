// SPDX-License-Identifier: BSD-3-Clause
// Copyright (c) 2026 Brickwright contributors
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {encodeSource} from '../overlay/scratch-gui/src/lib/spike-micropython/raw-repl.js';
import {createCodeRunFeedback} from '../overlay/scratch-gui/src/lib/spike-arena/code-run-feedback.js';
const importer = readFileSync(new URL('../overlay/scratch-gui/src/components/tw-pseudocode/pseudocode-importer.jsx', import.meta.url), 'utf8');
const paneSource = readFileSync(new URL('../overlay/scratch-gui/src/components/tw-pseudocode/spike-arena-pane.jsx', import.meta.url), 'utf8');
// Execute the actual method with a neutral browser/pane scaffold. Inject only
// its dynamic module import; encoding still uses the production encoder.
const codeMethod = (window, mutation = value => value) => {
    const body = importer.slice(importer.indexOf('    async runOnMicroPythonImage () {'), importer.indexOf('    async runOnSpikeFirmware () {'));
    const injected = mutation(body.replace("const {encodeSource} = await import('../../lib/spike-micropython/raw-repl.js');", ''));
    return new Function('window', 'encodeSource', 'createCodeRunFeedback', `return ({${injected}}).runOnMicroPythonImage;`)(window, encodeSource, createCodeRunFeedback);
};
const paneMethod = window => {
    const body = paneSource.slice(paneSource.indexOf('    async chooseMicroPythonImage () {'), paneSource.indexOf('    firmwareProgramObserver ('));
    return new Function('window', `return ({${body}}).chooseMicroPythonImage;`)(window);
};
const delayedChooser = () => {
    const choices = [], updates = [];
    const stopBody = paneSource.slice(paneSource.indexOf('    async stopProgram ('), paneSource.indexOf('    async pause () {'));
    const pane = {
        locale: 'en', state: {execution: 'micropython', status: 'ready'},
        hubState: {backend: {cancel () {}}}, clock: {uninstall () {}},
        nativeCapabilities: () => ({'renode.spike.micropython.image.choose': () =>
            new Promise((resolve, reject) => choices.push({resolve, reject}))}),
        setState (patch) {updates.push(patch); Object.assign(this.state, patch);}
    };
    pane.chooseMicroPythonImage = paneMethod({});
    pane.stopProgram = new Function('ArenaHubBridge', `return ({${stopBody}}).stopProgram;`)(class {});
    return {pane, choices, updates};
};

test('Stop invalidates a pending image selection even when the backend stays MicroPython', async () => {
    const f = delayedChooser(); const pending = f.pane.chooseMicroPythonImage();
    await f.pane.stopProgram({restart: true}); const mark = f.updates.length;
    f.choices[0].resolve('selected');
    assert.equal(await pending, false); assert.equal(f.pane.state.microImageSelected, false);
    assert.deepEqual(f.updates.slice(mark), []); assert.equal(f.pane.state.status, 'ready');
});

test('late chooser errors after backend changes or a return to MicroPython preserve newer state', async () => {
    for (const returnToMicroPython of [false, true]) {
        const f = delayedChooser(); const pending = f.pane.chooseMicroPythonImage();
        await f.pane.stopProgram({restart: true}); f.pane.state.execution = 'native';
        if (returnToMicroPython) f.pane.state.execution = 'micropython';
        f.pane.state.message = 'New intent'; const mark = f.updates.length;
        f.choices[0].reject(new Error('Late image error'));
        assert.equal(await pending, false); assert.deepEqual(f.updates.slice(mark), []);
        assert.equal(f.pane.state.status, 'ready'); assert.equal(f.pane.state.message, 'New intent');
    }
});

test('a newer chooser request supersedes the older response', async () => {
    const f = delayedChooser(); const first = f.pane.chooseMicroPythonImage();
    const second = f.pane.chooseMicroPythonImage(); const mark = f.updates.length;
    f.choices[0].resolve('selected');
    assert.equal(await first, false); assert.deepEqual(f.updates.slice(mark), []);
    assert.equal(f.pane.state.microImageSelected, false);
    f.choices[1].resolve('cancelled');
    assert.equal(await second, false); assert.equal(f.pane.state.status, 'ready');
});

test('disposal turns a late chooser error into cancellation without publishing it', async () => {
    const f = delayedChooser(); const pending = f.pane.chooseMicroPythonImage();
    f.pane.disposed = true; const mark = f.updates.length;
    f.choices[0].reject(new Error('Late disposed error'));
    assert.equal(await pending, false); assert.deepEqual(f.updates.slice(mark), []);
});

test('disposed and inactive panes do not open the native image chooser', async () => {
    for (const disposed of [false, true]) {
        const f = delayedChooser(); f.pane.disposed = disposed;
        if (!disposed) f.pane.state.execution = 'native';
        // Resolve a broken baseline too, so it fails an assertion rather than hanging.
        const pending = f.pane.chooseMicroPythonImage(); f.choices[0]?.resolve('cancelled');
        assert.equal(await pending, false); assert.equal(f.choices.length, 0);
        assert.deepEqual(f.updates, []);
    }
});

test('current chooser errors and invalid results still fail explicitly', async () => {
    for (const nativeError of [true, false]) {
        const f = delayedChooser(); const pending = f.pane.chooseMicroPythonImage();
        if (nativeError) f.choices[0].reject(new Error('Current image error'));
        else f.choices[0].resolve('unexpected');
        await assert.rejects(pending, nativeError ? /Current image error/ : /Unexpected image selection result/);
        assert.equal(f.pane.state.status, 'failed'); assert.equal(f.pane.state.microImageSelected, false);
    }
});

test('a current successful chooser selection remains authorized', async () => {
    const f = delayedChooser(); const pending = f.pane.chooseMicroPythonImage();
    f.choices[0].resolve('selected');
    assert.equal(await pending, true); assert.equal(f.pane.state.microImageSelected, true);
    assert.equal(f.pane.state.status, 'ready');
});
const scaffold = ({selected = true, source = 'print(42)', previouslySelected = false} = {}) => {
    const calls = [];
    const pane = {bridge: {}, state: {microImageSelected: previouslySelected},
        setState (next, done) {Object.assign(this.state, next); done?.();},
        async stopProgram () {calls.push('stop');},
        async chooseMicroPythonImage () {calls.push('choose'); if (selected instanceof Error) throw selected; return selected;},
        async startFirmware (program, args) {calls.push(['start', program, args.source]); this.firmwareSession = {};} };
    const editor = {state: {}, L: {spike3Stopped: 'Stopped.'}, openSpikeArena () {calls.push('open');}, activeCode: () => source,
        setState (next) {Object.assign(this.state, next);} };
    return {calls, pane, editor, window: {__bwSpikeArena: {_pane: pane, bridge: pane.bridge}}};
};
test('Code-tab MicroPython starts the current source only after successful selection', async () => {
    const s = scaffold(); await codeMethod(s.window).call(s.editor);
    assert.deepEqual(s.calls, ['open', 'stop', 'choose', ['start', null, 'print(42)']]);
    assert.equal(s.pane.state.execution, 'micropython'); assert.equal(s.pane.state.topology, 'default');
    assert.equal(s.editor.state.busy, false);
});
test('Code-tab cancellation, selection error and invalid Python never start an emulator', async () => {
    for (const options of [{selected: false}, {selected: new Error('unpackaged')}, {source: 'x\0y'}, {source: 'x'.repeat(16385)}]) {
        const s = scaffold(options); await codeMethod(s.window).call(s.editor);
        assert.equal(s.calls.some(call => Array.isArray(call) && call[0] === 'start'), false);
        assert.equal(s.editor.state.busy, false);
    }
});
test('an already selected image is used without reopening the native chooser', async () => {
    const s = scaffold({previouslySelected: true}); await codeMethod(s.window).call(s.editor);
    assert.equal(s.calls.includes('choose'), false);
    assert.equal(s.calls.filter(Array.isArray).length, 1);
});
test('late chooser completion after arena disposal cannot authorize startup', async () => {
    let resolve;
    const pane = {state: {execution: 'micropython'}, nativeCapabilities: () => ({
        'renode.spike.micropython.image.choose': () => new Promise(done => {resolve = done;})}),
        setState (next) {Object.assign(this.state, next);} };
    const result = paneMethod({}).call(pane);
    pane.disposed = true; resolve('selected');
    assert.equal(await result, false); assert.equal(pane.state.microImageSelected, false);
});
test('pane chooser sends no image path or bytes and records cancellation', async () => {
    const calls = [];
    const pane = {state: {execution: 'micropython'}, nativeCapabilities: () => ({
        'renode.spike.micropython.image.choose': async args => {calls.push(args); return 'cancelled';}}),
        setState (next) {Object.assign(this.state, next);} };
    assert.equal(await paneMethod({}).call(pane), false);
    assert.deepEqual(calls, [{}]); assert.equal(pane.state.microImageSelected, false);
});
test('comparison detects bypassing the Code-tab selection cancellation gate', async () => {
    const s = scaffold({selected: false});
    await codeMethod(s.window, value => value.replace('if (!pane.state.microImageSelected && !await pane.chooseMicroPythonImage()) {', 'if (false) {')).call(s.editor);
    assert.equal(s.calls.some(call => Array.isArray(call) && call[0] === 'start'), true,
        'the cancelled-selection no-start assertion above would detect this mutant');
});

test('asynchronous MicroPython failure clears the Code-tab running indicator', async () => {
    const s = scaffold(); let report;
    s.pane.startFirmware = async (program, args) => {report = args.onError; s.pane.firmwareSession = {};};
    await codeMethod(s.window).call(s.editor); assert.equal(s.editor.state.spike3Running, true);
    report(new Error('synthetic Python failure'));
    assert.equal(s.editor.state.spike3Running, false); assert.equal(s.editor.state.status, 'synthetic Python failure');
});

test('Code-tab preserves six motors only in the sandbox', async () => {
    for (const sandbox of [true, false]) {
        const s = scaffold(); Object.assign(s.pane.state, {sandbox, topology: 'six-motors'});
        await codeMethod(s.window).call(s.editor);
        assert.equal(s.pane.state.topology, sandbox ? 'six-motors' : 'default');
        assert.ok(s.calls.some(call => Array.isArray(call) && call[0] === 'start'));
    }
});
