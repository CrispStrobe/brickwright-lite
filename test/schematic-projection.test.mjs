import {test} from 'node:test';
import assert from 'node:assert/strict';

import {projectSchematic} from '../overlay/scratch-gui/src/lib/bw-circuit-ui/model/schematic-projection.js';
import {netsFromWires} from '../overlay/scratch-gui/src/lib/bw-circuit-ui/model/schematic-svg.js';

test('schematic shows the implicit ground reference when no GND part is placed', () => {
    const parts = [
        {id: 'B1', kind: 'vsource', params: {volts: 5}, terminals: ['pos', 'neg']},
        {id: 'R1', kind: 'resistor', params: {ohms: 1000}, terminals: ['a', 'b']}
    ];
    const nets = [
        {id: 'net_pos', terminals: [
            {part: 'B1', terminal: 'pos'}, {part: 'R1', terminal: 'a'}
        ]},
        {id: 'net_gnd', terminals: [
            {part: 'B1', terminal: 'neg'}, {part: 'R1', terminal: 'b'}
        ]}
    ];

    const projection = projectSchematic(parts, nets);
    const gnd = projection.symbols.find(symbol => symbol.id === '__implicit_gnd__');
    assert.ok(gnd, 'implicit GND symbol should be projected');
    assert.equal(gnd.kind, 'gnd');
    assert.equal(gnd.pins[0].netId, 'net_gnd');
    assert.ok(projection.wires.some(wire => wire.netId === 'net_gnd'));
});

test('schematic connects board sidecar pins to canonical engine nets', () => {
    const parts = [
        {id: 'U1', kind: 'arduino_uno', params: {}, terminals: ['d13', '5v', 'gnd']},
        {id: 'B1', kind: 'vsource', params: {volts: 5}, terminals: ['pos', 'neg']},
        {id: 'G1', kind: 'gnd', params: {}, terminals: ['gnd']},
    ];
    const nets = [
        {id: 'led_net', terminals: [
            {part: 'U1', terminal: 'D13'}, {part: 'B1', terminal: 'pos'}
        ]},
        {id: 'power_net', terminals: [
            {part: 'U1', terminal: '5V'}, {part: 'B1', terminal: 'neg'}
        ]},
        {id: 'ground_net', terminals: [
            {part: 'U1', terminal: 'GND'}, {part: 'G1', terminal: 'gnd'}
        ]},
    ];

    const projection = projectSchematic(parts, nets);
    const uno = projection.symbols.find(symbol => symbol.id === 'U1');
    assert.ok(uno, 'the board symbol should be projected');
    assert.deepEqual(
        uno.pins.map(pin => pin.netId).sort(),
        ['ground_net', 'led_net', 'power_net'].sort()
    );
});

test('dense parallel ranks wrap into readable column bands', () => {
    const parts = [{id: 'VCC', kind: 'vcc', terminals: ['vcc']}];
    const nets = [];
    for (let i = 0; i < 32; i++) {
        parts.push({id: `led${i}`, kind: 'led', terminals: ['anode', 'cathode']});
        nets.push({id: `n${i}`, terminals: [
            {part: 'VCC', terminal: 'vcc'}, {part: `led${i}`, terminal: 'anode'}
        ]});
    }
    const projected = projectSchematic(parts, nets);
    assert.ok(projected.height < 1200, `dense projection is ${projected.height} units tall`);
    assert.ok(projected.width > 500, 'parallel parts use more than one visual column');
});

test('headless net inference never shorts distinct rails through object-valued board holes', () => {
    const nets = netsFromWires([
        {from: 'VCC', fromTerminal: 'vcc', to: {board: 'bb1', hole: 't+2'}},
        {from: 'GND', fromTerminal: 'gnd', to: {board: 'bb1', hole: 'b-2'}},
        {from: 'R1', fromTerminal: 'b', to: 'D1', toTerminal: 'anode'}
    ]);
    assert.equal(nets.length, 1);
    assert.deepEqual(nets[0].terminals, [
        {part: 'R1', terminal: 'b'}, {part: 'D1', terminal: 'anode'}
    ]);
});
