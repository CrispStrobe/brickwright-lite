// SPDX-License-Identifier: BSD-3-Clause
// Copyright (c) 2026 Brickwright contributors
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createCodeRunFeedback} from '../overlay/scratch-gui/src/lib/spike-arena/code-run-feedback.js';
import {encodePython, encodeInstructions} from '../overlay/scratch-gui/src/lib/spike-nuttx/upload-protocol.js';

const importer = readFileSync(new URL('../overlay/scratch-gui/src/components/tw-pseudocode/pseudocode-importer.jsx', import.meta.url), 'utf8');
const paneSource = readFileSync(new URL('../overlay/scratch-gui/src/components/tw-pseudocode/spike-arena-pane.jsx', import.meta.url), 'utf8');
const runMethod = window => {
    const body = importer.slice(importer.indexOf('    async runOnNuttxPython () {'), importer.indexOf('    // New MicroPython execution glue:'));
    return new Function('window', 'createCodeRunFeedback', `return ({${body}}).runOnNuttxPython;`)(window, createCodeRunFeedback);
};
const feedbackFixture = () => {
    const state = {};
    const feedback = createCodeRunFeedback(next => Object.assign(state, next), {running: 'running', completed: 'completed'});
    return {state, feedback};
};

test('startup feedback exposes Stop with starting text and cannot overwrite a later observation', () => {
    const f = feedbackFixture();
    f.feedback.callbacks.onStarting('Simulation wird gestartet…');
    assert.deepEqual(f.state, {spike3Running: true, status: 'Simulation wird gestartet…'});
    f.feedback.callbacks.onProgramState(2, true, 0);
    f.feedback.callbacks.onStarting('late startup');
    assert.deepEqual(f.state, {spike3Running: true, status: 'running'});
    for (const finish of [
        x => x.requestStop(),
        x => x.callbacks.onCompleted(),
        x => x.callbacks.onError(new Error('startup failed')),
        x => x.callbacks.onProgramState(1, true, 0),
        x => x.callbacks.onProgramState(4, true, 0)
    ]) {
        const next = feedbackFixture();
        finish(next.feedback);
        const terminal = {...next.state};
        next.feedback.callbacks.onStarting('late startup');
        next.feedback.started();
        assert.deepEqual(next.state, terminal);
        assert.equal(next.state.spike3Running, false);
    }
});

test('firmware cancellation/failure clears running and preserves terminal state across startup completion', () => {
    for (const [state, message] of [[3, 'completed'], [4, 'Stopped.'], [5, 'Firmware program failed (7).']]) {
        const f = feedbackFixture();
        f.feedback.callbacks.onProgramState(2, true, 0);
        assert.equal(f.state.spike3Running, true);
        f.feedback.callbacks.onProgramState(state, true, 7);
        f.feedback.started(); f.feedback.callbacks.onStopped();
        assert.deepEqual(f.state, {spike3Running: false, status: message});
        f.feedback.callbacks.onProgramState(2, true, 0);
        assert.deepEqual(f.state, {spike3Running: true, status: 'running'});
    }
});
test('completion and asynchronous transport failure survive subsequent session close', () => {
    for (const completed of [true, false]) {
        const f = feedbackFixture(); f.feedback.started();
        if (completed) f.feedback.callbacks.onCompleted();
        else f.feedback.callbacks.onError(new Error('transport failed'));
        f.feedback.callbacks.onStopped(); f.feedback.started();
        assert.deepEqual(f.state, {spike3Running: false, status: completed ? 'completed' : 'transport failed'});
    }
});
test('actual Code-tab method handles Arena Stop and completion during startup', async () => {
    for (const earlyCompletion of [false, true]) {
        let callbacks;
        const pane = {bridge: {}, state: {}, setState(next, done) {Object.assign(this.state, next); done?.();},
            async stopProgram() {}, async startFirmware(program, options) {
                callbacks = options; this.firmwareSession = {};
                if (earlyCompletion) options.onCompleted();
            }};
        const editor = {state: {}, L: {spike3Stopped: 'Stopped.'}, openSpikeArena() {}, activeCode: () => 'pass',
            setState(next) {Object.assign(this.state, next);}};
        await runMethod({__bwSpikeArena: {_pane: pane, bridge: pane.bridge}}).call(editor);
        assert.equal(editor.state.spike3Running, !earlyCompletion);
        if (!earlyCompletion) callbacks.onProgramState(4, true, 0);
        assert.equal(editor.state.spike3Running, false);
        assert.equal(editor.state.status, earlyCompletion ? 'Python firmware program completed.' : 'Stopped.');
    }
});
test('pane observers forward cancellation and close while rejecting stale program telemetry', () => {
    const body = paneSource.slice(paneSource.indexOf('    firmwareProgramObserver ('), paneSource.indexOf('    async startFirmware ('));
    const methods = new Function(`return class {${body}};`)().prototype;
    const session = {}, events = [];
    const pane = {firmwareSession: session, setState() {}};
    const observe = methods.firmwareProgramObserver.call(pane, session, state => events.push(state));
    observe(4, true, 0); assert.deepEqual(events, [4]);
    const close = methods.firmwareStoppedObserver.call(pane, session, 'nuttx', null, () => events.push('closed'));
    pane.firmwareSession = null; close();
    assert.deepEqual(events, [4, 'closed']);
    observe(2, true, 0); assert.deepEqual(events, [4, 'closed']);
});

test('reupload replaces the previous program callbacks instead of accumulating listeners', async () => {
    const body = paneSource.slice(paneSource.indexOf('    firmwareProgramObserver ('), paneSource.indexOf('    async programStorage ('));
    const Pane = new Function('encodePython', 'encodeInstructions', `return class {${body}};`)(encodePython, encodeInstructions);
    const pane = new Pane(), events = [];
    Object.assign(pane, {bridge: {}, state: {execution: 'nuttx', topology: 'default'},
        setState(next) {Object.assign(this.state, next);}});
    const session = {storageSupported: true, topology: 'default',
        onProgramState() {events.push('obsolete');},
        async uploadProgram() {this.programState = 2; this.onProgramState(2, true, 0);
            this.programState = 4; this.onProgramState(4, true, 0);}};
    pane.firmwareSession = session;
    for (const run of ['first', 'second']) {
        await pane.startFirmware(null, {source: 'pass',
            onStarting: () => events.push([run, 'unexpected startup']),
            onProgramState: state => events.push([run, state]), onStopped: () => events.push([run, 'closed'])});
        assert.equal(pane.state.status, 'paused');
        assert.equal(pane.state.message, 'Program stopped.');
    }
    session.onStopped();
    assert.deepEqual(events, [['first', 2], ['first', 4], ['second', 2], ['second', 4], ['second', 'closed']]);
});

test('actual Code Stop handler is usable during startup before any firmware observation', async () => {
    let finish, callbacks, stopped = 0;
    const pane = {bridge: {}, state: {}, setState(next, done) {Object.assign(this.state, next); done?.();},
        async stopProgram() {stopped++; this.firmwareSession = null; callbacks.onStopped();},
        async startFirmware(program, options) {
            callbacks = options; this.firmwareSession = {};
            options.onStarting('Starting firmware simulation…');
            await new Promise(resolve => {finish = resolve;});
        }};
    const editor = {state: {}, L: {spike3Stopped: 'Stopped.'}, openSpikeArena() {}, activeCode: () => 'pass',
        setState(next) {Object.assign(this.state, next);}};
    const result = runMethod({__bwSpikeArena: {_pane: pane, bridge: pane.bridge}}).call(editor);
    while (!finish) await new Promise(resolve => setImmediate(resolve));
    assert.equal(editor.state.spike3Running, true);
    assert.equal(editor.state.status, 'Starting firmware simulation…');
    assert.equal(typeof editor._spike3Stop, 'function');
    await editor._spike3Stop(); finish(); await result;
    assert.equal(stopped, 1);
    assert.deepEqual({running: editor.state.spike3Running, status: editor.state.status}, {running: false, status: 'Stopped.'});
});

test('cold pane startup notifies after session startup and observer binding, then preserves cancellation', async () => {
    const body = paneSource.slice(paneSource.indexOf('    firmwareProgramObserver ('), paneSource.indexOf('    async programStorage ('));
    for (const locale of ['en', 'de']) {
        let settle, session;
        const events = [];
        class PendingSession {
            constructor () { session = this; }
            start () {
                assert.equal(typeof this.onStopped, 'function');
                assert.equal(typeof this.onProgramState, 'function');
                events.push('start');
                return new Promise(resolve => {settle = resolve;});
            }
        }
        const Pane = new Function('encodePython', 'encodeInstructions', 'RenodeArenaSession',
            `return class {${body}};`)(encodePython, encodeInstructions, PendingSession);
        const pane = new Pane(), f = feedbackFixture();
        Object.assign(pane, {locale, bridge: {reset() {}}, state: {execution: 'nuttx', topology: 'default'},
            hubState: {setSimulationEnabled() {}}, nativeCapabilities: () => ({}),
            async stopProgram() {}, setState(next) {Object.assign(this.state, next);}});
        const startup = pane.startFirmware(null, {source: 'pass', ...f.feedback.callbacks,
            onStarting: message => {
                assert.equal(pane.firmwareSession, session);
                assert.deepEqual(events, ['start']);
                events.push('notification');
                f.feedback.callbacks.onStarting(message);
            }});
        for (let i = 0; i < 10 && !settle; i++) await new Promise(resolve => setImmediate(resolve));
        assert.equal(typeof settle, 'function');
        assert.deepEqual(events, ['start', 'notification']);
        assert.deepEqual(f.state, {spike3Running: true,
            status: locale === 'de' ? 'Simulation wird gestartet…' : 'Starting firmware simulation…'});
        f.feedback.requestStop();
        pane.firmwareSession = null;
        session.onStopped();
        settle(); await startup;
        f.feedback.started();
        session.onProgramState(2, true, 0);
        assert.deepEqual(f.state, {spike3Running: false, status: 'Stopped.'});
    }
});

test('invalid cold-start input does not notify, replace a session or reserve simulation', async () => {
    const body = paneSource.slice(paneSource.indexOf('    firmwareProgramObserver ('), paneSource.indexOf('    async programStorage ('));
    let mutations = 0;
    class RefusedSession { constructor () {mutations++;} }
    const Pane = new Function('encodePython', 'encodeInstructions', 'RenodeArenaSession',
        `return class {${body}};`)(encodePython, encodeInstructions, RefusedSession);
    const pane = new Pane(), existing = {topology: 'default'};
    Object.assign(pane, {bridge: {}, firmwareSession: existing, state: {execution: 'nuttx', topology: 'default'},
        hubState: {setSimulationEnabled() {mutations++;}},
        async stopProgram() {mutations++;}, setState() {mutations++;}});
    await assert.rejects(pane.startFirmware(null, {source: {}, onStarting: () => {mutations++;}}));
    assert.equal(mutations, 0);
    assert.equal(pane.firmwareSession, existing);
});

test('READY is not reported as running and closing it reports stopped', () => {
    const f = feedbackFixture();
    f.feedback.callbacks.onProgramState(1, true, 0); f.feedback.started();
    assert.equal(f.state.spike3Running, false);
    f.feedback.callbacks.onStopped();
    assert.equal(f.state.status, 'Stopped.'); assert.equal(f.feedback.cancelled, true);
});

test('automatic STOP during reupload does not hide a subsequent upload error', async () => {
    const pane = {bridge: {}, state: {}, setState(next, done) {Object.assign(this.state, next); done?.();},
        async stopProgram() {}, async startFirmware(program, options) {
            this.firmwareSession = {};
            options.onProgramState(4, true, 0);
            throw new Error('upload rejected');
        }};
    const editor = {state: {}, L: {spike3Stopped: 'Stopped.'}, openSpikeArena() {}, activeCode: () => 'pass',
        setState(next) {Object.assign(this.state, next);}};
    await runMethod({__bwSpikeArena: {_pane: pane, bridge: pane.bridge}}).call(editor);
    assert.equal(editor.state.spike3Running, false);
    assert.equal(editor.state.status, 'upload rejected');
});

test('early terminal state is preserved in the arena even without storage support', () => {
    const body = paneSource.slice(paneSource.indexOf('    firmwareProgramObserver ('), paneSource.indexOf('    async startFirmware ('));
    const methods = new Function(`return class {${body}};`)().prototype;
    for (const state of [3, 4, 5]) {
        const session = {storageSupported: false, programState: state};
        const pane = {state: {message: 'observed failure'}, firmwareSession: session,
            setState(next) {Object.assign(this.state, next);}};
        methods.firmwareStartedState.call(pane, session, 'incorrect running text');
        assert.equal(pane.state.status, 'paused');
        assert.notEqual(pane.state.message, 'incorrect running text');
    }
});

test('closing the arena during previous-session teardown cannot start another simulator', async () => {
    const body = paneSource.slice(paneSource.indexOf('    firmwareProgramObserver ('), paneSource.indexOf('    async programStorage ('));
    const Pane = new Function('encodePython', 'encodeInstructions', `return class {${body}};`)(encodePython, encodeInstructions);
    const pane = new Pane(); let finish, mutations = 0;
    Object.assign(pane, {bridge: {}, state: {execution: 'nuttx', topology: 'default'},
        hubState: {setSimulationEnabled() {mutations++;}},
        stopProgram: () => new Promise(resolve => {finish = resolve;})});
    const result = pane.startFirmware(null, {source: 'pass'});
    pane.disposed = true; finish();
    await assert.rejects(result, /arena pane is closed/);
    assert.equal(mutations, 0);
    assert.equal(pane.firmwareSession, undefined);
});

test('repeated firmware polls do not repeatedly render the Code tab', () => {
    const updates = [];
    const f = createCodeRunFeedback(state => updates.push(state), {running: 'running', completed: 'done'});
    for (let i = 0; i < 50; i++) f.callbacks.onProgramState(2, true, 0);
    assert.equal(updates.length, 1);
    f.callbacks.onProgramState(4, true, 0);
    assert.equal(updates.length, 2);
});
