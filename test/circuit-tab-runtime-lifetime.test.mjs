import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createRequire} from 'node:module';
import {execFileSync} from 'node:child_process';
import {join} from 'node:path';

const root = join(import.meta.dirname, '..');
const requireGui = createRequire(join(root, 'packages/scratch-gui/package.json'));
const circuit = readFileSync(join(root,
    'overlay/scratch-gui/src/components/tw-pseudocode/circuit-tab.jsx'), 'utf8');

test('the debugger portal keeps one identity through Code, designer loading, and Circuit', () => {
    const portal = /ReactDOM\.createPortal\(\s*this\.renderDebugPanel\(\),\s*this\._ensureDebugHost\(\),\s*'([^']+)'\s*\)/g;
    const keys = [...circuit.matchAll(portal)].map(match => match[1]);
    assert.deepEqual(keys, ['debug-panel', 'debug-panel', 'debug-panel'],
        'every tab layout must render the debugger into the same keyed portal');
    const loading = circuit.slice(circuit.indexOf('if (!Designer) {'),
        circuit.indexOf('this._portalOn = this._stagePortalOn();'));
    assert.match(loading, /ReactDOM\.createPortal\(\s*this\.renderDebugPanel\(\)/,
        'loading the designer must not unmount a running debugger');
    assert.match(loading, /this\.state\.machineBooted \|\| stcDrives\(stc\)/,
        'the loading view must keep a live machine without eagerly mounting an idle debugger');

    // React reconciles sibling arrays by key. Model the three actual sibling
    // layouts, including the Circuit layout's extra stage portal slot, with
    // a live child whose unmount would destroy a machine runner.
    // Legacy jsdom leaves a timer open on this Node release, so run the DOM
    // reconciliation in a bounded child and exit once its assertions finish.
    const script = `
        const assert = require('node:assert/strict');
        const document = require(${JSON.stringify(requireGui.resolve('jsdom'))})
            .jsdom('<div id="app"></div><div id="debug-host"></div>');
        globalThis.window = document.defaultView;
        globalThis.document = document;
        Object.defineProperty(globalThis, 'navigator',
            {value: document.defaultView.navigator, configurable: true});
        const React = require(${JSON.stringify(requireGui.resolve('react'))});
        const ReactDOM = require(${JSON.stringify(requireGui.resolve('react-dom'))});
        const app = document.getElementById('app');
        const host = document.getElementById('debug-host');
        let mounts = 0, unmounts = 0;
        class LiveRunner extends React.Component {
            componentDidMount() { mounts++; }
            componentWillUnmount() { unmounts++; }
            render() { return React.createElement('span', null, 'guest still running'); }
        }
        const view = mode => {
            const panel = ReactDOM.createPortal(React.createElement(LiveRunner), host,
                ${JSON.stringify(keys[0])});
            const face = React.createElement('div', {key: mode}, mode);
            return React.createElement(React.Fragment, null,
                ...(mode === 'circuit' ? [face, null, panel] : [face, panel]));
        };
        for (const mode of ['code', 'loading', 'circuit', 'code']) {
            ReactDOM.render(view(mode), app);
            assert.equal(host.textContent, 'guest still running');
            assert.equal(mounts, 1, 'runner remounted entering ' + mode);
            assert.equal(unmounts, 0, 'runner stopped entering ' + mode);
        }
        ReactDOM.unmountComponentAtNode(app);
        assert.equal(unmounts, 1);
        document.defaultView.close();
        process.exit(0);
    `;
    execFileSync(process.execPath, ['-e', script], {timeout: 10000, stdio: 'pipe'});
});
