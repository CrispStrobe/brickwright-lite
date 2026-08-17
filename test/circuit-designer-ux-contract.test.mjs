import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {resolve} from 'node:path';

const root = resolve(new URL('..', import.meta.url).pathname);
const read = file => readFileSync(resolve(root, file), 'utf8');

test('Circuit Designer has a view toggle (realistic / schematic) and a mode attribute', () => {
    const source = read('overlay/scratch-gui/src/lib/bw-circuit-ui/components/CircuitDesigner.jsx');
    assert.match(source, /data-circuit-view-toggle/);
    assert.match(source, /data-sim-mode/);
    assert.match(source, /Realistic view/);
    assert.match(source, /Schematic view/);
});

test('part editor uses focused, native numeric controls', () => {
    const editor = read('overlay/scratch-gui/src/lib/bw-circuit-ui/components/InlineEditor.jsx');
    assert.match(editor, /data-inline-editor/);
    assert.match(editor, /firstInput\.current\?\.focus/);
    assert.match(editor, /type=\{typeof v === 'number' \? 'number' : 'text'\}/);
    assert.match(editor, /background: '#ffffff'/);
});

test('light circuit theme does not override toggle paint', () => {
    const theme = read('overlay/scratch-gui/src/lib/bw-circuit-ui/components/circuit-theme.css');
    assert.doesNotMatch(theme, /data-bw-circuit-theme="light"\]\s*button\)[\s\S]*background:\s*#ffffff\s*!important/);
    assert.match(theme, /Buttons own their active\/inactive colors inline/);
});

test('Circuit Designer side selectors expose toggle and divider', () => {
    const designer = read('overlay/scratch-gui/src/lib/bw-circuit-ui/components/CircuitDesigner.jsx');
    assert.match(designer, /data-selectors-toggle/);
    assert.match(designer, /data-selectors-panel/);
    assert.match(designer, /data-selector-divider/);
    assert.match(designer, /data-parts-selector/);
    assert.match(designer, /data-examples-selector/);
});

test('Circuit Designer keeps simulation and debugger controls in the instruments column', () => {
    const source = read('overlay/scratch-gui/src/lib/bw-circuit-ui/components/CircuitDesigner.jsx');
    assert.match(source, /data-instruments-column/);
    assert.match(source, /data-instruments-scroll/);
    assert.match(source, /data-instruments-scroll[^\n]*overflowY: 'auto'/);
    assert.match(source, /data-debugger-panel/);
    assert.match(source, /data-simulation-controls/);
    assert.match(source, /data-scope-module/);
    assert.match(source, /data-no-code-indicator/);
});

test('debugger selection is not disabled merely because the Circuit tab is active', () => {
    const source = read('overlay/scratch-gui/src/components/tw-pseudocode/circuit-tab.jsx');
    // `dock` is debugDock with 'solo' folded back to 'top' on the dedicated
    // Circuit tab — the designer keeps its instruments-column debugger there.
    assert.match(source, /const dock = this\.state\.debugDock === 'solo' \? 'top' : this\.state\.debugDock;/);
    assert.match(source, /debuggerOn=\{dock === 'top'\}/);
    assert.match(source, /debuggerPanel=\{dock === 'top' \? this\.renderDebugPanel\(\) : null\}/);
});

test("debugger-only pane: dock 'solo' portals just the DebugPanel while coding", () => {
    const source = read('overlay/scratch-gui/src/components/tw-pseudocode/circuit-tab.jsx');
    const header = read('overlay/scratch-gui/src/components/stage-header/stage-header.jsx');
    const settings = read('overlay/scratch-gui/src/components/menu-bar/settings-menu.jsx');
    // The solo branch renders before the Designer-chunk gate (the panel has
    // its own Suspense) and only while portalled into the stage column.
    assert.match(source, /\(this\.state\.debugDock === 'solo' \|\| this\.state\.debugDock === 'right'\) && this\._stagePortalOn\(\)/);
    // Fresh declarations reach the pane: "To blocks" announces via
    // PROJECT_CHANGED and the tab re-reads runtime.stc.
    assert.match(source, /runtime\.on\('PROJECT_CHANGED', this\.handleProjectChanged\)/);
    assert.match(source, /runtime\.removeListener\('PROJECT_CHANGED', this\.handleProjectChanged\)/);
    // The stage header offers the fourth view; Settings offers the dock value.
    assert.match(header, /dock: 'solo'/);
    assert.match(header, /debuggerFull/);
    assert.match(settings, /\{value: 'solo', label: 'Full pane'\}/);
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

test('main tab row retains the right-pane toggle', () => {
    const gui = read('overlay/scratch-gui/src/components/gui/gui.jsx');
    assert.match(gui, /data-right-pane-toggle/);
    assert.match(gui, /Show right panel|Hide right panel/);
    assert.match(gui, /stagePaneVisible \? '›' : '‹'/);
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
