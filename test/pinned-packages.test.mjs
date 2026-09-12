/**
 * bw-board and bw-circuit-ui are npm PACKAGES pinned by sha, and the sha lives
 * in ONE place: vendor-pins.json. Three other files must carry the same value —
 * root package.json (devDependencies, for tests and scripts), root
 * package-lock.json (what `npm ci` actually installs), and the integrated
 * packages/scratch-gui/package.json (what webpack bundles) — and each of them
 * is a place a stale sha can hide while every test still passes against
 * whatever tree happens to be installed.
 *
 * So: the specs are DERIVED (scripts/pin-packages.mjs, scripts/integrate.mjs),
 * and this gate asserts the derivation held, at the pin that is recorded now.
 * The counter-examples below drive each clause at a planted disagreement.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync, writeFileSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {spawnSync} from 'node:child_process';
import { PACKAGES, findings, pinnedSpecs, specFor, setPackagePin } from '../scripts/pin-packages.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const pins = JSON.parse(readFileSync(path.join(ROOT, 'vendor-pins.json'), 'utf8'));

test('vendor-pins.json pins both packages with 40-hex shas (the population is real)', () => {
    assert.deepEqual([...PACKAGES].sort(), ['bw-board', 'bw-circuit-ui']);
    for (const name of PACKAGES) assert.match(pins[name] ?? '', /^[0-9a-f]{40}$/, name);
    // sb3-creator is still copied in, not a package: it must NOT be in this set.
    assert.ok(pins['sb3-creator'] && !PACKAGES.includes('sb3-creator'));
});

test('root package.json and package-lock.json carry exactly the pinned specs', () => {
    assert.deepEqual(findings(), [], 'run `npm run pin:packages`');
});

test('the integrated GUI package.json carries the same specs (integrate.mjs derives them)', {
    skip: existsSync(path.join(ROOT, 'packages/scratch-gui/package.json')) ? false : 'packages/scratch-gui not integrated here'
}, () => {
    const gui = JSON.parse(readFileSync(path.join(ROOT, 'packages/scratch-gui/package.json'), 'utf8'));
    const want = pinnedSpecs();
    for (const name of PACKAGES) {
        assert.equal(gui.dependencies?.[name], want[name],
            `packages/scratch-gui/package.json ${name}: run \`node scripts/integrate.mjs\``);
    }
});

// Installed proof belongs to --verify-installed, which compares actual bytes
// with npm's packed payload from the pinned Git object, not lock metadata.

test('the derivation is checkable: a planted disagreement is named, in each file', () => {
    const tmp = mkdtempSync(path.join(tmpdir(), 'pin-packages-'));
    try {
        const pinsFile = path.join(tmp, 'vendor-pins.json');
        const pkgFile = path.join(tmp, 'package.json');
        const lockFile = path.join(tmp, 'package-lock.json');
        const a = 'a'.repeat(40), b = 'b'.repeat(40);
        writeFileSync(pinsFile, JSON.stringify({'bw-board': a, 'bw-circuit-ui': b, 'sb3-creator': 'c'.repeat(40)}));
        const good = {devDependencies: {'bw-board': specFor('bw-board', a), 'bw-circuit-ui': specFor('bw-circuit-ui', b)}};
        const goodLock = {packages: {
            '': good,
            'node_modules/bw-board': {resolved: `git+ssh://git@github.com/CrispStrobe/bw-board.git#${a}`},
            'node_modules/bw-circuit-ui': {resolved: `git+ssh://git@github.com/CrispStrobe/bw-circuit-ui.git#${b}`}
        }};
        writeFileSync(pkgFile, JSON.stringify(good)); writeFileSync(lockFile, JSON.stringify(goodLock));
        assert.deepEqual(findings({pinsFile, pkgFile, lockFile}), []);
        for (const resolved of [
            `git+ssh://git@evil.example/CrispStrobe/bw-board.git#${a}`,
            `git+ssh://git@github.com/SomeoneElse/bw-board.git#${a}`,
            `git+ssh://git@github.com/CrispStrobe/not-bw-board.git#${a}`,
            `git+ssh://git@github.com/CrispStrobe/bw-board.git#${a}suffix`,
            `https://evil.example/${a}`
        ]) {
            writeFileSync(lockFile, JSON.stringify({packages: {...goodLock.packages, 'node_modules/bw-board': {resolved}}}));
            assert.match(findings({pinsFile, pkgFile, lockFile}).join('\n'), /node_modules\/bw-board/);
        }
        writeFileSync(lockFile, JSON.stringify({packages: {...goodLock.packages, '': {devDependencies: {}}}}));
        assert.match(findings({pinsFile, pkgFile, lockFile}).join('\n'), /root devDependencies/);
        writeFileSync(lockFile, JSON.stringify(goodLock));
        // package.json behind the pin
        writeFileSync(pkgFile, JSON.stringify({devDependencies: {...good.devDependencies, 'bw-board': specFor('bw-board', b)}}));
        assert.match(findings({pinsFile, pkgFile, lockFile}).join('\n'), /package\.json devDependencies\.bw-board/);
        writeFileSync(pkgFile, JSON.stringify(good));
        // lockfile behind the pin
        writeFileSync(lockFile, JSON.stringify({packages: {...goodLock.packages, 'node_modules/bw-circuit-ui': {resolved: `x#${a}`}}}));
        assert.match(findings({pinsFile, pkgFile, lockFile}).join('\n'), /package-lock\.json node_modules\/bw-circuit-ui/);
        // a pin that is not a sha refuses rather than deriving garbage
        writeFileSync(pinsFile, JSON.stringify({'bw-board': 'master', 'bw-circuit-ui': b}));
        assert.throws(() => findings({pinsFile, pkgFile, lockFile}), /bw-board must be a 40-hex sha/);
    } finally {
        rmSync(tmp, {recursive: true, force: true});
    }
});

test('--set is explicit authority and changes only the requested package pin', async () => {
    const temp = mkdtempSync(path.join(tmpdir(), 'explicit-package-pin-'));
    try {
        const pinsFile = path.join(temp, 'pins.json');
        const before = {'bw-board': 'a'.repeat(40), 'bw-circuit-ui': 'b'.repeat(40)};
        writeFileSync(pinsFile, JSON.stringify(before));
        await setPackagePin('bw-board', 'c'.repeat(40), {pinsFile, log: () => {}});
        assert.deepEqual(JSON.parse(readFileSync(pinsFile)), {...before, 'bw-board': 'c'.repeat(40)});
        await assert.rejects(setPackagePin('unknown', 'd'.repeat(40), {pinsFile}), /invalid explicit/);
    } finally { rmSync(temp, {recursive: true, force: true}); }
});

test('read-only flags reject --set before touching repository pins', () => {
    const before = readFileSync(path.join(ROOT, 'vendor-pins.json'));
    for (const flag of ['--check', '--verify-installed']) {
        const result = spawnSync(process.execPath, ['scripts/pin-packages.mjs', flag, '--set', `bw-board=${'e'.repeat(40)}`], {cwd: ROOT, encoding: 'utf8'});
        assert.equal(result.status, 1);
        assert.match(result.stderr, /cannot be combined with read-only/);
        assert.deepEqual(readFileSync(path.join(ROOT, 'vendor-pins.json')), before);
    }
});
