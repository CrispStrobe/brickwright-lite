/**
 * The npm test scripts refuse, by name, to run on a Node older than
 * package.json's engines floor — before the first test, with the install hint.
 * Single-file `node --test` runs are deliberately NOT gated (the fleet uses
 * them on the Node 20 box).
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {readFileSync} from 'node:fs';
import path from 'node:path';
import {judge, floorMajor} from '../scripts/check-node.mjs';

const ROOT = path.resolve(import.meta.dirname, '..');
const pkg = JSON.parse(readFileSync(path.join(ROOT, 'package.json'), 'utf8'));
const PREFLIGHT = path.join(ROOT, 'scripts', 'check-node.mjs');

test('package.json declares the Node floor CI runs on, and .nvmrc agrees', () => {
    assert.equal(floorMajor(pkg.engines.node), 22, `engines.node is "${pkg.engines.node}"`);
    assert.equal(readFileSync(path.join(ROOT, '.nvmrc'), 'utf8').trim(), '22');
    const yml = readFileSync(path.join(ROOT, '.github', 'workflows', 'build.yml'), 'utf8');
    for (const m of yml.matchAll(/node-version:\s*(\d+)/g)) assert.equal(Number(m[1]), 22, 'CI and engines must name the same major');
});

test('every npm test script runs the preflight FIRST — and nothing else does', () => {
    for (const name of ['test', 'test:fast', 'test:corpus']) {
        assert.match(pkg.scripts[name], /^node scripts\/check-node\.mjs && /,
            `npm script "${name}" must start with the Node preflight so a wrong Node fails before the first test, not partway through`);
    }
    assert.doesNotMatch(pkg.scripts['test:fast'].replace(/^node scripts\/check-node\.mjs && /, ''), /check-node/, 'once is enough');
});

test('the verdict: below the floor refuses by name with the install hint; at or above it says nothing', () => {
    const low = judge('v20.20.2', '>=22');
    assert.equal(low.ok, false);
    assert.match(low.message, /needs Node 22 or newer/);
    assert.match(low.message, /this is Node 20\.20\.2/);
    assert.match(low.message, /nvm install 22/);
    assert.match(low.message, /node --test test\/<name>\.test\.mjs/, 'the hint says what still works on the old Node');
    for (const [v, range] of [['v22.0.0', '>=22'], ['v22.19.0', '22.x'], ['v24.1.0', '>=22'], ['v22.1.0', '^22.0.0']]) {
        assert.deepEqual(judge(v, range), {ok: true, message: ''}, `${v} against ${range}`);
    }
    assert.equal(judge('v21.7.3', '22.x').ok, false, 'a 22.x range still floors at 22');
    assert.equal(judge('v18.0.0', undefined).ok, true, 'no engines field means nothing to enforce');
});

test('the script itself: exit 0 and silent on a Node that satisfies the floor, exit 2 with the sentence below it', () => {
    const r = spawnSync(process.execPath, [PREFLIGHT], {cwd: ROOT, encoding: 'utf8'});
    const here = Number(process.versions.node.split('.')[0]);
    if (here >= floorMajor(pkg.engines.node)) {
        assert.equal(r.status, 0, r.stderr);
        assert.equal(r.stdout + r.stderr, '', 'on a good Node the preflight prints nothing');
    } else {
        assert.equal(r.status, 2, 'a wrong Node exits 2, distinct from a test failure');
        assert.match(r.stderr, /^check-node: This repo's test suite needs Node 22 or newer/);
        assert.equal(r.stdout, '');
    }
});
