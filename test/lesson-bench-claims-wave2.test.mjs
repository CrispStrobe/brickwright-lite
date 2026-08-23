/**
 * Wave 2 lesson review — "Measure rather than guess", as a gate.
 *
 * Same contract as `test/lesson-bench-claims.test.mjs` for Wave 1: every verdict
 * in `docs/LESSON-REVIEW-WAVE-2.md` is a number that came out of the engine, and
 * this file re-derives it so a verdict cannot quietly stop being true.
 *
 * Wave 2 is the instrument wave, so most of its claims are about whether a
 * reading is trustworthy. Two of them are about a reading that does not exist at
 * all, and those are pinned as OPEN DEFECT tests that fail when someone fixes
 * the engine — the same shape Wave 1 used for the transistor ammeter.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import path from 'node:path';
import {boot, load, EXAMPLES, circuitPathFor} from '../scripts/lesson-bench.mjs';

const MS = 1_000_000n;
const ROOT = path.resolve(import.meta.dirname, '..');
const near = (actual, expected, tol, what) => assert.ok(
    Math.abs(actual - expected) <= tol,
    `${what}: measured ${Number(actual).toFixed(4)}, expected ${expected} +-${tol}`);
const volts = (board, part, terminal) => {
    for (const net of board.nets) {
        if (net.terminals.some(t => t.part === part && t.terminal === terminal)) {
            return board.nodeVoltage(net.id);
        }
    }
    assert.fail(`${part}.${terminal} is on no net`);
};
const netId = (board, part, terminal) => {
    for (const net of board.nets) {
        if (net.terminals.some(t => t.part === part && t.terminal === terminal)) return net.id;
    }
    return null;
};
const milliamps = (board, part, terminal) => board.branchCurrent(part, terminal) * 1000;

// ── measurement-voltage → 73-voltmeter ──────────────────────────────────────
test('measurement-voltage: the probe spans the full ADC range', async () => {
    const {board, circuit} = await load('73-voltmeter');
    let t = 0n;
    const at = position => {
        circuit.setControl('probe1', position);
        board.advanceTo(t += 20n * MS);
        return volts(board, 'nano', 'a0');
    };
    near(at(0), 0, 0.01, 'wiper at 0%');
    near(at(0.5), 2.5, 0.01, 'wiper at 50%');
    near(at(1), 5.0, 0.01, 'wiper at 100%');
    // The lesson's "about 4.9 mV per count" is 5000/1023 = 4.888 mV.
    near(5000 / 1023, 4.888, 0.002, 'one ADC count');
    assert.equal(Math.round(at(1) / 5 * 1023), 1023, 'full scale reaches the top count');
});

test('OPEN DEFECT: 73-voltmeter\'s OLED cannot render — the verbs are undefined', () => {
    // The program says `oled clear` / `oled set cursor` / `oled print`. The
    // bundled `devices` extension declares no oled opcode at all, so in the SIM
    // path scratch-vm never executes those blocks: an undefined opcode is
    // silent. The lesson's three-way comparison is therefore two-way today.
    const ext = readFileSync(path.join(ROOT,
        'overlay/scratch-vm/src/extensions/crispstrobe/devices/index.js'), 'utf8');
    const declared = [...ext.matchAll(/opcode: *'([a-z0-9_]+)'/g)].map(m => m[1]);
    for (const verb of ['oledclear', 'oledcursor', 'oledprint']) {
        assert.ok(!declared.includes(verb),
            `devices now declares ${verb} — the OLED may render. Re-measure ` +
            `73-voltmeter, update docs/LESSON-REVIEW-WAVE-2.md and the ` +
            `measurement-voltage hint, then delete this test.`);
    }
    const program = readFileSync(path.join(EXAMPLES, '73-voltmeter/program.bw'), 'utf8');
    assert.match(program, /oled print/, 'the program still depends on those verbs');
});

// ── measurement-current-burden → 74-ammeter ─────────────────────────────────
test('measurement-current-burden: Vshunt/I recovers the shunt at every load', async () => {
    const {board, circuit} = await load('74-ammeter');
    let t = 0n;
    for (const position of [0.25, 0.5, 0.75]) {
        circuit.setControl('load1', position);
        board.advanceTo(t += 20n * MS);
        const vShunt = volts(board, 'shunt1', 'a');
        const current = -milliamps(board, 'shunt1', 'a') / 1000;
        near(vShunt / current, 10, 0.001, `shunt recovered at load ${position}`);
    }
    // and the lesson's I = V/(Rload + Rshunt) holds: 1k pot at 50% is 500 ohm.
    circuit.setControl('load1', 0.5);
    board.advanceTo(t += 20n * MS);
    near(-milliamps(board, 'shunt1', 'a'), 5000 / 510, 0.01, 'I = 5 V / (500 + 10)');
});

test('OPEN DEFECT: every devices actuator verb is a no-op — setDeviceControl does not exist', () => {
    // Different shape from the OLED defect above, and harder to see: these verbs
    // ARE declared and implemented, so an opcode-resolution check passes them.
    // Each body is `if (b && b.setDeviceControl) b.setDeviceControl(...)`, and
    // setDeviceControl is defined nowhere — the board exposes setControl and
    // setPartParam. The guard is always false. Independently confirmed by
    // bw-bundle; re-derived here rather than taken on trust.
    const ext = readFileSync(path.join(ROOT,
        'overlay/scratch-vm/src/extensions/crispstrobe/devices/index.js'), 'utf8');
    const calls = [...ext.matchAll(/b\.setDeviceControl\(/g)].length;
    assert.ok(calls >= 7, `expected the actuator verbs to call it, found ${calls}`);

    for (const file of ['overlay/scratch-gui/src/lib/bw-board/board.js',
        'overlay/scratch-gui/src/lib/bw-circuit-ui/model/circuit.js']) {
        const source = readFileSync(path.join(ROOT, file), 'utf8');
        assert.ok(!/^\s+setDeviceControl\s*\(/m.test(source),
            `${file} now defines setDeviceControl — the LCD may render. Re-measure ` +
            `74-ammeter, update docs/LESSON-REVIEW-WAVE-2.md and the ` +
            `measurement-current-burden hint, then delete this test.`);
    }
});

// ── measurement-resistance → 22-series-parallel ─────────────────────────────
test('measurement-resistance: no bare parallel pair is exposed to the probes', async () => {
    const {board} = await load('22-series-parallel');
    board.advanceTo(50n * MS);
    assert.equal(board.resistance(netId(board, 'r1', 'a'), netId(board, 'r1', 'b')),
        'requires-power-off', 'the ohmmeter refuses while powered, as the lesson says');
    board.setPower(false);
    board.advanceTo(60n * MS);
    near(board.resistance(netId(board, 'r1', 'a'), netId(board, 'r1', 'b')), 470, 1, 'one resistor alone');
    near(board.resistance(netId(board, 'led1', 'anode'), netId(board, 'led1', 'cathode')),
        2010, 60, 'one LED alone, under the 1 mA test current');
    near(board.resistance(netId(board, 'vcc1', 'vcc'), netId(board, 'gnd1', 'gnd')),
        2191.6, 5, 'the whole network, rail to rail');
    // The v1 hint's 470||470 = 235 ohm is nowhere on this bench.
    assert.ok(Math.abs(board.resistance(netId(board, 'vcc1', 'vcc'), netId(board, 'gnd1', 'gnd')) - 235) > 100,
        'if 235 ohm ever appears here, the v1 hint was right and the review is wrong');
    // The two parallel branch tops are the SAME node.
    assert.equal(netId(board, 'r3', 'a'), netId(board, 'r4', 'a'));
});

// ── measurement-continuity → 76-multimeter ──────────────────────────────────
test('measurement-continuity: connected and open pairs are both available', async () => {
    const {board} = await load('76-multimeter');
    board.advanceTo(50n * MS);
    board.setPower(false);
    board.advanceTo(60n * MS);
    near(board.resistance(netId(board, 'sr0', 'a'), netId(board, 'sr0', 'b')), 220, 1,
        'across one segment resistor — connected');
    assert.ok(board.resistance(netId(board, 'vcc1', 'vcc'), netId(board, 'gnd1', 'gnd')) < 1000,
        'rail to rail is a low-resistance path');
    assert.ok(board.resistance(netId(board, 'btn1', 'a'), netId(board, 'btn1', 'b')) > 1e8,
        'the released MODE button is open');
    assert.ok(board.resistance(netId(board, 'mcu1', 'p0.0'), netId(board, 'mcu1', 'p0.1')) > 1e8,
        'two unrelated MCU pins are open');
});

// ── measurement-range-error → 76-multimeter ─────────────────────────────────
test('measurement-range-error: the volts divider is exactly the documented /4', async () => {
    const {board, circuit} = await load('76-multimeter');
    let t = 0n;
    for (const position of [0.2, 0.6, 0.9]) {
        circuit.setControl('vsrc1', position);
        board.advanceTo(t += 20n * MS);
        near(volts(board, 'vsrc1', 'wiper') / volts(board, 'mcu1', 'p1.0'), 4, 0.001,
            `divider ratio at pot ${position}`);
    }
});

test('OPEN DEFECT: the LM358 stage never reaches its documented x46.5', async () => {
    // bw-board's lm358 is a damped integrator that halts once its per-round
    // output step falls below 1 mV, leaving up to 1 mV / G_STEP = 0.667 mV of
    // input error unamplified. On a 2 mV shunt signal that is a third of it, so
    // the realised gain falls short AND depends on the input.
    const {board, circuit} = await load('76-multimeter');
    let t = 0n;
    const gains = [];
    for (const position of [0.25, 0.5, 0.75]) {
        circuit.setControl('load1', position);
        board.advanceTo(t += 20n * MS);
        gains.push(volts(board, 'amp1', '1_out') / volts(board, 'shunt1', 'a'));
    }
    const documented = 1 + 100000 / 2200;   // 46.45
    for (const gain of gains) {
        assert.ok(gain < documented - 5,
            `the amps stage now reaches ${gain.toFixed(2)} against a documented ` +
            `${documented.toFixed(2)}. If the op-amp was fixed, re-measure 76-multimeter, ` +
            `update docs/LESSON-REVIEW-WAVE-2.md and the measurement-range-error ` +
            `hints, then delete this test.`);
    }
    // and it is not even a constant, which is why no single number can be taught
    assert.ok(Math.max(...gains) - Math.min(...gains) > 2,
        `the realised gain has become constant (${gains.map(g => g.toFixed(2))}) — ` +
        `re-check whether a single figure can now be quoted`);
});

// ── measurement-function-generator / scope-* → 49, 50 ───────────────────────
test('measurement-function-generator: the generator is 0-5 V, 5 Vpp, 1 ms, and its controls are live', async () => {
    const {Circuit} = await boot();
    const raw = JSON.parse(readFileSync(path.join(EXAMPLES, circuitPathFor('49-function-generator-sine')), 'utf8'));
    // The declared key must stay `freq`: mna.js reads p.freq and ignores
    // `frequency`, which is how this bench ran at 1 kHz whatever its file said.
    assert.ok('freq' in raw.parts.find(p => p.id === 'fg1').params,
        'the generator declares `freq`; `frequency` is silently ignored by mna.js');

    const shape = data => {
        const circuit = Circuit.fromJSON(data);
        let min = Infinity;
        let max = -Infinity;
        let prev = null;
        let first = null;
        let last = null;
        let crossings = 0;
        for (let i = 1; i <= 2000; i++) {
            circuit.board.advanceTo(BigInt(i * 17) * 1000n);
            const v = volts(circuit.board, 'fg1', 'pos');
            min = Math.min(min, v);
            max = Math.max(max, v);
            const rel = v - 2.5;
            if (prev !== null && prev < 0 && rel >= 0) {
                if (first === null) first = i * 17;
                last = i * 17;
                crossings++;
            }
            prev = rel;
        }
        return {min, max, period: crossings > 1 ? (last - first) / (crossings - 1) : NaN};
    };
    const shipped = shape(structuredClone(raw));
    near(shipped.min, 0, 0.01, 'valley');
    near(shipped.max, 5, 0.01, 'peak');
    near(shipped.period, 1000, 1, 'period in us');

    // The `test` checkpoint says to change one control at a time. All three must move it.
    const quieter = structuredClone(raw);
    quieter.parts.find(p => p.id === 'fg1').params.amplitude = 1.0;
    near(shape(quieter).max - shape(quieter).min, 2.0, 0.02, 'amplitude control is live');
    const slower = structuredClone(raw);
    slower.parts.find(p => p.id === 'fg1').params.freq = 250;
    near(shape(slower).period, 4000, 4, 'frequency control is live');
});

test('measurement-scope-probes-scale: the RC output is small but visible against the input', async () => {
    const {board} = await load('50-rc-scope');
    let iMin = Infinity;
    let iMax = -Infinity;
    let oMin = Infinity;
    let oMax = -Infinity;
    for (let i = 1; i <= 6000; i++) {
        board.advanceTo(BigInt(i * 13) * 1000n);
        if (i * 13 < 60000) continue;          // let the DC transient settle
        const vi = volts(board, 'fg1', 'pos');
        const vo = volts(board, 'c1', 'a');
        iMin = Math.min(iMin, vi); iMax = Math.max(iMax, vi);
        oMin = Math.min(oMin, vo); oMax = Math.max(oMax, vo);
    }
    near(iMax - iMin, 5.0, 0.05, 'input Vpp');
    // EXPECTED.md predicts 5.0 x 0.157 = 0.78 V. This is the number the
    // `frequency` -> `freq` fix restored; before it the bench gave 0.084 V.
    near(oMax - oMin, 0.786, 0.02, 'output Vpp across the capacitor');
    near((oMax + oMin) / 2, 2.5, 0.02, 'the DC offset passes through');
    // At the lesson's suggested 1 V/div the output is under one division, and
    // the scope's V/div is global rather than per channel — recorded because the
    // lesson's own advice warns against a tiny trace without saying so.
    assert.ok((oMax - oMin) < 1.0 && (oMax - oMin) > 0.5,
        'the output sits under one division at 1 V/div');
});

// ── measurement-rc-cursors → 43-rc-timing ───────────────────────────────────
test('measurement-rc-cursors: tau is 1 s and 63.2% is 3.16 V, exactly as taught', async () => {
    const {board} = await load('43-rc-timing');
    const landmarks = {};
    for (const ms of [500, 1000, 2000, 3000]) {
        board.advanceTo(BigInt(ms) * MS);
        landmarks[ms] = volts(board, 'c1', 'a');
    }
    near(landmarks[500], 1.9673, 0.01, '0.5 tau');
    near(landmarks[1000], 3.1606, 0.01, '1 tau — the lesson quotes 3.16 V');
    near(landmarks[2000], 4.3233, 0.01, '2 tau');
    near(landmarks[3000], 4.7511, 0.01, '3 tau');
});

test('OPEN DEFECT: the RC step is one-shot and nothing on the bench repeats it', async () => {
    const {board, circuit} = await load('43-rc-timing');
    assert.deepEqual(circuit.getControls(), [],
        'a control appeared on 43-rc-timing — if the step can now be repeated, ' +
        'update docs/LESSON-REVIEW-WAVE-2.md and the measurement-rc-cursors hint');
    let t = 4000n * MS;
    board.advanceTo(t);
    const charged = volts(board, 'c1', 'a');
    assert.ok(charged > 4.7, 'the capacitor is charged after 4 s');
    // Power off does NOT discharge it: the state freezes and resumes.
    board.setPower(false);
    board.advanceTo(t += 3000n * MS);
    near(volts(board, 'c1', 'a'), charged, 0.05, 'power off freezes rather than discharges');
    board.setPower(true);
    board.advanceTo(t += 1000n * MS);
    assert.ok(volts(board, 'c1', 'a') > charged,
        'power on resumes the charge from where it stopped — there is no second step');
});

test('OPEN DEFECT: the ohmmeter answers differently depending on which probe is which', async () => {
    // board.resistance(a, b) makes `b` the solver reference, and mna.js then
    // SKIPS the gnd-symbol merge for that solve. Probe with ground as B and the
    // circuit is whole; probe with ground as A and it fragments, so a real path
    // reads as open. Found while re-checking the continuity verdict, which is
    // why it is pinned: it changes what a learner sees on the exact measurement
    // measurement-resistance asks for.
    const {board} = await load('22-series-parallel');
    board.advanceTo(50n * MS);
    board.setPower(false);
    board.advanceTo(60n * MS);
    const hot = netId(board, 'vcc1', 'vcc');
    const gnd = netId(board, 'gnd1', 'gnd');
    near(board.resistance(hot, gnd), 2191.6, 5, 'probed hot-to-ground — the real path');
    assert.ok(board.resistance(gnd, hot) > 1e6,
        'the ohmmeter has become symmetric. Re-measure, update ' +
        'docs/LESSON-REVIEW-WAVE-2.md and the measurement-resistance hint, then delete this test.');
});
