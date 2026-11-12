// SPDX-License-Identifier: BSD-3-Clause
// Two newly authored series RL fixtures; no completed cohort input is replayed.
// Oracle: the closed-form RL step response (ngspice was used only offline as
// an independent reference check; no GPL code is used here).
import test from 'node:test';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {mkdtempSync, readFileSync, rmSync, writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..');
const cli = path.join(root, 'node_modules/bw-circuit-ui/bin/bwc.mjs');
const R = 1470, L = 0.073, DURATION = 0.005, DT = 1e-6, POINTS = 5000;
const VOLTAGE_TOL = 1e-5, CURRENT_TOL = 1e-8;
const TAU = L / R;

// Inductor terminal voltage after a zero-state step: source * exp(-t / tau).
const inductorVoltage = (source, t, tau = TAU) => source * Math.exp(-t / tau);
// Complete-window mean of the series current source/R * (1 - exp(-t/tau)).
// CLI resistor terminal meters report native current signed out of that terminal,
// so current entering R1.a from the source reads negative for a positive source.
const meanCurrentA = (source, r = R, tau = TAU) =>
    -source / r * (1 - tau / DURATION * -Math.expm1(-DURATION / tau));

const checkCurrent = (actual, expected) => {
    assert.ok(Number.isFinite(actual), 'current must be finite');
    assert.ok(Math.abs(actual - expected) <= CURRENT_TOL,
        `signed terminal current ${actual} A differs from ${expected} A`);
};
// Returns the worst absolute error; throws on any nonfinite or out-of-tolerance sample.
const checkScope = (rows, source, tau = TAU) => {
    assert.equal(rows.length, POINTS);
    let worst = 0;
    for (let i = 0; i < rows.length; i++) {
        const [elapsed, volts] = rows[i];
        assert.ok(Number.isFinite(elapsed) && Number.isFinite(volts), `nonfinite sample ${i}`);
        assert.ok(Math.abs(elapsed - i * DT) < 1e-12, `elapsed time at sample ${i}`);
        const error = Math.abs(volts - inductorVoltage(source, (i + 1) * DT, tau));
        assert.ok(error <= VOLTAGE_TOL, `inductor voltage at sample ${i}: ${volts}`);
        worst = Math.max(worst, error);
    }
    return worst;
};
const analyticRows = (source, tau = TAU) =>
    Array.from({length: POINTS}, (_, i) => [i * DT, inductorVoltage(source, (i + 1) * DT, tau)]);
const deck = source => `Signed RL capture\nV1 in 0 ${source}\nR1 in out ${R}\nL1 out 0 ${L}\n.tran 1u 5m UIC\n.end\n`;

// Mutants that the comparators must reject: sign flip, wrong time constant, R and L swapped.
const mutants = source => [
    ['sign flip', -source, TAU, R],
    ['wrong time constant', source, 2 * TAU, R],
    ['swapped R and L', source, R / L, L],
];

test('signed RL comparators reject reversal, nonfinite values and reference mutants', () => {
    for (const source of [2.3, -2.3]) {
        const expected = meanCurrentA(source);
        assert.ok(Math.abs(expected) > 2 * CURRENT_TOL);
        checkCurrent(expected, expected);
        assert.throws(() => checkCurrent(-expected, expected), /signed terminal current/);
        assert.throws(() => checkCurrent(Number.NaN, expected), /finite/);
        checkScope(analyticRows(source), source);
        const nan = analyticRows(source);
        nan[17][1] = Number.NaN;
        assert.throws(() => checkScope(nan, source), /nonfinite/);
        for (const [name, mSource, mTau, mR] of mutants(source)) {
            assert.throws(() => checkScope(analyticRows(mSource, mTau), source), /inductor voltage/, name);
            assert.throws(() => checkCurrent(meanCurrentA(mSource, mR, mTau), expected),
                /signed terminal current/, name);
        }
    }
});

for (const source of [2.3, -2.3]) {
    test(`installed bwc 5 ms RL capture preserves signed terminal currents at ${source} V`, () => {
        const dir = mkdtempSync(path.join(tmpdir(), 'bwc-signed-rl-'));
        try {
            const file = path.join(dir, 'signed-rl.cir');
            const csv = path.join(dir, 'capture.csv');
            writeFileSync(file, deck(source));
            const result = spawnSync(process.execPath, [cli, 'measure', file,
                '--scope', 'L1.a,V1.neg', '--meter', 'current:R1.a', '--meter', 'current:R1.b',
                '--profile', 'precision-v1', '--initial', 'zero-state',
                '--duration', '5ms', '--rate', '1MHz', '--json', '--csv', csv],
            {encoding: 'utf8', timeout: 120000});
            assert.equal(result.status, 0, result.stderr);
            const report = JSON.parse(result.stdout);
            assert.equal(report.transient.accuracyMet, true);
            assert.equal(report.transient.work.advances, 1);
            assert.ok(report.transient.work.attempts <= 20000 && report.transient.work.solves <= 60001);
            assert.equal(report.precisionResources.renewal, 'none-whole-capture');
            assert.equal(report.scope[0].summary.samples, POINTS);
            assert.equal(report.scope[0].startTimeSeconds, DT);
            assert.equal(report.meters.length, 2);
            for (const [index, terminal] of ['R1.a', 'R1.b'].entries()) {
                assert.equal(report.meters[index].mode, 'current');
                assert.deepEqual(report.meters[index].probes, [terminal]);
                assert.equal(report.meters[index].reading.siUnit, 'A');
            }
            const expected = meanCurrentA(source);
            const a = report.meters[0].reading.siValue, b = report.meters[1].reading.siValue;
            checkCurrent(a, expected);
            checkCurrent(b, -expected);
            const lines = readFileSync(csv, 'utf8').trim().split('\n');
            assert.match(lines[0], /capture=sample startTimeNs=1000 sampleIntervalNs=1000 points=5000$/);
            assert.equal(lines[1], 'elapsed_seconds,volts');
            const rows = lines.slice(2).map(line => {
                const fields = line.split(',').map(Number);
                assert.equal(fields.length, 2);
                return fields;
            });
            const worst = checkScope(rows, source);
            // The same actual capture must fail every mutated reference.
            for (const [name, mSource, mTau, mR] of mutants(source)) {
                assert.throws(() => checkScope(rows, mSource, mTau), /inductor voltage/, name);
                assert.throws(() => checkCurrent(a, meanCurrentA(mSource, mR, mTau)),
                    /signed terminal current/, name);
            }
            console.log(`signed RL ${source} V: worst voltage error ${worst} V (limit ${VOLTAGE_TOL}); ` +
                `current errors ${Math.abs(a - expected)} / ${Math.abs(b + expected)} A (limit ${CURRENT_TOL})`);
        } finally {
            rmSync(dir, {recursive: true, force: true});
        }
    });
}
