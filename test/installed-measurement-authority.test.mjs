import test from 'node:test';
import assert from 'node:assert/strict';
import {BoardImpl} from 'bw-board/board.js';
import {inferNetlist, checkWiring} from 'bw-board/infer-netlist.js';
import {getDevice} from 'bw-board/devices.js';
import {registerAllDevices} from 'bw-board/register-all.js';
import {setEngine} from 'bw-circuit-ui/engine.js';
import {Circuit} from 'bw-circuit-ui/model/circuit.js';
import {importCircuit} from 'bw-circuit-ui/importers/index.js';
import {createMeterState, readMeter} from 'bw-circuit-ui/model/multimeter.js';
import {resolveEndpointNet} from 'bw-circuit-ui/model/instrument-report.js';
import {readScopeCapture} from 'bw-circuit-ui/model/scope-tools.js';

registerAllDevices();
setEngine({BoardImpl, inferNetlist, checkWiring, getDevice});

for (const badNet of ['a', 'b']) {
    test(`installed instantaneous meter refuses invalid raw operand ${badNet} before subtraction`, () => {
        const meter = createMeterState(); meter.probeA.netId = 'a'; meter.probeB.netId = 'b';
        for (const value of [NaN, Infinity, -Infinity, null, undefined, '1', true, false,
            {}, {valueOf: () => 1}]) {
            const reading = readMeter(meter, {board: {}, nodeVoltage: net => net === badNet ? value : 0});
            assert.equal(reading.value, '---', `${badNet}: ${String(value)}`);
            assert.equal(reading.siValue, null); assert.equal(reading.note, 'Cannot read voltage');
        }
    });
}

test('installed instantaneous meter preserves valid operands without bypassing the averaged path', () => {
    const meter = createMeterState(); meter.probeA.netId = 'a'; meter.probeB.netId = 'b';
    for (const [a, b, expected] of [[0, 0, 0], [1, 2, -1], [-2, -3, 1], [1e-15, 0, 1e-15]]) {
        const reading = readMeter(meter, {board: {}, nodeVoltage: net => net === 'a' ? a : b});
        assert.equal(reading.siValue, expected); assert.equal(reading.note, null);
    }
    assert.equal(readMeter(meter, {board: {}, meterVoltage: () => -2,
        nodeVoltage: () => {throw new Error('averaged path must not use raw nodes');}}).siValue, -2);
});

test('installed meter refuses nonfinite and untyped values while preserving true zero and signed values', () => {
    for (const mode of ['voltage', 'current', 'resistance']) {
        const meter = createMeterState(); meter.mode = mode;
        meter.probeA = {netId:'a', partId:'r', terminal:'a'};
        meter.probeB.netId = 'b';
        const c = {board:{}, meterVoltage:()=>NaN, meterCurrent:()=>NaN, resistance:()=>NaN};
        const method = {voltage:'meterVoltage', current:'meterCurrent', resistance:'resistance'}[mode];
        for (const bad of [NaN, Infinity, -Infinity, null, undefined, '1', {}]) {
            c[method] = () => bad;
            const reading = readMeter(meter, c);
            assert.equal(reading.siValue, null, `${mode}: ${String(bad)}`);
            assert.equal(reading.value, '---'); assert.ok(reading.note);
        }
        for (const good of [0, -1, 1]) {
            c[method] = () => good;
            const reading = readMeter(meter, c);
            assert.equal(reading.siValue, good); assert.equal(reading.note, null);
        }
    }
});

test('installed designer and engine refuse a faulted meter and unobserved scope interval across recovery', () => {
    const input = importCircuit('spice', '* live fault\nV1 n 0 1\nVBAD 0 0 0\nR1 n 0 1k\n.end\n');
    assert.deepEqual(input.unmapped || [], []);
    const c = Circuit.fromJSON({parts: input.parts, wires: input.wires});
    assert.equal(c.netlistError, null); c.setPower(true);
    const meter = createMeterState();
    meter.probeA.netId = resolveEndpointNet(c.resolvedNets, 'V1.pos');
    meter.probeB.netId = resolveEndpointNet(c.resolvedNets, 'V1.neg');
    assert.equal(readMeter(meter, c).siValue, 1);
    const h = c.board.addScopeChannel({type: 'voltage', netId: meter.probeA.netId,
        capture: 'sample', sampleRateHz: 1000, depth: 8});
    c.advanceTo(1_000_000n);
    assert.throws(() => c.setControl('VBAD', 5), /inconsistent ideal voltage constraint VBAD/);
    assert.equal(readMeter(meter, c).siValue, null);
    assert.equal(readMeter(meter, c).value, '---');
    // Do not observe the scope during the fault: sticky invalidation must be proactive.
    c.setControl('VBAD', 0);
    assert.throws(() => c.board.getScopeData(h), /scope capture refused:.*solve failed/);
    const refused = readScopeCapture(c.board, h);
    assert.equal(refused.data, null);
    assert.match(refused.reason, /scope capture refused:.*solve failed/);
    assert.equal(readMeter(meter, c).siValue, null);
    const fresh = createMeterState();
    fresh.probeA.netId = meter.probeB.netId; fresh.probeB.netId = meter.probeA.netId;
    assert.equal(readMeter(fresh, c).siValue, -1);
});

test('installed native bench meters expose unavailable state, then genuine nonzero and zero recovery', () => {
    for (const kind of ['voltmeter', 'analog_meter', 'ammeter']) {
        const c = new Circuit(5);
        const a = c.addPart('vsource', {volts: 1}, 0, 0);
        const b = c.addPart('vsource', {volts: 1}, 0, 0);
        const g = c.addPart('gnd', {}, 0, 0), r = c.addPart('resistor', {ohms: 1000}, 0, 0);
        const m = c.addPart(kind, {}, 0, 0);
        c.addWire(a.id, 'pos', b.id, 'pos'); c.addWire(a.id, 'pos', r.id, 'a');
        c.addWire(a.id, 'neg', b.id, 'neg'); c.addWire(a.id, 'neg', g.id, 'gnd');
        c.addWire(r.id, 'b', g.id, 'gnd');
        c.addWire(m.id, 'a', a.id, 'pos'); c.addWire(m.id, 'b', g.id, 'gnd');
        assert.equal(c.netlistError, null); c.setPower(true);
        const state = c.board.getDeviceState(m.id);
        assert.equal(state.available, false); assert.equal(state.reading, null);
        assert.match(state.measurementError, /solve failed/);
        if (kind === 'analog_meter') assert.equal(state.deflection, null);
        c.removePart(b.id);
        const recovered = c.board.getDeviceState(m.id);
        assert.equal(recovered.available, true); assert.equal(recovered.measurementError, null);
        assert.ok(Number.isFinite(recovered.reading) && recovered.reading !== 0);
        c.setControl(a.id, 0);
        assert.equal(c.board.getDeviceState(m.id).available, true);
        assert.equal(c.board.getDeviceState(m.id).reading, 0);
    }
});
