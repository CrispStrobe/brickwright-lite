/**
 * Peer sessions (task E11) are compiled in only on request, and OFF is the default.
 *
 * Two switches, one per side, and both must be off unless a build asks:
 *   - the app: the `peers` Cargo feature (not a default feature). Without it there is no
 *     listener, no peer command and no peer capability. test/tauri-app-command-acl.test.mjs
 *     holds the command/permission half; this file holds the crate and module half.
 *   - the web build: BW_ENABLE_PEERS=1, a DefinePlugin boolean. Every consumer tests
 *     `process.env.BW_ENABLE_PEERS === true`, which webpack folds so the off build drops the
 *     branch and its modules. scripts/verify-no-peer-surface.mjs checks the emitted bytes in
 *     CI (Build workflow); this file checks the sources and that scanner.
 *
 * Review and verdicts: docs/PEERS-SECURITY-REVIEW.md.
 */
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {PEER_MARKERS, PRESENCE_MARKER, scanForPeerSurface, verdict} from '../scripts/verify-no-peer-surface.mjs';
import Creator from '../overlay/scratch-gui/src/lib/sb3-creator-register-art.js';

const root = path.resolve(import.meta.dirname, '..');
const read = file => readFileSync(path.join(root, file), 'utf8');
const native = 'apps/tauri/src-tauri';

// The modules that ARE the feature. Nothing else may import them except behind the literal.
const GATED_MODULES = [
    'overlay/scratch-gui/src/lib/peer-sessions.js',
    'overlay/scratch-gui/src/lib/peer-pseudocode.js',
    'overlay/scratch-vm/src/extensions/crispstrobe/peers/index.js'
];
const GATE = 'process.env.BW_ENABLE_PEERS === true';

const sources = () => ['overlay/scratch-gui/src', 'overlay/scratch-vm/src']
    .flatMap(dir => readdirSync(path.join(root, dir), {recursive: true})
        .filter(file => /\.(?:js|jsx|mjs)$/.test(file))
        .map(file => path.join(dir, file)));

test('the Cargo feature exists, is not a default, and owns the crypto crates', () => {
    const cargo = read(`${native}/Cargo.toml`);
    const features = cargo.slice(cargo.indexOf('[features]'));
    assert.match(features, /^peers = \["dep:chacha20poly1305", "dep:hkdf", "tokio\/io-util", "tokio\/time"\]$/m);
    assert.doesNotMatch(features, /^default\s*=/m,
        'a `default` feature list could switch peers on for every build; add one only with review');
    assert.match(cargo, /^chacha20poly1305 = \{ version = "0\.10", optional = true \}$/m);
    assert.match(cargo, /^hkdf = \{ version = "0\.12", optional = true \}$/m);
    assert.doesNotMatch(cargo, /get_if_addrs|tauri-plugin-fs/,
        'the WIP\'s unmaintained get_if_addrs and its fs plugin were refused (review F10, F12)');
    const lib = read(`${native}/src/lib.rs`);
    assert.match(lib, /#\[cfg\(feature = "peers"\)\]\nmod peer;/, 'the module is compiled only with the feature');
    assert.match(lib, /#\[cfg\(feature = "peers"\)\]\n {4}let builder = builder\.manage\(peer::PeerState::default\(\)\);/);
    // Every mention of the peer module in lib.rs carries the attribute on the line before.
    const lines = lib.split('\n');
    lines.forEach((line, i) => {
        if (/\bpeer::|mod peer;|peers\.json/.test(line)) {
            const guard = lines.slice(Math.max(0, i - 3), i).join('\n');
            assert.match(guard, /#\[cfg\(feature = "peers"\)\]/, `ungated peer use at lib.rs:${i + 1}: ${line.trim()}`);
        }
    });
    // The listener is only ever started by peer_enable, which asks first (review F8).
    const peer = read(`${native}/src/peer/mod.rs`);
    assert.equal((peer.match(/TcpListener::bind/g) || []).length, 1);
    assert.match(peer, /pub async fn peer_enable[\s\S]*?ask\([\s\S]*?Start peer sharing\?[\s\S]*?start\(app, peer_state\.clone\(\)\)/,
        'the listener starts only after the native "Start peer sharing?" question');
});

test('the web flag is a build-time boolean, explicit opt-in, no fallback', () => {
    const webpack = read('overlay/scratch-gui/webpack.config.js');
    const line = webpack.split('\n').find(l => l.includes("'process.env.BW_ENABLE_PEERS'"));
    assert.ok(line, 'BW_ENABLE_PEERS must be substituted by DefinePlugin');
    assert.equal(line.trim(),
        "'process.env.BW_ENABLE_PEERS': JSON.stringify(process.env.BW_ENABLE_PEERS === '1'),");
    for (const workflow of ['build.yml', 'tauri.yml', 'release.yml', 'mobile.yml', 'deploy-daily.yml']) {
        const text = read(`.github/workflows/${workflow}`);
        const code = text.split('\n').filter(l => !/^\s*#/.test(l)).join('\n');
        assert.doesNotMatch(code, /BW_ENABLE_PEERS/, `${workflow} must not build peers on`);
        const featureLines = text.split('\n').filter(l => /--features\b[^\n]*\bpeers\b/.test(l));
        // Only tauri.yml's test job builds the feature, to test and lint it; nothing ships it.
        assert.deepEqual(featureLines.map(l => l.trim()), workflow === 'tauri.yml' ? [
            '- name: cargo test --features peers (peer sessions, off by default)',
            'run: cargo test --manifest-path src-tauri/Cargo.toml --features peers peer::',
            '- name: cargo clippy --features peers',
            'run: cargo clippy --manifest-path src-tauri/Cargo.toml --features peers -- -D warnings'
        ] : [], `${workflow} builds the peers feature`);
    }
    assert.doesNotMatch(read('scripts/vercel-build.sh'), /BW_ENABLE_PEERS/);
});

test('every use of the flag is the folded literal, and every reach of a peer module is behind it', () => {
    const files = sources();
    const offenders = [];
    for (const file of files) {
        const text = read(file);
        for (const match of text.matchAll(/process\.env\.BW_ENABLE_PEERS(?! === true)/g)) {
            offenders.push(`${file}: flag read as "${text.slice(match.index, match.index + 45)}" — ` +
                'only `=== true` is folded by webpack AND reads off in node');
        }
        // The gated modules themselves are the feature; the reach checks apply to the rest.
        const reaches = GATED_MODULES.includes(file) ? [] : GATED_MODULES;
        const markers = GATED_MODULES.includes(file) ? [] : PEER_MARKERS;
        for (const module of reaches) {
            const base = path.basename(module) === 'index.js' ? 'crispstrobe/peers/index.js' : path.basename(module);
            let at = text.indexOf(base);
            while (at !== -1) {
                const before = text.slice(Math.max(0, at - 220), at);
                if (!before.includes(GATE)) offenders.push(`${file}: reaches ${base} outside the gate`);
                at = text.indexOf(base, at + 1);
            }
        }
        for (const marker of markers) {
            let at = text.indexOf(marker);
            while (at !== -1) {
                const before = text.slice(Math.max(0, at - 260), at);
                if (!before.includes(GATE)) offenders.push(`${file}: "${marker}" outside the gate`);
                at = text.indexOf(marker, at + 1);
            }
        }
    }
    assert.deepEqual(offenders, []);
    // And the gate is where it should be: each consumer exists (a deleted gate is not a pass).
    const consumers = files.filter(file => !GATED_MODULES.includes(file) && read(file).includes(GATE));
    assert.deepEqual(consumers.sort(), [
        'overlay/scratch-gui/src/components/menu-bar/settings-menu.jsx',
        'overlay/scratch-gui/src/lib/libraries/extensions/index.jsx',
        'overlay/scratch-gui/src/lib/sb3-creator-register-art.js',
        'overlay/scratch-gui/src/playground/render-gui.jsx',
        'overlay/scratch-vm/src/extension-support/extension-manager.js',
        'overlay/scratch-vm/src/extensions/crispstrobe/cameracapture/index.js'
    ]);
});

test('every scanned marker really occurs in the gated code, so the build scan is not vacuous', () => {
    const gated = [...GATED_MODULES, 'overlay/scratch-gui/src/components/menu-bar/settings-menu.jsx',
        'overlay/scratch-gui/src/lib/libraries/extensions/index.jsx',
        'overlay/scratch-vm/src/extensions/crispstrobe/cameracapture/index.js'].map(read).join('\n');
    for (const marker of PEER_MARKERS) assert.ok(gated.includes(marker), `"${marker}" occurs in no gated source`);
});

test('the default dialect has no peer words (node reads the flag as off)', () => {
    assert.equal(process.env.BW_ENABLE_PEERS === true, false);
    const creator = new Creator();
    let project = null;
    try {
        creator.parse('WHEN flag clicked:\n  run peer project\n  take photo on peer "Phone"');
        project = creator.project;
    } catch (error) {
        return; // refused as unknown words: no peer block was made
    }
    const opcodes = project.targets.flatMap(target => Object.values(target.blocks).map(block => block.opcode));
    assert.deepEqual(opcodes.filter(opcode => String(opcode).startsWith('peersessions_')), []);
    assert.ok(!project.extensions.includes('peersessions'));
});

test('the editor half asks nothing itself: consent is native (review F1)', () => {
    const sessions = read('overlay/scratch-gui/src/lib/peer-sessions.js');
    assert.doesNotMatch(sessions, /\bconfirm\s*\(/, 'window.confirm is an always-truthy Promise in the app (E6)');
    assert.match(sessions, /await loadProjectFile\(vm\(\), bytes\.buffer, 'peer\.sb3'\)/,
        'a received project goes through the one project loader');
    const peer = read(`${native}/src/peer/mod.rs`);
    assert.match(peer, /consent\(app, state, needed, &request\.action, &request\.payload\)\.await\?;\s*\/\/ Revocation/,
        'the native consent runs before the request is handed to the editor');
});

const fakeBuild = files => {
    const dir = mkdtempSync(path.join(tmpdir(), 'peer-surface-'));
    mkdirSync(path.join(dir, 'static'));
    for (const [name, text] of Object.entries(files)) writeFileSync(path.join(dir, name), text);
    return dir;
};
const clean = () => Object.fromEntries([1, 2, 3, 4, 5].map(n =>
    [`static/chunk-${n}.js`, n === 1 ? `x={extensionId:"${PRESENCE_MARKER}"}` : 'y=1']));

test('the emitted-build scanner: clean passes, every marker fails, a vacuous scan fails', () => {
    const dirs = [];
    try {
        const ok = fakeBuild(clean());
        dirs.push(ok);
        assert.deepEqual(verdict(scanForPeerSurface(ok)), []);
        for (const marker of PEER_MARKERS) {
            const dir = fakeBuild({...clean(), 'static/chunk-9.js': `z="${marker}"`});
            dirs.push(dir);
            const failures = verdict(scanForPeerSurface(dir));
            assert.equal(failures.length, 1, marker);
            assert.match(failures[0], new RegExp(marker.replace(/[.*+?^${}()|[\]\\/]/g, '\\$&')));
        }
        const noPresence = fakeBuild(Object.fromEntries(Object.keys(clean()).map(name => [name, 'y=1'])));
        dirs.push(noPresence);
        assert.match(verdict(scanForPeerSurface(noPresence)).join('\n'), /did not read the editor bundle/);
        const tooFew = fakeBuild({'static/a.js': `x="${PRESENCE_MARKER}"`});
        dirs.push(tooFew);
        assert.match(verdict(scanForPeerSurface(tooFew)).join('\n'), /not an editor build/);
    } finally {
        for (const dir of dirs) rmSync(dir, {recursive: true, force: true});
    }
});
