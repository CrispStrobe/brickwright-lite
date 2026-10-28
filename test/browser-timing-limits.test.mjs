/**
 * Every RELATIVE interactivity limit inside a browser gate is what the readings
 * DERIVE, never a typed number (plan T15; T12's shape one layer in).
 * scripts/gen-timing-limits.mjs states the derivation — ceil(p95 of the last 20
 * green readings × 1.5), PROVISIONAL under 5 — and this test holds each gate's
 * `const relativeLimitMs = N;` to it: a literal that disagrees is red naming the
 * metric; a metric with no readings entry, or readings for a metric that is
 * gone, is red by name (regenerate: node scripts/gen-timing-limits.mjs --fetch);
 * the comment beside the literal must carry its own derivation and the
 * metric's all-time max with its run.
 *
 * Measured 2026-09-07 before this existed: the Sounds tab's 150 sat 1.1× above
 * its p95 on a runner with a 5 % spread (two red main runs in a day); the
 * Costume ceiling sat AT its p95 and was quarantined for it; P21's was 1.84×.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import path from 'node:path';
import {METRICS, derive, commentFor, applyToScript, READINGS, FACTOR, MIN_READINGS} from '../scripts/gen-timing-limits.mjs';

const ROOT = path.resolve(import.meta.dirname, '..');
const readings = JSON.parse(readFileSync(READINGS, 'utf8'));

test('the readings are the generator\'s, name their runs, and cover exactly the metrics the generator knows', () => {
    assert.ok(readings.newestRun && readings.runsScanned >= 20, 'the readings name the runs they came from');
    assert.deepEqual({factor: readings.factor, minReadings: readings.minReadings}, {factor: FACTOR, minReadings: MIN_READINGS}, 'the readings were built under the derivation this test asserts');
    const ids = METRICS.map(m => m.id).sort();
    assert.deepEqual(Object.keys(readings.metrics).sort(), ids, 'the readings and the generator disagree on which metrics exist — regenerate');
    for (const [id, e] of Object.entries(readings.metrics)) {
        assert.ok(e.readings.every(r => Number.isInteger(r.run) && Number.isFinite(r.ms) && r.ms > 0), `${id}: a reading without a run id or a millisecond value`);
        assert.ok(e.max && Number.isInteger(e.max.run) && e.max.ms >= Math.max(...e.readings.map(r => r.ms)), `${id}: the all-time max must name its run and be no smaller than any kept reading`);
        assert.ok(e.typed && e.typed.absoluteLimitMs && e.typed.maxLongTaskMs, `${id}: the typed limits (absolute, long task) are recorded beside the derived one`);
    }
});

test('every gate\'s relativeLimitMs is its derivation, and the comment beside it says so', () => {
    for (const m of METRICS) {
        const text = readFileSync(path.join(ROOT, m.script), 'utf8');
        const {change, missing} = applyToScript(text, readings.metrics[m.id], readings.newestRun);
        assert.ok(!missing, `${m.script}: no \`const relativeLimitMs = N;\` line`);
        assert.equal(change, null, `${m.id}: the literal disagrees with the derivation (${change}) — run node scripts/gen-timing-limits.mjs`);
        const d = derive(readings.metrics[m.id], NaN);
        const line = text.match(/^const relativeLimitMs = [0-9.]+;.*$/m)[0];
        if (d.provisional) assert.match(line, new RegExp(`PROVISIONAL — ${d.n} reading`), `${m.id}: a provisional limit must say so with its count`);
        else assert.match(line, new RegExp(`derived: p95 ${d.p95.toFixed(1)} ms × ${FACTOR} → ${d.limit} ms over ${d.n} green runs to ${readings.newestRun}; max ${d.max.ms.toFixed(1)} ms in run ${d.max.run}`), `${m.id}: the comment does not carry its own derivation and max`);
    }
});

test('the derivation and the rewrite (mutation): factor, provisional, one literal edited is red naming the metric', () => {
    const entry = (n, f) => ({readings: Array.from({length: n}, (_, i) => ({run: 1, ms: f(i)})), max: {ms: 500, run: 9}});
    assert.deepEqual(derive(entry(20, i => 100 + i), 999), {provisional: false, n: 20, p95: 118, limit: 177, max: {ms: 500, run: 9}}, 'p95 of 100..119 is 118; ceil(118 × 1.5) = 177');
    assert.deepEqual(derive(entry(3, () => 100), 150), {provisional: true, n: 3, limit: 150, p95: 100, max: {ms: 500, run: 9}}, 'under five readings the literal stays and is called provisional');
    assert.match(commentFor(derive(entry(3, () => 100), 150), 1), /PROVISIONAL — 3 reading/);
    assert.match(commentFor(derive(entry(20, i => 100 + i), 1), 777), /derived: p95 118\.0 ms × 1\.5 → 177 ms over 20 green runs to 777; max 500\.0 ms in run 9/);
    const src = "const baselineMs = 1;\nconst relativeLimitMs = 150; // old\nconst absoluteLimitMs = 1000;\n";
    const {text, change} = applyToScript(src, entry(20, i => 100 + i), 777);
    assert.equal(change, '150 → 177'); assert.match(text, /^const relativeLimitMs = 177; \/\/ derived:/m); assert.match(text, /const absoluteLimitMs = 1000;/);
    assert.equal(applyToScript(text, entry(20, i => 100 + i), 777).change, null, 'idempotent');
    assert.equal(applyToScript("no literal here\n", entry(20, i => 100), 1).missing, true);
    // the real thing: one gate's literal bumped by one is red naming it
    const m = METRICS[0];
    const real = readFileSync(path.join(ROOT, m.script), 'utf8');
    const bumped = real.replace(/^(const relativeLimitMs = )([0-9.]+)/m, (s, a, n) => `${a}${Number(n) + 1}`);
    assert.notEqual(bumped, real, 'mutation anchor');
    assert.match(applyToScript(bumped, readings.metrics[m.id], readings.newestRun).change || '', /^\d+ → \d+$/);
});
