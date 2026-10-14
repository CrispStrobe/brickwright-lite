/**
 * The PWM follow-ups B1 named reach the circuit (task B5,
 * docs/OPEN-TASKS-2026-09-29.md), at the pinned bw-board and bw-circuit-ui and
 * through the bundled extensions exactly as the app loads them.
 *
 *  1. micro:bit+ `set pin P0 analog N %` dims an LED to N % of full-on. It used
 *     to drive `N >= 50` on/off: 25 % read 0 mA, 75 % read full.
 *  2. micro:bit+ `set pin P0 servo angle N` / `continuous servo S %` move a
 *     servo on the micro:bit's pin by CODAL's pulse (500 + N * 2000 / 180 us at
 *     50 Hz). Both were empty stubs.
 *  3. devices `set motor 1 speed to N` turns the motor at the speed N % duty on
 *     its pin gives. bw-board refused the verb ("no simulator action"), and the
 *     block addressed the part by an ordinal the board did not resolve.
 *  4. devices `set servo 1 angle to N` puts pulses on the servo's pin, so the
 *     servo's state says `signal: 'pulse'` (what the canvas face reads) and the
 *     horn reaches N.
 *  5. Both meter readers of the Circuit tab show the 100 ms mean on a PWM net
 *     (a DMM), where the instantaneous solve is on or off; a DC net reads the
 *     same as before.
 *  6. The MakeCode bridge: `pins.servoWritePin(P0, 45)` moves a servo on P0 to
 *     45 degrees, and `pins.analogSetPeriod` sets the carrier. pxsim leaves a
 *     servo pin's value at 0 and the host page reported the value alone, so the
 *     servo got a 0 % PWM (no pulse, horn at its power-up 90) and every analog
 *     pin ran at 50 Hz whatever its period (measured task B5).
 *
 * The stc12 pin blocks are held in test/stc12-vm-pins-reach-the-circuit.test.mjs.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import fs from 'node:fs';
import vm from 'node:vm';
import {fileURLToPath} from 'node:url';

import {loadExtensionClass, stubRuntime} from './helpers/bw-extensions.mjs';
import {loadCircuitModel} from '../scripts/lib/polarity-oracle.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const BWB = path.join(ROOT, 'node_modules/bw-board/src');
const {BoardImpl} = await import(path.join(BWB, 'board.js'));
(await import(path.join(BWB, 'register-all.js'))).registerAllDevices();
const {Circuit} = await loadCircuitModel(ROOT);
const {createMeterState, readMeter} = await import(path.join(ROOT, 'node_modules/bw-circuit-ui/src/model/multimeter.js'));
const {getMeterReading} = await import(path.join(ROOT, 'node_modules/bw-circuit-ui/src/model/meter-reading.js'));

const MS = 1_000_000n;
const {driveMakeCodeOutput} = await import(path.join(ROOT, 'overlay/scratch-gui/src/lib/bw-makecode/pin-drive.js'));

/** micro:bit P0 → 220 Ω → red LED → the micro:bit's own GND pad. */
function microbitLed () {
    const board = new BoardImpl(3.3);
    board.setNetlist([
        {id: 'mb', kind: 'microbit', params: {}, terminals: ['p0', 'p1', 'p2', '3v', 'gnd']},
        {id: 'r1', kind: 'resistor', params: {ohms: 220}, terminals: ['a', 'b']},
        {id: 'led1', kind: 'led', params: {vf: 2.0, color: 'red'}, terminals: ['anode', 'cathode']}
    ], [
        {id: 'n1', terminals: [{part: 'mb', terminal: 'p0'}, {part: 'r1', terminal: 'a'}]},
        {id: 'n2', terminals: [{part: 'r1', terminal: 'b'}, {part: 'led1', terminal: 'anode'}]},
        {id: 'n3', terminals: [{part: 'led1', terminal: 'cathode'}, {part: 'mb', terminal: 'gnd'}]}
    ]);
    board.setPower(true);
    return board;
}

/** micro:bit P0 → servo signal; the servo powered from the micro:bit's 3V/GND pads. */
function microbitServo () {
    const board = new BoardImpl(3.3);
    board.setNetlist([
        {id: 'mb', kind: 'microbit', params: {}, terminals: ['p0', 'p1', 'p2', '3v', 'gnd']},
        {id: 's1', kind: 'servo', params: {}, terminals: ['signal', 'vcc', 'gnd']}
    ], [
        {id: 'n1', terminals: [{part: 'mb', terminal: 'p0'}, {part: 's1', terminal: 'signal'}]},
        {id: 'n2', terminals: [{part: 'mb', terminal: '3v'}, {part: 's1', terminal: 'vcc'}]},
        {id: 'n3', terminals: [{part: 'mb', terminal: 'gnd'}, {part: 's1', terminal: 'gnd'}]}
    ]);
    board.setPower(true);
    return board;
}

const withBoard = (id, board, stc) => {
    const runtime = stubRuntime(stc);
    runtime.circuitBoard = board;
    return new (loadExtensionClass(id))(runtime);
};

function run (board, ms) {
    for (let t = board.timeNs + 10n * MS; t <= BigInt(ms) * MS; t += 10n * MS) board.advanceTo(t);
}

test('micro:bit+ analog write dims the LED to N % of full-on', () => {
    const full = (() => {
        const b = microbitLed();
        withBoard('microbitplus', b).digitalwrite({PIN: '0', LEVEL: '1'});
        run(b, 200);
        return b.ledBrightness('led1') * 20;
    })();
    assert.ok(full > 4, `full-on through the micro:bit's own GND pad: ${full} mA`);
    for (const pct of [0, 25, 50, 75, 100]) {
        const b = microbitLed();
        withBoard('microbitplus', b).analogwrite({PIN: '0', PCT: pct});
        run(b, 200);
        const ma = b.ledBrightness('led1') * 20;
        assert.ok(Math.abs(ma - full * pct / 100) <= 0.005 * full,
            `${pct} %: ${ma.toFixed(4)} mA, want ${(full * pct / 100).toFixed(4)} `
            + `(the old >= 50 % rule gave ${pct >= 50 ? full.toFixed(3) : '0.000'})`);
        if (pct > 0 && pct < 100) assert.equal(b.getPwm('p0').hz, 50, 'the micro:bit\'s 20 ms analog period');
    }
});

test('micro:bit+ servo blocks move a servo by CODAL\'s pulse', () => {
    for (const deg of [0, 45, 90, 135, 180]) {
        const b = microbitServo();
        withBoard('microbitplus', b).servo({PIN: '0', DEG: deg});
        run(b, 1500);
        const st = b.getDeviceState('s1');
        assert.equal(st.signal, 'pulse');
        assert.ok(Math.abs(st.actualAngle - deg) < 0.5, `servo ${deg}: ${st.actualAngle}`);
    }
    for (const [spd, deg] of [[-100, 0], [0, 90], [100, 180]]) {
        const b = microbitServo();
        withBoard('microbitplus', b).servocont({PIN: '0', SPD: spd});
        run(b, 1500);
        assert.ok(Math.abs(b.getDeviceState('s1').actualAngle - deg) < 0.5,
            `continuous ${spd} %: ${b.getDeviceState('s1').actualAngle}`);
    }
});

/** An Arduino bench: D9 → servo signal, D6 → 1 k → NPN → motor → 5 V. */
function arduinoBench () {
    const board = new BoardImpl(5);
    board.setNetlist([
        {id: 'mcu', kind: 'mcu', params: {}, terminals: ['D9', 'D6']},
        {id: 'v', kind: 'vcc', params: {}, terminals: ['vcc']},
        {id: 'g', kind: 'gnd', params: {}, terminals: ['gnd']},
        {id: 'sv', kind: 'servo', params: {}, terminals: ['signal', 'vcc', 'gnd']},
        {id: 'rb', kind: 'resistor', params: {ohms: 1000}, terminals: ['a', 'b']},
        {id: 'q', kind: 'npn', params: {}, terminals: ['base', 'collector', 'emitter']},
        {id: 'm', kind: 'dc_motor', params: {}, terminals: ['a', 'b']}
    ], [
        {id: 'sig', terminals: [{part: 'mcu', terminal: 'D9'}, {part: 'sv', terminal: 'signal'}]},
        {id: 'pin6', terminals: [{part: 'mcu', terminal: 'D6'}, {part: 'rb', terminal: 'a'}]},
        {id: 'base', terminals: [{part: 'rb', terminal: 'b'}, {part: 'q', terminal: 'base'}]},
        {id: 'col', terminals: [{part: 'q', terminal: 'collector'}, {part: 'm', terminal: 'b'}]},
        {id: 'vcc', terminals: [{part: 'v', terminal: 'vcc'}, {part: 'm', terminal: 'a'}, {part: 'sv', terminal: 'vcc'}]},
        {id: 'gnd', terminals: [{part: 'g', terminal: 'gnd'}, {part: 'q', terminal: 'emitter'}, {part: 'sv', terminal: 'gnd'}]}
    ]);
    board.setPower(true);
    return board;
}

test('devices: set motor 1 speed drives the motor pin as a PWM', () => {
    const b = arduinoBench();
    const ext = withBoard('devices', b);
    ext.setmotor({MOTOR: '1', SPEED: 40});
    assert.deepEqual(b.getPwm('D6'), {duty: 0.4, hz: 500}, 'the ordinal resolved to the motor, and its pin to D6');
    assert.ok(!JSON.stringify(b.getWarnings()).includes('no simulator action'), 'not refused');
    run(b, 20);
    assert.ok(b.getDeviceState('m').omega > 0, 'the motor turns');
    assert.ok(ext.motorspeed({MOTOR: '1'}) > 0, 'the speed reporter reads it through the same ordinal');
});

test('devices: set servo 1 angle puts the servo\'s pulses on its pin', () => {
    const b = arduinoBench();
    const ext = withBoard('devices', b);
    ext.setservo({SERVO: '1', ANGLE: 45});
    assert.equal(b.getPwm('D9').hz, 50);
    run(b, 1500);
    const st = b.getDeviceState('sv');
    assert.equal(st.signal, 'pulse', 'the canvas face reads a signal');
    assert.ok(Math.abs(st.actualAngle - 45) < 0.5, `horn at ${st.actualAngle}`);
    assert.equal(ext.servoangle({SERVO: '1'}), st.targetAngle);
});

test('both Circuit-tab meters show the 100 ms mean on a PWM net, and DC as before', () => {
    const c = new Circuit(5.0);
    const mcu = c.addPart('mcu', {pins: ['D9']}, 0, 0);
    const r = c.addPart('resistor', {ohms: 1000}, 0, 0);
    const gnd = c.addPart('gnd', {}, 0, 0);
    const meter = c.addPart('meter', {mode: 'voltage'}, 0, 0);
    const w1 = c.addWire(mcu.id, 'D9', r.id, 'a');
    const w2 = c.addWire(r.id, 'b', gnd.id, 'gnd');
    c.addWire(meter.id, 'probe_a', r.id, 'a');
    c.addWire(meter.id, 'probe_b', gnd.id, 'gnd');
    const m = createMeterState();
    m.probeA = {netId: w1.netId, partId: null, terminal: null};
    m.probeB = {netId: w2.netId, partId: null, terminal: null};

    c.setPin('D9', 'pushpull', true);
    c.advanceTo(20n * MS);
    const vOn = c.nodeVoltage(w1.netId) - c.nodeVoltage(w2.netId);
    assert.equal(readMeter(m, c).siValue, vOn, 'DC: the instantaneous value, first read');
    c.advanceTo(200n * MS);
    assert.equal(readMeter(m, c).siValue, vOn, 'DC: the same after the window fills');
    assert.equal(getMeterReading(meter, c.wires, c).value, vOn.toFixed(3));

    c.board.setPwm('D9', 25);
    const seen = new Set();
    for (let t = 201n; t <= 400n; t++) {
        c.advanceTo(t * MS + 300_000n);
        seen.add(Math.round((c.nodeVoltage(w1.netId) - c.nodeVoltage(w2.netId)) * 1000));
        readMeter(m, c);
        getMeterReading(meter, c.wires, c);
    }
    assert.equal(seen.size, 2, 'the instantaneous solve is on or off');
    const want = 0.25 * vOn;
    assert.ok(Math.abs(readMeter(m, c).siValue - want) < 1e-6, `Instruments meter ${readMeter(m, c).siValue} V, want ${want}`);
    assert.equal(getMeterReading(meter, c.wires, c).value, want.toFixed(3), 'the placed meter part agrees');
});

/** pinReport, exactly as scripts/makecode/host.html defines it. */
function hostPinReport () {
    const host = fs.readFileSync(path.join(ROOT, 'scripts/makecode/host.html'), 'utf8');
    const begin = host.indexOf('// bw-pin-report:begin');
    const end = host.indexOf('// bw-pin-report:end');
    assert.ok(begin >= 0 && end > begin, 'host.html lost its bw-pin-report markers');
    const sb = {};
    vm.runInNewContext(`${host.slice(begin, end)}\nthis.pinReport = pinReport;`, sb);
    return sb.pinReport;
}

/**
 * pxsim's edge-connector Pin, the three writes as pxt-microbit's sim.js has them
 * (static/makecode/microbit/sim/sim.js, class Pin): an analog or servo write
 * makes the pin Analog|Output (2|8); analogWritePin sets the value;
 * analogSetPeriod sets `period`; servoWritePin sets period 20000 and
 * servoAngle and does NOT touch the value.
 */
class SimPin {
    constructor () { this.value = 0; this.period = 0; this.servoAngle = 0; this.mode = 0; }
    analogWritePin (v) { this.mode = 2 | 8; this.value = Math.max(0, Math.min(1023, v >> 0)); }
    analogSetPeriod (us) { this.mode = 2 | 8; this.period = us >> 0; }
    servoWritePin (v) { this.analogSetPeriod(20000); this.servoAngle = Math.max(0, Math.min(180, v >> 0)); }
}

test('the stand-in pin matches pxsim\'s own, where the synced simulator is present', t => {
    const sim = path.join(ROOT, 'packages/scratch-gui/static/makecode/microbit/sim/sim.js');
    if (!fs.existsSync(sim)) {
        t.skip('no synced MakeCode runtime (npm run sync:makecode): the stand-in is not compared with pxsim here');
        return;
    }
    const src = fs.readFileSync(sim, 'utf8');
    for (const line of ['this.analogSetPeriod(20000);', 'this.servoAngle = Math.max(0, Math.min(180, value));',
        'this.value = Math.max(0, Math.min(1023, value));', 'this.period = micros;']) {
        assert.ok(src.includes(line), `pxsim Pin still has: ${line}`);
    }
});

test('MakeCode servoWritePin moves the servo; analogSetPeriod sets the carrier', () => {
    const pinReport = hostPinReport();
    for (const deg of [0, 45, 135]) {
        const pin = new SimPin();
        const prev = {};
        pinReport(pin, prev);                       // the program starts: nothing written
        pin.servoWritePin(deg);
        const r = pinReport(pin, prev);
        assert.equal(r.servo, deg, `the host reports the servo angle: ${JSON.stringify(r)}`);
        const b = microbitServo();
        assert.equal(driveMakeCodeOutput(b, 'p0', r), 'servo');
        run(b, 1500);
        const st = b.getDeviceState('s1');
        assert.equal(st.signal, 'pulse');
        assert.ok(Math.abs(st.actualAngle - deg) < 0.5, `servoWritePin(${deg}): horn at ${st.actualAngle}`);
    }
    // An analog write after the servo makes it a plain PWM pin again, at its period.
    const pin = new SimPin();
    const prev = {};
    pin.servoWritePin(90); pinReport(pin, prev);
    pin.analogSetPeriod(1000); pin.analogWritePin(256);
    const r = pinReport(pin, prev);
    assert.equal(r.servo, undefined, 'a value write ends the servo');
    assert.equal(r.periodUs, 1000);
    const b = microbitLed();
    assert.equal(driveMakeCodeOutput(b, 'p0', r), 'pwm');
    assert.equal(b.getPwm('p0').hz, 1000, 'the carrier is the program\'s period');
    assert.ok(Math.abs(b.getPwm('p0').duty - 256 / 1023) < 1e-12);
});
