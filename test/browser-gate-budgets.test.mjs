/**
 * Every browser gate's timeout-minutes is what the readings DERIVE, never a typed number
 * (plan T12). scripts/gen-gate-budgets.mjs states the derivation — p95 of the last 20 green
 * readings × 3, ceil to the minute, floor 3, cap 8 — and this test holds build.yml to it:
 *
 *   - a step whose literal disagrees with its derivation is red by name;
 *   - a step with no entry in docs/generated/browser-gate-readings.json is red by name
 *     (regenerate: `node scripts/gen-gate-budgets.mjs --fetch`), and an entry naming a step
 *     that is gone is red too — the readings file is never hand-edited and cannot go stale
 *     silently (the pin-move-chain shape);
 *   - a step with fewer than 5 readings carries PROVISIONAL and the count in its comment,
 *     so a guess is called a guess;
 *   - a derivation above the cap is written as the cap and its comment says CAPPED with the raw
 *     derivation and that it is the gate with no headroom above;
 *   - every step keeps its all-time max and the run it came from, so lowering a budget never
 *     loses the memory of why it was high.
 *
 * Measured 2026-09-07 before this existed: 49 steps, 31 agreeing, 18 literals above their
 * derivation (an 8-minute budget on a 124 s outlier that never recurred; a "6" that was a
 * guess), 0 below.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import path from 'node:path';
import {parseJobs, gateJob, isBrowserStep} from '../scripts/lib/workflow-gates.mjs';
import {derive, commentFor, applyToWorkflow, READINGS, FACTOR, FLOOR, CAP, MIN_READINGS} from '../scripts/gen-gate-budgets.mjs';

const ROOT = path.resolve(import.meta.dirname, '..');
const yml = readFileSync(process.env.BW_BUILD_YML || path.join(ROOT, '.github/workflows/build.yml'), 'utf8');
const readings = JSON.parse(readFileSync(READINGS, 'utf8'));
const gates = gateJob(parseJobs(yml)).steps.filter(s => isBrowserStep(s.name));

test('the readings file is the generator\'s, names its runs, and covers exactly the gates build.yml has', () => {
    assert.ok(readings.newestRun && readings.runsScanned >= 20, 'the readings name the runs they came from');
    assert.deepEqual({factor: readings.factor, floor: readings.floor, cap: readings.cap, minReadings: readings.minReadings}, {factor: FACTOR, floor: FLOOR, cap: CAP, minReadings: MIN_READINGS}, 'the readings were built under the derivation this test asserts');
    const missing = gates.filter(g => !readings.steps[g.name]).map(g => g.name);
    const gone = Object.keys(readings.steps).filter(n => !gates.some(g => g.name === n));
    assert.deepEqual(missing, [], 'gate(s) with no readings entry — regenerate (node scripts/gen-gate-budgets.mjs --fetch):\n  ' + missing.join('\n  '));
    assert.deepEqual(gone, [], 'readings for gate(s) build.yml no longer has — regenerate:\n  ' + gone.join('\n  '));
    for (const [name, e] of Object.entries(readings.steps)) {
        assert.ok(e.readings.every(r => Number.isInteger(r.run) && Number.isInteger(r.seconds) && r.seconds >= 0), `${name}: a reading without a run id or seconds`);
        assert.ok(e.readings.length <= readings.keepPerStep && e.n === e.readings.length, `${name}: n disagrees with its readings`);
        if (e.readings.length) assert.ok(e.max && Number.isInteger(e.max.run) && e.max.seconds >= Math.max(...e.readings.map(r => r.seconds)), `${name}: the all-time max must name its run and be no smaller than any kept reading`);
    }
});

test('every gate\'s timeout-minutes is its derivation, and the comment beside it says so', () => {
    const {changes} = applyToWorkflow(yml, readings);
    assert.deepEqual(changes, [], 'literal(s) that disagree with the derivation — run node scripts/gen-gate-budgets.mjs:\n  ' + changes.join('\n  '));
    const lines = yml.split('\n');
    for (const g of gates) {
        const d = derive(readings.steps[g.name], g.timeout);
        let comment = null;
        for (let i = g.line; i < lines.length && !(i > g.line && /^      - /.test(lines[i])); i++) { const m = lines[i].match(/^\s+timeout-minutes:\s*\d+\s*(#.*)$/); if (m) { comment = m[1]; break; } }
        assert.ok(comment, `${g.name}: no comment beside timeout-minutes`);
        if (d.provisional) assert.match(comment, new RegExp(`PROVISIONAL — ${d.n} reading`), `${g.name}: a budget with ${d.n} readings must be called provisional`);
        else if (d.capped) assert.match(comment, new RegExp(`CAPPED: p95 ${d.p95} s × ${FACTOR} → ${d.capped} min exceeds the cap of ${CAP}.*no headroom above`), `${g.name}: a capped budget must say so and that it has no headroom`);
        else assert.match(comment, new RegExp(`p95 ${d.p95} s × ${FACTOR} → ${d.budget} min over ${d.n} green runs`), `${g.name}: the comment does not carry its own derivation`);
        if (d.max) assert.match(comment, new RegExp(`max ${d.max.seconds} s in run ${d.max.run}`), `${g.name}: the comment must keep the all-time max and its run`);
    }
});

test('the derivation (mutation): factor, floor, cap, provisional, over-cap', () => {
    const entry = (n, secs) => ({readings: Array.from({length: n}, (_, i) => ({run: 1, seconds: secs(i)})), max: {seconds: 99, run: 7, sha: 'abc'}});
    const rs = n => entry(n, i => 10 + i);
    assert.deepEqual(derive(rs(20), 4), {provisional: false, n: 20, p95: 28, budget: 3, max: {seconds: 99, run: 7, sha: 'abc'}}, 'p95 of 10..29 is sorted[ceil(0.95·20)-1] = 28; ceil(28×3/60) = 2 → floor 3');
    assert.equal(derive(entry(20, () => 135), 8).budget, 7, '135 s × 3 = 405 s → 7 min');
    assert.equal(derive(entry(20, () => 160), 8).budget, 8, '160 s × 3 = 480 s → exactly 8');
    const over = derive(entry(20, () => 166), 8);
    assert.equal(over.budget, 8); assert.equal(over.capped, 9, '166 s × 3 = 498 s → 9, written as the cap');
    assert.match(commentFor(over, 1), /CAPPED: p95 166 s × 3 → 9 min exceeds the cap of 8; budget is the cap, 2\.9× p95 — the one gate with no headroom above/);
    assert.deepEqual(derive(rs(3), 6), {provisional: true, n: 3, budget: 6, p95: 12, max: {seconds: 99, run: 7, sha: 'abc'}}, 'a guess keeps its literal (≥ floor) and is called provisional');
    assert.deepEqual(derive(undefined, 2), {provisional: true, n: 0, budget: 3, p95: null, max: null}, 'no readings at all: provisional at the floor');
    assert.match(commentFor(derive(rs(3), 6), 1), /PROVISIONAL — 3 reading/);
    assert.match(commentFor(derive(rs(20), 4), 12345), /p95 28 s × 3 → 3 min over 20 green runs to 12345; max 99 s in run 7/);
});

test('mutation: one literal edited is red naming the step; a gate with no readings is red naming it', () => {
    const target = gates.find(g => (readings.steps[g.name] || {n: 0}).n >= MIN_READINGS && !derive(readings.steps[g.name], g.timeout).capped);
    const mutated = yml.replace(new RegExp(`(- name: ${target.name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\n(?:.*\\n){0,4}?\\s+timeout-minutes:\\s*)(\\d+)`), (m, pre, n) => `${pre}${Number(n) + 1}`);
    assert.notEqual(mutated, yml, 'mutation anchor');
    const {changes} = applyToWorkflow(mutated, readings);
    assert.equal(changes.length, 1, changes.join('\n'));
    assert.match(changes[0], new RegExp(`^${target.name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}: ${Number(target.timeout) + 1} → ${target.timeout}`));
    // the hand-off literal is held to the same number
    const handoff = yml.replace(/BW_STEP_BUDGET_MIN=(\d+)/, (m, n) => `BW_STEP_BUDGET_MIN=${Number(n) + 1}`);
    assert.notEqual(handoff, yml, 'mutation anchor');
    assert.equal(applyToWorkflow(handoff, readings).changes.length, 1);
    assert.match(applyToWorkflow(handoff, readings).changes[0], /BW_STEP_BUDGET_MIN=\d+ → \d+$/);
    const without = {...readings, steps: {...readings.steps}}; delete without.steps[target.name];
    const missing = gates.filter(g => !without.steps[g.name]).map(g => g.name);
    assert.deepEqual(missing, [target.name]);
});
