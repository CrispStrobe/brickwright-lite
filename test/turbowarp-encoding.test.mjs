// TurboWarp's Encoding extension (id `Encoding`) in Lite — task E3.
//
// A TurboWarp project names the extension by id; Lite routes that id to the
// gallery's content-pinned copy of the same file (extension-manager.js,
// GALLERY_EXTENSION_IDS). These tests hold the route, the table entry against
// the pin and the source's declared id, and the extension's behaviour when a
// TurboWarp-shaped project runs in the real VM.
//
// The parked WIP (23e9c7f44) shipped a partial clean-room copy instead. Its own
// unit test (Base64 of 'apple', 'ä😀', bad input -> '', URL refused) is
// superseded: the original reports '' for bad input too, but decodes unpadded
// input and supports URL, and those are the cases asserted below.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import {createHash} from 'node:crypto';
import {createRequire} from 'node:module';
import JSZip from 'jszip';
import {VM, INTEGRATED, REPO, stepFrames, clearStrayTimers} from './helpers/bw-vm.mjs';

const require = createRequire(import.meta.url);
const pins = JSON.parse(fs.readFileSync(path.join(REPO,
    'overlay/scratch-vm/src/extension-support/gallery-pins.json'), 'utf8'));
const VM_SRC = path.join(INTEGRATED, 'node_modules', 'scratch-vm', 'src');
const ExtensionManager = require(path.join(VM_SRC, 'extension-support/extension-manager.js'));
const makeCrispExtension = require(path.join(VM_SRC, 'extensions/crispstrobe/adapter.js'));
// Byte-identical to the pinned gallery source (MIT, -SIPC-); already a fixture of
// test/gallery-worker-compat.test.mjs, with its licence header intact.
const SOURCE_FILE = path.join(REPO, 'test/fixtures/gallery-worker-sources/encoding.js');
// A checkout of TurboWarp/extensions (its samples/ hold TurboWarp's published
// example projects). Optional: named by environment, never by a machine path.
const CORPUS = process.env.BW_TURBOWARP_EXTENSIONS_DIR || '';
const SAMPLE = CORPUS && path.join(CORPUS, 'samples', 'Base 64.sb3');
const PINNED_URL = `${pins.base}encoding.js`;
const sha256 = bytes => createHash('sha256').update(bytes).digest('hex');

/**
 * A VM whose pinned-gallery loaders are replaced by recorders. When `source`
 * is given the recorded load also registers that source in-process through the
 * gallery adapter, exactly as `_loadTrustedRemoteExtension` does after its
 * fetch and hash check (node has no Worker; worker/adapter parity of this
 * extension is held by test/gallery-worker-compat.test.mjs).
 */
function recordingVM (source) {
    const machine = new VM();
    const manager = machine.extensionManager;
    const requests = [];
    const load = kind => async url => {
        requests.push({kind, url});
        if (!source) return;
        const Extension = makeCrispExtension(source);
        const instance = new Extension(machine.runtime);
        const service = manager._registerInternalExtension(instance);
        // Keyed by URL and by the extension's own id, as both real paths do.
        manager._loadedExtensions.set(url, service);
        manager._loadedExtensions.set(instance.getInfo().id, service);
    };
    manager._loadPinnedWorkerExtension = load('worker');
    manager._loadTrustedRemoteExtension = load('adapter');
    return {machine, manager, requests};
}

const textInput = value => [1, [10, value]];
// Scratch's empty backdrop; the schema needs one costume per target, and with no
// storage attached the VM loads the project without fetching it.
const costume = () => [{name: 'backdrop1', assetId: 'cd21514d0531fdffb22204e0ec5ed84a',
    md5ext: 'cd21514d0531fdffb22204e0ec5ed84a.svg', dataFormat: 'svg', rotationCenterX: 240, rotationCenterY: 180}];

/** A TurboWarp-shaped project: one green-flag script setting `results` from Encoding blocks. */
function encodingProject (cases) {
    const blocks = {
        flag: {opcode: 'event_whenflagclicked', next: null, parent: null, inputs: {}, fields: {},
            shadow: false, topLevel: true, x: 0, y: 0}
    };
    const variables = {};
    let previous = 'flag';
    cases.forEach(([opcode, text, mode], i) => {
        const set = `set${i}`;
        const reporter = `rep${i}`;
        const menu = `menu${i}`;
        variables[`v${i}`] = [`r${i}`, ''];
        blocks[previous].next = set;
        blocks[set] = {opcode: 'data_setvariableto', next: null, parent: previous,
            inputs: {VALUE: [3, reporter, [10, '']]}, fields: {VARIABLE: [`r${i}`, `v${i}`]},
            shadow: false, topLevel: false};
        blocks[reporter] = {opcode: `Encoding_${opcode}`, next: null, parent: set,
            inputs: {string: textInput(text), code: [1, menu]}, fields: {}, shadow: false, topLevel: false};
        blocks[menu] = {opcode: 'Encoding_menu_encode', next: null, parent: reporter, inputs: {},
            fields: {encode: [mode, null]}, shadow: true, topLevel: false};
        previous = set;
    });
    return {
        targets: [
            {isStage: true, name: 'Stage', variables, lists: {}, broadcasts: {}, blocks: {}, comments: {},
                currentCostume: 0, costumes: costume(), sounds: [], volume: 100, layerOrder: 0},
            {isStage: false, name: 'Sprite1', variables: {}, lists: {}, broadcasts: {}, blocks, comments: {},
                currentCostume: 0, costumes: costume(), sounds: [], volume: 100, layerOrder: 1, visible: true,
                x: 0, y: 0, size: 100, direction: 90, draggable: false, rotationStyle: 'all around'}
        ],
        monitors: [],
        extensions: ['Encoding'],
        extensionURLs: {Encoding: 'https://extensions.turbowarp.org/encoding.js'},
        meta: {semver: '3.0.0', vm: '0.2.0', agent: ''}
    };
}

async function runGreenFlag (machine, frames = 6) {
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

test('the Encoding table entry names a pinned gallery file that declares the id Encoding', () => {
    assert.equal(ExtensionManager.GALLERY_EXTENSION_IDS.Encoding, 'encoding');
    const pin = pins.extensions.encoding;
    assert.ok(pin, 'gallery-pins.json has no "encoding" entry');
    const bytes = fs.readFileSync(SOURCE_FILE);
    assert.equal(sha256(bytes), pin.repo, 'the fixture is not the pinned gallery source');
    const text = bytes.toString('utf8');
    assert.match(text, /^\/\/ ID: Encoding$/m);
    assert.match(text, /^\/\/ License: MIT$/m);
    const registered = [];
    const enumProxy = new Proxy({}, {get: (_target, key) => String(key)});
    vm.runInNewContext(text, {
        Scratch: {ArgumentType: enumProxy, BlockType: enumProxy, Cast: {}, translate: m => m,
            extensions: {register: e => registered.push(e), unsandboxed: true}},
        TextEncoder, TextDecoder, atob, btoa
    });
    assert.equal(registered.length, 1);
    assert.equal(registered[0].getInfo().id, 'Encoding');
});

test('a bare Encoding id loads the pinned gallery copy once, through its pin\'s path', async () => {
    const {machine, manager, requests} = recordingVM(null);
    try {
        await manager.loadExtensionURL('Encoding');
        manager._loadedExtensions.set(PINNED_URL, 'svc');
        await manager.loadExtensionURL('Encoding');
        assert.deepEqual(requests, [{kind: 'worker', url: PINNED_URL}],
            'the encoding pin is a worker pin; the id must reach exactly that URL');
        assert.equal(pins.extensions.encoding.migration.status, 'worker');
    } finally {
        machine.quit();
        clearStrayTimers();
    }
});

test('only an exact pinned slug yields a gallery URL', () => {
    const {galleryURLForSlug} = require(path.join(VM_SRC, 'extension-support/gallery-integrity.js'));
    assert.equal(galleryURLForSlug('encoding'), PINNED_URL);
    for (const slug of ['encoding-not-pinned', '../encoding', 'encoding?x=1', '', null]) {
        assert.equal(galleryURLForSlug(slug), null, String(slug));
    }
});

test('a remote-denied distribution still refuses the routed id', async () => {
    const {machine, manager, requests} = recordingVM(null);
    const previous = process.env.BW_REMOTE_EXTENSIONS_POLICY;
    process.env.BW_REMOTE_EXTENSIONS_POLICY = 'deny';
    try {
        await assert.rejects(manager.loadExtensionURL('Encoding'), /only bundled extensions/);
        assert.deepEqual(requests, []);
    } finally {
        if (previous === undefined) delete process.env.BW_REMOTE_EXTENSIONS_POLICY;
        else process.env.BW_REMOTE_EXTENSIONS_POLICY = previous;
        machine.quit();
        clearStrayTimers();
    }
});

test('a TurboWarp project using Encoding opens and runs the original blocks', async () => {
    const source = fs.readFileSync(SOURCE_FILE, 'utf8');
    const {machine, requests} = recordingVM(source);
    try {
        // RFC 4648 Base64 and RFC 3986 percent-encoding. 'YQ' (unpadded) and URL
        // are the cases the WIP's clean-room copy got wrong ('' and a thrown error).
        await machine.loadProject(encodingProject([
            ['encode', 'apple', 'Base64'],
            ['decode', 'YXBwbGU=', 'Base64'],
            ['encode', 'ä😀', 'Base64'],
            ['decode', 'w6Twn5iA', 'Base64'],
            ['decode', 'YQ', 'Base64'],
            ['encode', 'a b&c', 'URL'],
            ['decode', 'a%20b%26c', 'URL']
        ]));
        assert.deepEqual(requests, [{kind: 'worker', url: PINNED_URL}], 'loaded exactly once, from the pin');
        assert.ok(machine.extensionManager.isExtensionLoaded('Encoding'));
        const values = await runGreenFlag(machine);
        assert.deepEqual(values, {
            r0: 'YXBwbGU=', r1: 'apple', r2: 'w6Twn5iA', r3: 'ä😀', r4: 'a', r5: 'a%20b%26c', r6: 'a b&c'
        });
    } finally {
        machine.quit();
        clearStrayTimers();
    }
});

test('TurboWarp\'s published Base 64 sample keeps its Encoding block and evaluates it',
    {skip: !(SAMPLE && fs.existsSync(SAMPLE)) &&
        'BW_TURBOWARP_EXTENSIONS_DIR does not name a TurboWarp/extensions checkout with samples/'}, async () => {
        const source = fs.readFileSync(SOURCE_FILE, 'utf8');
        const bytes = fs.readFileSync(SAMPLE);
        const project = JSON.parse(await (await JSZip.loadAsync(bytes)).file('project.json').async('string'));
        assert.deepEqual(project.extensionURLs, {Encoding: 'https://extensions.turbowarp.org/encoding.js'});
        const {machine, requests} = recordingVM(source);
        try {
            await machine.loadProject(bytes);
            assert.deepEqual(requests, [{kind: 'worker', url: PINNED_URL}]);
            const sprite = machine.runtime.targets.find(t => t.getName() === 'Sprite1');
            const block = Object.values(sprite.blocks._blocks).find(b => b.opcode === 'Encoding_encode');
            assert.ok(block, 'the sample\'s Encoding_encode block did not survive loading');
            // The sample's loose reporter: what clicking it shows in TurboWarp.
            const info = machine.runtime._blockInfo.find(i => i.id === 'Encoding');
            assert.ok(info, 'Encoding primitives were not registered');
            const primitive = machine.runtime.getOpcodeFunction('Encoding_encode');
            assert.equal(typeof primitive, 'function');
            assert.equal(primitive({string: 'apple', code: 'Base64'}, {}), 'YXBwbGU=');
        } finally {
            machine.quit();
            clearStrayTimers();
        }
    });
