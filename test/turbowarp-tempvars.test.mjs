// TurboWarp's Temporary Variables extension (id `lmsTempVars2`) in Lite — task E3.
//
// A TurboWarp project names it by id; Lite routes the id to the gallery's
// content-pinned `Lily/TempVariables2.js` (extension-manager.js,
// GALLERY_EXTENSION_IDS). Its pin is `deferred`, so it runs through the in-process
// gallery adapter like any gallery pick of it.
//
// The source is MIT AND LGPL-3.0 and is NOT committed to this BSD-3 tree; the
// tests that execute it read the pinned file from a TurboWarp/extensions checkout
// named by BW_TURBOWARP_EXTENSIONS_DIR and are skipped by name without it. The route and the pin are held without it.
//
// The parked WIP (23e9c7f44) shipped a 4-opcode clean-room copy. Its unit test
// (an unset thread variable reads 0) is superseded: the original reads "", and
// clears runtime variables on green flag and stop; both asserted below.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {createRequire} from 'node:module';
import {VM, INTEGRATED, REPO, stepFrames, clearStrayTimers} from './helpers/bw-vm.mjs';

const require = createRequire(import.meta.url);
const pins = JSON.parse(fs.readFileSync(path.join(REPO,
    'overlay/scratch-vm/src/extension-support/gallery-pins.json'), 'utf8'));
const VM_SRC = path.join(INTEGRATED, 'node_modules', 'scratch-vm', 'src');
const ExtensionManager = require(path.join(VM_SRC, 'extension-support/extension-manager.js'));
const makeCrispExtension = require(path.join(VM_SRC, 'extensions/crispstrobe/adapter.js'));
const SLUG = 'Lily/TempVariables2';
// A checkout of TurboWarp/extensions. Optional: named by environment, never by a machine path.
const CORPUS = process.env.BW_TURBOWARP_EXTENSIONS_DIR || '';
const SOURCE_FILE = CORPUS && path.join(CORPUS, 'extensions', `${SLUG}.js`);
const SAMPLE = CORPUS && path.join(CORPUS, 'samples', 'Temporary Variables - Thread vs. Runtime.sb3');
const PINNED_URL = `${pins.base}${SLUG}.js`;
const sha256 = bytes => createHash('sha256').update(bytes).digest('hex');

// The corpus copy counts only when it is the reviewed pin's bytes.
const pinnedSource = (() => {
    if (!SOURCE_FILE || !fs.existsSync(SOURCE_FILE)) return null;
    const bytes = fs.readFileSync(SOURCE_FILE);
    return sha256(bytes) === pins.extensions[SLUG].repo ? bytes.toString('utf8') : null;
})();
const NO_SOURCE = !pinnedSource &&
    `BW_TURBOWARP_EXTENSIONS_DIR has no ${SLUG}.js matching its pin (MIT AND LGPL-3.0; not committed)`;

function recordingVM (source) {
    const machine = new VM();
    const manager = machine.extensionManager;
    const requests = [];
    const load = kind => async url => {
        requests.push({kind, url});
        if (!source) return;
        // What _loadTrustedRemoteExtension does once the bytes have passed their hash check.
        const Extension = makeCrispExtension(source);
        const instance = new Extension(machine.runtime);
        const service = manager._registerInternalExtension(instance);
        manager._loadedExtensions.set(url, service);
        manager._loadedExtensions.set(instance.getInfo().id, service);
    };
    manager._loadPinnedWorkerExtension = load('worker');
    manager._loadTrustedRemoteExtension = load('adapter');
    return {machine, manager, requests};
}

const text = value => [1, [10, value]];
const costume = () => [{name: 'backdrop1', assetId: 'cd21514d0531fdffb22204e0ec5ed84a',
    md5ext: 'cd21514d0531fdffb22204e0ec5ed84a.svg', dataFormat: 'svg', rotationCenterX: 240, rotationCenterY: 180}];

/**
 * Two green-flag scripts, A and B, each run:
 *   repeat 5: change thread [n] by 1; change runtime [shared] by 1
 *   set <X>thread to (thread [n]); set <X>missing to (thread [unset])
 * and B, which runs after A in every frame, then reads (runtime [shared]).
 */
function tempvarsProject () {
    const blocks = {};
    const variables = {};
    let id = 0;
    const next = () => `b${id++}`;
    const reporter = (parent, opcode, inputs) => {
        const key = next();
        blocks[key] = {opcode: `lmsTempVars2_${opcode}`, next: null, parent, inputs, fields: {},
            shadow: false, topLevel: false};
        return key;
    };
    const setVar = (parent, name, opcode, varName) => {
        const key = next();
        variables[`v_${name}`] = [name, ''];
        const rep = reporter(key, opcode, {VAR: text(varName)});
        blocks[key] = {opcode: 'data_setvariableto', next: null, parent,
            inputs: {VALUE: [3, rep, [10, '']]}, fields: {VARIABLE: [name, `v_${name}`]},
            shadow: false, topLevel: false};
        return key;
    };
    const chain = keys => {
        for (let i = 0; i < keys.length - 1; i++) {
            blocks[keys[i]].next = keys[i + 1];
            blocks[keys[i + 1]].parent = keys[i];
        }
    };
    for (const name of ['A', 'B']) {
        const hat = next();
        blocks[hat] = {opcode: 'event_whenflagclicked', next: null, parent: null, inputs: {}, fields: {},
            shadow: false, topLevel: true, x: 0, y: 0};
        const loop = next();
        const changeThread = next();
        const changeRuntime = next();
        blocks[changeThread] = {opcode: 'lmsTempVars2_changeThreadVariable', next: changeRuntime, parent: loop,
            inputs: {VAR: text('n'), NUM: [1, [4, '1']]}, fields: {}, shadow: false, topLevel: false};
        blocks[changeRuntime] = {opcode: 'lmsTempVars2_changeRuntimeVariable', next: null, parent: changeThread,
            inputs: {VAR: text('shared'), NUM: [1, [4, '1']]}, fields: {}, shadow: false, topLevel: false};
        blocks[loop] = {opcode: 'control_repeat', next: null, parent: hat,
            inputs: {TIMES: [1, [6, '5']], SUBSTACK: [2, changeThread]}, fields: {}, shadow: false, topLevel: false};
        const readThread = setVar(null, `${name}thread`, 'getThreadVariable', 'n');
        const readMissing = setVar(null, `${name}missing`, 'getThreadVariable', 'unset');
        const tail = [hat, loop, readThread, readMissing];
        // B starts after A and so runs after it within each frame: when B's loop
        // ends, A has made all five of its runtime increments too.
        if (name === 'B') tail.push(setVar(null, 'shared', 'getRuntimeVariable', 'shared'));
        chain(tail);
    }
    return {
        targets: [
            {isStage: true, name: 'Stage', variables, lists: {}, broadcasts: {}, blocks: {}, comments: {},
                currentCostume: 0, costumes: costume(), sounds: [], volume: 100, layerOrder: 0},
            {isStage: false, name: 'Sprite1', variables: {}, lists: {}, broadcasts: {}, blocks,
                comments: {}, currentCostume: 0, costumes: costume(), sounds: [], volume: 100, layerOrder: 1,
                visible: true, x: 0, y: 0, size: 100, direction: 90, draggable: false, rotationStyle: 'all around'}
        ],
        monitors: [],
        extensions: ['lmsTempVars2'],
        extensionURLs: {lmsTempVars2: 'https://extensions.turbowarp.org/Lily/TempVariables2.js'},
        meta: {semver: '3.0.0', vm: '0.2.0', agent: ''}
    };
}

async function greenFlag (machine, frames = 14) {
    machine.start();
    machine.greenFlag();
    machine.quit();
    await stepFrames(machine, frames);
    const values = {};
    for (const variable of Object.values(machine.runtime.getTargetForStage().variables)) {
        values[variable.name] = variable.value;
    }
    return values;
}

test('the lmsTempVars2 table entry names a pinned gallery file', () => {
    assert.equal(ExtensionManager.GALLERY_EXTENSION_IDS.lmsTempVars2, SLUG);
    const pin = pins.extensions[SLUG];
    assert.ok(pin, `gallery-pins.json has no "${SLUG}" entry`);
    assert.equal(pin.migration.status, 'deferred', 'a promoted pin moves this extension to the worker path');
});

test('the pinned source declares the id lmsTempVars2 and its licence', {skip: NO_SOURCE}, () => {
    assert.match(pinnedSource, /^\/\/ ID: lmsTempVars2$/m);
    assert.match(pinnedSource, /^\/\/ License: MIT AND LGPL-3\.0$/m);
});

test('a bare lmsTempVars2 id loads the pinned gallery copy once, through the adapter', async () => {
    const {machine, manager, requests} = recordingVM(null);
    try {
        await manager.loadExtensionURL('lmsTempVars2');
        assert.deepEqual(requests, [{kind: 'adapter', url: PINNED_URL}]);
    } finally {
        machine.quit();
        clearStrayTimers();
    }
});

test('thread variables are per thread, runtime variables shared and cleared on green flag',
    {skip: NO_SOURCE}, async () => {
        const {machine, requests} = recordingVM(pinnedSource);
        try {
            await machine.loadProject(tempvarsProject());
            assert.deepEqual(requests, [{kind: 'adapter', url: PINNED_URL}], 'loaded exactly once');
            const first = await greenFlag(machine);
            assert.deepEqual(first, {Athread: 5, Amissing: '', Bthread: 5, Bmissing: '', shared: 10});
            // A second run starts from nothing again (TurboWarp resets on PROJECT_START).
            const second = await greenFlag(machine);
            assert.deepEqual(second, first);
        } finally {
            machine.quit();
            clearStrayTimers();
        }
    });

test('TurboWarp\'s published Thread vs. Runtime sample keeps and runs its four blocks',
    {skip: (!(SAMPLE && fs.existsSync(SAMPLE)) && 'BW_TURBOWARP_EXTENSIONS_DIR has no samples/') || NO_SOURCE}, async () => {
        const bytes = fs.readFileSync(SAMPLE);
        const {machine, requests} = recordingVM(pinnedSource);
        try {
            await machine.loadProject(bytes);
            assert.deepEqual(requests, [{kind: 'adapter', url: PINNED_URL}]);
            const opcodes = new Set(machine.runtime.targets.flatMap(t =>
                Object.values(t.blocks._blocks).map(b => b.opcode)));
            for (const op of ['changeThreadVariable', 'getThreadVariable', 'changeRuntimeVariable',
                'getRuntimeVariable']) assert.ok(opcodes.has(`lmsTempVars2_${op}`), op);
            // Key 1: the first thread says its own count, starting at 1.
            const said = [];
            machine.runtime.on('SAY', (_target, _type, message) => said.push(String(message)));
            machine.start();
            machine.quit();
            machine.postIOData('keyboard', {key: '1', isDown: true});
            await stepFrames(machine, 3);
            assert.equal(said[0], '1');
        } finally {
            machine.quit();
            clearStrayTimers();
        }
    });
