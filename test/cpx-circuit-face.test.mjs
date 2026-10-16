import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {EventEmitter} from 'node:events';
import vm from 'node:vm';
import {scopeAfter} from './helpers/js-scope.mjs';
import {cpxExtensionSource} from '../scripts/lib/cpx-extension-run.mjs';

const path = 'scratch-gui/src/components/tw-pseudocode/circuit-tab.jsx';
const source = readFileSync(new URL(`../overlay/${path}`, import.meta.url), 'utf8');

function fixture(text = source) {
    const runtime = new EventEmitter();
    runtime.targets = [];
    const hats = [];
    let ext;
    runtime.startHats = (opcode, fields) => {
        hats.push({opcode, ...fields});
        // Real extension input starts the real registered hat boundary; its
        // handler drives the same extension the face and pane both read.
        if (opcode === 'circuitplayground_whenbutton' && fields.BUTTON === 'A' && fields.EVENT === 'down') {
            ext.setall({COLOR: 'blue'});
        }
    };
    vm.runInNewContext(cpxExtensionSource(), {Scratch: {
        vm: {runtime}, extensions: {register: value => { ext = value; }},
        BlockType: {COMMAND: 'command', REPORTER: 'reporter', BOOLEAN: 'boolean', HAT: 'hat'},
        ArgumentType: {NUMBER: 'number', STRING: 'string'}
    }, setTimeout, clearTimeout, Date, console});
    const host = {props: {vm: {runtime}}, state: {cpxState: runtime.bwCpxState}, updates: 0,
        setState(update) {
            const patch = typeof update === 'function' ? update(this.state) : update;
            if (patch) { this.state = {...this.state, ...patch}; this.updates++; }
        }};
    for (const [method, parameter] of [['handleCpxState', 'next'], ['handleCpxInput', 'input'],
        ['subscribeCpxRuntime', 'runtime']]) {
        host[method] = new Function(parameter, scopeAfter(text, `${method} (${parameter})`)).bind(host);
    }
    host.subscribeCpxRuntime(runtime);
    return {runtime, ext, host, hats};
}

function buttonJourney(text = source) {
    const {runtime, ext, host, hats} = fixture(text);
    try {
        ext.setbrightness({BRIGHTNESS: 255});
        ext.setall({COLOR: 'red'});
        assert.deepEqual(Array.from(host.state.cpxState.shown), Array(10).fill(0xff0000));
        host.handleCpxInput({button: 'A', down: true});
        assert.ok(hats.some(h => h.opcode === 'circuitplayground_whenbutton' && h.BUTTON === 'A' && h.EVENT === 'down'),
            'Face A must reach the original hat');
        assert.deepEqual(Array.from(host.state.cpxState.shown), Array(10).fill(0x0000ff));
        assert.equal(host.state.cpxState.buttons.A, true);
        host.handleCpxInput({button: 'A', down: false});
        assert.equal(host.state.cpxState.buttons.A, false);
        assert.ok(hats.some(h => h.BUTTON === 'A' && h.EVENT === 'click'));
        assert.deepEqual(Array.from(host.state.cpxState.shown), Array.from(runtime.bwCpxState.shown));
    } finally { host.subscribeCpxRuntime(null); }
}

test('the actual bundled CPX extension drives the face and receives its A-button edges', () => {
    buttonJourney();
});

test('dropping the host button callback breaks the same real-extension journey', () => {
    const mutant = source.replace('board.setButton(input.button, input.down);', '/* omitted */');
    assert.notEqual(mutant, source);
    assert.throws(() => buttonJourney(mutant), /Face A must reach the original hat/);
});

test('switch input reaches the extension; unsupported input does not drive other controls', () => {
    const {runtime, host, hats} = fixture();
    const right = !runtime.bwCpxState.switchRight;
    host.handleCpxInput({switchRight: right});
    assert.equal(runtime.bwCpxState.switchRight, right);
    assert.equal(host.state.cpxState.switchRight, right);
    assert.ok(hats.some(h => h.opcode === 'circuitplayground_whenswitch'));
    const count = hats.length;
    for (const input of [null, {}, {button: 'A', down: 'true'}, {button: 'A1', down: true}, {switchRight: 'false'}]) {
        host.handleCpxInput(input);
    }
    assert.equal(hats.length, count);
    host.subscribeCpxRuntime(null);
});

test('sensor-only publications retain the face snapshot and avoid designer redraws', () => {
    const {host, ext} = fixture();
    const snapshot = host.state.cpxState;
    const before = host.updates;
    ext.setTemperature(32);
    ext.setLightLevel(99);
    ext.setSoundLevel(4);
    assert.equal(host.updates, before);
    assert.equal(host.state.cpxState, snapshot);
    ext.setpixel({INDEX: 7, COLOR: 'green'});
    assert.equal(host.updates, before + 1);
    assert.notEqual(host.state.cpxState.shown[7], snapshot.shown[7]);
    host.subscribeCpxRuntime(null);
});

test('runtime replacement and disconnection remove the original listener', () => {
    const {host, runtime} = fixture();
    assert.equal(runtime.listenerCount('CPX_STATE'), 1);
    const replacement = new EventEmitter();
    replacement.bwCpxState = {shown: Array(10).fill(123), buttons: {A: false, B: false}};
    host.props.vm = {runtime: replacement};
    host.subscribeCpxRuntime(replacement);
    assert.equal(runtime.listenerCount('CPX_STATE'), 0);
    assert.equal(replacement.listenerCount('CPX_STATE'), 1);
    assert.equal(host.state.cpxState, replacement.bwCpxState);
    host.subscribeCpxRuntime(null);
    assert.equal(replacement.listenerCount('CPX_STATE'), 0);
    assert.equal(host.state.cpxState, null);
});

test('the mounted designer receives the bridge, lifetime wiring and exact package mirror', () => {
    assert.match(source, /cpxState=\{this\.state\.cpxState\}/);
    assert.match(source, /onCpxInput=\{this\.handleCpxInput\}/);
    assert.match(scopeAfter(source, 'componentDidMount ()'), /this\.subscribeCpxRuntime\(this\.props\.vm\?\.runtime\)/);
    assert.match(scopeAfter(source, 'componentDidUpdate (prevProps, prevState)'), /this\.subscribeCpxRuntime/);
    assert.match(scopeAfter(source, 'componentWillUnmount ()'), /removeListener\('CPX_STATE', this\.handleCpxState\)/);
    assert.equal(readFileSync(new URL(`../packages/${path}`, import.meta.url), 'utf8'), source);
});
