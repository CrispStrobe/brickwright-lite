import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {pathToFileURL} from 'node:url';
import {scopeAfter} from './helpers/js-scope.mjs';
import {importGuiDependency} from './helpers/bw-integrated.mjs';
const {EditorState} = await importGuiDependency('@codemirror/state/dist/index.js');
const {history, undo, undoDepth} = await importGuiDependency('@codemirror/commands/dist/index.js');
// Explicit read-only candidate source override supports reviewing a coordinator's
// uncommitted UI. Normal CI reads this checkout's relative overlay source.
const root = process.env.BW_AUTHORING_SOURCE_ROOT ? pathToFileURL(process.env.BW_AUTHORING_SOURCE_ROOT + '/') : new URL('../', import.meta.url);
const read = path => readFileSync(new URL('overlay/scratch-gui/src/' + path, root), 'utf8');
const method = (path, signature, args, bindings = {}) => new Function(...Object.keys(bindings),
    `return function(${args}) ${scopeAfter(read(path), signature)}`)(...Object.values(bindings));
const insertText = method('lib/codemirror-editor.jsx', 'insertText (text) {', 'text');
const selectCostume = method('containers/costume-tab.jsx', 'handleSelectCostume (costumeIndex) {', 'costumeIndex');
const saveBeforeSwitch = method('containers/costume-tab.jsx', 'savePixelBeforeSwitch () {', '');
const insertResource = resources => method('components/tw-pseudocode/pseudocode-importer.jsx',
    'insertAnimationResource (kind) {', 'kind', {syncAnimationResources: () => resources});
function editor() {
    const view = {state: EditorState.create({doc: 'before SELECT after', selection: {anchor: 7, head: 13}, extensions: [history()]}),
        transactions: 0, focused: 0,
        dispatch(spec) { this.transactions++; this.state = this.state.update(spec).state; },
        focus() { this.focused++; }};
    return {props: {readOnly: false}, _view: view, insertText};
}
test('resource insertion replaces real CodeMirror selection in one undoable transaction', () => {
    const cm = editor(), id = 'resource:walk';
    const control = {state: {animationResourceId: id}, props: {vm: {}}, _cmEditor: cm,
        activeCode: () => 'must not append', setActiveCode() { assert.fail('live editor must own insertion'); }};
    insertResource(new Map([[id, {id}]] )).call(control, 'frames');
    assert.equal(cm._view.state.doc.toString(), 'before (arcade animation frames resource "resource:walk") after');
    assert.equal(cm._view.transactions, 1);
    assert.equal(cm._view.focused, 1);
    assert.equal(undoDepth(cm._view.state), 1);
    assert.equal(undo({state: cm._view.state, dispatch: spec => cm._view.dispatch(spec)}), true);
    assert.equal(cm._view.state.doc.toString(), 'before SELECT after');
    assert.equal(undoDepth(cm._view.state), 0);
});
test('missing resources preserve active Code and selection with a named status', () => {
    const cm = editor(), state = {animationResourceId: 'deleted'};
    const control = {state, props: {vm: {}}, _cmEditor: cm,
        activeCode: () => 'original', setActiveCode() { assert.fail('missing resource must not edit Code'); },
        setState(patch) { Object.assign(state, patch); }};
    insertResource(new Map()).call(control, 'frames');
    assert.equal(cm._view.state.doc.toString(), 'before SELECT after');
    assert.equal(cm._view.state.selection.main.from, 7);
    assert.equal(cm._view.transactions, 0);
    assert.match(state.status, /available published animation/);
});
test('unavailable editor view uses active text fallback; read-only method itself refuses edits', () => {
    for (const unavailable of [undefined, {props: {}, _view: null, insertText}]) {
        let code = 'original\n';
        const control = {state: {animationResourceId: 'walk'}, props: {vm: {}}, _cmEditor: unavailable,
            activeCode: () => code, setActiveCode(text) { code = text; }};
        insertResource(new Map([['walk', {}]])).call(control, 'interval');
        assert.equal(code, 'original\n(arcade animation interval resource "walk")');
    }
    const cm = editor(); cm.props.readOnly = true;
    assert.equal(cm.insertText('forbidden'), false);
    assert.equal(cm._view.transactions, 0);
});
test('failed Pixel save blocks costume selection and target mutation; successful save permits switch', () => {
    let saves = 0, switches = 0, selected = 0;
    const pixel = {hasUnsavedChanges: () => true, save: () => { saves++; return false; }};
    const control = {state: {pixelMode: true}, pixelEditor: {current: pixel}, savePixelBeforeSwitch: saveBeforeSwitch,
        props: {vm: {editingTarget: {setCostume(index) { switches++; selected = index; }}}},
        setState(patch) { Object.assign(this.state, patch); }};
    selectCostume.call(control, 2);
    assert.equal(saves, 1); assert.equal(switches, 0);
    assert.equal(control.state.selectedCostumeIndex, undefined);
    pixel.save = () => { saves++; return true; };
    selectCostume.call(control, 2);
    assert.equal(saves, 2); assert.equal(switches, 1);
    assert.equal(selected, 2); assert.equal(control.state.selectedCostumeIndex, 2);
    pixel.hasUnsavedChanges = () => false;
    selectCostume.call(control, 1);
    assert.equal(saves, 2, 'unchanged artwork requires no save');
    assert.equal(switches, 2);
});

test('fresh insertion is a separate undoable Code operation', () => {
    const cm = editor();
    const control = {state: {animationResourceId: 'walk'}, props: {vm: {}}, _cmEditor: cm,
        setActiveCode() { assert.fail('live editor owns insertion'); }};
    insertResource(new Map([['walk', {}]])).call(control, 'fresh');
    assert.equal(cm._view.state.doc.toString(), 'before (arcade animation fresh frames resource "walk") after');
    assert.equal(undoDepth(cm._view.state), 1);
    assert.equal(undo({state: cm._view.state, dispatch: spec => cm._view.dispatch(spec)}), true);
    assert.equal(cm._view.state.doc.toString(), 'before SELECT after');
});
