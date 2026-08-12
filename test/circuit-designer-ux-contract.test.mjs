import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {resolve} from 'node:path';

const root = resolve(new URL('..', import.meta.url).pathname);
const read = file => readFileSync(resolve(root, file), 'utf8');

test('Circuit Designer toolbar has one mode toggle, one view toggle, and a readable zoom indicator', () => {
    const source = read('overlay/scratch-gui/src/lib/bw-circuit-ui/components/BoardCanvas.jsx');
    assert.match(source, /data-build-sim-toggle/);
    assert.match(source, /data-zoom-indicator/);
    assert.match(source, /data-power-toggle/);
    assert.match(source, /data-toolbar-more/);
    assert.match(source, /data-circuit-toolbar[\s\S]*flexWrap:\s*'wrap'/);
    assert.doesNotMatch(source, /Show right panel|Hide right panel/);
});

test('Circuit Designer side selectors expose independent collapse affordances', () => {
    const designer = read('overlay/scratch-gui/src/lib/bw-circuit-ui/components/CircuitDesigner.jsx');
    const examples = read('overlay/scratch-gui/src/lib/bw-circuit-ui/components/ExamplesBrowser.jsx');
    const presets = read('overlay/scratch-gui/src/lib/bw-circuit-ui/components/InferPanel.jsx');
    assert.match(designer, /Collapse Parts Selector/);
    assert.match(designer, /Expand Parts Selector/);
    assert.match(designer, /data-selector-divider/);
    assert.match(examples, /Collapse examples selector/);
    assert.match(examples, /Expand examples selector/);
    assert.match(examples, /data-examples-selector-content/);
    assert.match(presets, /Collapse examples selector/);
    assert.match(presets, /Expand examples selector/);
});

test('Circuit Designer keeps simulation and debugger controls in the instruments column', () => {
    const source = read('overlay/scratch-gui/src/lib/bw-circuit-ui/components/CircuitDesigner.jsx');
    assert.match(source, /data-instruments-column/);
    assert.match(source, /data-simulation-controls/);
    assert.match(source, /data-debugger-panel/);
    assert.match(source, /data-no-code-indicator/);
});

test('debugger selection is not disabled merely because the Circuit tab is active', () => {
    const source = read('overlay/scratch-gui/src/components/tw-pseudocode/circuit-tab.jsx');
    assert.match(source, /debuggerOn=\{this\.state\.debugDock === 'top'\}/);
    assert.match(source, /debuggerPanel=\{this\.state\.debugDock === 'top' \? this\.renderDebugPanel\(\) : null\}/);
});

test('Green Flag and Red Flag reach Circuit Designer even without MCU code', () => {
    const source = read('overlay/scratch-gui/src/components/tw-pseudocode/circuit-tab.jsx');
    const controls = read('overlay/scratch-gui/src/containers/controls.jsx');
    assert.match(source, /addEventListener\('bw-green-flag', this\._greenFlagHandler\)/);
    assert.match(source, /addEventListener\('bw-stop-all', this\._stopAllHandler\)/);
    assert.match(source, /runToken/);
    assert.match(source, /stopToken/);
    assert.match(controls, /setTimeout\(\(\) => window\.dispatchEvent\(new CustomEvent\('bw-green-flag'\)\), 0\)/);
    assert.match(controls, /setTimeout\(\(\) => window\.dispatchEvent\(new CustomEvent\('bw-stop-all'\)\), 0\)/);
});

test('main tab row no longer renders the obsolete right-pane button', () => {
    const gui = read('overlay/scratch-gui/src/components/gui/gui.jsx');
    assert.doesNotMatch(gui, /data-right-pane-toggle/);
    assert.doesNotMatch(gui, /Show Right Pane|Hide Right Pane/);
});

test('Settings exposes an app-internal hard reload without clearing project storage', () => {
    const menu = read('overlay/scratch-gui/src/components/menu-bar/settings-menu.jsx');
    const reload = read('overlay/scratch-gui/src/lib/hard-reload.js');
    assert.match(menu, /Reload BrickWright/);
    assert.match(menu, /hardReload\(\)/);
    assert.match(reload, /caches\.keys\(\)/);
    assert.match(reload, /getRegistrations\(\)/);
    assert.match(reload, /bw-hard-reload/);
    assert.doesNotMatch(reload, /localStorage\.clear/);
});
