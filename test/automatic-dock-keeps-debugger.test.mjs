// SPDX-License-Identifier: BSD-3-Clause
// The user decides what the right column shows. A run that opens Widgets on
// its own — a machine's video mirror, FPGA LEDs or seven-segment readout —
// sends the controller dock marked `automatic`; the Circuit tab must keep the
// debugger the user placed (browser gate I4: Pause beside the x86 Widgets).
// A controller dock the user picks still hides the stage debugger (#1691).
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createRequire} from 'node:module';
import {advanceDebugPhase} from '../overlay/scratch-gui/src/lib/bw-debug/debug-phase-transition.js';
import {shouldRefreshDesignerDebugState} from '../overlay/scratch-gui/src/lib/bw-debug/debug-ui-refresh.js';
import {applyBenchTemperature} from '../overlay/scratch-gui/src/lib/bench-temperature.js';

const requireGui = createRequire(new URL('../packages/scratch-gui/package.json', import.meta.url));
const babel = requireGui('@babel/core');
const requireBabel = createRequire(requireGui.resolve('@babel/core'));
const parser = requireBabel('@babel/parser');
const generate = requireBabel('@babel/generator').default;
const React = requireGui('react');
const read = path => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');
const parse = source => parser.parse(source, {sourceType: 'module', plugins: ['jsx']});
const compile = source => babel.transformSync(source, {
    babelrc: false, configFile: false,
    plugins: [requireGui.resolve('@babel/plugin-transform-react-jsx')]
}).code;

for (const tree of ['overlay', 'packages']) {
    const ast = parse(read(`${tree}/scratch-gui/src/components/tw-pseudocode/circuit-tab.jsx`));
    const topLevel = name => {
        const node = ast.program.body.find(item => item.id?.name === name ||
            item.declarations?.some(declaration => declaration.id.name === name));
        assert.ok(node, `${tree}: missing ${name}`);
        return generate(node).code;
    };
    const circuitClass = ast.program.body.find(item => item.type === 'ClassDeclaration' && item.id.name === 'CircuitTab');
    const mount = circuitClass.body.body.find(item => item.key?.name === 'componentDidMount');
    // The actual `this._settingsHandler = event => {...}` statement.
    const install = mount.body.body.find(node => node.type === 'ExpressionStatement' &&
        generate(node.expression.left || node.expression).code === 'this._settingsHandler');
    assert.ok(install, `${tree}: componentDidMount no longer installs _settingsHandler`);
    const makeCircuit = new Function('env', `const {React, ReactDOM, document, window, localStorage,
        DebugPanel, loadBenchTemperature, getReactPerformanceProbe, profileReactSubtree,
        pt, advanceDebugPhase, shouldRefreshDesignerDebugState, applyBenchTemperature} = env;
        ${compile(['PanelBoundary', 'HostMount', 'stcDrives', 'DEBUG_LIVE_REFRESH_MS', 'CIRCUIT_DOCKS',
        'DEVICE_DOCKS', 'CircuitTab'].map(topLevel).join('\n'))}
        const installHandler = function () { ${compile(generate(install).code)} };
        return {CircuitTab, installHandler};`);

    const fixture = dock => {
        const entries = new Map([['bw-debug-dock', dock]]);
        const storage = {getItem: key => entries.get(key) ?? null, setItem: (key, value) => entries.set(key, String(value))};
        const connected = new Set();
        const document = {contains: node => connected.has(node), createElement: () => ({dataset: {}, style: {}})};
        const {CircuitTab, installHandler} = makeCircuit({React, document, localStorage: storage,
            ReactDOM: {createPortal: () => null}, DebugPanel: () => null,
            loadBenchTemperature: () => 25, getReactPerformanceProbe: () => null,
            profileReactSubtree: (_r, _n, element) => element, pt: (_l, key) => key,
            advanceDebugPhase, shouldRefreshDesignerDebugState, applyBenchTemperature});
        const host = new CircuitTab({isVisible: false, locale: 'en', vm: {runtime: {}}});
        host.setState = change => Object.assign(host.state,
            typeof change === 'function' ? change(host.state, host.props) : change);
        host.load = () => {};
        host._stageHost = {dataset: {}, style: {}};
        connected.add(host._stageHost);
        installHandler.call(host);
        const send = detail => host._settingsHandler({detail});
        return {host, storage, send};
    };

    test(`${tree}: an automatic controller dock keeps the user's stage debugger`, () => {
        for (const dock of ['right', 'solo']) {
            const {host, storage, send} = fixture(dock);
            send({key: 'bw-debug-dock', value: 'controller', automatic: true});
            assert.equal(host.state.debugDock, dock);
            assert.equal(storage.getItem('bw-debug-dock'), dock, 'an automatic dock is not saved as the user choice');
            assert.equal(host._stagePortalOn(), true, `${dock}: the debugger stays on the stage`);
            assert.equal(host.state.rightPaneHidden, false, 'the Widgets column is still opened');
        }
    });

    test(`${tree}: a controller dock the user picks still hides the stage debugger`, () => {
        const {host, storage, send} = fixture('right');
        send({key: 'bw-debug-dock', value: 'controller'});
        assert.equal(host.state.debugDock, 'controller');
        assert.equal(storage.getItem('bw-debug-dock'), 'controller');
        assert.equal(host._stagePortalOn(), false);
    });

    test(`${tree}: an automatic circuit dock is still applied`, () => {
        const {host, send} = fixture('top');
        send({key: 'bw-debug-dock', value: 'right', automatic: true});
        assert.equal(host.state.debugDock, 'right');
    });
}

test('every automatic controller dock in gui.jsx is marked automatic', () => {
    for (const tree of ['overlay', 'packages']) {
        const source = read(`${tree}/scratch-gui/src/components/gui/gui.jsx`);
        const docks = source.match(/key: 'bw-debug-dock', value: 'controller'[^}]*}/g) || [];
        assert.equal(docks.length, 3, `${tree}: expected the FPGA LED, seven-segment and machine-video docks`);
        for (const dock of docks) assert.match(dock, /automatic: true/, `${tree}: ${dock}`);
    }
});
