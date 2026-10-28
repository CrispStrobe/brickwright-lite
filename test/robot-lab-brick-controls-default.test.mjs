// SPDX-License-Identifier: BSD-3-Clause
// The Robot Lab "Brick buttons" panel shows by default only when the program has brick-button
// handlers; otherwise Manual controls offers it as a folded "Brick controls" section.
import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {readFileSync} from 'node:fs';
import {isBrickButtonOpcode, programUsesBrickButtons} from '../overlay/scratch-gui/src/components/tw-pseudocode/sim-lab-brick-handlers.js';
import * as motorControl from '../overlay/scratch-gui/src/components/tw-pseudocode/sim-lab-motor-control.js';

const vmWith = (...opcodes) => ({runtime: {targets: [{blocks: {_blocks: Object.fromEntries(opcodes.map((opcode, i) => [`b${i}`, {opcode}]))}}]}});

test('brick-button opcodes of robot hubs count as handlers', () => {
    for (const opcode of ['spikeprime_whenButtonPressed', 'spikeprime_isButtonPressed', 'ev3_whenButtonPressed',
        'ev3_buttonPressed', 'legonxt_buttonPressed', 'ev3comprehensive_waitForButton', 'legopoweredup_whenButtonPressed']) {
        assert.equal(isBrickButtonOpcode(opcode), true, opcode);
    }
});

test('button lights, remotes and non-hub devices are not brick-button handlers', () => {
    for (const opcode of ['spikeprime_setCenterButtonColor', 'ev3comprehensive_irRemoteButton', 'microbit_whenButtonPressed',
        'arcade_whenButton', 'universalgamepad_isButtonPressed', 'circuitplayground_whenbutton', 'spikeprime_motorRun', null]) {
        assert.equal(isBrickButtonOpcode(opcode), false, String(opcode));
    }
});

test('program scan follows the project, including edits that add a handler', () => {
    assert.equal(programUsesBrickButtons(null), false);
    assert.equal(programUsesBrickButtons({runtime: {targets: []}}), false);
    const vm = vmWith('event_whenflagclicked', 'spikeprime_motorRun');
    assert.equal(programUsesBrickButtons(vm), false);
    vm.runtime.targets[0].blocks._blocks.added = {opcode: 'spikeprime_whenButtonPressed'};
    assert.equal(programUsesBrickButtons(vm), true);
    assert.equal(programUsesBrickButtons(vmWith('ev3_whenButtonPressed')), true);
});

test('the pane renders the standalone panel only for handlers and offers it in Manual controls otherwise', () => {
    const pane = readFileSync(new URL('../overlay/scratch-gui/src/components/tw-pseudocode/sim-lab-pane.jsx', import.meta.url), 'utf8');
    assert.match(pane, /programUsesBrickButtons\(this\.props\.vm\) &&\s+this\.renderBrickButtons\(\)\}/);
    assert.match(pane, /this\.renderMixer\(button,\s+programUsesBrickButtons\(this\.props\.vm\) \|\| !this\.api\?\.brickButtons\(\)\?\.length \? null : this\.renderBrickButtons\(\)\)/);
    assert.match(pane, /brick=\{brick \|\| null\}/);
    assert.equal((pane.match(/<SimLabBrickButtons /g) || []).length, 1);
});

const requireGui = createRequire(new URL('../packages/scratch-gui/package.json', import.meta.url));
const loadMixer = () => {
    const babel = requireGui('@babel/core');
    const source = readFileSync(new URL('../overlay/scratch-gui/src/components/tw-pseudocode/sim-lab-motor-mixer.jsx', import.meta.url), 'utf8');
    const code = babel.transformSync(source, {filename: 'sim-lab-motor-mixer.jsx', babelrc: false, configFile: false,
        presets: [requireGui.resolve('@babel/preset-react')], plugins: [requireGui.resolve('@babel/plugin-transform-modules-commonjs')]}).code;
    const module = {exports: {}};
    new Function('require', 'module', 'exports', code)(name => (name === './sim-lab-motor-control.js' ? motorControl : requireGui(name)), module, module.exports);
    return module.exports.default;
};

test('Manual controls shows an optional folded Brick controls section', () => {
    const React = requireGui('react');
    const {renderToStaticMarkup} = requireGui('react-dom/server');
    const Mixer = loadMixer();
    const noop = () => {};
    const base = {motors: [], power: {}, open: false, locale: 'en', onToggle: noop, onPower: noop, onJog: noop, onStop: noop,
        onStopAll: noop, override: false, onOverride: noop, onClose: noop, onBrickToggle: noop};
    const brick = React.createElement('fieldset', {'data-testid': 'bw-sim-lab-brick-buttons'});
    const none = renderToStaticMarkup(React.createElement(Mixer, base));
    assert.doesNotMatch(none, /bw-sim-lab-brick-controls/);
    const folded = renderToStaticMarkup(React.createElement(Mixer, {...base, brick}));
    assert.match(folded, /data-testid="bw-sim-lab-brick-controls-toggle" aria-expanded="false"[^>]*>Brick controls ▸/);
    assert.doesNotMatch(folded, /bw-sim-lab-brick-buttons/);
    const opened = renderToStaticMarkup(React.createElement(Mixer, {...base, brick, brickOpen: true}));
    assert.match(opened, /aria-expanded="true"[^>]*>Brick controls ▾/);
    assert.match(opened, /data-testid="bw-sim-lab-brick-controls"><fieldset data-testid="bw-sim-lab-brick-buttons"/);
    assert.match(renderToStaticMarkup(React.createElement(Mixer, {...base, brick, locale: 'de'})), /Hub-Tasten ▸/);
});

test('the program connection is only a folded section of Manual controls, never above the scene', () => {
    const pane = readFileSync(new URL('../overlay/scratch-gui/src/components/tw-pseudocode/sim-lab-pane.jsx', import.meta.url), 'utf8');
    assert.equal((pane.match(/<SimLabConnections /g) || []).length, 1);
    const at = pane.indexOf('<SimLabConnections ');
    assert.ok(pane.lastIndexOf('renderConnections () {', at) > pane.lastIndexOf('\n    render', at - 30) - 1 &&
        pane.lastIndexOf('    renderConnections () {', at) !== -1, 'rendered only by renderConnections()');
    assert.match(pane, /connection=\{this\.renderConnections\(\)\}/);
    const React = requireGui('react');
    const {renderToStaticMarkup} = requireGui('react-dom/server');
    const Mixer = loadMixer();
    const noop = () => {};
    const base = {motors: [], power: {}, open: false, locale: 'en', onToggle: noop, onPower: noop, onJog: noop, onStop: noop,
        onStopAll: noop, override: false, onOverride: noop, onClose: noop, onConnectionToggle: noop};
    const connection = React.createElement('fieldset', {'data-testid': 'bw-sim-lab-connections'});
    assert.doesNotMatch(renderToStaticMarkup(React.createElement(Mixer, base)), /bw-sim-lab-connection-toggle/);
    const folded = renderToStaticMarkup(React.createElement(Mixer, {...base, connection}));
    assert.match(folded, /data-testid="bw-sim-lab-connection-toggle" aria-expanded="false"[^>]*>Connection ▸/);
    assert.doesNotMatch(folded, /bw-sim-lab-connections/);
    const opened = renderToStaticMarkup(React.createElement(Mixer, {...base, connection, connectionOpen: true}));
    assert.match(opened, /aria-expanded="true"[^>]*>Connection ▾/);
    assert.match(opened, /<fieldset data-testid="bw-sim-lab-connections"/);
    assert.match(renderToStaticMarkup(React.createElement(Mixer, {...base, connection, locale: 'de'})), /Verbindung ▸/);
});
