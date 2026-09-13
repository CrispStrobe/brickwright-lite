import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync, writeFileSync, mkdirSync, cpSync, mkdtempSync} from 'node:fs';
import {execFileSync, spawnSync} from 'node:child_process';
import {tmpdir} from 'node:os';
import path from 'node:path';

const ROOT = path.resolve(import.meta.dirname, '..');
const STC = process.env.STC_COMPILER_FLASHER_DIR;
const BANNER = '// VENDORED from CrispStrobe/stc-compiler docs/flash.js — do NOT edit here.\n'
    + '// Change it there (it has the mock-bootloader tests), then `npm run sync:flasher`.\n';
const read = (root, rel) => readFileSync(path.join(root, rel), 'utf8');
// The directory is either the CI-provided checkout or a test-owned temporary
// repository, and its exact HEAD/origin are asserted below. // gate-shapes-allow
const git = (dir, ...args) => execFileSync('git', ['-C', dir, ...args], {encoding: 'utf8'}).trim();
const pin = () => JSON.parse(read(ROOT, 'vendor-pins.json'))['stc-compiler-flasher'];

test('both shipped flasher mirrors are byte-identical generated copies', () => {
    const overlay = read(ROOT, 'overlay/scratch-gui/src/lib/flasher.js');
    assert.equal(read(ROOT, 'packages/scratch-gui/src/lib/flasher.js'), overlay);
    assert.ok(overlay.startsWith(BANNER));
});

test('pinned checkout HEAD, canonical origin, source body and both mirrors agree', t => {
    if (!STC) return t.skip('STC_COMPILER_FLASHER_DIR unset — exact flasher identity not checked');
    assert.equal(git(STC, 'rev-parse', 'HEAD'), pin());
    assert.match(git(STC, 'remote', 'get-url', 'origin'), /^(https:\/\/github\.com\/|git@github\.com:)CrispStrobe\/stc-compiler(?:\.git)?$/);
    const expected = BANNER + read(STC, 'docs/flash.js');
    assert.equal(read(ROOT, 'overlay/scratch-gui/src/lib/flasher.js'), expected);
    assert.equal(read(ROOT, 'packages/scratch-gui/src/lib/flasher.js'), expected);
});

test('Build checks out the separately pinned flasher source for this exact proof', () => {
    const workflow = read(ROOT, '.github/workflows/build.yml');
    assert.match(workflow, /sha=\$\(node -p .*\['stc-compiler-flasher'\]/);
    assert.match(workflow, /ref: \$\{\{ steps\.stc_flasher_pin\.outputs\.sha \}\}/);
    assert.match(workflow, /STC_COMPILER_FLASHER_DIR: \$\{\{ github\.workspace \}\}\/\.stc-compiler-flasher/);
});

const tempLite = () => {
    const root = mkdtempSync(path.join(tmpdir(), 'flasher-sync-'));
    for (const dir of ['scripts', 'overlay/scratch-gui/src/lib']) mkdirSync(path.join(root, dir), {recursive: true});
    for (const rel of ['scripts/sync-flasher.mjs', 'scripts/lib-pin.mjs', 'vendor-pins.json',
        'overlay/scratch-gui/src/lib/flasher.js']) cpSync(path.join(ROOT, rel), path.join(root, rel));
    return root;
};

test('real --dir sync at the pin is a byte-identical no-op', t => {
    if (!STC) return t.skip('STC_COMPILER_FLASHER_DIR unset — real local sync not checked');
    const root = tempLite(), before = read(root, 'overlay/scratch-gui/src/lib/flasher.js');
    const r = spawnSync(process.execPath, ['scripts/sync-flasher.mjs', '--dir', STC, '--pin'], {cwd: root, encoding: 'utf8'});
    assert.equal(r.status, 0, r.stderr);
    assert.equal(read(root, 'overlay/scratch-gui/src/lib/flasher.js'), before);
    assert.equal(JSON.parse(read(root, 'vendor-pins.json'))['stc-compiler-flasher'], git(STC, 'rev-parse', 'HEAD'));
});

test('a different local commit is refused before destination or pin writes', t => {
    if (!STC) return t.skip('STC_COMPILER_FLASHER_DIR unset — real refusal not checked');
    const root = tempLite(), upstream = path.join(root, 'upstream');
    // Both paths are created by this test; no ambient checkout supplies them. // gate-shapes-allow
    execFileSync('git', ['clone', '-q', STC, upstream]);
    // gate-shapes-allow
    execFileSync('git', ['-C', upstream, 'remote', 'set-url', 'origin', 'https://github.com/CrispStrobe/stc-compiler.git']);
    writeFileSync(path.join(upstream, 'docs/flash.js'), read(upstream, 'docs/flash.js') + '\n// mutation\n');
    // gate-shapes-allow
    execFileSync('git', ['-C', upstream, '-c', 'user.name=test', '-c', 'user.email=test@example.invalid', 'add', 'docs/flash.js']);
    // gate-shapes-allow
    execFileSync('git', ['-C', upstream, '-c', 'user.name=test', '-c', 'user.email=test@example.invalid', 'commit', '-qm', 'mutation']);
    const beforeFile = read(root, 'overlay/scratch-gui/src/lib/flasher.js'), beforePins = read(root, 'vendor-pins.json');
    const r = spawnSync(process.execPath, ['scripts/sync-flasher.mjs', '--dir', upstream], {cwd: root, encoding: 'utf8'});
    assert.notEqual(r.status, 0);
    assert.match(r.stdout + r.stderr, /refusing to move the stc-compiler-flasher pin/);
    assert.equal(read(root, 'overlay/scratch-gui/src/lib/flasher.js'), beforeFile);
    assert.equal(read(root, 'vendor-pins.json'), beforePins);
});

test('a same-commit checkout from the wrong origin is refused before writes', t => {
    if (!STC) return t.skip('STC_COMPILER_FLASHER_DIR unset — wrong-origin refusal not checked');
    const root = tempLite(), upstream = path.join(root, 'upstream');
    // This path is created by this test; no ambient checkout supplies it. // gate-shapes-allow
    execFileSync('git', ['clone', '-q', STC, upstream]);
    // gate-shapes-allow
    execFileSync('git', ['-C', upstream, 'remote', 'set-url', 'origin', 'https://github.com/Other/stc-compiler.git']);
    const beforeFile = read(root, 'overlay/scratch-gui/src/lib/flasher.js'), beforePins = read(root, 'vendor-pins.json');
    const r = spawnSync(process.execPath, ['scripts/sync-flasher.mjs', '--dir', upstream, '--pin'], {cwd: root, encoding: 'utf8'});
    assert.notEqual(r.status, 0);
    assert.match(r.stdout + r.stderr, /refusing flasher source from/);
    assert.equal(read(root, 'overlay/scratch-gui/src/lib/flasher.js'), beforeFile);
    assert.equal(read(root, 'vendor-pins.json'), beforePins);
});
