// SPDX-License-Identifier: BSD-3-Clause
// Actual React component and brick API at a controlled DOM event boundary.
// JSDOM does not implement pointer capture: the successful-capture controls
// explicitly supply that DOM edge. Built-browser capture remains a separate gate.
import test, {after} from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {readFileSync} from 'node:fs';
import {createBrickButtonInputs} from '../overlay/scratch-gui/src/lib/bw-sim/api/brick-button-inputs.js';
import {createRobotLabApi} from '../overlay/scratch-gui/src/lib/bw-sim/api/robot-lab-api.js';
import {Ev3VirtualHub} from '../overlay/scratch-gui/src/lib/bw-sim/hubs/ev3/ev3-virtual-hub.js';
const requireGui = createRequire(new URL('../packages/scratch-gui/package.json', import.meta.url));
// Use the modern DOM already pinned beneath the GUI sanitizer, rather than
// the GUI's separate legacy jsdom 9 test dependency. No dependency is added.
const {JSDOM} = createRequire(requireGui.resolve('isomorphic-dompurify'))('jsdom');
const dom = new JSDOM('<!doctype html><html><body></body></html>', {pretendToBeVisual: true, url: 'http://localhost/'});
const globals = new Map();
for (const [key, value] of Object.entries({window: dom.window, document: dom.window.document, navigator: dom.window.navigator, MessageChannel: dom.window.MessageChannel,
    requestAnimationFrame: dom.window.requestAnimationFrame.bind(dom.window), cancelAnimationFrame: dom.window.cancelAnimationFrame.bind(dom.window)})) {
    globals.set(key, Object.getOwnPropertyDescriptor(globalThis, key));
    Object.defineProperty(globalThis, key, {configurable: true, writable: true, value});
}
const React = requireGui('react');
const ReactDOM = requireGui('react-dom');
const {act, Simulate} = requireGui('react-dom/test-utils');
const babel = requireGui('@babel/core');
const source = readFileSync(new URL('../overlay/scratch-gui/src/components/tw-pseudocode/sim-lab-brick-buttons.jsx', import.meta.url), 'utf8');
const transformed = babel.transformSync(source, {filename: 'sim-lab-brick-buttons.jsx', babelrc: false, configFile: false,
    presets: [requireGui.resolve('@babel/preset-react')], plugins: [requireGui.resolve('@babel/plugin-transform-modules-commonjs')]}).code;
const module = {exports: {}};
new Function('require', 'module', 'exports', transformed)(name => name.endsWith('/api/brick-button-inputs.js') ?
    {createBrickButtonInputs} : requireGui(name), module, module.exports);
const Panel = module.exports.default;
after(() => {
    dom.window.close();
    for (const [key, descriptor] of globals) {
        if (descriptor) Object.defineProperty(globalThis, key, descriptor);
        else delete globalThis[key];
    }
});
const scene = () => ({hubs: [{id: 'brick', profile: 'ev3', hub: new Ev3VirtualHub()}]});
const fixture = t => {
    let current = scene();
    const initial = current;
    const errors = [];
    const api = createRobotLabApi({getSession: () => current});
    const container = document.createElement('div'); document.body.append(container);
    let props = {locale: 'en', api, scene: current, disabled: false, onError: error => errors.push(error)};
    const render = delta => {props = {...props, ...delta}; act(() => {ReactDOM.render(React.createElement(Panel, props), container);});};
    const unmount = () => act(() => {ReactDOM.unmountComponentAtNode(container);});
    render();
    t.after(() => {unmount(); api.dispose(); container.remove(); assert.deepEqual(errors, []);});
    return {api, initial, container, render, unmount, replace: next => {current = next; render({scene: next});},
        button: (name = 'enter') => container.querySelector(`button[data-button="${name}"]`),
        pressed: (name = 'enter') => api.brickButtons()[0].buttons.find(button => button.name === name).pressed};
};
const pointer = (f, id = 7) => {
    const button = f.button();
    const captures = [];
    button.setPointerCapture = value => captures.push(value);
    act(() => Simulate.pointerDown(button, {button: 0, pointerId: id}));
    assert.deepEqual(captures, [id]);
    return button;
};

test('actual keyboard callbacks hold once across repeat and release on keyup', t => {
    const f = fixture(t); const button = f.button();
    act(() => Simulate.keyDown(button, {key: ' ', repeat: false}));
    assert.equal(f.pressed(), true); assert.equal(button.getAttribute('aria-pressed'), 'true');
    act(() => Simulate.keyDown(button, {key: ' ', repeat: true}));
    act(() => Simulate.keyUp(button, {key: ' '}));
    assert.equal(f.pressed(), false); assert.equal(button.getAttribute('aria-pressed'), 'false');
});

for (const terminal of ['pointerUp', 'pointerCancel', 'lostPointerCapture']) test(`actual ${terminal} releases only its owned pointer hold`, t => {
    const f = fixture(t); const button = pointer(f);
    assert.equal(f.pressed(), true);
    act(() => Simulate.keyDown(button, {key: 'Enter', repeat: false}));
    act(() => Simulate[terminal](button, {pointerId: 7}));
    assert.equal(f.pressed(), true, 'independent keyboard hold survives');
    act(() => Simulate.keyUp(button, {key: 'Enter'}));
    assert.equal(f.pressed(), false);
});

test('a failed DOM pointer capture rolls back the acquired real API input', t => {
    const f = fixture(t); const button = f.button();
    button.setPointerCapture = () => {throw new Error('capture refused');};
    act(() => Simulate.pointerDown(button, {button: 0, pointerId: 9}));
    assert.equal(f.pressed(), false);
});

test('window blur releases UI holds while preserving an independent API owner', t => {
    const f = fixture(t); const external = f.api.holdButton('brick', 'enter');
    pointer(f);
    act(() => {window.dispatchEvent(new window.Event('blur'));});
    assert.equal(f.pressed(), true);
    external.release(); assert.equal(f.pressed(), false);
});

test('disabling or replacing the model releases old DOM input without pressing the replacement brick', t => {
    const f = fixture(t); pointer(f);
    f.render({disabled: true}); assert.equal(f.pressed(), false);
    f.render({disabled: false}); pointer(f);
    const next = scene(); f.replace(next);
    assert.equal(f.initial.hubs[0].hub.button(2), false);
    assert.equal(next.hubs[0].hub.button(2), false);
});

test('unmount releases pointer and keyboard ownership but leaves independent inputs alone', t => {
    const f = fixture(t); const external = f.api.holdButton('brick', 'up');
    const button = pointer(f);
    act(() => Simulate.keyDown(button, {key: 'Enter', repeat: false}));
    f.unmount();
    assert.equal(f.pressed(), false); assert.equal(f.pressed('up'), true);
    external.release(); assert.equal(f.pressed('up'), false);
});

test('assistive activation pulses the actual input and releases it without a second click', async t => {
    const f = fixture(t);
    act(() => Simulate.click(f.button(), {detail: 0}));
    assert.equal(f.pressed(), true);
    await act(async () => {await new Promise(resolve => setTimeout(resolve, 200));});
    assert.equal(f.pressed(), false);
});

test('native DOM focus loss releases a keyboard hold', t => {
    const f = fixture(t); const button = f.button();
    act(() => {button.focus();});
    act(() => Simulate.keyDown(button, {key: 'Enter', repeat: false}));
    assert.equal(f.pressed(), true);
    act(() => {f.button('up').focus();});
    assert.equal(f.pressed(), false);
});

test('page visibility loss releases held UI input', t => {
    const f = fixture(t); pointer(f);
    const original = Object.getOwnPropertyDescriptor(document, 'hidden');
    try {
        Object.defineProperty(document, 'hidden', {configurable: true, value: true});
        act(() => {document.dispatchEvent(new window.Event('visibilitychange'));});
        assert.equal(f.pressed(), false);
    } finally {
        if (original) Object.defineProperty(document, 'hidden', original);
        else delete document.hidden;
    }
});

test('a pointer release does not cancel a simultaneous assistive pulse', async t => {
    const f = fixture(t); const button = pointer(f);
    act(() => Simulate.click(button, {detail: 0}));
    act(() => Simulate.pointerUp(button, {pointerId: 7}));
    assert.equal(f.pressed(), true, 'the assistive input still owns its pulse');
    await act(async () => {await new Promise(resolve => setTimeout(resolve, 200));});
    assert.equal(f.pressed(), false);
});
