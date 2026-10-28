/**
 * Milestone 0, one deliberately narrow topology: the runtime fallback for
 * `DEVICE STC12C5A60S2; PIN buzzer1 = P1.0 OUTPUT` must behave like the same
 * breadboard with a buzzer seated explicitly on that pin. This is not a claim
 * about active-low wiring, another MCU surface, or the authored corpus.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import {boot} from '../scripts/lesson-bench.mjs';

const ROOT = path.resolve(import.meta.dirname, '..');
const CUI = path.join(ROOT, 'node_modules/bw-circuit-ui/src');
const {Circuit} = await boot();
const {buildSeatedFromDeclarations} = await import(path.join(CUI, 'model/infer-seated.js'));
const {FOOTPRINTS, computeLeadMap} = await import(path.join(CUI, 'model/footprints.js'));

const PIN = 'P1.0';
const COL = 22;
const declaration = name => ({
    device: 'stc12c5a60s2',
    pins: [{name, port: 1, bit: 0, direction: 'output', activeLow: false}]
});

const inferred = name => {
    const circuit = new Circuit(5);
    const built = buildSeatedFromDeclarations(circuit, declaration(name));
    assert.equal(circuit.netlistError, null, `${name}: inferred netlist was rejected`);
    if (name === 'buzzer1') {
        const buzzer = circuit.parts.find(part => part.kind === 'buzzer');
        assert.ok(buzzer?.seat, 'buzzer1: inference did not seat a buzzer');
        assert.deepEqual(buzzer.seat.leadMap, {a: `a${COL}`, b: `a${COL + 2}`},
            `buzzer1: the bounded topology moved away from columns ${COL}/${COL + 2}; ` +
            'change the stated scope and independent reference rather than following silently');
        assert.ok(built.notes.some(note => note.includes('driven directly, no series resistor')),
            'buzzer1: the intended active-high buzzer inference branch did not execute');
    }
    return circuit;
};

const emptyChassis = () => {
    const circuit = new Circuit(5);
    buildSeatedFromDeclarations(circuit, {device: 'stc12c5a60s2', pins: []});
    const bb = circuit.parts.find(part => part.kind === 'breadboard');
    const mcu = circuit.parts.find(part => part.kind === 'mcu');
    const pinHole = mcu.seat.leadMap[PIN];
    const pinRow = pinHole[0];
    const pinCol = Number(pinHole.slice(1));
    return {circuit, bb, pinTap: `${pinRow <= 'e' ? 'a' : 'g'}${pinCol}`};
};

/** Build an independent reference from the fallback's power/MCU chassis and
 * the footprint library, without invoking its per-pin buzzer branch. */
const explicitBuzzer = () => {
    const {circuit, bb, pinTap} = emptyChassis();
    const buzzer = circuit.addPart('buzzer', {}, 0, 0, 'reference-buzzer');
    assert.ok(circuit.seatPart(buzzer.id, bb.id,
        computeLeadMap(FOOTPRINTS.buzzer, `a${COL}`)), 'reference buzzer did not seat');
    let wires = circuit.holeWires().length;
    circuit.addHoleWire(bb.id, pinTap, `b${COL}`, '#f1c40f');
    assert.equal(circuit.holeWires().length, ++wires, 'reference buzzer did not reach P1.0');
    circuit.addHoleWire(bb.id, `b${COL + 2}`, `t-${COL + 2}`, '#2c3e50');
    assert.equal(circuit.holeWires().length, ++wires, 'reference buzzer did not reach ground');
    assert.equal(circuit.netlistError, null, 'explicit buzzer netlist was rejected');
    return circuit;
};

const netFor = (board, partId, terminal) => board.nets.find(net =>
    net.terminals.some(endpoint => endpoint.part === partId && endpoint.terminal === terminal));

const observe = (circuit, high) => {
    const board = circuit.board;
    const [buzzer] = board.getBuzzers();
    assert.ok(buzzer, 'bench holds no buzzer');
    board.setPower(true);
    board.advanceTo(0n);
    board.setPin(PIN, 'pushpull', high);
    board.advanceTo(1_000_000n);
    const a = netFor(board, buzzer, 'a');
    const b = netFor(board, buzzer, 'b');
    assert.ok(a && b, `${buzzer}: one buzzer terminal is not in a resolved net`);
    return {
        volts: Math.abs(board.nodeVoltage(a.id) - board.nodeVoltage(b.id)),
        amps: Math.abs(board.branchCurrent(buzzer, 'a')),
        tone: board.buzzerTone(buzzer)
    };
};

const close = (actual, expected, tolerance, label) => assert.ok(
    Math.abs(actual - expected) <= tolerance,
    `${label}: ${actual} differs from ${expected} by more than ${tolerance}`);

const assertElectricalState = (actual, reference, high, what) => {
    close(actual.volts, reference.volts, 1e-9, `${what} terminal voltage`);
    close(actual.amps, reference.amps, 1e-12, `${what} branch current`);
    if (high) {
        // The board's push-pull source is 25 ohms and the buzzer is 100 ohms:
        // the real solved divider is 4 V / 40 mA, not an idealised 5 V rail.
        close(actual.volts, 4, 0.01, `${what} HIGH voltage`);
        close(actual.amps, 0.04, 0.0001, `${what} HIGH current`);
        assert.equal(actual.tone.on, true, `${what}: active buzzer did not sound on DC HIGH`);
        close(actual.tone.hz, 2400, 0.5, `${what} active-buzzer tone`);
    } else {
        close(actual.volts, 0, 1e-9, `${what} LOW voltage`);
        close(actual.amps, 0, 1e-12, `${what} LOW current`);
        assert.equal(actual.tone.on, false, `${what}: buzzer sounded on DC LOW`);
    }
};

const driveFrequency = (circuit, hz) => {
    const board = circuit.board;
    const [buzzer] = board.getBuzzers();
    assert.ok(buzzer, `driven at ${hz} Hz, bench holds no buzzer`);
    const halfNs = BigInt(Math.round(1e9 / (2 * hz)));
    board.setPower(true);
    board.advanceTo(0n);
    let now = 0n;
    for (let edge = 0; edge < 60; edge++) {
        board.setPin(PIN, 'pushpull', edge % 2 === 0);
        now += halfNs;
        board.advanceTo(now);
    }
    const tone = board.buzzerTone(buzzer);
    assert.equal(tone.on, true, `${hz} Hz drive left the buzzer silent`);
    close(tone.hz, hz, 0.5, `${hz} Hz behavior`);
    return tone.hz;
};

test('inferred active-high STC12 buzzer equals an explicitly seated buzzer electrically', () => {
    for (const high of [false, true]) {
        const actual = observe(inferred('buzzer1'), high);
        const reference = observe(explicitBuzzer(), high);
        assertElectricalState(actual, reference, high, high ? 'HIGH' : 'LOW');
    }
});

test('inferred and explicit buzzers report the applied 200/1000/4000 Hz behavior', () => {
    for (const hz of [200, 1000, 4000]) {
        close(driveFrequency(inferred('buzzer1'), hz), driveFrequency(explicitBuzzer(), hz),
            1e-9, `${hz} Hz inferred/reference equivalence`);
    }
});

test('negative control: an LED at the same seat cannot satisfy the buzzer oracle', () => {
    const {circuit, bb, pinTap} = emptyChassis();
    const led = circuit.addPart('led', {color: 'red'}, 0, 0, 'mutant-led');
    assert.ok(circuit.seatPart(led.id, bb.id, computeLeadMap(FOOTPRINTS.led, `a${COL}`)),
        'LED mutation did not seat');
    const span = Math.max(...Object.values(FOOTPRINTS.led.leads).map(lead => lead.dCol));
    let wires = circuit.holeWires().length;
    circuit.addHoleWire(bb.id, pinTap, `b${COL}`, '#f1c40f');
    assert.equal(circuit.holeWires().length, ++wires, 'LED mutation did not reach P1.0');
    circuit.addHoleWire(bb.id, `b${COL + span}`, `t-${COL + span}`, '#2c3e50');
    assert.equal(circuit.holeWires().length, ++wires, 'LED mutation did not reach ground');
    assert.equal(circuit.board.getBuzzers().length, 0, 'LED mutation retained a buzzer');
    assert.throws(() => driveFrequency(circuit, 1000), /bench holds no buzzer/);
});

test('connectivity mutation: removing the ground jumper breaks the same oracle', () => {
    const circuit = inferred('buzzer1');
    const before = circuit.holeWires().length;
    const ground = circuit.holeWires().find(wire =>
        (wire.a === `b${COL + 2}` && wire.b === `t-${COL + 2}`) ||
        (wire.b === `b${COL + 2}` && wire.a === `t-${COL + 2}`));
    assert.ok(ground, 'ground-jumper mutation found no target');
    circuit.removeHoleWire(ground.ref);
    assert.equal(circuit.holeWires().length, before - 1, 'ground-jumper mutation was a no-op');
    const reference = observe(explicitBuzzer(), true);
    const mutant = observe(circuit, true);
    assert.ok(mutant.volts < 0.01 && mutant.amps < 1e-9 && mutant.tone.on === false,
        `MUTANT: open buzzer ground did not fail electrically: ${JSON.stringify(mutant)}`);
    assert.throws(() => assertElectricalState(mutant, reference, true,
        'MUTANT: open buzzer ground'), /MUTANT: open buzzer ground/);
});
