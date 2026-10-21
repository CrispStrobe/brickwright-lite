// A workspace reload must not echo its own Blockly events back into the VM
// (the intermittent verify-arcade-legacy-layout timeout). The legacy painter's
// Save calls vm.emitWorkspaceUpdate(); Blockly queues the clear/load
// delete+create events and fires them on a later task, to the listeners
// attached THEN, which includes the VM's. A green flag in that window bound the
// Arcade source prelude to block objects the echo then replaced, and every
// frame threw "Source scalar declaration has no current prelude binding"
// (910 identical page errors in both failing CI artifacts).
//
// This replays that echo against the real VM: delete + create events built
// from the VM's own XML, fired after greenFlag through a queue with Blockly's
// semantics (group captured at construction, delivered later to the
// listeners present at delivery).
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {VM, SB3Creator, stepFrames, clearStrayTimers} from './helpers/bw-vm.mjs';
import {loadExtensionClass, bundledExtensionIds} from './helpers/bw-extensions.mjs';
import {
    runAsWorkspaceReload, isWorkspaceReloadEvent, vmBlockListenerFor, WORKSPACE_RELOAD_GROUP_PREFIX
} from '../overlay/scratch-gui/src/lib/workspace-reload-events.js';

const code = `DEVICE ARCADE
GLOBAL score
SPRITE Game:
WHEN arcade source starts:
  declare arcade source scalar score as Number
  set score to 7`;

/** Blockly.Events' queue: group read at construction, fired on a later task. */
function fakeBlocklyEvents () {
    let group = '';
    const queue = [];
    const listeners = new Set();
    return {
        getGroup: () => group,
        setGroup: state => { group = typeof state === 'boolean' ? (state ? 'user-group' : '') : state; },
        fire: event => queue.push({...event, group}),
        listeners,
        flush () {
            for (const event of queue.splice(0)) for (const listener of listeners) listener(event);
        }
    };
}

async function loadedVm () {
    const creator = new SB3Creator();
    creator.parse(code);
    const vm = new VM(), ids = bundledExtensionIds(), manager = vm.extensionManager;
    const load = manager.loadExtensionURL.bind(manager);
    manager.loadExtensionURL = id => {
        if (!ids.has(id)) return load(id);
        if (!manager.isExtensionLoaded(id)) {
            manager._loadedExtensions.set(id, manager._registerInternalExtension(
                new (loadExtensionClass(ids.get(id)))(vm.runtime)));
        }
        return Promise.resolve();
    };
    await vm.loadProject(Buffer.from(await (await creator.generateSB3()).arrayBuffer()));
    const errors = [];
    vm.runtime.on('BLOCKS_ERROR', error => errors.push(String(error)));
    const game = vm.runtime.targets.find(target => target.sprite?.name === 'Game');
    vm.setEditingTarget(game.id);
    return {vm, game, errors};
}

/** The GUI's onWorkspaceUpdate, against the fake queue. */
function reloadWorkspace (vm, game, Events, listener, tagged) {
    Events.listeners.delete(listener);
    const load = () => {
        const tops = game.blocks.getScripts();
        for (const id of tops) Events.fire({type: 'delete', blockId: id});
        for (const id of tops) {
            Events.fire({type: 'create', blockId: id, xml: {outerHTML: game.blocks.blockToXML(id, {})}});
        }
    };
    if (tagged) runAsWorkspaceReload(Events, load);
    else load();
    Events.listeners.add(listener);
}

async function runWithReloadAfterGreenFlag (tagged) {
    const {vm, game, errors} = await loadedVm();
    const Events = fakeBlocklyEvents();
    const listener = tagged ? vmBlockListenerFor(vm) : e => vm.blockListener(e);
    Events.listeners.add(listener);
    const before = Object.values(game.blocks._blocks).find(b => b.opcode === 'arcade_declareSourceScalar');
    assert.ok(before, 'fixture has a source scalar declaration');
    // The painter's Save, then an immediate green flag, then Blockly's task.
    reloadWorkspace(vm, game, Events, listener, tagged);
    vm.start();
    vm.greenFlag();
    Events.flush();
    // The browser reports the throw as a page error every frame; here it
    // leaves the frame step.
    let thrown = null;
    try { await stepFrames(vm, 6); } catch (error) { thrown = String(error && error.message); }
    vm.quit();
    clearStrayTimers();
    const after = game.blocks.getBlock(before.id);
    const score = Object.values(vm.runtime.getTargetForStage().variables).find(v => v.name === 'score');
    return {errors, thrown, sameObject: after === before, score: score && score.value};
}

test('the untagged echo replaces VM blocks mid-run and the source prelude fails (the CI signature)', async () => {
    const result = await runWithReloadAfterGreenFlag(false);
    assert.equal(result.sameObject, false, 'the echo recreated the declaration as a new object');
    assert.equal(result.thrown, 'Source scalar declaration has no current prelude binding');
    assert.notEqual(String(result.score), '7');
});

test('a tagged reload leaves the VM blocks alone and the game starts', async () => {
    const result = await runWithReloadAfterGreenFlag(true);
    assert.equal(result.sameObject, true);
    assert.equal(result.thrown, null);
    assert.deepEqual(result.errors, []);
    assert.equal(String(result.score), '7');
});

test('reload grouping restores the caller group and other listeners still see the events', () => {
    const Events = fakeBlocklyEvents();
    const seen = [];
    const vm = {blockListener: e => seen.push(['vm', e.type])};
    Events.listeners.add(vmBlockListenerFor(vm));
    Events.listeners.add(e => seen.push(['other', e.type, isWorkspaceReloadEvent(e)]));
    Events.setGroup('drag');
    runAsWorkspaceReload(Events, () => Events.fire({type: 'create'}));
    assert.equal(Events.getGroup(), 'drag');
    Events.fire({type: 'move'});
    Events.flush();
    assert.deepEqual(seen, [['other', 'create', true], ['vm', 'move'], ['other', 'move', false]]);
    assert.equal(vmBlockListenerFor(vm), vmBlockListenerFor(vm), 'one listener per VM so remove pairs with add');
    assert.ok(WORKSPACE_RELOAD_GROUP_PREFIX.length > 0);
});

test('the GUI workspace reload is tagged and the VM listens through the filter', () => {
    const blocks = readFileSync(new URL('../overlay/scratch-gui/src/containers/blocks.jsx', import.meta.url), 'utf8');
    assert.match(blocks, /runAsWorkspaceReload\(this\.ScratchBlocks\.Events, \(\) =>\s+this\.ScratchBlocks\.Xml\.clearWorkspaceAndLoadFromXml\(dom, this\.workspace\)\)/);
    assert.doesNotMatch(blocks, /ChangeListener\(this\.props\.vm\.blockListener\)/);
    assert.equal((blocks.match(/ChangeListener\(vmBlockListenerFor\(this\.props\.vm\)\)/g) || []).length, 3);
});
