import {test} from 'node:test';
import assert from 'node:assert/strict';

test('board pin markers preserve Arduino and Pico pin vocabularies', async () => {
    const {default: SB3Creator} = await import(
        '../overlay/scratch-gui/src/lib/sb3-creator.js');
    const creator = new SB3Creator();
    const markers = creator.stcStructMarkers({
        stc: {
            device: 'pico',
            pins: [
                {name: 'led', where: 'GP25', direction: 'output', activeLow: false},
                {name: 'button', where: 'GP14', direction: 'input', activeLow: true},
            ],
        },
    });
    assert.deepEqual(markers, [
        'scratch.device("pico", undefined)',
        'scratch.pin("led", "GP25", "output", 0)',
        'scratch.pin("button", "GP14", "input", 1)',
    ]);
});
