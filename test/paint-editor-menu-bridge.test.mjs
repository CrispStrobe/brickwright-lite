// SPDX-License-Identifier: BSD-3-Clause
// Actual provider methods with passive editor spies; no Paper project or GUI
// runtime is created. Package publication stays independent of GUI imports.
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {scopeAfter} from './helpers/js-scope.mjs';
import {registerEditorMenuActions, runEditorMenuAction, getEditorMenuItems}
    from '../overlay/scratch-gui/src/lib/editor-menu-actions.js';
const read = path => readFileSync(new URL(`../overlay/${path}`, import.meta.url), 'utf8');
const wrapper = read('scratch-gui/src/containers/paint-editor-wrapper.jsx');
const costume = read('scratch-gui/src/containers/costume-tab.jsx');
const paint = read('scratch-paint/src/containers/paint-editor.jsx');
const selection = read('scratch-paint/src/containers/mode-tools.jsx');
const component = read('scratch-paint/src/components/paint-editor/paint-editor.jsx');
const widths = read('scratch-paint/src/components/mode-tools/mode-tools.jsx');
const method = (source, signature, args = '', extra = {}) => new Function(...Object.keys(extra),
    `return function(${args}) ${scopeAfter(source, signature)}`)(...Object.values(extra));
const intl = {locale: 'en', formatMessage: ({defaultMessage}) => defaultMessage};

function fixture () {
    const calls = [];
    const target = {id: 'sprite', currentCostume: 0, sprite: {costumes: [{skinId: 7, asset: {}}, {skinId: 8, asset: {}}]}};
    const tab = {_menuMounted: true, props: {vm: {editingTarget: target}, intl},
        state: {selectedCostumeIndex: 0, pixelMode: false, tilemapMode: false}, fileInput: {click() {}}};
    for (const key of ['handleFileUploadClick', 'handleExportCostume', 'handleNewBlankCostume', 'handleDuplicateCostume', 'handleDeleteCostume']) {
        tab[key] = (...args) => calls.push([key, ...args]);
    }
    tab.costumeMenuActions = method(costume, '    costumeMenuActions ()', '', {
        editorT: (locale, key) => key, messages: {addBlankCostumeMsg: {defaultMessage: 'Paint'}}});
    const host = {mounted: true, surface: 'costumes', props: {vm: tab.props.vm, selectedCostumeIndex: 0,
        imageId: 'sprite7', isSelectedEditor: true, getFileMenuActions: () => tab.costumeMenuActions()},
        state: {PaintEditor: {}, loadError: null}, menuChannels: new Map()};
    const notices = [];
    host.handleEditorMenuActions = method(wrapper, '    handleEditorMenuActions (channel, getter, owner)', 'channel, getter, owner',
        {notifyEditorMenuActions: () => notices.push('changed')});
    host.editorMenuActions = method(wrapper, '    editorMenuActions ()', '', {getUndoState: () => ({surface: host.surface})});
    return {host, tab, target, calls, notices};
}

test('one costumes provider combines current asset callbacks and fresh package channels', () => {
    const {host, calls} = fixture();
    const unregister = registerEditorMenuActions('test-paint-menu', () => host.editorMenuActions());
    try {
        host.handleEditorMenuActions('paint', () => ({'zoom-in': {label: 'Zoom in', location: 'edit', enabled: true,
            run: () => calls.push(['zoom'])}}), host.props.imageId);
        assert.equal(getEditorMenuItems('test-paint-menu', 'file').length, 4);
        for (const name of ['open', 'export', 'new', 'duplicate', 'zoom-in']) {
            assert.equal(runEditorMenuAction('test-paint-menu', name), true, name);
        }
        assert.deepEqual(calls, [['handleFileUploadClick'], ['handleExportCostume', 0], ['handleNewBlankCostume'],
            ['handleDuplicateCostume', 0], ['zoom']]);
        host.props.isSelectedEditor = false;
        assert.equal(runEditorMenuAction('test-paint-menu', 'zoom-in'), false);
        host.props.isSelectedEditor = true;
        host.surface = 'pixel';
        assert.equal(host.editorMenuActions(), null);
        host.surface = 'costumes';
        host.mounted = false;
        assert.equal(runEditorMenuAction('test-paint-menu', 'export'), false);
    } finally {unregister();}
});

test('costume replacement, malformed channels and stale cleanup cannot deliver commands to the old image', () => {
    const {host, tab, target} = fixture();
    const item = {label: 'Edit', location: 'edit', enabled: true, run() {}};
    const oldCleanup = host.handleEditorMenuActions('selection', () => ({copy: item}), 'sprite7');
    const currentCleanup = host.handleEditorMenuActions('selection', () => ({paste: item}), 'sprite7');
    oldCleanup();
    assert.ok(host.editorMenuActions().paste);
    assert.equal(host.editorMenuActions().copy, undefined);
    host.handleEditorMenuActions('other-package', () => ({foreign: item}), 'sprite7');
    host.handleEditorMenuActions('paint', null, 'sprite7');
    host.handleEditorMenuActions('paint', () => ({old: item}), 'wrong-image');
    assert.equal(host.menuChannels.size, 1);
    host.handleEditorMenuActions('paint', () => ({noCallback: {...item, run: null}, noLabel: {...item, label: null},
        noGuard: {...item, enabled: 'yes'}, badLocation: {...item, location: 'elsewhere'}}), 'sprite7');
    for (const key of ['noCallback', 'noLabel', 'noGuard', 'badLocation']) assert.equal(host.editorMenuActions()[key], undefined);
    target.currentCostume = 1;
    assert.equal(host.editorMenuActions(), null, 'VM switches before connected props');
    host.props.selectedCostumeIndex = 1;
    host.props.imageId = 'sprite8';
    tab.state.selectedCostumeIndex = 1;
    assert.equal(host.editorMenuActions().paste, undefined, 'old package owner token is refused');
    currentCleanup();
    tab.state.pixelMode = true;
    assert.equal(tab.costumeMenuActions(), null);
    tab.state.pixelMode = false;
    tab.fileInput = {};
    assert.equal(tab.costumeMenuActions().open.enabled, false, 'malformed file input is refused');
    assert.equal('delete-costume' in tab.costumeMenuActions(), false, 'asset deletion keeps its existing confirmation UI');
});

test('Paint selection descriptors use actual callbacks and established group/order helpers with live guards', () => {
    const calls = [];
    const props = {format: 'VECTOR', mode: 'SELECT', intl, clipboardItems: [],
        onUpdateImage: () => calls.push('update'), clearSelectedItems: () => calls.push('clear'),
        setSelectedItems: format => calls.push(['selected', format]), onCopyToClipboard: () => calls.push('copy')};
    const host = {_menuMounted: true, props,
        getSelectedPath: () => ({closed: false, segments: [1, 2, 3]}), getSplitSegment: () => ({}), getJoinPaths: () => ({}),
        hasSelectedUncurvedPoints: () => true, hasSelectedUnpointedPoints: () => false};
    for (const key of ['handlePasteFromClipboard', 'handleDelete', 'handleFlipHorizontal', 'handleFlipVertical',
        'handleRotateClockwise', 'handleRotateCounterClockwise', 'handleCurvePoints', 'handlePointPoints', 'handleClosePath', 'handleOpenPath', 'handleSplitPath', 'handleJoinPaths']) {
        host[key] = () => calls.push(key);
    }
    let roots = [{}];
    const helpers = {paper: {project: {}}, isVector: value => value === 'VECTOR', isBitmap: value => value === 'BITMAP',
        Modes: {SELECT: 'SELECT', BIT_SELECT: 'BIT_SELECT', RESHAPE: 'RESHAPE'}, tx: (locale, key) => key,
        getSelectedRootItems: () => roots, shouldShowGroup: () => roots.length > 1, shouldShowUngroup: () => false,
        shouldShowBringForward: () => true, shouldShowSendBackward: () => false,
        groupSelection: (clear, select, update) => {calls.push('group'); select();}, ungroupSelection() {},
        bringForward: update => {assert.equal(update, props.onUpdateImage); calls.push('forward');},
        bringToFront() {}, sendBackward() {}, sendToBack() {},
        selectAllBitmap: clear => {assert.equal(clear, props.clearSelectedItems); calls.push('bitmapAll');},
        selectAllSegments: () => {calls.push('segmentsAll'); return true;},
        selectAllItems: () => {calls.push('itemsAll'); return true;}};
    const get = method(selection, '    editorMenuActions ()', '', helpers);
    let actions = get.call(host);
    assert.equal(actions.copy.enabled, true);
    assert.equal(actions.paste.enabled, false);
    assert.equal(actions.group.enabled, false);
    assert.equal(actions.forward.enabled, true);
    actions.copy.run(); actions['select-all'].run(); actions.forward.run();
    roots = [{}, {}]; props.clipboardItems = [{}];
    actions = get.call(host);
    assert.equal(actions.group.enabled, true); assert.equal(actions.paste.enabled, true);
    actions.group.run(); actions.paste.run();
    props.mode = 'RESHAPE'; actions = get.call(host);
    assert.equal(actions.copy.enabled, false);
    assert.equal(actions['close-path'].enabled, true);
    assert.equal(actions['open-path'].enabled, false);
    assert.equal(actions['curve-points'].enabled, true);
    actions['close-path'].run(); actions['select-all'].run();
    props.format = 'BITMAP'; props.mode = 'BIT_SELECT'; actions = get.call(host);
    assert.equal(actions.group.enabled, false); assert.equal(actions.forward.enabled, false);
    assert.equal(actions['rotate-clockwise'].enabled, true);
    actions['rotate-clockwise'].run(); actions['select-all'].run();
    assert.deepEqual(calls, ['copy', 'itemsAll', ['selected', 'VECTOR'], 'forward', 'group', ['selected', 'VECTOR'],
        'handlePasteFromClipboard', 'handleClosePath', 'segmentsAll', ['selected', 'VECTOR'], 'handleRotateClockwise', 'bitmapAll', ['selected', 'BITMAP']]);
});

test('Paint viewport/format publication uses real handlers and preserves package boundaries and row layout', () => {
    const calls = [];
    const host = {_menuMounted: true, state: {canvas: {}}, props: {imageId: 'sprite7', format: 'VECTOR', intl,
        handleSwitchToBitmap: () => calls.push('bitmap'), handleSwitchToVector: () => calls.push('vector')},
        handleZoomIn: () => calls.push('in'), handleZoomOut: () => calls.push('out'), handleZoomReset: () => calls.push('reset')};
    const get = method(paint, '    editorMenuActions ()', '', {paper: {view: {}},
        tx: () => 'Transform', isVector: value => value === 'VECTOR', isBitmap: value => value === 'BITMAP'});
    const actions = get.call(host);
    assert.equal(actions['convert-bitmap'].enabled, true); assert.equal(actions['convert-vector'].enabled, false);
    actions['zoom-in'].run(); actions['zoom-out'].run(); actions['zoom-reset'].run(); actions['convert-bitmap'].run();
    assert.deepEqual(calls, ['in', 'out', 'reset', 'bitmap']);
    host._menuMounted = false; assert.equal(get.call(host), null);
    assert.match(component, /data-testid="bw-paint-command-row"/);
    assert.match(component, /onEditorMenuActions=\{props\.onEditorMenuActions\} editorMenuOwner=\{props\.editorMenuOwner\}/);
    for (const source of [paint, selection]) {
        assert.doesNotMatch(source, /from ['"][^'"]*scratch-gui|from ['"][^'"]*global-undo|registerEditorMenuActions/);
        assert.match(source, /this\.props\.onEditorMenuActions\('/);
        assert.match(scopeAfter(source, '    componentWillUnmount ()'), /this\.unregisterMenuChannel\(\)/);
    }
    assert.match(widths, /aria-label=\{props\.intl\.formatMessage\(currentMessage\)\}[\s\S]*?title=\{props\.intl\.formatMessage\(currentMessage\)\}/);
    assert.match(widths, /aria-label=\{props\.intl\.formatMessage\(messages\.eraserSize\)\}[\s\S]*?title=\{props\.intl\.formatMessage\(messages\.eraserSize\)\}/);
});
