import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {scopeAfter} from './helpers/js-scope.mjs';

const read = file => readFileSync(new URL(`../${file}`, import.meta.url), 'utf8');
const menu = read('overlay/scratch-gui/src/components/menu-bar/menu-bar.jsx');
const editor = read('overlay/scratch-gui/src/lib/codemirror-editor.jsx');
const method = (source, signature, args, bindings = {}) => new Function(
    ...Object.keys(bindings), `return function(${args}) ${scopeAfter(source, signature)}`
)(...Object.values(bindings));

test('Code menu commands call the real command with the live view and preserve panel focus', () => {
    for (const [name, fn] of [['find', 'openSearchPanel'], ['go-to-line', 'gotoLine'], ['select-all', 'selectAll']]) {
        const calls = [];
        const view = {focus: () => calls.push('focus')};
        const bindings = Object.fromEntries(['openSearchPanel', 'gotoLine', 'selectAll'].map(key =>
            [key, actual => {assert.equal(actual, view); calls.push(key); return true;}]));
        const run = method(editor, '    _onMenuCommand (event)', 'event', bindings);
        assert.equal(run.call({_view: view, props: {isVisible: true}}, {detail: {command: name}}), true);
        assert.deepEqual(calls, ['focus', fn]);
    }
});

test('hidden, disposed and unknown Code commands neither focus nor edit', () => {
    const fail = () => assert.fail('inactive or unknown command executed');
    const run = method(editor, '    _onMenuCommand (event)', 'event',
        {openSearchPanel: fail, gotoLine: fail, selectAll: fail});
    const view = {focus: fail};
    for (const host of [{_view: view, props: {isVisible: false}}, {_view: null, props: {isVisible: true}}]) {
        assert.equal(run.call(host, {detail: {command: 'select-all'}}), false);
    }
    for (const event of [{}, {detail: {}}, {detail: {command: 'constructor'}}, {detail: {command: 'delete'}}]) {
        assert.equal(run.call({_view: view, props: {isVisible: true}}, event), false);
    }
    const mount = scopeAfter(editor, '    componentDidMount ()');
    const unmount = scopeAfter(editor, '    componentWillUnmount ()');
    assert.match(mount, /addEventListener\('bw-code-editor-command', this\._onMenuCommand\)/);
    assert.match(unmount, /removeEventListener\('bw-code-editor-command', this\._onMenuCommand\)/);
});

test('menu routing closes Edit and only dispatches while Code is active', () => {
    const calls = [];
    const run = method(menu, '    handleCodeEditorCommand (command)', 'command', {
        window: {dispatchEvent: event => calls.push(event)},
        CustomEvent: class {constructor(type, options) {this.type = type; this.detail = options.detail;}}
    });
    for (const activeTabIndex of [0, 1, 2, 4, 5, 6]) {
        run.call({props: {activeTabIndex, onRequestCloseEdit: () => calls.push('close')}}, 'find');
    }
    assert.deepEqual(calls, Array(6).fill('close'));
    calls.length = 0;
    run.call({props: {activeTabIndex: 3, onRequestCloseEdit: () => calls.push('close')}}, 'find');
    assert.equal(calls[0], 'close');
    assert.equal(calls[1].type, 'bw-code-editor-command');
    assert.deepEqual(calls[1].detail, {command: 'find'});
});

test('Edit uses existing active-editor history and disables unavailable commands', () => {
    for (const name of ['Undo', 'Redo']) {
        assert.match(menu, new RegExp(`disabled=\\{!this\\.state\\.globalCan${name}\\}`));
        const action = scopeAfter(menu, `    handleGlobal${name} ()`);
        assert.match(action, new RegExp(`${name.toLowerCase()}ActiveSurface\\(\\)`));
    }
    const item = read('overlay/scratch-gui/src/components/menu/menu.jsx');
    assert.match(item, /aria-disabled=\{disabled \|\| undefined\}/);
    assert.match(item, /onClick=\{disabled \? undefined : onClick\}/);
    assert.match(item, /disabled: PropTypes\.bool/);
});

test('editor-specific actions are contextual and every Code item has a receiver', () => {
    const circuit = menu.slice(menu.indexOf('{this.props.activeTabIndex === 4 && ('), menu.indexOf('id="gui.menuBar.edit"'));
    assert.equal([...circuit.matchAll(/'bw-circuit-file'/g)].length, 4);
    const code = menu.slice(menu.indexOf('{this.props.activeTabIndex === 3 && ('), menu.indexOf('<DeletionRestorer>'));
    for (const name of ['find', 'go-to-line', 'select-all']) {
        assert.ok(code.includes(`handleCodeEditorCommand('${name}')`));
    }
    assert.match(menu, /<SB3Downloader>/, 'project save remains global');
});

test('all changed GUI overlays match their runtime package mirrors', () => {
    for (const file of ['components/menu-bar/menu-bar.jsx', 'components/menu/menu.jsx', 'components/menu/menu.css',
        'lib/codemirror-editor.jsx']) {
        assert.equal(read(`overlay/scratch-gui/src/${file}`), read(`packages/scratch-gui/src/${file}`), file);
    }
});
