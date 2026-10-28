// SPDX-License-Identifier: BSD-3-Clause
// Campaign task 4: bounded passive-RC 5 ms / 1 MHz precision batch through the
// installed bwc CLI. Circuits, closed forms, trigger level, meter integrals and
// tolerances were frozen before the CLI was observed; ngspice-42 `.tran`
// references (reltol 1e-9, max step 0.1 us, linearized to the 1 us grid) matched
// these closed forms within 1.2e-9 V (step), 3.8e-7 V (pulse) and 7.4e-8 V (sine)
// at all 5,001 grid points, so the closed forms serve as the admitted reference.
import test from 'node:test';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {mkdtempSync, readFileSync, rmSync, writeFileSync, existsSync} from 'node:fs';
import {tmpdir} from 'node:os';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..');
const cli = path.join(root, 'node_modules/bw-circuit-ui/bin/bwc.mjs');
const T_END = 5e-3, DT = 1e-6, LEVEL = 0.5, W = 2 * Math.PI * 1e3;
const TOL = {rawV: 1e-5, triggerS: 1e-8, meterV: 1e-6, meterI: 1e-8};

const pwl = (t, tau, segs) => {
    let v = 0;
    for (const [t0, t1, a, b] of segs) {
        if (t <= t0) break;
        const h = Math.min(t, t1) - t0;
        v = a + b * h - b * tau + (v - a + b * tau) * Math.exp(-h / tau);
        if (t <= t1) break;
    }
    return v;
};
const PULSE = (() => { // PULSE(0 1 0.5m 10u 10u 1m 2m)
    const segs = [[0, 5e-4, 0, 0]];
    for (let t = 5e-4; t < T_END + 2e-3; t += 2e-3) {
        segs.push([t, t + 1e-5, 0, 1e5], [t + 1e-5, t + 1.01e-3, 1, 0],
            [t + 1.01e-3, t + 1.02e-3, 1, -1e5], [t + 1.02e-3, t + 2e-3, 0, 0]);
    }
    return segs;
})();
const pulseIn = t => { for (const [t0, t1, a, b] of PULSE) if (t0 <= t && t < t1) return a + b * (t - t0); return 0; };
const CIRCUITS = {
    step: {R: 2.2e3, C: 0.47e-6, source: '1', u: () => 1,
        v: (t, tau) => 1 - Math.exp(-t / tau)},
    pulse: {R: 1e3, C: 0.33e-6, source: 'PULSE(0 1 0.5m 10u 10u 1m 2m)', u: pulseIn,
        v: (t, tau) => pwl(t, tau, PULSE)},
    sine: {R: 1e3, C: 0.1e-6, source: 'SIN(0 1 1k)', u: t => Math.sin(W * t),
        v: (t, tau) => { const wt = W * tau;
            return (Math.sin(W * t) - wt * Math.cos(W * t) + wt * Math.exp(-t / tau)) / (1 + wt * wt); }},
};
const deck = (name, c) => `Task4 RC ${name}\nV1 in 0 ${c.source}\nR1 in out ${c.R}\nC1 out 0 ${c.C}\n.tran 1u 5m UIC\n.end\n`;
const closedTrigger = (v) => {
    let t = 0; const h = 1e-7;
    while (v(t + h) < LEVEL) t += h;
    let a = t, b = t + h;
    for (let i = 0; i < 80; i++) { const m = (a + b) / 2; if (v(m) < LEVEL) a = m; else b = m; }
    return (a + b) / 2;
};
const means = (c, v, n = 200_000) => { // trapezoid over 0..T of the closed form
    const h = T_END / n; let sv = 0, si = 0;
    for (let k = 0; k <= n; k++) {
        const t = k * h, w = k === 0 || k === n ? 0.5 : 1, x = v(t);
        sv += w * x; si += w * (c.u(t) - x) / c.R;
    }
    return {v: sv * h / T_END, i: si * h / T_END};
};
const bwc = args => spawnSync(process.execPath, [cli, 'measure', ...args], {encoding: 'utf8', timeout: 120000});
const PRECISION = ['--profile', 'precision-v1', '--initial', 'zero-state'];

for (const [name, c] of Object.entries(CIRCUITS)) {
    test(`installed bwc 5 ms / 1 MHz passive batch: RC ${name} at every requested raw point`, () => {
        const dir = mkdtempSync(path.join(tmpdir(), 'bwc-task4-'));
        try {
            const file = path.join(dir, `${name}.cir`), csv = path.join(dir, `${name}.csv`);
            writeFileSync(file, deck(name, c));
            const r = bwc([file, '--scope', 'C1.a,V1.neg', '--meter', 'voltage:C1.a,V1.neg', '--meter', 'current:R1.a',
                ...PRECISION, '--duration', '5ms', '--rate', '1MHz', '--json', '--csv', csv]);
            assert.equal(r.status, 0, r.stderr);
            const report = JSON.parse(r.stdout);
            assert.equal(report.transient.accuracyMet, true);
            const work = report.transient.work;
            assert.equal(work.advances, 1, 'one whole-capture advance, no per-chunk renewal');
            assert.ok(work.attempts <= 20000 && work.solves <= 60001, JSON.stringify(work));
            assert.equal(report.precisionResources.renewal, 'none-whole-capture');
            const lines = readFileSync(csv, 'utf8').trim().split('\n');
            assert.match(lines[0], /capture=sample startTimeNs=1000 sampleIntervalNs=1000 points=5000$/);
            const rows = lines.slice(2).map(line => line.split(',').map(Number));
            // Capture cadence equals report cadence here: 5,000 raw points at k*1 us,
            // k = 1..5000 (first sample at dt, last at 5 ms); t = 0 is not a sample.
            assert.equal(rows.length, 5000);
            assert.equal(report.scope[0].summary.samples, 5000);
            assert.equal(report.scope[0].startTimeSeconds, DT);
            const tau = c.R * c.C, v = t => c.v(t, tau);
            let worst = 0, trigger = null;
            rows.forEach(([elapsed, volts], index) => {
                assert.ok(Math.abs(elapsed - index * DT) < 1e-12, `sample ${index} elapsed ${elapsed}`);
                worst = Math.max(worst, Math.abs(volts - v((index + 1) * DT)));
                if (trigger === null && index && rows[index - 1][1] < LEVEL && volts >= LEVEL) {
                    const [e0, v0] = rows[index - 1];
                    trigger = DT + e0 + (LEVEL - v0) / (volts - v0) * DT;
                }
            });
            assert.ok(worst <= TOL.rawV, `worst raw-point error ${worst} V`);
            assert.ok(trigger !== null && Math.abs(trigger - closedTrigger(v)) <= TOL.triggerS,
                `0.5 V trigger ${trigger} vs ${closedTrigger(v)}`);
            // 5 ms < 100 ms meter window: readings are 0..T time integrals, not sample means.
            const expected = means(c, v), [vm, im] = report.meters.map(m => m.reading.siValue);
            assert.ok(Math.abs(vm - expected.v) <= TOL.meterV, `voltage mean ${vm} vs ${expected.v}`);
            assert.ok(Math.abs(Math.abs(im) - Math.abs(expected.i)) <= TOL.meterI, `|current mean| ${im} vs ${expected.i}`);
        } finally { rmSync(dir, {recursive: true, force: true}); }
    });
}

test('installed bwc keeps the original refusals: no artifact, no truncated success', () => {
    const dir = mkdtempSync(path.join(tmpdir(), 'bwc-task4-neg-'));
    try {
        const file = path.join(dir, 'step.cir'), csv = path.join(dir, 'neg.csv');
        writeFileSync(file, deck('step', CIRCUITS.step));
        const base = [file, '--scope', 'C1.a,V1.neg', ...PRECISION];
        const cases = [
            [[...base, '--duration', '5ms', '--rate', '1MHz', '--watch', '--csv', csv],
                /precision watch requires the bounded ADP7118/],
            [[...base, '--duration', '5ms', '--rate', '1MHz', '--max-step', '50ns', '--json', '--csv', csv],
                /needs 100000 adaptive attempts; limit is 20000/],
            [[...base, '--scope', 'R1.a,V1.neg', '--duration', '100ms', '--rate', '2MHz', '--json', '--csv', csv],
                /needs 200000 adaptive attempts; limit is 20000/],
        ];
        for (const [args, message] of cases) {
            const r = bwc(args);
            assert.notEqual(r.status, 0);
            assert.match(r.stderr, /precision batch admission failed/);
            assert.match(r.stderr, message);
            assert.equal(r.stdout, '');
            assert.equal(existsSync(csv), false, 'refusal precedes any CSV');
        }
    } finally { rmSync(dir, {recursive: true, force: true}); }
});
