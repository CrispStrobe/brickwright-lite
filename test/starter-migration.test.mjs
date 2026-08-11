import {test} from 'node:test';
import assert from 'node:assert/strict';
import {migrateStarterAutosave} from '../overlay/scratch-gui/src/lib/bw-circuit-ui/model/starter-migration.js';

function legacyStarter() {
    return {
        parts: [
            {id: 'bb', kind: 'breadboard'},
            {id: 'bat', kind: 'vsource', params: {variant: '9v', volts: 5}},
            {id: 'r', kind: 'resistor', params: {ohms: 1000}},
            {id: 'led', kind: 'led', declName: 'led1'}
        ],
        wires: [
            {from: {part: 'bat', terminal: 'pos'}, to: {board: 'bb', hole: 't+3'}},
            {from: {part: 'bat', terminal: 'neg'}, to: {board: 'bb', hole: 't-3'}}
        ],
        holeWires: [
            {boardId: 'bb', a: 't+8', b: 'a5'},
            {boardId: 'bb', a: 'a10', b: 't-8'}
        ]
    };
}

test('legacy starter autosave becomes two direct taps', () => {
    const migrated = migrateStarterAutosave(legacyStarter());
    assert.deepEqual(migrated.wires.map(wire => wire.to.hole), ['a5', 'a10']);
    assert.deepEqual(migrated.holeWires, []);
});

test('ordinary circuits are not rewritten', () => {
    const data = legacyStarter();
    data.parts[2].params.ohms = 470;
    assert.strictEqual(migrateStarterAutosave(data), data);
});
