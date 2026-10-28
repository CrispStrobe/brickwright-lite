// Campaign task 5: packaged acceptance of the opt-in nominal 25 C LM741
// bias/supply domain through Lite's INSTALLED bw-circuit-ui CLI.
//
// Expectations are frozen here from independent nominal equations using the
// TI SNOSC25D TYPICAL values (Ib 80 nA, Ios 20 nA, Is 1.7 mA, 25 C, +-15 V).
// They are typical values, not guaranteed limits, and these checks are not a
// claim of physical-device accuracy.
//
// Nominal model (as documented by CUI docs/CLI-INSTRUMENTS.md):
//   Ibp = Ib + s*Ios/2, Ibn = Ib - s*Ios/2           (s = inputOffsetCurrentSign)
//   bias currents return through V-; quiescent Iq flows V+ -> V-;
//   output current Iout is drawn from V+ when sourcing, returned to V- when sinking.
// Meter convention (from the upstream CLI test): a terminal reading is positive
// for current leaving the part at that terminal.
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync, mkdtempSync, writeFileSync, rmSync} from 'node:fs';
import {spawnSync} from 'node:child_process';
import {tmpdir} from 'node:os';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..');
const cuiRoot = path.join(root, 'node_modules/bw-circuit-ui');
const CLI = path.join(cuiRoot, 'bin/bwc.mjs');
const DOMAIN = 'ti-snosc25d-typical-25c';
const IB = 80e-9, IOS = 20e-9, IQ = 1.7e-3, RAIL = 15, DURATION = 20e-6;

function follower({sign = 1, domain = true, load = null, params = {}} = {}) {
    const wire = (from, fromTerminal, to, toTerminal) => ({from, fromTerminal, to, toTerminal});
    const parts = [
        {id: 'VP', kind: 'vsource', params: {volts: 15}},
        {id: 'VN', kind: 'vsource', params: {volts: 15}},
        {id: 'VIN', kind: 'vsource', params: {volts: 0}},
        {id: 'G', kind: 'gnd', params: {}},
        {id: 'U', kind: 'lm741', params: {transientModel: 'linear-pole', inputOffsetV: 0,
            supplyPositiveV: 15, supplyNegativeV: -15,
            ...(domain ? {biasSupplyDomain: DOMAIN, inputOffsetCurrentSign: sign} : {}), ...params}},
    ];
    const wires = [wire('VP', 'neg', 'G', 'gnd'), wire('VN', 'pos', 'G', 'gnd'), wire('VIN', 'neg', 'G', 'gnd'),
        wire('VP', 'pos', 'U', 'vpos'), wire('VN', 'neg', 'U', 'vneg'),
        wire('VIN', 'pos', 'U', 'inp'), wire('U', 'out', 'U', 'inn')];
    if (load) {
        // The output sits at 0 V from t=0 (VIN=0, zero state), so a load returned
        // to a fixed VL draws a constant -VL/RL from the output without slewing.
        parts.push({id: 'RL', kind: 'resistor', params: {ohms: load.ohms}},
            {id: 'VL', kind: 'vsource', params: {volts: load.volts}});
        wires.push(wire('U', 'out', 'RL', 'a'), wire('RL', 'b', 'VL', 'pos'), wire('VL', 'neg', 'G', 'gnd'));
    }
    return {vcc: 5, parts, wires};
}

function expected(sign, load) {
    const ibp = IB + sign * IOS / 2, ibn = IB - sign * IOS / 2;
    const iload = load ? -load.volts / load.ohms : 0;          // into RL.a, out of U.out
    const iout = ibn + iload;                                    // out terminal feeds inn and RL
    const source = Math.max(0, iout), sink = Math.max(0, -iout);
    const vpos = -(IQ + source);                                 // current enters U at vpos
    const vneg = IQ + ibp + ibn + sink;                          // current leaves U at vneg
    const power = RAIL * -vpos + RAIL * vneg;                    // both rails deliver
    return {ibp, ibn, iload, iout, vpos, vneg, inp: -ibp, inn: -ibn, power, energy: power * DURATION};
}

function runCli(dir, circuit, meters, extra = [], duration = '20us') {
    const file = path.join(dir, 'follower.json');
    writeFileSync(file, JSON.stringify(circuit));
    const env = {...process.env}; delete env.BW_BOARD;
    return spawnSync(process.execPath, [CLI, 'measure', file, '--profile', 'precision-v1',
        '--initial', 'zero-state', '--scope', 'U.out,G.gnd',
        ...meters.flatMap(m => ['--meter', `current:${m}`]),
        '--duration', duration, '--rate', '2MHz', '--json', ...extra],
    {encoding: 'utf8', env, timeout: 120000});
}

test('the installed packages are the pinned Board/CUI pair carrying the domain', () => {
    const pins = JSON.parse(readFileSync(path.join(root, 'vendor-pins.json'), 'utf8'));
    const manifest = JSON.parse(readFileSync(path.join(root, 'package.json'), 'utf8'));
    const lock = JSON.parse(readFileSync(path.join(root, 'package-lock.json'), 'utf8'));
    for (const name of ['bw-board', 'bw-circuit-ui']) {
        assert.match(pins[name], /^[0-9a-f]{40}$/, `${name}: exact current pin`);
        assert.equal(manifest.devDependencies[name], `github:CrispStrobe/${name}#${pins[name]}`);
        assert.equal(lock.packages[`node_modules/${name}`].resolved,
            `git+ssh://git@github.com/CrispStrobe/${name}.git#${pins[name]}`);
    }
    const report = readFileSync(path.join(cuiRoot, 'src/model/instrument-report.js'), 'utf8');
    assert.match(report, /nominal-typical-25c-bias-supply/);
});

const METERS = ['U.vpos', 'U.vneg', 'U.inp', 'U.inn', 'U.out', 'VP.pos', 'VN.neg'];
const LOADS = [null, {ohms: 10000, volts: -1}, {ohms: 10000, volts: 1}];

// v1 (instant-settling) predicate, frozen and committed before its first run.
// ORIGINAL OBSERVED FAILURE (2026-10-28, first local run, kept verbatim):
//   'sign 1, load 10000 ohm to -1 V: V+ pin -0.0018000219515663727 expected -0.00180007'
// It compares 0-20 us observed means against steady-state values, ignoring the
// zero-state load-step transient. Retained unedited as an expected failure (todo);
// the v2 predicate below replaces it as the acceptance gate.
test('v1-instant-settling: installed CLI terminal KCL, rail power/energy, both polarities, zero and nonzero load', {
    todo: 'expected failure preserved: v1 ignores start-up transient; tracked in docs/CIRCUIT-INSTRUMENT-REGRESSION.md (item 5); see v2-post-settling-window',
}, () => {
    const dir = mkdtempSync(path.join(tmpdir(), 'lite-lm741-bias-'));
    try {
        for (const sign of [1, -1]) for (const load of LOADS) {
            const label = `sign ${sign}, load ${load ? `${load.ohms} ohm to ${load.volts} V` : 'none'}`;
            const meters = load ? [...METERS, 'RL.a'] : METERS;
            const r = runCli(dir, follower({sign, load}), meters);
            assert.equal(r.status, 0, `${label}: ${r.stderr}`);
            const report = JSON.parse(r.stdout);
            assert.match(report.precisionCapture.admission, /nominal-typical-25c-bias-supply$/);
            assert.deepEqual(report.precisionCapture.hiddenSolverExpansion, {parts: 6, nets: 2});
            const got = Object.fromEntries(report.meters.map((m, i) => {
                assert.equal(m.reading.note, null, `${label}: ${meters[i]} represented`);
                return [meters[i], m.reading.siValue];
            }));
            const e = expected(sign, load);
            const tol = load ? 1e-9 : 1e-10;
            const near = (name, actual, want) => assert.ok(Math.abs(actual - want) <= tol,
                `${label}: ${name} ${actual} expected ${want}`);
            near('V+ pin', got['U.vpos'], e.vpos);
            near('V- pin', got['U.vneg'], e.vneg);
            near('inp bias', got['U.inp'], e.inp);
            near('inn bias', got['U.inn'], e.inn);
            near('out', got['U.out'], e.iout);
            if (load) near('load', -got['RL.a'], e.iload);
            // Terminal KCL over the package (offset/NC pins are open).
            const kcl = got['U.vpos'] + got['U.vneg'] + got['U.inp'] + got['U.inn'] + got['U.out'];
            assert.ok(Math.abs(kcl) <= tol, `${label}: package KCL residual ${kcl}`);
            // Rail sources carry exactly the package rail currents.
            assert.ok(Math.abs(got['VP.pos'] + got['U.vpos']) <= 1e-12, `${label}: V+ source`);
            assert.ok(Math.abs(got['VN.neg'] + got['U.vneg']) <= 1e-12, `${label}: V- source`);
            // Rail power and energy over the 20 us capture from metered currents.
            const power = RAIL * -got['U.vpos'] + RAIL * got['U.vneg'];
            assert.ok(Math.abs(power - e.power) <= RAIL * 2 * tol, `${label}: power ${power} vs ${e.power}`);
            assert.ok(Math.abs(power * DURATION - e.energy) <= RAIL * 2 * tol * DURATION,
                `${label}: energy ${power * DURATION} vs ${e.energy}`);
            // Sanity on the frozen arithmetic itself: polarity is resolvable (20 nA).
            assert.ok(Math.abs(expected(1, load).inp - expected(-1, load).inp) > 10 * tol);
        }
    } finally { rmSync(dir, {recursive: true, force: true}); }
});

test('installed CLI refuses unsupported temperatures, rails, signs and non-linear-pole use', () => {
    const dir = mkdtempSync(path.join(tmpdir(), 'lite-lm741-refuse-'));
    try {
        const cases = {
            'other temperature': {biasSupplyDomain: 'ti-snosc25d-typical-70c'},
            'other rails': {supplyPositiveV: 12, supplyNegativeV: -12},
            'zero sign': {inputOffsetCurrentSign: 0},
            'missing sign': {inputOffsetCurrentSign: undefined},
            'non-linear-pole': {transientModel: undefined},
        };
        for (const [label, params] of Object.entries(cases)) {
            const circuit = follower({params});
            const u = circuit.parts.find(p => p.id === 'U').params;
            for (const [k, v] of Object.entries(params)) if (v === undefined) delete u[k];
            const r = runCli(dir, circuit, ['U.vpos']);
            assert.notEqual(r.status, 0, `${label} must refuse`);
            assert.match(r.stderr + r.stdout, /precision LM741/, label);
        }
    } finally { rmSync(dir, {recursive: true, force: true}); }
});

test('default-off: unchanged admission, unrepresented supply pins, byte-identical repeat', () => {
    const dir = mkdtempSync(path.join(tmpdir(), 'lite-lm741-off-'));
    try {
        const outputs = [];
        for (let i = 0; i < 2; i++) {
            const csv = path.join(dir, `off-${i}.csv`);
            const r = runCli(dir, follower({domain: false}), ['U.vpos'], ['--csv', csv]);
            if (r.status !== 0) {
                assert.match(r.stderr + r.stdout, /current|branch/i, 'off: supply current unrepresented');
                return;
            }
            const report = JSON.parse(r.stdout);
            assert.match(report.precisionCapture.admission, /bias-not-adopted$/);
            assert.deepEqual(report.precisionCapture.hiddenSolverExpansion, {parts: 5, nets: 2});
            assert.notEqual(report.meters[0].reading.note, null, 'off: supply pin current stays unrepresented');
            outputs.push(readFileSync(csv));
        }
        assert.ok(outputs[0].equals(outputs[1]), 'default-off capture is byte-identical on repeat');
    } finally { rmSync(dir, {recursive: true, force: true}); }
});

test('GUI does not expose the domain: palette default and editors are unchanged (CLI-only)', () => {
    const palette = readFileSync(path.join(cuiRoot, 'src/components/PartPalette.jsx'), 'utf8');
    assert.match(palette, /kind: 'lm741', label: 'LM741', params: \{\}/);
    const grep = spawnSync('/usr/bin/grep', ['-rlE', 'biasSupplyDomain|inputOffsetCurrentSign',
        path.join(cuiRoot, 'src'), path.join(root, 'overlay')], {encoding: 'utf8'});
    assert.ok(grep.status <= 1, grep.stderr);
    const hits = grep.stdout.trim().split('\n').filter(Boolean)
        .map(f => path.relative(root, f));
    assert.deepEqual(hits, ['node_modules/bw-circuit-ui/src/model/instrument-report.js'],
        'only the CLI precision report admits the domain; no GUI editor authors it');
});


// v2 predicate, frozen a priori from the pinned Board linear-pole card (gbwHz 1e6,
// a0 2e5) before its first run. A unity-gain follower closes the loop at GBW, so
// its small-signal time constant is tau = 1/(2*pi*1e6) ~= 159 ns. The window
// starts at 10 us >= 60*tau (well above the requested >= 10*tau); exp(-60) makes
// any start-up residue negligible against the 1e-10/1e-9 A tolerances. The CLI
// meter reports the mean since capture start, so the [10 us, 20 us] window mean is
// (20*mean20 - 10*mean10)/10 from two deterministic runs of the same circuit.
const TAU = 1 / (2 * Math.PI * 1e6), T1 = 10e-6, T2 = 20e-6;
test('v2-post-settling-window: terminal KCL, rail power/energy, both polarities, zero and nonzero load', () => {
    assert.ok(T1 >= 10 * TAU && T1 >= 60 * TAU);
    const dir = mkdtempSync(path.join(tmpdir(), 'lite-lm741-bias-v2-'));
    const failures = [];
    try {
        for (const sign of [1, -1]) for (const load of LOADS) {
            const label = `v2 sign ${sign}, load ${load ? `${load.ohms} ohm to ${load.volts} V` : 'none'}`;
            const meters = load ? [...METERS, 'RL.a'] : METERS;
            const means = ['10us', '20us'].map(d => {
                const r = runCli(dir, follower({sign, load}), meters, [], d);
                assert.equal(r.status, 0, `${label} ${d}: ${r.stderr}`);
                const report = JSON.parse(r.stdout);
                assert.match(report.precisionCapture.admission, /nominal-typical-25c-bias-supply$/);
                return report.meters.map(m => { assert.equal(m.reading.note, null); return m.reading.siValue; });
            });
            const got = Object.fromEntries(meters.map((m, i) =>
                [m, (T2 * means[1][i] - T1 * means[0][i]) / (T2 - T1)]));
            const e = expected(sign, load);
            const tol = load ? 1e-9 : 1e-10;
            const check = (name, actual, want, t = tol) => {
                if (!(Math.abs(actual - want) <= t)) failures.push(`${label}: ${name} ${actual} expected ${want}`);
            };
            check('V+ pin', got['U.vpos'], e.vpos);
            check('V- pin', got['U.vneg'], e.vneg);
            check('inp bias', got['U.inp'], e.inp);
            check('inn bias', got['U.inn'], e.inn);
            check('out', got['U.out'], e.iout);
            if (load) check('load', -got['RL.a'], e.iload);
            check('package KCL', got['U.vpos'] + got['U.vneg'] + got['U.inp'] + got['U.inn'] + got['U.out'], 0);
            check('V+ source', got['VP.pos'], -got['U.vpos'], 1e-12);
            check('V- source', got['VN.neg'], -got['U.vneg'], 1e-12);
            const power = RAIL * -got['U.vpos'] + RAIL * got['U.vneg'];
            check('rail power', power, e.power, RAIL * 2 * tol);
            check('rail energy over window', power * (T2 - T1), e.power * (T2 - T1), RAIL * 2 * tol * (T2 - T1));
        }
    } finally { rmSync(dir, {recursive: true, force: true}); }
    assert.deepEqual(failures, [], 'every v2 case must meet the frozen nominal expectation');
});
