// SPDX-License-Identifier: BSD-3-Clause
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const read = name => readFileSync(new URL(`../${name}`, import.meta.url), 'utf8');
const gui = read('overlay/scratch-gui/src/components/gui/gui.jsx');
const panel = read('overlay/scratch-gui/src/components/tw-pseudocode/debug-panel.jsx');

test('machine mirror preserves default focus and permits a live background widget', () => {
    assert.equal(read('packages/scratch-gui/src/components/gui/gui.jsx'), gui);
    const anchor = gui.indexOf('// Mirror a running MACHINE');
    const start = gui.indexOf('        const start = payload => {', anchor);
    const end = gui.indexOf('        const onStart = e => start', start);
    assert.ok(anchor >= 0 && start > anchor && end > start, 'actual machine mirror start exists');
    const calls = [];
    const mirror = {start() { calls.push('start'); }};
    const win = {dispatchEvent(event) { calls.push(['dock', event.detail.value]); }};
    class Event { constructor(type, options) { this.type = type; this.detail = options.detail; } }
    const activate = {onActivateTab(index) { calls.push(['tab', index]); }};
    const factory = new Function('stop', 'createMachineVideoMirror', 'controllerPanel', 'setMachineConsole',
        'window', 'CustomEvent', 'props', 'CODE_TAB_INDEX',
        `let mirror; ${gui.slice(start, end)} return start;`);
    const run = factory(() => calls.push('stop'), ({videoFn}) => { assert.equal(videoFn(), 'frame'); return mirror; },
        {setMode(mode) { calls.push(['mode', mode]); }}, state => calls.push(['console', state.name]), win, Event, activate, 42);
    const payload = {widget: {name: 'display'}, videoFn: () => 'frame'};
    run(payload);
    assert.deepEqual(calls, ['stop', 'start', ['console', 'display'], ['mode', 'play'], ['dock', 'controller'], ['tab', 42]]);
    calls.length = 0;
    run({...payload, focusController: false});
    assert.deepEqual(calls, ['stop', 'start', ['console', 'display'], ['mode', 'play']],
        'the display still starts and remains available without changing the visible dock');
});

test('microbit mirror keeps debugger visible while other LabWired defaults remain', () => {
    assert.equal(read('packages/scratch-gui/src/components/tw-pseudocode/debug-panel.jsx'), panel);
    const start = panel.indexOf('    mirrorLabwiredDisplay (runner) {');
    const end = panel.indexOf('    setSamdButton (', start);
    assert.ok(start >= 0 && end > start, 'actual LabWired mirror method exists');
    const calls = [];
    const Panel = new Function('window', `return class { ${panel.slice(start, end)} };`)({
        bwMirrorMachineVideo: payload => calls.push(payload)
    });
    const p = new Panel();
    const runner = {video: () => ({width: 5, height: 5})};
    p.state = {kind: 'labwired', labwiredChip: 'board:microbit-v2'};
    p.mirrorLabwiredDisplay(runner);
    assert.equal(calls[0].focusController, false);
    assert.deepEqual(calls[0].videoFn(), {width: 5, height: 5});
    p.state.labwiredChip = 'board:other';
    p.mirrorLabwiredDisplay(runner);
    assert.equal(calls[1].focusController, undefined, 'other callers retain default focus');
    p.state.labwiredChip = 'firmware:esp32-4848s040-merged-flash';
    p.mirrorLabwiredDisplay({...runner, esp32S040PartId: 'panel-a'});
    assert.equal(calls.length, 2, 'a placed S040 retains its circuit face');
});
