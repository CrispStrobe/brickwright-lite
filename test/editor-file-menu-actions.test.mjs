import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {scopeAfter} from './helpers/js-scope.mjs';
import {registerEditorMenuActions, subscribeEditorMenuActions, notifyEditorMenuActions,
    editorMenuActionEnabled, runEditorMenuAction} from '../overlay/scratch-gui/src/lib/editor-menu-actions.js';

const read = file => readFileSync(new URL(`../${file}`, import.meta.url), 'utf8');
const importer = read('overlay/scratch-gui/src/components/tw-pseudocode/pseudocode-importer.jsx');
const method = (source, signature, args, bindings = {}) => new Function(...Object.keys(bindings),
    `return function(${args}) ${scopeAfter(source, signature)}`)(...Object.values(bindings));

test('File actions re-read busy and visibility at click rather than trust an old menu snapshot', () => {
    let visible = true;
    let busy = false;
    let calls = 0;
    const unregister = registerEditorMenuActions('test-live', () => visible ? {
        open: {enabled: !busy, run: () => calls++}, save: {enabled: true, run: () => calls++}
    } : null);
    try {
        assert.equal(editorMenuActionEnabled('test-live', 'open'), true);
        busy = true;
        assert.equal(runEditorMenuAction('test-live', 'open'), false);
        assert.equal(runEditorMenuAction('test-live', 'save'), true);
        visible = false;
        assert.equal(runEditorMenuAction('test-live', 'save'), false);
        assert.equal(calls, 1);
    } finally { unregister(); }
    assert.equal(runEditorMenuAction('test-live', 'open'), false);
});

test('ambiguous visible editors refuse delivery, and disposing one preserves the remaining owner', () => {
    const calls = [];
    const first = registerEditorMenuActions('test-owners', () => ({open: {enabled: true, run: () => calls.push('first')}}));
    const second = registerEditorMenuActions('test-owners', () => ({open: {enabled: true, run: () => calls.push('second')}}));
    try {
        assert.equal(editorMenuActionEnabled('test-owners', 'open'), false);
        assert.equal(runEditorMenuAction('test-owners', 'open'), false);
        first();
        assert.equal(runEditorMenuAction('test-owners', 'open'), true);
        assert.deepEqual(calls, ['second']);
        first();
        assert.equal(runEditorMenuAction('test-owners', 'open'), true);
    } finally { first(); second(); }
});

test('hidden providers cannot shadow visible ones; old cleanup cannot delete a replacement', () => {
    let calls = 0;
    const hidden = registerEditorMenuActions('test-lifetime', () => null);
    const live = registerEditorMenuActions('test-lifetime', () => ({save: {enabled: true, run: () => calls++}}));
    try {
        assert.equal(runEditorMenuAction('test-lifetime', 'save'), true);
        assert.equal(calls, 1);
    } finally { hidden(); live(); }
    const replacement = registerEditorMenuActions('test-lifetime', () => ({save: {enabled: true, run: () => calls++}}));
    try {
        live();
        assert.equal(runEditorMenuAction('test-lifetime', 'save'), true);
        assert.equal(calls, 2);
    } finally { replacement(); }
});

test('missing, inherited, disabled, malformed and throwing providers refuse commands', () => {
    const unregister = registerEditorMenuActions('test-negative', () => ({
        disabled: {enabled: false, run: () => assert.fail('disabled')}, malformed: {enabled: true}
    }));
    try {
        for (const name of ['missing', 'constructor', '__proto__', 'disabled', 'malformed']) {
            assert.equal(editorMenuActionEnabled('test-negative', name), false);
            assert.equal(runEditorMenuAction('test-negative', name), false);
        }
    } finally { unregister(); }
    const throwing = registerEditorMenuActions('test-negative', () => {throw new Error('disposed');});
    try { assert.equal(runEditorMenuAction('test-negative', 'open'), false); } finally { throwing(); }
});

test('subscribers see registration, availability updates and disposal and stop after unsubscribe', () => {
    const states = [];
    let enabled = true;
    const unsubscribe = subscribeEditorMenuActions(() => states.push(editorMenuActionEnabled('test-notify', 'open')));
    const unregister = registerEditorMenuActions('test-notify', () => ({open: {enabled, run: () => {}}}));
    enabled = false;
    notifyEditorMenuActions();
    unregister();
    assert.deepEqual(states, [false, true, false, false]);
    unsubscribe(); notifyEditorMenuActions();
    assert.equal(states.length, 4);
});

test('actual Code provider invokes its original chooser and bound save handler with toolbar availability', () => {
    const calls = [];
    const host = {props: {isVisible: true}, state: {revealed: true, busy: false},
        _codeFileInput: {current: {click: () => calls.push('chooser')}}, saveCodeFile: () => calls.push('save'), canCompileToBlocks: () => true,
        compile: () => calls.push('compile'), fromBlocks: () => calls.push('from-blocks')};
    const actions = method(importer, '    codeMenuActions ()', '');
    const unregister = registerEditorMenuActions('test-code', () => actions.call(host));
    try {
        assert.equal(runEditorMenuAction('test-code', 'open'), true);
        assert.equal(runEditorMenuAction('test-code', 'save'), true);
        host.state.busy = true;
        assert.equal(runEditorMenuAction('test-code', 'open'), false);
        assert.equal(runEditorMenuAction('test-code', 'save'), true);
        host.state.busy = false; host._codeFileInput.current = null;
        assert.equal(runEditorMenuAction('test-code', 'open'), false);
        assert.deepEqual(calls, ['chooser', 'save', 'save']);
        for (const property of ['hidden', 'unrevealed', 'unmounted']) {
            host.props.isVisible = property !== 'hidden';
            host.state.revealed = property !== 'unrevealed';
            host._unmounted = property === 'unmounted';
            assert.equal(actions.call(host), null);
        }
    } finally { unregister(); }
    assert.match(importer, /<input ref=\{this\._codeFileInput\} type="file"[^>]*[\s\S]*?onChange=\{this\.openCodeFile\}/);
});

test('Code menu provider registers and cleans up at actual component lifecycle boundaries', () => {
    assert.match(scopeAfter(importer, '    componentDidMount ()'), /registerEditorMenuActions\('code'/);
    assert.match(scopeAfter(importer, '    componentWillUnmount ()'), /this\._unregisterCodeMenu\(\)/);
    const update = scopeAfter(importer, '    componentDidUpdate (prevProps, prevState)');
    for (const state of ['isVisible', 'busy', 'revealed']) assert.ok(update.includes(`prev${state === 'isVisible' ? 'Props' : 'State'}.${state}`));
    assert.match(update, /notifyEditorMenuActions\(\)/);
});

test('shared File menu closes and routes only from Code, preserving actual provider guards', () => {
    const menu = read('overlay/scratch-gui/src/components/menu-bar/menu-bar.jsx');
    const calls = [];
    const run = method(menu, '    handleCodeFileAction (action)', 'action', {
        runEditorMenuAction: (...args) => {calls.push(args); return true;}
    });
    const host = {props: {activeTabIndex: 4, onRequestCloseFile: () => calls.push('close')}};
    assert.equal(run.call(host, 'open'), false);
    assert.deepEqual(calls, ['close']);
    host.props.activeTabIndex = 3;
    assert.equal(run.call(host, 'open'), true);
    assert.deepEqual(calls, ['close', 'close', ['code', 'open']]);
    assert.match(menu, /disabled=\{!this\.state\.codeOpenAvailable\}/);
    assert.match(menu, /disabled=\{!this\.state\.codeSaveAvailable\}/);
});
