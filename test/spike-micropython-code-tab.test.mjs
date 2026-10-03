// SPDX-License-Identifier: BSD-3-Clause
// Copyright (c) 2026 Brickwright contributors
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {encodeSource} from '../overlay/scratch-gui/src/lib/spike-micropython/raw-repl.js';
const importer = readFileSync(new URL('../overlay/scratch-gui/src/components/tw-pseudocode/pseudocode-importer.jsx', import.meta.url), 'utf8');
const paneSource = readFileSync(new URL('../overlay/scratch-gui/src/components/tw-pseudocode/spike-arena-pane.jsx', import.meta.url), 'utf8');
// Execute the actual method with a neutral browser/pane scaffold. Inject only
// its dynamic module import; encoding still uses the production encoder.
const codeMethod = (window, mutation = value => value) => {
    const body = importer.slice(importer.indexOf('    async runOnMicroPythonImage () {'), importer.indexOf('    async runOnSpikeFirmware () {'));
    const injected = mutation(body.replace("const {encodeSource} = await import('../../lib/spike-micropython/raw-repl.js');", ''));
    return new Function('window', 'encodeSource', `return ({${injected}}).runOnMicroPythonImage;`)(window, encodeSource);
};
const paneMethod = window => {
    const body = paneSource.slice(paneSource.indexOf('    async chooseMicroPythonImage () {'), paneSource.indexOf('    async startFirmware ('));
    return new Function('window', `return ({${body}}).chooseMicroPythonImage;`)(window);
};
const scaffold = ({selected = true, source = 'print(42)', previouslySelected = false} = {}) => {
    const calls = [];
    const pane = {bridge: {}, state: {microImageSelected: previouslySelected},
        setState (next, done) {Object.assign(this.state, next); done?.();},
        async stopProgram () {calls.push('stop');},
        async chooseMicroPythonImage () {calls.push('choose'); if (selected instanceof Error) throw selected; return selected;},
        async startFirmware (program, args) {calls.push(['start', program, args.source]); this.firmwareSession = {};} };
    const editor = {state: {}, openSpikeArena () {calls.push('open');}, activeCode: () => source,
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
