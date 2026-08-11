import {test} from 'node:test';
import assert from 'node:assert/strict';
import {buildSeatedFromDeclarations} from '../overlay/scratch-gui/src/lib/bw-circuit-ui/model/infer-seated.js';

class FakeCircuit {
    constructor() {
        this.parts = [];
        this.taps = [];
    }

    addPart(kind, params = {}) {
        const part = {id: `${kind}-${this.parts.length}`, kind, params};
        this.parts.push(part);
        return part;
    }

    addTapWire(partId, terminal, boardId, hole) {
        this.taps.push({partId, terminal, boardId, hole});
        return {};
    }

    addHoleWire() { return {}; }
    seatPart() { return true; }
}

test('Uno seated inference uses the real board and Arduino header names', () => {
    const circuit = new FakeCircuit();
    buildSeatedFromDeclarations(circuit, {
        device: 'arduino-uno',
        pins: [{name: 'led1', where: 'D13', direction: 'output', activeLow: true}]
    }, {realism: 'none'});
    assert.equal(circuit.parts.some(part => part.kind === 'arduino_uno'), true);
    assert.equal(circuit.parts.some(part => part.kind === 'mcu'), false);
    assert.equal(circuit.taps.some(tap => tap.terminal === 'd13'), true);
    assert.equal(circuit.taps.some(tap => tap.terminal === '5v'), true);
    assert.equal(circuit.taps.some(tap => tap.terminal === 'gnd'), true);
});

test('Nano uses the same ATmega header contract and Pico uses VBUS', () => {
    const nano = new FakeCircuit();
    buildSeatedFromDeclarations(nano, {
        device: 'arduino-nano',
        pins: [{name: 'led1', where: 'D3', direction: 'output', activeLow: false}]
    }, {realism: 'none'});
    assert.equal(nano.parts.some(part => part.kind === 'arduino_nano'), true);
    assert.equal(nano.taps.some(tap => tap.terminal === 'd3'), true);

    const pico = new FakeCircuit();
    buildSeatedFromDeclarations(pico, {
        device: 'pico',
        pins: [{name: 'led1', where: 'GP0', direction: 'output', activeLow: false}]
    }, {realism: 'none'});
    assert.equal(pico.parts.some(part => part.kind === 'pi_pico'), true);
    assert.equal(pico.taps.some(tap => tap.terminal === 'gp0'), true);
    assert.equal(pico.taps.some(tap => tap.terminal === 'vbus'), true);
});
