// scripts/worktree-deps.mjs: a shared, content-keyed node_modules store for
// local Lite worktrees (task C1). No network and no npm: the store is
// populated through an injected fake installer that lays out node_modules
// from the fixture lockfile the way npm would (package dirs, a .bin symlink,
// the hidden lockfile). Every case drives the helper into the state it is
// meant to catch — a stale key, a written-through store, a borrowed tree at
// another pin — and asserts the verdict names it.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {
    appendFileSync, chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, statSync,
    symlinkSync, utimesSync, writeFileSync
} from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
    GIT_DEPS, KEY_INPUTS, MARKER, OWNED, computeKey, gc, link, populate, removeTree, verify, walk
} from '../scripts/worktree-deps.mjs';

const REPO = path.resolve(import.meta.dirname, '..');
const ENV = {nodeMajor: 22, npmMajor: 10, platform: 'linux', arch: 'x64'};
const PIN = {'bw-board': 'a'.repeat(40), 'bw-circuit-ui': 'b'.repeat(40)};
const gitRes = (name, sha) => `git+ssh://git@github.com/CrispStrobe/${name}.git#${sha}`;

function lockFor (deps, pins) {
    const packages = {'': {name: 'x', dependencies: {}}};
    for (const [n, v] of Object.entries(deps)) { packages[''].dependencies[n] = v; packages[`node_modules/${n}`] = {version: v}; }
    for (const d of GIT_DEPS) {
        packages[''].dependencies[d] = `github:CrispStrobe/${d}#${pins[d]}`;
        packages[`node_modules/${d}`] = {version: '0.1.0', resolved: gitRes(d, pins[d])};
    }
    return {name: 'x', lockfileVersion: 3, packages};
}

function makeWorktree (base, name, pins = PIN) {
    const wt = path.join(base, name);
    mkdirSync(path.join(wt, 'packages/scratch-gui'), {recursive: true});
    const rootDeps = {commander: '15.0.0'};
    const guiDeps = {'scratch-vm': '4.8.115', 'scratch-paint': '2.2.518', 'scratch-render': '1.2.126',
        'scratch-blocks': '1.3.0', 'scratch-l10n': '3.0.0', lit: '3.3.3'};
    const pkg = deps => ({name: 'x', dependencies: {...deps,
        ...Object.fromEntries(GIT_DEPS.map(d => [d, `github:CrispStrobe/${d}#${pins[d]}`]))}});
    writeFileSync(path.join(wt, 'package.json'), JSON.stringify(pkg(rootDeps), null, 2));
    writeFileSync(path.join(wt, 'package-lock.json'), JSON.stringify(lockFor(rootDeps, pins), null, 2));
    writeFileSync(path.join(wt, 'vendor-pins.json'), JSON.stringify(pins, null, 2));
    writeFileSync(path.join(wt, 'packages/scratch-gui/package.json'), JSON.stringify(pkg(guiDeps), null, 2));
    writeFileSync(path.join(wt, 'packages/scratch-gui/package-lock.json'), JSON.stringify(lockFor(guiDeps, pins), null, 2));
    return wt;
}

/** What `npm ci` / `npm install` would leave, from the lockfile in dir. */
function fakeInstall (dir) {
    const lock = JSON.parse(readFileSync(path.join(dir, 'package-lock.json'), 'utf8'));
    const nm = path.join(dir, 'node_modules');
    mkdirSync(path.join(nm, '.bin'), {recursive: true});
    for (const [k, e] of Object.entries(lock.packages)) {
        if (!k) continue;
        const p = path.join(dir, k);
        mkdirSync(path.join(p, 'src'), {recursive: true});
        writeFileSync(path.join(p, 'package.json'), JSON.stringify({name: k.slice(13), version: e.version}));
        writeFileSync(path.join(p, 'src/index.js'), `module.exports = ${JSON.stringify(k)};\n`);
    }
    if (existsSync(path.join(nm, 'scratch-blocks'))) {
        mkdirSync(path.join(nm, 'scratch-blocks/msg'), {recursive: true});
        writeFileSync(path.join(nm, 'scratch-blocks/msg/scratch_msgs.js'), 'Blockly.ScratchMsgs = {};\n');
    }
    symlinkSync('../commander/src/index.js', path.join(nm, '.bin/commander-cli'));
    writeFileSync(path.join(nm, '.package-lock.json'), JSON.stringify({packages: lock.packages}));
}

function setup () {
    const base = mkdtempSync(path.join(os.tmpdir(), 'bw-lite-deps-'));
    const store = path.join(base, 'store');
    mkdirSync(store);
    return {base, store, done: () => { removeTree(store); rmSync(base, {recursive: true, force: true}); }};
}
const quiet = {log: () => {}};
const linkFresh = (wt, store, opts = {}) => {
    const k = computeKey(wt, ENV);
    populate(wt, store, k, {install: fakeInstall, ...quiet});
    link(wt, store, k, {...quiet, ...opts});
    return k;
};

test('the key moves with every input byte and the Node major, not with derived bw-* lock entries', () => {
    const {base, done} = setup();
    try {
        const wt = makeWorktree(base, 'wt');
        const k0 = computeKey(wt, ENV).key;
        assert.equal(computeKey(wt, ENV).key, k0, 'deterministic');
        for (const rel of KEY_INPUTS) {
            const p = path.join(wt, rel);
            const orig = readFileSync(p, 'utf8');
            writeFileSync(p, orig.replace('"x"', '"y"').replace('"a', '"c'));
            assert.notEqual(computeKey(wt, ENV).key, k0, `a changed ${rel} must change the key`);
            writeFileSync(p, orig);
        }
        assert.notEqual(computeKey(wt, {...ENV, nodeMajor: 20}).key, k0, 'Node major is keyed');
        // integrate.mjs rewrites the gui bw-* spec from vendor-pins.json and npm install
        // rewrites its lock entry: derived data, so the key must not move with it...
        const gl = path.join(wt, 'packages/scratch-gui/package-lock.json');
        const lock = JSON.parse(readFileSync(gl, 'utf8'));
        lock.packages['node_modules/bw-circuit-ui'].resolved = gitRes('bw-circuit-ui', 'd'.repeat(40));
        writeFileSync(gl, JSON.stringify(lock));
        assert.equal(computeKey(wt, ENV).key, k0, 'gui bw-* lock entry is derived from vendor-pins.json');
        // ...while the pin itself does move it.
        writeFileSync(path.join(wt, 'vendor-pins.json'), JSON.stringify({...PIN, 'bw-circuit-ui': 'd'.repeat(40)}));
        assert.notEqual(computeKey(wt, ENV).key, k0, 'vendor-pins.json is keyed');
    } finally { done(); }
});

test('link: hardlinks the store read-only, copies OWNED paths, and verify passes', () => {
    const {base, store, done} = setup();
    try {
        const wt = makeWorktree(base, 'wt');
        const k = linkFresh(wt, store);
        const gui = path.join(wt, 'packages/scratch-gui/node_modules');
        const sGui = path.join(store, k.key, 'gui/node_modules');
        const same = rel => statSync(path.join(gui, rel)).ino === statSync(path.join(sGui, rel)).ino;
        assert.ok(same('lit/src/index.js'), 'ordinary file is a hardlink of the store');
        assert.ok(statSync(path.join(sGui, 'lit/src/index.js')).nlink >= 2);
        for (const rel of ['scratch-vm/src/index.js', 'scratch-blocks/msg/scratch_msgs.js']) {
            assert.ok(!same(rel), `${rel} is OWNED: a private copy`);
            assert.equal(readFileSync(path.join(gui, rel), 'utf8'), readFileSync(path.join(sGui, rel), 'utf8'));
            writeFileSync(path.join(gui, rel), '// overlay\n');         // the overlay scripts can write it
        }
        assert.ok(same('scratch-blocks/package.json'), 'only the named file of scratch-blocks is owned');
        // Store files are read-only: an in-place write through a link cannot land silently.
        const linked = path.join(gui, 'lit/src/index.js');
        assert.equal(statSync(linked).mode & 0o222, 0, 'store file has no write bits');
        if (process.getuid?.() !== 0) assert.throws(() => writeFileSync(linked, 'x'), {code: 'EACCES'});
        // New files (webpack's node_modules/.cache) land in the worktree's own dirs.
        mkdirSync(path.join(gui, '.cache/webpack'), {recursive: true});
        assert.ok(!existsSync(path.join(sGui, '.cache')));
        const v = verify(wt, {store, k});
        assert.deepEqual(v.problems, []);
        assert.ok(v.ok && v.linked);
    } finally { done(); }
});

test('verify goes red, naming the remedy, when a lockfile byte changes after linking', () => {
    const {base, store, done} = setup();
    try {
        const wt = makeWorktree(base, 'wt');
        linkFresh(wt, store);
        const p = path.join(wt, 'package-lock.json');
        writeFileSync(p, readFileSync(p, 'utf8').replace('"name": "x"', '"name": "z"'));
        const v = verify(wt, {store, k: computeKey(wt, ENV)});
        assert.equal(v.ok, false);
        assert.ok(v.problems.some(x => x.startsWith('STALE')), v.problems.join('\n'));
        assert.ok(v.notes.some(n => n.includes('worktree-deps.mjs link')), 'names the remedy');
    } finally { done(); }
});

test('verify catches a write through a hardlink into the shared store', () => {
    const {base, store, done} = setup();
    try {
        const wt = makeWorktree(base, 'wt');
        const k = linkFresh(wt, store);
        const f = path.join(wt, 'node_modules/commander/src/index.js');
        chmodSync(f, 0o644);                    // what a tool that "fixes" permissions would do
        appendFileSync(f, '// patched\n');
        const v = verify(wt, {store, k});
        assert.equal(v.ok, false);
        assert.ok(v.problems.some(x => x.startsWith('STORE MODIFIED')), v.problems.join('\n'));
    } finally { done(); }
});

test('verify catches a file that is no longer the store\'s inode, and a missing owned copy', () => {
    const {base, store, done} = setup();
    try {
        const wt = makeWorktree(base, 'wt');
        const k = linkFresh(wt, store);
        const f = path.join(wt, 'packages/scratch-gui/node_modules/lit/src/index.js');
        rmSync(f);
        writeFileSync(f, 'module.exports = "node_modules/lit";\n');
        rmSync(path.join(wt, 'packages/scratch-gui/node_modules/scratch-paint'), {recursive: true});
        const v = verify(wt, {store, k});
        assert.equal(v.ok, false);
        assert.ok(v.problems.some(x => /1 unlinked/.test(x)), v.problems.join('\n'));
        assert.ok(v.problems.some(x => x.includes('owned copy scratch-paint')), v.problems.join('\n'));
    } finally { done(); }
});

test('a borrowed tree at another pin is refused, whether copied or symlinked', () => {
    const {base, store, done} = setup();
    try {
        const old = {...PIN, 'bw-board': 'e'.repeat(40)};
        const donor = makeWorktree(base, 'donor', old);
        for (const t of ['', 'packages/scratch-gui']) fakeInstall(path.join(donor, t));
        const wt = makeWorktree(base, 'wt');
        // the private donor tree itself is consistent
        assert.deepEqual(verify(donor).problems, []);
        // borrowed by symlink: every tree is at the donor's bw-board
        symlinkSync(path.join(donor, 'node_modules'), path.join(wt, 'node_modules'));
        symlinkSync(path.join(donor, 'packages/scratch-gui/node_modules'), path.join(wt, 'packages/scratch-gui/node_modules'));
        const v = verify(wt);
        assert.equal(v.ok, false);
        assert.ok(v.problems.some(x => x.includes('SYMLINK')));
        assert.ok(v.problems.some(x => x.includes(`bw-board installed at ${'e'.repeat(40)}`)), v.problems.join('\n'));
        // link refuses to discard it without --replace, and never follows the symlink when replacing
        assert.throws(() => linkFresh(wt, store), /--replace/);
        linkFresh(wt, store, {replace: true});
        assert.ok(existsSync(path.join(donor, 'node_modules/commander/package.json')), 'donor untouched');
        assert.deepEqual(verify(wt, {store, k: computeKey(wt, ENV)}).problems, []);
    } finally { done(); }
});

test('gc evicts idle, unlinked keys only', () => {
    const {base, store, done} = setup();
    try {
        const a = makeWorktree(base, 'a');
        const kA = linkFresh(a, store);
        const b = makeWorktree(base, 'b', {...PIN, 'bw-board': 'f'.repeat(40)});
        const kB = linkFresh(b, store);
        removeTree(path.join(b, 'node_modules'));
        removeTree(path.join(b, 'packages/scratch-gui/node_modules'));
        const c = makeWorktree(base, 'c', {...PIN, 'bw-board': '1'.repeat(40)});
        const kC = linkFresh(c, store);
        removeTree(path.join(c, 'node_modules'));
        removeTree(path.join(c, 'packages/scratch-gui/node_modules'));
        const old = new Date(Date.now() - 30 * 86400e3);
        for (const k of [kA, kB]) utimesSync(path.join(store, k.key, 'last-used'), old, old);
        const r = gc(store, {days: 14, ...quiet});
        assert.deepEqual(r.evicted, [kB.key], `B: idle and unlinked; kept ${r.kept}`);
        assert.ok(existsSync(path.join(store, kA.key)), 'A: idle but still linked by worktree a');
        assert.ok(existsSync(path.join(store, kC.key)), 'C: unlinked but recently used');
        assert.equal(verify(a, {store, k: kA}).ok, true);
        // Once worktree a is gone (and A idle again: verify counts as a use), A is evictable too.
        removeTree(path.join(a, 'node_modules'));
        removeTree(path.join(a, 'packages/scratch-gui/node_modules'));
        utimesSync(path.join(store, kA.key, 'last-used'), old, old);
        assert.deepEqual(gc(store, {days: 14, ...quiet}).evicted, [kA.key]);
    } finally { done(); }
});

test('the marker lives in the worktree, never in the store', () => {
    const {base, store, done} = setup();
    try {
        const wt = makeWorktree(base, 'wt');
        const k = linkFresh(wt, store);
        assert.ok(existsSync(path.join(wt, 'node_modules', MARKER)));
        assert.ok(!walk(path.join(store, k.key)).some(e => e.rel.endsWith(MARKER)));
    } finally { done(); }
});

// The apply-*-overlay scripts write into packages/scratch-gui/node_modules after install.
// Every node_modules path they address must be OWNED (a private copy in each worktree) or
// be listed here as only read. A new overlay target reds this until it is classified, so a
// write can never reach a hardlinked store file unnoticed (it would also fail with EACCES).
const READ_ONLY = {
    'scratch-l10n/locales/editor-msgs.js': 'read only; apply-vm-overlay creates and removes a temp file beside it, in the worktree\'s own directory'
};
test('OWNED covers every node_modules path the overlay scripts address', () => {
    const seen = new Set();
    for (const s of ['apply-vm-overlay.mjs', 'apply-paint-overlay.mjs', 'apply-render-overlay.mjs']) {
        const src = readFileSync(path.join(REPO, 'scripts', s), 'utf8');
        for (const m of src.matchAll(/'node_modules',((?:\s*'[^']+',?)+)/g)) {
            seen.add([...m[1].matchAll(/'([^']+)'/g)].map(x => x[1]).join('/'));
        }
    }
    assert.ok(seen.size >= 4, `found ${[...seen]}`);
    for (const rel of seen) {
        const owned = OWNED.gui.some(o => rel === o || rel.startsWith(o + '/'));
        assert.ok(owned || READ_ONLY[rel], `${rel} is written/read by an overlay script but is neither OWNED nor READ_ONLY`);
    }
    for (const rel of Object.keys(READ_ONLY)) assert.ok(seen.has(rel), `READ_ONLY entry ${rel} is no longer addressed; drop it`);
    for (const o of OWNED.gui) assert.ok([...seen].some(rel => rel === o || rel.startsWith(o + '/')), `OWNED ${o} is no longer addressed by an overlay`);
});
