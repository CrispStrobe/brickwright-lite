import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {balancedAfter, scopeAfter} from './helpers/js-scope.mjs';
import {registerEditorMenuActions, runEditorMenuAction} from '../overlay/scratch-gui/src/lib/editor-menu-actions.js';

const read = path => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');
const importer = read('overlay/scratch-gui/src/components/tw-pseudocode/pseudocode-importer.jsx');
const menu = read('overlay/scratch-gui/src/components/menu-bar/menu-bar.jsx');
const method = (source, signature, args, bindings = {}) => new Function(...Object.keys(bindings),
    `return function(${args}) ${scopeAfter(source, signature)}`)(...Object.values(bindings));
// Use the actual supported-language table, not a duplicate list in the test.
const TWO_WAY = new Set(new Function(`return ${balancedAfter(importer, 'const TWO_WAY = new Set(')}`)());
const canCompile = method(importer, '    canCompileToBlocks ()', '', {TWO_WAY});

test('toolbar and menu share busy, empty, language and supported-ASM availability', () => {
    const host = {state: {busy: false, lang: 'pseudocode'}, activeCode: () => 'say "hello"', canLiftAsm: () => false};
    assert.equal(canCompile.call(host), true);
    host.state.busy = true;
    assert.equal(canCompile.call(host), false);
    host.state.busy = false; host.activeCode = () => ' \n ';
    assert.equal(canCompile.call(host), false);
    host.activeCode = () => 'nonempty'; host.state.lang = 'asm';
    assert.equal(canCompile.call(host), false);
    host.canLiftAsm = () => true;
    assert.equal(canCompile.call(host), true);
    host.state.busy = true;
    assert.equal(canCompile.call(host), false);
    host.state.busy = false; host.state.lang = 'unsupported'; host.canLiftAsm = () => false;
    assert.equal(canCompile.call(host), false);
    assert.match(importer, /<button onClick=\{this\.compile\}[\s\S]*?disabled=\{!this\.canCompileToBlocks\(\)\}/);
});

test('conversion menu calls the bound originals and rechecks busy state and hidden ownership', () => {
    const calls = [];
    const provider = method(importer, '    codeMenuActions ()', '');
    const host = {props: {isVisible: true}, state: {revealed: true, busy: false, lang: 'pseudocode'},
        _codeFileInput: {current: null}, activeCode: () => 'say "hello"', canLiftAsm: () => false,
        saveCodeFile: () => {}, compile: () => calls.push('compile'), fromBlocks: () => calls.push('generate')};
    host.canCompileToBlocks = () => canCompile.call(host);
    const unregister = registerEditorMenuActions('test-conversion', () => provider.call(host));
    try {
        assert.equal(runEditorMenuAction('test-conversion', 'to-blocks'), true);
        assert.equal(runEditorMenuAction('test-conversion', 'from-blocks'), true);
        host.state.busy = true;
        for (const name of ['to-blocks', 'from-blocks']) assert.equal(runEditorMenuAction('test-conversion', name), false);
        host.state.busy = false; host.activeCode = () => '';
        assert.equal(runEditorMenuAction('test-conversion', 'to-blocks'), false);
        assert.equal(runEditorMenuAction('test-conversion', 'from-blocks'), true);
        host.props.isVisible = false;
        assert.equal(runEditorMenuAction('test-conversion', 'from-blocks'), false);
        assert.deepEqual(calls, ['compile', 'generate', 'generate']);
    } finally { unregister(); }
});

test('conversion routing closes Edit and never sends a command from another editor', () => {
    const calls = [];
    const route = method(menu, '    handleCodeConversionAction (action)', 'action', {
        runEditorMenuAction: (...args) => {calls.push(args); return true;}
    });
    for (const activeTabIndex of [0, 1, 2, 4, 5]) {
        assert.equal(route.call({props: {activeTabIndex, onRequestCloseEdit: () => calls.push('close')}}, 'to-blocks'), false);
    }
    assert.deepEqual(calls, Array(5).fill('close'));
    calls.length = 0;
    assert.equal(route.call({props: {activeTabIndex: 3, onRequestCloseEdit: () => calls.push('close')}}, 'from-blocks'), true);
    assert.deepEqual(calls, ['close', ['code', 'from-blocks']]);
});

test('text, language and ASM changes refresh conversion availability', () => {
    const update = scopeAfter(importer, '    componentDidUpdate (prevProps, prevState)');
    for (const property of ['busy', 'buffers', 'lang', 'asmMode', 'revealed']) {
        assert.ok(update.includes(`prevState.${property} !== this.state.${property}`), property);
    }
    assert.match(update, /notifyEditorMenuActions\(\)/);
    assert.match(menu, /disabled=\{!this\.state\.codeToBlocksAvailable\}/);
    assert.match(menu, /disabled=\{!this\.state\.codeFromBlocksAvailable\}/);
});


test('browser conversion reader requires the say block’s actual connected text value', () => {
    const script = read('scripts/verify-chrome-sweep.mjs');
    const blocks = {};
    const vm = {runtime: {targets: [{blocks: {_blocks: blocks, getBlock: id => blocks[id]}}]}};
    const probe = method(script, '    const vmHasConversionProbe = () =>', '', {
        window: {__brickwrightStore: {getState: () => ({scratchGui: {vm}})}}
    });
    assert.equal(probe(), false);
    blocks.unrelated = {opcode: 'text', fields: {TEXT: {value: 'menu_conversion_probe'}}};
    assert.equal(probe(), false);
    blocks.say = {opcode: 'looks_say', inputs: {MESSAGE: {block: 'connected'}}};
    blocks.connected = {opcode: 'text', fields: {TEXT: {value: 'wrong'}}};
    assert.equal(probe(), false);
    blocks.connected.fields.TEXT.value = 'menu_conversion_probe';
    assert.equal(probe(), true);
    blocks.say.inputs.MESSAGE.block = 'missing';
    assert.equal(probe(), false);
});
