/**
 * The PR browser-shard scope (scripts/ci-browser-scope.mjs): sample changed-file
 * lists in, the shards that run out — against the real build.yml and the real
 * gate import closure, so a renamed shard or a moved gate shows up here.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {spawnSync} from 'node:child_process';
import path from 'node:path';
import {decide, loadContext, needlesOf, mentions, entriesOf, outputLines} from '../scripts/ci-browser-scope.mjs';

const ROOT = path.resolve(import.meta.dirname, '..');
const ctx = loadContext(ROOT);
const ROBOT = ['robotlab', 'robotdraw', 'robotlink', 'robotmotion', 'robotbench', 'robotlink2', 'robotbench2', 'robotdraw2', 'robotdraw3', 'robotmotion2', 'robotaddon1', 'robotaddon2', 'robotaddon3'];
const ALL = ['heavy', 'light', ...ROBOT, 'fpga'];
const run = files => decide(files, ctx).needed;

test('the shards are the browser matrix plus fpga', () => {
    assert.deepEqual(ctx.shards, ALL);
    assert.deepEqual(ctx.browserShards, ['heavy', 'light', ...ROBOT]);
});

test('no browser shard: docs, tests, Tauri/Rust', () => {
    assert.deepEqual(run(['LANES.md', 'docs/SOME-UNREAD-NOTE.md', 'README.md']), [], 'docs-only');
    assert.deepEqual(run(['lanes/2026-10-21-some-claim.md', 'CI-POINTERS.md']), [], 'lane claims and CI pointers are docs');
    assert.deepEqual(run(['test/ci-docs-only.test.mjs', 'test/bw-sim-hinge.test.mjs']), [], 'tests-only');
    assert.deepEqual(run(['apps/tauri/src-tauri/src/main.rs', 'apps/tauri/src-tauri/Cargo.toml', 'apps/tauri/src-tauri/Cargo.lock']), [], 'tauri-only');
    assert.deepEqual(run(['bin/bwlite.mjs', 'scripts/gen-ci-steps.mjs']), [], 'CLI and a script no gate reaches');
});

test('one shard: a path only Robot Lab exercises', () => {
    assert.deepEqual(run(['overlay/scratch-gui/src/lib/bw-sim/physics/world.js']), ROBOT);
    assert.deepEqual(run(['overlay/scratch-gui/static/sim-lab/models/a.json', 'test/bw-sim-hinge.test.mjs']), ROBOT);
});

test('every shard: shared inputs, the workflow, and anything unknown', () => {
    assert.deepEqual(run(['overlay/scratch-gui/src/components/gui/gui.jsx']), ALL, 'gui.jsx');
    assert.deepEqual(run(['package.json']), ALL, 'package.json');
    assert.deepEqual(run(['package-lock.json']), ALL);
    assert.deepEqual(run(['vendor-pins.json']), ALL);
    assert.deepEqual(run(['overlay/scratch-vm/src/virtual-machine.js']), ALL);
    assert.deepEqual(run(['.github/workflows/build.yml']), ALL, 'a workflow path');
    assert.deepEqual(run(['something/brand-new.txt']), ALL, 'an unknown path');
    assert.deepEqual(run(['test/x.test.mjs', 'something/brand-new.txt']), ALL, 'unknown wins over tests');
    assert.deepEqual(run([]), ALL, 'an empty list is not evidence: fail closed');
    assert.deepEqual(run(['scripts/integrate.mjs']), ALL, 'a prerequisite every shard runs');
});

test('a gate script maps to the shard whose step runs it', () => {
    const fpga = run(['scripts/verify-fpga-pinch.mjs']);
    assert.ok(fpga.includes('fpga') && !fpga.includes('robotlab'), fpga.join());
    const robot = run(['scripts/verify-sim-lab-browser.mjs']);
    assert.deepEqual(robot, ROBOT);
});

test('the pure decision, over a synthetic closure', () => {
    const synthetic = {
        shards: ALL, browserShards: ALL.filter(s => s !== 'fpga'),
        reach: new Map([['scripts/verify-a.mjs', new Set(['light'])], ['scripts/lib/h.mjs', new Set(['light'])], ['scripts/pre.mjs', new Set(['(prerequisite)'])]]),
        texts: new Map([['scripts/verify-a.mjs', "read(path.join(ROOT, 'test/fixtures/thing/x.bin'))"], ['scripts/pre.mjs', '']]),
    };
    assert.deepEqual(decide(['scripts/verify-a.mjs'], synthetic).needed, ['light']);
    assert.deepEqual(decide(['scripts/lib/h.mjs'], synthetic).needed, ALL, 'scripts/lib a gate imports is shared');
    assert.deepEqual(decide(['scripts/pre.mjs'], synthetic).needed, ALL);
    assert.deepEqual(decide(['test/fixtures/thing/x.bin'], synthetic).needed, ['light'], 'a fixture a gate names');
    assert.deepEqual(decide(['test/fixtures/other/y.bin'], synthetic).needed, []);
    assert.ok(needlesOf('test/fixtures/thing/x.bin').dirs.includes('fixtures/thing'));
    assert.ok(mentions("join(ROOT, 'test/fixtures/thing', name)", needlesOf('test/fixtures/thing/y.bin')), 'a directory a gate joins onto');
    assert.ok(mentions('`${ROOT}/test/fixtures/thing/${n}`', needlesOf('test/fixtures/thing/y.bin')));
    assert.ok(!mentions("'test/fixtures/thing/x.bin'", needlesOf('test/fixtures/y.bin')), 'naming a file is not naming its parent');
    assert.ok(!mentions("node --test test/data.test.mjs", needlesOf('test/a.test.mjs')), 'a.test.mjs is not named by data.test.mjs');
    assert.ok(mentions("node --test test/a.test.mjs", needlesOf('test/a.test.mjs')));
    assert.ok(mentions("import x from '../test/helpers/h.mjs'", needlesOf('test/helpers/h.mjs')));
    assert.deepEqual([...entriesOf('npm run v -- --x && node scripts/b.mjs', {v: 'node scripts/a.mjs'})].sort(), ['scripts/a.mjs', 'scripts/b.mjs']);
    const out = outputLines(decide(['test/z.test.mjs'], synthetic), synthetic);
    assert.deepEqual(out.slice(0, ALL.length+2), [...ALL.map(s=>s+'=false'), 'browser=false', 'any=false']);
    assert.match(out[ALL.length+2], /^summary=1 file\(s\): test 1$/);
});

// A test file no gate names. (test/a.test.mjs is not one: test/gate-coverage.test.mjs,
// which a gate runs, uses 'a.test.mjs' as fixture text, and the scope rightly counts it.)
const UNNAMED = 'test/zz-ci-browser-scope-unnamed-sample.test.mjs';
test('the CLI prints GITHUB_OUTPUT lines, and build.yml wires them', () => {
    assert.ok(![...ctx.texts.values()].some(t => mentions(t, needlesOf(UNNAMED))), 'the sample must be named by no gate');
    const r = spawnSync(process.execPath, ['scripts/ci-browser-scope.mjs'], {cwd: ROOT, input: `${UNNAMED}\nLANES.md\n`, encoding: 'utf8'});
    assert.equal(r.status, 0, r.stderr);
    assert.ok(r.stdout.startsWith(ALL.map(s => s+'=false\n').join('')+'browser=false\nany=false\nsummary='));
    const yml = readFileSync(path.join(ROOT, '.github/workflows/build.yml'), 'utf8');
    assert.match(yml, /node scripts\/ci-browser-scope\.mjs < \/tmp\/changed\.txt/);
    assert.match(yml, /no browser-relevant paths changed: \$SUMMARY/);
    for (const s of ['heavy', 'light', 'robotlab'])
        assert.match(yml, new RegExp(`- shard: \\$\\{\\{ needs\\.scope\\.outputs\\.${s} != 'true' && '${s}' \\|\\| 'none' \\}\\}`), s);
    assert.match(yml, /needs\.scope\.outputs\.thorough == 'true' && needs\.scope\.outputs\.fpga == 'true'/);
    assert.match(yml, /needs\.scope\.outputs\.thorough == 'true' && needs\.scope\.outputs\.browser == 'true'/);
});
