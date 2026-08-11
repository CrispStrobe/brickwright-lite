import {test} from 'node:test';
import assert from 'node:assert/strict';

import {projectSchematic} from '../overlay/scratch-gui/src/lib/bw-circuit-ui/model/schematic-projection.js';

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
