import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {execFileSync} from 'node:child_process';
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';
const require = createRequire(import.meta.url);
const createSourceCells = require('../overlay/scratch-vm/src/extensions/crispstrobe/arcade/source-scalar-cells.js');
const root = fileURLToPath(new URL('../', import.meta.url));
// Use the genuine tracked queue/filter/disable implementation, not a replacement
// Events model. Closure namespace and workspace/DOM boundaries below are explicit
// fixtures; this does not mount React or claim a browser/VM execution result.
// Git reads the exact tracked source in this repository at HEAD;
// gate-shapes-allow: no external package checkout or executable-under-test is selected.
const eventSource = execFileSync('git', ['-C', root, 'show', 'HEAD:packages/scratch-blocks/core/events.js'], {encoding: 'utf8'});
const componentSource = readFileSync(new URL('../overlay/scratch-gui/src/containers/blocks.jsx', import.meta.url), 'utf8');
const start = componentSource.indexOf('    onWorkspaceUpdate (data) {');
const end = componentSource.indexOf('    handleMonitorsUpdate (monitors) {', start);
assert.ok(start > 0 && end > start);
const method = componentSource.slice(start, end);

function fixture (options = {}) {
    const timers = [], listeners = new Set(), received = [], logged = [], actions = [];
    let workspace;
    const Blockly = {Events: {}, Workspace: {getById: id => id === 'workspace' ? workspace : null}};
    const goog = {provide () {}, require () {}, array: {clone: array => array.slice()}};
    new Function('Blockly', 'goog', 'setTimeout', eventSource)(Blockly, goog, (fn, delay) => {
        assert.equal(delay, 0); timers.push(fn);
    });
    const variable = {id: 'cell', type: '', value: false};
    const initial = {
        hat: {id: 'hat', opcode: 'arcade_whenSourceStarts', topLevel: true, next: 'declare'},
        declare: {id: 'declare', opcode: 'arcade_declareSourceScalar', inputs: {VARIABLE: {block: 'reporter'}}, fields: {TYPE: {value: 'Boolean'}}},
        reporter: {id: 'reporter', opcode: 'data_variable', fields: {VARIABLE: {id: 'cell', value: 'cell'}}}
    };
    const target = {id: 'stage', isOriginal: true, isStage: true, variables: {cell: variable},
        blocks: {_blocks: {...initial}, getBlock (id) {return this._blocks[id];}},
        lookupVariableById: id => target.variables[id]};
    const cells = createSourceCells({targets: [target]}, {encode: value => value});
    cells.initialize(); variable.value = false;
    const util = {target, thread: {peekStack: () => 'declare'}};
    const event = type => ({type, blockId: type === 'change' ? 'unrelated' : 'declare', workspaceId: 'workspace', isNull: () => false});
    const blockListener = e => {
        received.push(e.type);
        if (e.type === 'delete') delete target.blocks._blocks.declare;
        if (e.type === 'create') target.blocks._blocks.declare = {...initial.declare};
    };
    workspace = {
        removeChangeListener: fn => {assert.equal(fn, blockListener); actions.push('remove'); listeners.delete(fn);},
        addChangeListener: fn => {assert.equal(fn, blockListener); actions.push('add'); listeners.add(fn);},
        fireChangeListener: e => {for (const listener of listeners) listener(e);},
        resize: () => actions.push('resize'),
        clearUndo: () => {actions.push('undo'); Blockly.Events.clearPendingUndo();}
    };
    listeners.add(blockListener);
    const controller = new Function('log', `return ({${method}});`)({error: value => {
        logged.push(value); if (Object.hasOwn(options, 'loggerFailure')) throw options.loggerFailure;
    }});
    Object.assign(controller, {workspace, ScratchBlocks: {Events: Blockly.Events, Xml: {
        textToDom (xml) {assert.equal(xml, '<original/>'); if (Object.hasOwn(options, 'parseFailure')) throw options.parseFailure; return xml;},
        clearWorkspaceAndLoadFromXml (dom, actual) {
            assert.equal(dom, '<original/>'); assert.equal(actual, workspace);
            // These operations correspond to genuine Block.dispose/Xml.domToBlock
            // firing delete/create. Actual queueing and enable-depth are unchanged.
            Blockly.Events.fire(event('delete'));
            Blockly.Events.fire(event('create'));
            if (Object.hasOwn(options, 'loadFailure')) throw options.loadFailure;
        }
    }}, getToolboxXML: () => '<toolbox/>', onWorkspaceMetricsChange: () => actions.push('metrics'),
    props: {vm: {editingTarget: target, blockListener}, updateToolboxState: xml => {assert.equal(xml, '<toolbox/>'); actions.push('toolbox');},
        workspaceMetrics: {targets: {stage: {scrollX: 7, scrollY: 11, scale: 0.5}}}}});
    const drain = () => {while (timers.length) timers.shift()();};
    return {controller, Blockly, received, logged, actions, listeners, blockListener, event, drain, target, initial, cells, util, variable};
}

test('VM workspace projection creates no delayed echo and retains an already queued user edit and prelude identity', () => {
    const f = fixture();
    f.Blockly.Events.fire(f.event('change'));
    const declaration = f.target.blocks.getBlock('declare');
    f.controller.onWorkspaceUpdate({xml: '<original/>'});
    assert.deepEqual(f.received, [], 'genuine queue is asynchronous');
    f.drain();
    assert.deepEqual(f.received, ['change'], 'unrelated existing event is not flushed or discarded');
    assert.equal(f.target.blocks.getBlock('declare'), declaration);
    f.cells.declare({}, f.util); assert.equal(f.variable.value, false);
    assert.equal(f.Blockly.Events.disabled_, 0);
    assert.equal(f.listeners.has(f.blockListener), true);
    assert.deepEqual(f.actions, ['toolbox', 'remove', 'add', 'resize', 'undo']);
    assert.equal(f.controller.workspace.scrollX, 7); assert.equal(f.controller.workspace.scrollY, 11); assert.equal(f.controller.workspace.scale, 0.5);
    // Nonvacuous unsafe control: the SAME genuine queue delivers a delete/create
    // echo and the unchanged real source-prelude guard refuses its replacement.
    const unsafe = fixture();
    unsafe.Blockly.Events.fire(unsafe.event('delete')); unsafe.Blockly.Events.fire(unsafe.event('create')); unsafe.drain();
    assert.deepEqual(unsafe.received, ['delete', 'create']);
    assert.notEqual(unsafe.target.blocks.getBlock('declare'), unsafe.initial.declare);
    assert.throws(() => unsafe.cells.declare({}, unsafe.util), /no current prelude binding/);
});

test('projection retains an outer disable depth and restores events/listener after a handled load failure', () => {
    const failure = new Error('load failure'); const f = fixture({loadFailure: failure});
    f.Blockly.Events.disable();
    f.controller.onWorkspaceUpdate({xml: '<original/>'});
    assert.equal(f.Blockly.Events.disabled_, 1);
    assert.equal(f.listeners.has(f.blockListener), true);
    assert.deepEqual(f.logged, [failure]); assert.equal(failure.message, 'Workspace Update Error: load failure');
    assert.deepEqual(f.actions, ['toolbox', 'remove', 'add', 'resize', 'undo']);
    f.Blockly.Events.enable(); f.drain(); assert.deepEqual(f.received, []);
    f.cells.declare({}, f.util);
    f.Blockly.Events.fire(f.event('change')); f.drain(); assert.deepEqual(f.received, ['change']);
});

test('parse and logger errors retain their identity and restore listener and event depth before escaping', () => {
    for (const stage of ['parseFailure', 'loggerFailure']) {
        const reason = Object.freeze(new Error(stage));
        const f = fixture(stage === 'parseFailure' ? {[stage]: reason} : {[stage]: reason, loadFailure: new Error('inner load')});
        assert.throws(() => f.controller.onWorkspaceUpdate({xml: '<original/>'}), actual => actual === reason);
        assert.equal(f.Blockly.Events.disabled_, 0); assert.equal(f.listeners.has(f.blockListener), true);
        f.drain(); assert.deepEqual(f.received, []);
        f.cells.declare({}, f.util);
        assert.deepEqual(f.actions, ['toolbox', 'remove', 'add']);
    }
});
