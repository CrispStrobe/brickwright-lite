// SPDX-License-Identifier: BSD-3-Clause
/**
 * The "Rover basics" unit, run for real: every challenge's reference solution
 * PASSES and its deliberately wrong solution FAILS, each program executed in
 * the real Scratch VM through the real spikeprime extension and the virtual
 * hub (test/helpers/spike-arena-vm.mjs), with the arena judging.
 *
 * Then the checker is mutation-checked: each condition evaluator the unit uses
 * is replaced, one at a time, by a mutant that is always false and one that is
 * always true, and the recorded runs are replayed through it. A mutant that
 * changes no verdict would mean the unit cannot tell that evaluator from a
 * broken one, and fails this file.
 */
import {test} from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import {existsSync, readdirSync, readFileSync} from 'node:fs';
import {REPO, INTEGRATED} from './helpers/bw-integrated.mjs';

const UNIT_DIR = path.join(REPO, 'overlay', 'scratch-gui', 'static', 'spike-arena', 'rover-basics');
const LIB = path.join(REPO, 'overlay', 'scratch-gui', 'src', 'lib', 'spike-arena');
const {validateWorld} = await import(path.join(LIB, 'arena-world.js'));
const {ArenaChecker, EVALUATORS} = await import(path.join(LIB, 'arena-checker.js'));

const unit = JSON.parse(readFileSync(path.join(UNIT_DIR, 'unit.json'), 'utf8'));
const worlds = unit.challenges.map(id => JSON.parse(readFileSync(path.join(UNIT_DIR, `${id}.json`), 'utf8')));

test('the unit lists every challenge file in its folder, and nothing else', () => {
    const files = readdirSync(UNIT_DIR).sort();
    const expected = ['unit.json', ...unit.challenges.flatMap(id => [`${id}.json`, `${id}.bw`, `${id}.wrong.bw`])].sort();
    assert.deepEqual(files, expected);
    assert.ok(unit.challenges.length >= 8 && unit.challenges.length <= 10, `${unit.challenges.length} challenges`);
    assert.ok(unit.title.en && unit.title.de && unit.intro.en && unit.intro.de);
});

test('every challenge is a valid world with EN and DE text and a DEVICE SPIKE solution pair', () => {
    for (const world of worlds) {
        assert.deepEqual(validateWorld(world), [], world.id);
        assert.equal(world.solution, `${world.id}.bw`);
        assert.equal(world.wrong, `${world.id}.wrong.bw`);
        assert.ok(world.intro.en.length > 40 && world.intro.de.length > 40, `${world.id}: an intro in both languages`);
        assert.notEqual(world.intro.en, world.intro.de, `${world.id}: DE is not a copy of EN`);
        assert.ok((world.hints || []).length >= 1, `${world.id}: at least one hint`);
        for (const file of [world.solution, world.wrong]) {
            assert.match(readFileSync(path.join(UNIT_DIR, file), 'utf8'), /^DEVICE SPIKE\s*$/m, file);
        }
    }
});

test('the unit covers the skills it promises', () => {
    const types = new Set(worlds.flatMap(w => [...w.success, ...(w.failure || [])].map(c => c.type)));
    for (const type of ['stopIn', 'heading', 'sequence', 'touch', 'avoid', 'stayIn', 'noWallContact']) {
        assert.ok(types.has(type), `no challenge uses ${type}`);
    }
    const solutions = worlds.map(w => readFileSync(path.join(UNIT_DIR, w.solution), 'utf8')).join('\n');
    for (const [skill, pattern] of [['colour sensor', /spike color C is/], ['distance sensor', /spike distance D/],
        ['force sensor', /spike force sensor E pressed/], ['yaw', /spike angle yaw/], ['repeat', /REPEAT 4:/],
        ['forever', /FOREVER:/], ['a defined block', /^DEFINE /m]]) {
        assert.match(solutions, pattern, `no reference solution uses the ${skill}`);
    }
});

// ── the runs ─────────────────────────────────────────────────────────────────

const missing = path.join(INTEGRATED, 'node_modules', 'scratch-vm', 'src', 'index.js');
if (!existsSync(missing)) {
    // A missing tree FAILS rather than skips: a skip here would count as the
    // whole unit passing (docs/GATES-THAT-CANNOT-FAIL.md).
    test('the arena run gate: its inputs are present', () => {
        assert.fail(`missing ${path.relative(REPO, missing)} — run \`cd packages/scratch-gui && npm install --ignore-scripts --legacy-peer-deps\``);
    });
} else {
    const {runOnArena} = await import('./helpers/spike-arena-vm.mjs');
    const runs = new Map();
    const run = async (world, which) => {
        const key = `${world.id}/${which}`;
        if (!runs.has(key)) {
            const source = readFileSync(path.join(UNIT_DIR, world[which]), 'utf8');
            runs.set(key, await runOnArena(source, world, {record: true}));
        }
        return runs.get(key);
    };

    for (const world of worlds) {
        test(`${world.id}: the reference solution passes in the real VM`, async () => {
            const result = await run(world, 'solution');
            assert.equal(result.verdict.status, 'pass',
                `${world.id}: ${JSON.stringify(result.verdict)} at ${JSON.stringify(result.snapshot.pose)}`);
            assert.deepEqual(result.unsupported, [], 'every command the program sent was understood by the hub');
            const verbs = ['motorStart', 'moveForward', 'motorStop'].filter(name => result.calls.get(name));
            assert.ok(verbs.length, `${world.id}: the program reached a motion block of the extension`);
        });
        test(`${world.id}: the deliberately wrong solution fails`, async () => {
            const result = await run(world, 'wrong');
            assert.equal(result.verdict.status, 'fail', `${world.id}: ${JSON.stringify(result.verdict)}`);
            assert.ok(result.verdict.reason.startsWith('fail.'), result.verdict.reason);
        });
    }

    test('runs are reproducible: the same program gives the same pose, bit for bit', async () => {
        const world = worlds.find(w => w.id === 'rb08-follow-the-track');
        const source = readFileSync(path.join(UNIT_DIR, world.solution), 'utf8');
        const a = await runOnArena(source, world);
        const b = await runOnArena(source, world);
        assert.deepEqual(a.snapshot.pose, b.snapshot.pose);
        assert.equal(a.frames, b.frames);
    });

    // ── mutation check of the checker ───────────────────────────────────────

    const replay = (world, views, evaluators, timeLimit = true) => {
        const checker = new ArenaChecker(timeLimit ? world : {...world, timeLimitMs: Infinity}, {evaluators});
        let verdict = checker.verdict;
        for (const view of views) verdict = checker.evaluate(view);
        return `${verdict.status}:${verdict.reason}`;
    };

    test('the checker is mutation-checked: every evaluator the unit uses is load-bearing', async () => {
        const recorded = [];
        for (const world of worlds) {
            for (const which of ['solution', 'wrong']) recorded.push({world, views: (await run(world, which)).views});
        }
        for (const {world, views} of recorded) assert.ok(views.length > 10, `${world.id}: views were recorded`);
        // The replay must reproduce the live verdicts, or the mutants below
        // would be judged against the wrong baseline.
        const baseline = recorded.map(({world, views}) => replay(world, views, EVALUATORS));
        for (const [k, {world}] of recorded.entries()) {
            const live = runs.get(`${world.id}/${k % 2 ? 'wrong' : 'solution'}`).verdict;
            assert.equal(baseline[k], `${live.status}:${live.reason}`, `${world.id}: the replay reproduces the live verdict`);
        }
        const used = new Set(worlds.flatMap(w => [...w.success, ...(w.failure || [])].map(c => c.type)));
        const survivors = [];
        for (const type of used) {
            for (const [name, mutant] of [['never', () => false], ['always', () => true]]) {
                const evaluators = {...EVALUATORS, [type]: mutant};
                const changed = recorded.some(({world, views}, k) => replay(world, views, evaluators) !== baseline[k]);
                if (!changed) survivors.push(`${type}/${name}`);
            }
        }
        assert.deepEqual(survivors, [], 'mutants no challenge run can tell from the real evaluator');
        // The time limit is a condition too: without it, the wrong solutions that ran out of time do not fail.
        const timeouts = recorded.filter(({world, views}, k) => baseline[k] === 'fail:fail.timeLimit');
        assert.ok(timeouts.length, 'some wrong solution fails on the time limit');
        for (const {world, views} of timeouts) assert.equal(replay(world, views, EVALUATORS, false), 'running:null', world.id);
    });
}
