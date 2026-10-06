// Gallery extensions in saved and TurboWarp projects (task E5).
//
// Before E5, Lite neither WROTE a project's `extensionURLs` nor READ one, and
// only E3's two ids (Encoding, lmsTempVars2) were routed. Any other gallery
// extension a saved Lite project or a TurboWarp project used reopened with
// every block broken ("Unknown extension id"). Measured on TurboWarp's 16
// published sample projects: 2 of 16 loaded their extension (E3's two); a
// project saved after a gallery pick carried no URL, and of three picks only
// E3's Encoding reopened with its extension.
//
// Now: every pinned gallery id routes to its pinned copy (the id map is the
// pins' generator-owned `extensionId`), a file's `extensionURLs` entry is
// honoured only when it names a pinned gallery copy of that id, and a save
// writes the pinned URL of every gallery extension in use.
//
// The real loaders run here: `fetch` is stubbed to serve the bytes the gallery
// serves (test/fixtures/gallery-served/, each checked against its pin), the
// SHA-256 check is the shipped one, and the adapter path runs in-process as in
// the browser. Node has no Worker, so for a worker pin only the realm is
// stood in: the verified, frozen host record the loader hands to dispatch is
// registered through the adapter (worker/adapter parity of these pins is held
// by test/gallery-worker-compat.test.mjs) and the manager's own onWorkerInit
// completes the load. Fetch, verification, allocation and bookkeeping are real.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import {createHash} from 'node:crypto';
import {createRequire} from 'node:module';
import {VM, INTEGRATED, REPO, stepFrames, clearStrayTimers} from './helpers/bw-vm.mjs';
import {extensionIdOf} from '../scripts/sync-gallery-pins.mjs';

const require = createRequire(import.meta.url);
const VM_SRC = path.join(INTEGRATED, 'node_modules', 'scratch-vm', 'src');
const ExtensionManager = require(path.join(VM_SRC, 'extension-support/extension-manager.js'));
const integrity = require(path.join(VM_SRC, 'extension-support/gallery-integrity.js'));
const dispatch = require(path.join(VM_SRC, 'dispatch/central-dispatch.js'));
const log = require(path.join(VM_SRC, 'util/log.js'));
const Cast = require(path.join(VM_SRC, 'util/cast.js'));
const makeCrispExtension = require(path.join(VM_SRC, 'extensions/crispstrobe/adapter.js'));
const validate = require(path.join(INTEGRATED, 'node_modules', 'scratch-parser'));
const pins = JSON.parse(fs.readFileSync(path.join(REPO,
    'overlay/scratch-vm/src/extension-support/gallery-pins.json'), 'utf8'));
const SERVED = path.join(REPO, 'test/fixtures/gallery-served');
const REPO_SOURCES = path.join(REPO, 'test/fixtures/gallery-worker-sources');
const sha256 = bytes => createHash('sha256').update(bytes).digest('hex');
const pinnedURL = slug => `${pins.base}${slug}.js`;
const turbowarpURL = slug => `https://extensions.turbowarp.org/${slug}.js`;

// ---- network and worker stand-ins ------------------------------------------

const fetches = [];
let served = slug => fs.readFileSync(path.join(SERVED, `${slug}.js`));
const realFetch = globalThis.fetch;
globalThis.fetch = async url => {
    fetches.push(String(url));
    const slug = String(url).startsWith(pins.base) ? String(url).slice(pins.base.length, -3) : null;
    const file = slug && path.join(SERVED, `${slug}.js`);
    if (!file || !fs.existsSync(file)) return {ok: false, status: 404, arrayBuffer: async () => new ArrayBuffer(0)};
    const bytes = served(slug);
    return {ok: true, status: 200, arrayBuffer: async () => bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.length)};
};
const realWorker = globalThis.Worker;
globalThis.Worker = class { postMessage () {} addEventListener () {} terminate () {} };
const managers = new Set();
const realAddWorker = dispatch.addWorker;
dispatch.addWorker = (worker, hostRecord) => {
    const manager = [...managers].find(m => m.pendingWorkers[hostRecord.workerId] &&
        m.pendingWorkers[hostRecord.workerId].hostRecord === hostRecord);
    assert.ok(manager, 'a worker was started for no pending pinned load');
    assert.ok(Object.isFrozen(hostRecord));
    try {
        const Extension = makeCrispExtension(hostRecord.source);
        const instance = new Extension(manager.runtime);
        const service = manager._registerInternalExtension(instance);
        manager._loadedExtensions.set(instance.getInfo().id, service);
        manager.pendingWorkers[hostRecord.workerId].serviceNames.push(service);
        manager.onWorkerInit(hostRecord.workerId);
    } catch (e) {
        manager.onWorkerInit(hostRecord.workerId, e);
    }
};
test.after(() => {
    globalThis.fetch = realFetch;
    globalThis.Worker = realWorker;
    dispatch.addWorker = realAddWorker;
});

const warnings = [];
const realWarn = log.warn;
log.warn = (...args) => {
    warnings.push(args.join(' '));
};
test.after(() => {
    log.warn = realWarn;
});

function machine () {
    const instance = new VM();
    managers.add(instance.extensionManager);
    return instance;
}
function done (instance) {
    instance.quit();
    managers.delete(instance.extensionManager);
    clearStrayTimers();
}

// ---- projects ----------------------------------------------------------------

const costume = () => [{name: 'backdrop1', assetId: 'cd21514d0531fdffb22204e0ec5ed84a',
    md5ext: 'cd21514d0531fdffb22204e0ec5ed84a.svg', dataFormat: 'svg', rotationCenterX: 240, rotationCenterY: 180}];
const text = value => [1, [10, String(value)]];

// One representative per gallery-extension class. `reporter` is a block the
// green flag stores into variable `r`; `expected` is what the original computes.
const CASES = {
    worker: {
        slug: 'encoding', id: 'Encoding',
        reporter: {opcode: 'Encoding_encode', inputs: {string: text('apple'), code: text('Base64')}},
        expected: 'YXBwbGU='
    },
    'worker, header id is not its id': {
        slug: 'Clay/htmlEncode', id: 'claytonhtmlencode',
        reporter: {opcode: 'claytonhtmlencode_encode', inputs: {text: text('<b>&"\'')}},
        expected: '&lt;b&gt;&amp;&quot;&apos;'
    },
    adapter: {
        slug: 'JeremyGamer13/tween', id: 'jeremygamerTweening',
        reporter: {opcode: 'jeremygamerTweening_tweenValue', inputs: {
            MODE: text('linear'), DIRECTION: text('in'), START: text(0), END: text(200), AMOUNT: text(25)}},
        expected: 50
    }
};

/** A TurboWarp-shaped project: extensions + extensionURLs as TurboWarp writes them. */
function project (cases, extensionURLs) {
    const blocks = {
        flag: {opcode: 'event_whenflagclicked', next: null, parent: null, inputs: {}, fields: {},
            shadow: false, topLevel: true, x: 0, y: 0}
    };
    const variables = {};
    let previous = 'flag';
    cases.forEach((c, i) => {
        variables[`v${i}`] = [`r${i}`, ''];
        blocks[previous].next = `set${i}`;
        blocks[`set${i}`] = {opcode: 'data_setvariableto', next: null, parent: previous,
            inputs: {VALUE: [3, `rep${i}`, [10, '']]}, fields: {VARIABLE: [`r${i}`, `v${i}`]},
            shadow: false, topLevel: false};
        blocks[`rep${i}`] = {opcode: c.reporter.opcode, next: null, parent: `set${i}`,
            inputs: c.reporter.inputs, fields: {}, shadow: false, topLevel: false};
        previous = `set${i}`;
    });
    const json = {
        targets: [
            {isStage: true, name: 'Stage', variables, lists: {}, broadcasts: {}, blocks: {}, comments: {},
                currentCostume: 0, costumes: costume(), sounds: [], volume: 100, layerOrder: 0},
            {isStage: false, name: 'Sprite1', variables: {}, lists: {}, broadcasts: {}, blocks, comments: {},
                currentCostume: 0, costumes: costume(), sounds: [], volume: 100, layerOrder: 1, visible: true,
                x: 0, y: 0, size: 100, direction: 90, draggable: false, rotationStyle: 'all around'}
        ],
        monitors: [],
        extensions: [...new Set(cases.map(c => c.id))],
        meta: {semver: '3.0.0', vm: '0.2.0', agent: ''}
    };
    if (extensionURLs) json.extensionURLs = extensionURLs;
    return json;
}

async function greenFlag (instance) {
    instance.start();
    instance.greenFlag();
    await stepFrames(instance, 6);
    const values = {};
    for (const variable of Object.values(instance.runtime.getTargetForStage().variables)) {
        values[variable.name] = variable.value;
    }
    return values;
}

const parserVerdict = json => new Promise(resolve => {
    validate(Buffer.from(JSON.stringify(json)), false, error => resolve(error ? JSON.stringify(error) : null));
});

// ---- the id map ----------------------------------------------------------------

test('every served fixture is the pinned gallery content', () => {
    for (const {slug} of Object.values(CASES)) {
        assert.equal(sha256(fs.readFileSync(path.join(SERVED, `${slug}.js`))), pins.extensions[slug].served, slug);
    }
});

test('the id map is the pins\' extensionId, one row per pin, E3\'s two entries included', () => {
    const map = ExtensionManager.GALLERY_EXTENSION_IDS;
    const pinned = Object.entries(pins.extensions);
    assert.equal(pinned.length, 129);
    assert.ok(pinned.every(([, pin]) => typeof pin.extensionId === 'string' && pin.extensionId),
        'every pin at a1dd6cbc has a readable id');
    assert.deepEqual(map, Object.fromEntries(pinned.map(([slug, pin]) => [pin.extensionId, slug])));
    assert.equal(map.Encoding, 'encoding');
    assert.equal(map.lmsTempVars2, 'Lily/TempVariables2');
    // Each of TurboWarp's published samples names an id that is now routable.
    for (const id of ['AR', 'xeltallivclipblend', 'lmsmcutils', 'Encoding', 'griffpatch', 'gsaWebsocket',
        'pointerlock', 'lbdrawtest', 'penP', 'runtimeoptions', 'shovelColorPicker', 'xeltallivSimple3D',
        'stretch', 'lmsTempVars2', 'MouseCursor', 'jeremygamerTweening']) {
        assert.ok(integrity.galleryURLForExtensionId(id), `${id} does not route`);
    }
});

test('a pin\'s extensionId is the id its source registers, not its header', () => {
    // Executed: every repo-byte fixture the worker corpus holds (24 pins), each
    // checked against its pin first. extensionIdOf must agree with the real
    // getInfo().id for all of them, and so must the pin.
    const walk = dir => fs.readdirSync(dir, {withFileTypes: true}).flatMap(entry =>
        entry.isDirectory() ? walk(path.join(dir, entry.name)) : [path.join(dir, entry.name)]);
    const files = walk(REPO_SOURCES).filter(file => file.endsWith('.js'));
    assert.ok(files.length >= 24);
    for (const file of files) {
        const slug = path.relative(REPO_SOURCES, file).replace(/\\/g, '/').slice(0, -3);
        const bytes = fs.readFileSync(file);
        assert.equal(sha256(bytes), pins.extensions[slug].repo, `${slug} fixture is not its pin`);
        const registered = [];
        const enums = new Proxy({}, {get: (_target, key) => String(key)});
        vm.runInNewContext(bytes.toString('utf8'), {
            Scratch: {ArgumentType: enums, BlockType: enums, TargetType: enums, Cast,
                translate: Object.assign(m => (typeof m === 'object' ? m.default : m), {setup () {}}),
                extensions: {register: e => registered.push(e), unsandboxed: false}},
            TextEncoder, TextDecoder, URL, Blob, atob, btoa, setTimeout, clearTimeout,
            console: {log () {}, warn () {}, error () {}}
        });
        assert.equal(registered.length, 1, slug);
        const id = registered[0].getInfo().id;
        assert.equal(extensionIdOf(bytes), id, `${slug}: extensionIdOf`);
        assert.equal(pins.extensions[slug].extensionId, id, `${slug}: pin`);
    }
    const clay = fs.readFileSync(path.join(REPO_SOURCES, 'Clay/htmlEncode.js'), 'utf8');
    assert.match(clay, /^\/\/ ID: clayhtmlencode\r?$/m, 'the header this test is about');
    assert.equal(pins.extensions['Clay/htmlEncode'].extensionId, 'claytonhtmlencode');
    // Static, never executed: an identifier bound once, and the header fallback.
    assert.equal(extensionIdOf('const ID = "abc";\nclass X { getInfo() { return { name: "x", id: ID }; } }'), 'abc');
    assert.equal(extensionIdOf('// ID: hdr\nclass X { getInfo() { const i = make(); return i; } } f("hdr")'), 'hdr');
    assert.equal(extensionIdOf('// ID: hdr\nclass X { getInfo() { return make(); } }'), null,
        'a header the source never quotes is not evidence');
    assert.equal(extensionIdOf('class A { getInfo() { return {id: "a"}; } } class B { getInfo() { return {id: "b"}; } }'),
        null, 'two registrations are ambiguous');
});

// ---- TurboWarp files ------------------------------------------------------------

for (const [label, c] of Object.entries(CASES)) {
    test(`a TurboWarp file using a ${label} gallery extension opens and runs (${c.id})`, async () => {
        const instance = machine();
        fetches.length = 0;
        try {
            await instance.loadProject(project([c], {[c.id]: turbowarpURL(c.slug)}));
            assert.deepEqual(fetches, [pinnedURL(c.slug)],
                'the pinned copy loads exactly once, and TurboWarp\'s host is never asked');
            assert.ok(instance.extensionManager.isExtensionLoaded(c.id));
            assert.deepEqual(await greenFlag(instance), {r0: c.expected});
        } finally {
            done(instance);
        }
    });
}

test('a TurboWarp file naming two gallery extensions and a bundled one loads all three', async () => {
    const instance = machine();
    fetches.length = 0;
    try {
        const json = project([CASES.worker, CASES.adapter], {
            Encoding: turbowarpURL('encoding'), jeremygamerTweening: turbowarpURL('JeremyGamer13/tween')});
        json.extensions.push('pen');
        await instance.loadProject(json);
        assert.deepEqual(fetches.sort(), [pinnedURL('JeremyGamer13/tween'), pinnedURL('encoding')]);
        for (const id of ['Encoding', 'jeremygamerTweening', 'pen']) {
            assert.ok(instance.extensionManager.isExtensionLoaded(id), id);
        }
        assert.deepEqual(await greenFlag(instance), {r0: 'YXBwbGU=', r1: 50});
    } finally {
        done(instance);
    }
});

// ---- save -> reopen -------------------------------------------------------------

for (const [label, c] of Object.entries(CASES)) {
    test(`a Lite project using a ${label} gallery extension saves its pinned URL and reopens (${c.id})`, async () => {
        // Authored in Lite: the extension came from the gallery picker (by URL),
        // the file has no extensionURLs yet.
        const author = machine();
        let saved;
        try {
            await author.extensionManager.loadExtensionURL(pinnedURL(c.slug));
            await author.loadProject(project([c]));
            saved = JSON.parse(author.toJSON());
        } finally {
            done(author);
        }
        assert.deepEqual(saved.extensions, [c.id]);
        assert.deepEqual(saved.extensionURLs, {[c.id]: pinnedURL(c.slug)});
        assert.deepEqual(Object.keys(saved), ['targets', 'monitors', 'extensions', 'extensionURLs', 'meta'],
            'extensionURLs sits after extensions, as TurboWarp writes it');
        assert.equal(await parserVerdict(saved), null, 'stock scratch-parser accepts the saved project');

        const reader = machine();
        fetches.length = 0;
        const loadProjectExtension = reader.extensionManager.loadProjectExtension.bind(reader.extensionManager);
        const asked = [];
        reader.extensionManager.loadProjectExtension = (id, url) => {
            asked.push([id, url]);
            return loadProjectExtension(id, url);
        };
        try {
            await reader.loadProject(JSON.stringify(saved));
            assert.deepEqual(asked, [[c.id, pinnedURL(c.slug)]], 'the saved URL is what the load reads');
            assert.deepEqual(fetches, [pinnedURL(c.slug)]);
            assert.deepEqual(await greenFlag(reader), {r0: c.expected});
            assert.deepEqual(JSON.parse(reader.toJSON()).extensionURLs, saved.extensionURLs, 'stable on re-save');
        } finally {
            done(reader);
        }
    });
}

test('E3\'s lmsTempVars2 saves its pinned URL and reopens through it', async () => {
    // Its source is MIT AND LGPL-3.0 and is not committed; a stand-in with its id
    // takes the place of the bytes once the real router has chosen the URL.
    const url = pinnedURL('Lily/TempVariables2');
    const standIn = manager => async loaded => {
        assert.equal(loaded, url);
        const service = manager._registerInternalExtension({
            getInfo: () => ({id: 'lmsTempVars2', name: 'Temporary Variables', blocks: [
                {opcode: 'getRuntimeVariable', blockType: 'reporter', text: 'runtime var', arguments: {}}
            ]}),
            getRuntimeVariable: () => 'stand-in'
        });
        manager._loadedExtensions.set(loaded, service);
        manager._loadedExtensions.set('lmsTempVars2', service);
    };
    const temp = {id: 'lmsTempVars2', reporter: {opcode: 'lmsTempVars2_getRuntimeVariable', inputs: {}}};
    const author = machine();
    let saved;
    try {
        author.extensionManager._loadTrustedRemoteExtension = standIn(author.extensionManager);
        await author.loadProject(project([temp]));
        saved = JSON.parse(author.toJSON());
    } finally {
        done(author);
    }
    assert.deepEqual(saved.extensionURLs, {lmsTempVars2: url});
    const reader = machine();
    const requested = [];
    try {
        const load = standIn(reader.extensionManager);
        reader.extensionManager._loadTrustedRemoteExtension = u => {
            requested.push(u);
            return load(u);
        };
        await reader.loadProject(JSON.stringify(saved));
        assert.deepEqual(requested, [url]);
        assert.ok(reader.extensionManager.isExtensionLoaded('lmsTempVars2'));
    } finally {
        done(reader);
    }
});

test('a project with only bundled extensions saves no extensionURLs (the file stays stock)', async () => {
    const instance = machine();
    try {
        const json = project([]);
        json.extensions = ['pen', 'bitops'];
        await instance.loadProject(json);
        await instance.extensionManager.loadExtensionURL('bitops');
        const saved = JSON.parse(instance.toJSON());
        assert.equal('extensionURLs' in saved, false);
    } finally {
        done(instance);
    }
});

// ---- refusals ------------------------------------------------------------------

const REFUSED = {
    'another host': 'https://example.com/encoding.js',
    'an unpinned gallery slug': `${pins.base}not-a-pinned-extension.js`,
    'a pinned URL of a different id': pinnedURL('JeremyGamer13/tween'),
    'a query string on TurboWarp\'s URL': `${turbowarpURL('encoding')}?v=2`,
    'traversal on our URL': `${pins.base}x/../encoding.js`,
    'a data: URL': 'data:text/javascript,Scratch.extensions.register({getInfo(){return{id:"Encoding",blocks:[]}}})',
    'a non-string': 42
};
for (const [label, url] of Object.entries(REFUSED)) {
    test(`a project naming ${label} for an id is refused by name and nothing is fetched`, async () => {
        const instance = machine();
        fetches.length = 0;
        warnings.length = 0;
        try {
            await instance.loadProject(project([CASES.worker], {Encoding: url}));
            assert.deepEqual(fetches, [], 'neither the named URL nor the gallery copy was fetched');
            assert.equal(instance.extensionManager.isExtensionLoaded('Encoding'), false);
            const refusal = warnings.find(w => w.includes('Refusing extension "Encoding"'));
            assert.ok(refusal, `no refusal naming the id: ${JSON.stringify(warnings)}`);
            assert.ok(refusal.includes(JSON.stringify(String(url))), 'the refusal names the URL');
            const saved = JSON.parse(instance.toJSON());
            assert.equal('extensionURLs' in saved, false, 'a refused URL is not written back as trusted');
        } finally {
            done(instance);
        }
    });
}

test('the refusal lasts for that project only', async () => {
    const instance = machine();
    try {
        await instance.loadProject(project([CASES.worker], {Encoding: 'https://example.com/x.js'}));
        assert.equal(instance.extensionManager.isExtensionLoaded('Encoding'), false);
        fetches.length = 0;
        await instance.loadProject(project([CASES.worker]));
        assert.deepEqual(fetches, [pinnedURL('encoding')]);
        assert.ok(instance.extensionManager.isExtensionLoaded('Encoding'));
    } finally {
        done(instance);
    }
});

test('changed gallery bytes are refused after the fetch and nothing registers', async () => {
    const instance = machine();
    const previous = served;
    served = slug => Buffer.concat([previous(slug), Buffer.from('\n// tampered\n')]);
    warnings.length = 0;
    try {
        for (const c of [CASES.worker, CASES.adapter]) {
            await instance.loadProject(project([c], {[c.id]: turbowarpURL(c.slug)}));
            assert.equal(instance.extensionManager.isExtensionLoaded(c.id), false, c.id);
        }
        assert.equal(warnings.filter(w => /has changed since its reviewed pin/.test(w)).length, 2,
            JSON.stringify(warnings));
    } finally {
        served = previous;
        done(instance);
    }
});

test('a bundled id keeps priority over the gallery copy a file names', async () => {
    // CrispStrobe/bitops is pinned in the gallery under the same id Lite bundles.
    assert.equal(pins.extensions['CrispStrobe/bitops'].extensionId, 'bitops');
    const instance = machine();
    fetches.length = 0;
    try {
        const json = project([]);
        json.extensions = ['bitops'];
        json.extensionURLs = {bitops: pinnedURL('CrispStrobe/bitops')};
        json.targets[1].blocks = {b: {opcode: 'bitops_bitand', next: null, parent: null,
            inputs: {A: [1, [4, '6']], B: [1, [4, '3']]}, fields: {}, shadow: false, topLevel: true, x: 0, y: 0}};
        await instance.loadProject(json);
        assert.deepEqual(fetches, []);
        const manager = instance.extensionManager;
        assert.ok(manager.isExtensionLoaded('bitops'));
        assert.equal(manager.isExtensionLoaded(pinnedURL('CrispStrobe/bitops')), false);
        assert.equal(manager.galleryURLForLoadedExtension('bitops'), null);
        assert.equal('extensionURLs' in JSON.parse(instance.toJSON()), false);
        // And by bare id, as installTargets and sprite imports ask.
        await manager.loadExtensionURL('bitops');
        assert.deepEqual(fetches, []);
        // Even if the gallery copy is loaded by its URL as well (the picker hides
        // it, a direct call does not), a save never names a URL for a bundled id:
        // the reopened project must get the bundled one. Stand-in bytes (MPL-2.0,
        // not committed) registered the way the adapter path registers them.
        const url = pinnedURL('CrispStrobe/bitops');
        manager._loadTrustedRemoteExtension = async loaded => {
            const service = manager._registerInternalExtension({
                getInfo: () => ({id: 'bitops', name: 'gallery copy', blocks: []})
            });
            manager._loadedExtensions.set(loaded, service);
            manager._loadedExtensions.set('bitops', service);
        };
        await manager.loadExtensionURL(url);
        assert.ok(manager.isExtensionLoaded(url));
        assert.equal(manager.galleryURLForLoadedExtension('bitops'), null);
        assert.equal('extensionURLs' in JSON.parse(instance.toJSON()), false);
    } finally {
        done(instance);
    }
});

test('a remote-denied build refuses a gallery extension a file names, with its reason', async () => {
    const previous = process.env.BW_REMOTE_EXTENSIONS_POLICY;
    process.env.BW_REMOTE_EXTENSIONS_POLICY = 'deny';
    const instance = machine();
    fetches.length = 0;
    warnings.length = 0;
    try {
        await instance.loadProject(project([CASES.adapter], {jeremygamerTweening: turbowarpURL('JeremyGamer13/tween')}));
        assert.deepEqual(fetches, []);
        assert.equal(instance.extensionManager.isExtensionLoaded('jeremygamerTweening'), false);
        assert.ok(warnings.some(w => w.includes('Extension "jeremygamerTweening" did not load') &&
            w.includes('only bundled extensions')), JSON.stringify(warnings));
    } finally {
        if (previous === undefined) delete process.env.BW_REMOTE_EXTENSIONS_POLICY;
        else process.env.BW_REMOTE_EXTENSIONS_POLICY = previous;
        done(instance);
    }
});

// ---- TurboWarp's published samples (optional corpus) ------------------------------

const CORPUS = process.env.BW_TURBOWARP_EXTENSIONS_DIR || '';
const SAMPLES = CORPUS && path.join(CORPUS, 'samples');
test('each of TurboWarp\'s published samples asks for exactly its pinned gallery copies',
    {skip: !(SAMPLES && fs.existsSync(SAMPLES)) &&
        'BW_TURBOWARP_EXTENSIONS_DIR does not name a TurboWarp/extensions checkout with samples/ (not committed)'},
    async () => {
        // The bytes of most of these extensions are not committed, so this holds the
        // ROUTE (file -> pinned URL, TurboWarp's host never asked), not the run; the
        // run is held above per class and in the browser by verify-pinned-worker.mjs.
        const {default: JSZip} = await import('jszip');
        const files = fs.readdirSync(SAMPLES).filter(name => name.endsWith('.sb3')).sort();
        assert.equal(files.length, 16);
        for (const file of files) {
            const bytes = fs.readFileSync(path.join(SAMPLES, file));
            const json = JSON.parse(await (await JSZip.loadAsync(bytes)).file('project.json').async('string'));
            const gallery = Object.keys(json.extensionURLs);
            const expected = gallery.map(id => {
                const slug = json.extensionURLs[id].slice('https://extensions.turbowarp.org/'.length, -3);
                assert.equal(pins.extensions[slug].extensionId, id, `${file}: ${id}`);
                return pinnedURL(slug);
            });
            const instance = machine();
            fetches.length = 0;
            try {
                await instance.loadProject(bytes);
                assert.deepEqual([...new Set(fetches)].sort(), expected.sort(), file);
            } finally {
                done(instance);
            }
        }
    });
