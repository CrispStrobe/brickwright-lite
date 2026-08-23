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

test('RESOLVED UPSTREAM: 73-voltmeter\'s OLED renders — the verbs and the dispatcher both exist now', async () => {
    // This was an OPEN DEFECT when Wave 2 was reviewed at 3e87340f5, and it was
    // true of that tree: the devices extension declared 37 opcodes and not one
    // oled verb, and board.js had no setDeviceControl. Both landed while the
    // review was in flight — 6f8d11c5c vendored the dispatcher, 802fc1050 added
    // eleven OLED/TFT opcodes — so the assertion is inverted rather than deleted,
    // and now guards the fix instead of the defect.
    const ext = readFileSync(path.join(ROOT,
        'overlay/scratch-vm/src/extensions/crispstrobe/devices/index.js'), 'utf8');
    const declared = [...ext.matchAll(/opcode: *'([a-z0-9_]+)'/g)].map(m => m[1]);
    for (const verb of ['oledclear', 'oledcursor', 'oledprint']) {
        assert.ok(declared.includes(verb), `the devices extension has lost ${verb} again`);
    }
    // Proven by executing the dispatcher, not by looking the symbols up.
    const {board} = await load('73-voltmeter');
    board.advanceTo(50n * MS);
    assert.equal(typeof board.setDeviceControl, 'function');
    for (const [verb, value] of [['clear', 1], ['cursor', [0, 0]], ['print', 'VOLTMETER']]) {
        assert.equal(board.setDeviceControl('oled1', verb, value), true,
            `the ssd1306 model refused ${verb} — 73-voltmeter's screen is dark again`);
    }
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

test('OPEN DEFECT: 74-ammeter\'s LCD stays blank — char_lcd_i2c has no control handler', async () => {
    // Narrower than first reported, and the narrowing matters. The original
    // finding was "setDeviceControl is defined nowhere", true at 3e87340f5 and
    // fixed by 6f8d11c5c. What is left is one device model: of the four display
    // kinds this corpus uses, char_lcd_i2c is the ONLY one without a control()
    // handler — and it is the kind 74-ammeter seats.
    const {getDevice} = await import(path.join(ROOT,
        'overlay/scratch-gui/src/lib/bw-board/devices.js'));
    const {board} = await load('74-ammeter');
    board.advanceTo(50n * MS);
    assert.equal(board.parts.find(p => p.id === 'lcd1').kind, 'char_lcd_i2c');

    for (const kind of ['char_lcd', 'hd44780', 'ssd1306']) {
        assert.equal(typeof getDevice(kind)?.control, 'function',
            `${kind} has lost its control handler`);
    }
    assert.notEqual(typeof getDevice('char_lcd_i2c')?.control, 'function',
        'char_lcd_i2c now has a control handler — re-measure 74-ammeter, update ' +
        'docs/LESSON-REVIEW-WAVE-2.md and the measurement-current-burden hint, ' +
        'then delete this test.');

    // and the consequence, executed rather than inferred
    for (const [verb, value] of [['clear', 1], ['cursor', [0, 0]], ['print', 'I = 9.8 mA']]) {
        assert.equal(board.setDeviceControl('lcd1', verb, value), false,
            `the I2C LCD now accepts ${verb} — the lesson can read its display again`);
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
        2181.8, 40, 'the whole network, rail to rail');
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
    // DIRECTIONAL BY DESIGN, not a bug — the distinction was bw-bundle's and it
    // is the right one. board.resistance(a, b) makes `b` the solver reference,
    // and mna.js then switches ground symbols out of that solve deliberately:
    // "a dangling gnd must not become a shunt path" (mna.js ~354). The
    // consequence is still learner-visible, which is why it stays pinned — a
    // real 2.2 kohm path reads as open if the probes go on the other way round,
    // on the exact measurement measurement-resistance asks for.
    const {board} = await load('22-series-parallel');
    board.advanceTo(50n * MS);
    board.setPower(false);
    board.advanceTo(60n * MS);
    const hot = netId(board, 'vcc1', 'vcc');
    const gnd = netId(board, 'gnd1', 'gnd');
    // 2181.8 +-40, and the tolerance is wide ON PURPOSE. Solving backwards,
    // 470 + (470 + Rd)/3 = 2181.8 puts Rd at about 4.67 kohm per LED: this
    // number is dominated by the LEDs' near-zero-bias resistance, not by the
    // four 470 ohm resistors. It moved 2181.8 -> 2181.8 (0.45%) when the engine
    // gained a C1 blend across the diode knee, which is exactly the term it
    // depends on. A quantity set by an off-state diode model does not deserve
    // a 0.2% pin; +-40 still fails if the network changes and no longer fires
    // on a model refinement.
    near(board.resistance(hot, gnd), 2181.8, 40, 'probed hot-to-ground — the real path');
    assert.ok(board.resistance(gnd, hot) > 1e6,
        'the ohmmeter has become symmetric. Re-measure, update ' +
        'docs/LESSON-REVIEW-WAVE-2.md and the measurement-resistance hint, then delete this test.');
    // A pair with no ground symbol on either side is symmetric, which is what
    // makes this the gnd-merge rule rather than a general solver asymmetry.
    const a = netId(board, 'r1', 'b');
    const b = netId(board, 'r2', 'a');
    near(board.resistance(a, b), board.resistance(b, a), 1, 'a non-ground pair reads the same both ways');
});
