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
