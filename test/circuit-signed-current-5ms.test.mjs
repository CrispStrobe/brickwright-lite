// SPDX-License-Identifier: BSD-3-Clause
// Two newly authored RC fixtures; no completed cohort input is replayed.
import test from 'node:test';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {mkdtempSync, readFileSync, rmSync, writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..');
const cli = path.join(root, 'node_modules/bw-circuit-ui/bin/bwc.mjs');
const R = 1370, C = 0.37e-6, DURATION = 0.005, DT = 1e-6;
const VOLTAGE_TOL = 1e-5, CURRENT_TOL = 1e-8;
const response = (source, t) => source * -Math.expm1(-t / (R * C));
// CLI resistor terminal meters use native current signed out of that terminal.
const meanCurrentA = source => -source / R * (R * C) / DURATION * -Math.expm1(-DURATION / (R * C));
const checkCurrent = (actual, expected) => {
    assert.ok(Number.isFinite(actual), 'current must be finite');
    assert.ok(Math.abs(actual - expected) <= CURRENT_TOL,
        `signed terminal current ${actual} A differs from ${expected} A`);
};
const deck = source => `Signed RC capture\nV1 in 0 ${source}\nR1 in out ${R}\nC1 out 0 ${C}\n.tran 1u 5m UIC\n.end\n`;

test('signed-current comparator rejects nonzero reversal and nonfinite readings', () => {
    const expected = meanCurrentA(1.7);
    assert.ok(Math.abs(expected) > 2 * CURRENT_TOL);
    checkCurrent(expected, expected);
    assert.throws(() => checkCurrent(-expected, expected), /signed terminal current/);
    assert.throws(() => checkCurrent(Number.NaN, expected), /finite/);
});

for (const source of [1.7, -1.7]) {
    test(`installed bwc 5 ms RC capture preserves signed terminal currents at ${source} V`, () => {
        const dir = mkdtempSync(path.join(tmpdir(), 'bwc-signed-rc-'));
        try {
            const file = path.join(dir, 'signed-rc.cir');
            const csv = path.join(dir, 'capture.csv');
            writeFileSync(file, deck(source));
            const result = spawnSync(process.execPath, [cli, 'measure', file,
                '--scope', 'C1.a,V1.neg', '--meter', 'current:R1.a', '--meter', 'current:R1.b',
                '--profile', 'precision-v1', '--initial', 'zero-state',
                '--duration', '5ms', '--rate', '1MHz', '--json', '--csv', csv],
            {encoding: 'utf8', timeout: 120000});
            assert.equal(result.status, 0, result.stderr);
            const report = JSON.parse(result.stdout);
            assert.equal(report.transient.accuracyMet, true);
            assert.equal(report.transient.work.advances, 1);
            assert.ok(report.transient.work.attempts <= 20000 && report.transient.work.solves <= 60001);
            assert.equal(report.precisionResources.renewal, 'none-whole-capture');
            assert.equal(report.scope[0].summary.samples, 5000);
            assert.equal(report.scope[0].startTimeSeconds, DT);
            assert.equal(report.meters.length, 2);
            for (const [index, terminal] of ['R1.a', 'R1.b'].entries()) {
                assert.equal(report.meters[index].mode, 'current');
                assert.deepEqual(report.meters[index].probes, [terminal]);
                assert.equal(report.meters[index].reading.siUnit, 'A');
            }
            const expected = meanCurrentA(source);
            checkCurrent(report.meters[0].reading.siValue, expected);
            checkCurrent(report.meters[1].reading.siValue, -expected);
            const lines = readFileSync(csv, 'utf8').trim().split('\n');
            assert.match(lines[0], /capture=sample startTimeNs=1000 sampleIntervalNs=1000 points=5000$/);
            assert.equal(lines[1], 'elapsed_seconds,volts');
            const rows = lines.slice(2);
            assert.equal(rows.length, 5000);
            for (let i = 0; i < rows.length; i++) {
                const fields = rows[i].split(',').map(Number);
                assert.equal(fields.length, 2);
                assert.ok(fields.every(Number.isFinite), `nonfinite sample ${i}`);
                assert.ok(Math.abs(fields[0] - i * DT) < 1e-12, `elapsed time at sample ${i}`);
                assert.ok(Math.abs(fields[1] - response(source, (i + 1) * DT)) <= VOLTAGE_TOL,
                    `voltage at sample ${i}: ${fields[1]}`);
            }
        } finally {
            rmSync(dir, {recursive: true, force: true});
        }
    });
}
