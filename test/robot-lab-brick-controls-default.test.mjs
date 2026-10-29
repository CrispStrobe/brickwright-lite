// SPDX-License-Identifier: BSD-3-Clause
// Brick buttons and program connection belong inside Manual controls, including
// programs with button handlers. Actual button delivery and release stay unchanged.
import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {resolve} from 'node:path';
import {readFileSync} from 'node:fs';
import * as motorControl from '../overlay/scratch-gui/src/components/tw-pseudocode/sim-lab-motor-control.js';

test('brick buttons have one rendering site inside Manual controls regardless of program handlers', () => {
    const pane = readFileSync(new URL('../overlay/scratch-gui/src/components/tw-pseudocode/sim-lab-pane.jsx', import.meta.url), 'utf8');
    assert.doesNotMatch(pane, /programUsesBrickButtons/);
    assert.match(pane, /this\.renderMixer\(button,\s+!this\.api\?\.brickButtons\(\)\?\.length \? null : this\.renderBrickButtons\(\)\)/);
    assert.match(pane, /brick=\{brick \|\| null\}/);
    assert.equal((pane.match(/this\.renderBrickButtons\(\)/g) || []).length, 1);
    assert.equal((pane.match(/<SimLabBrickButtons /g) || []).length, 1);
    assert.match(pane, /connection=\{this\.renderConnections\(\)\}/);
});

const requireGui = createRequire(process.env.BW_TEST_BABEL_ROOT
    ? resolve(process.env.BW_TEST_BABEL_ROOT, 'package.json')
    : new URL('../packages/scratch-gui/package.json', import.meta.url));
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
