import test from 'node:test';
import assert from 'node:assert/strict';

import {BoardImpl} from '../overlay/scratch-gui/src/lib/bw-board/board.js';
import {registerTier2Parts} from '../overlay/scratch-gui/src/lib/bw-board/devices/tier2-parts.js';
import {registerMiscParts} from '../overlay/scratch-gui/src/lib/bw-board/devices/misc-parts.js';
import {M74C922} from '../overlay/scratch-gui/src/lib/bw-board/m74c922.js';

registerMiscParts();
registerTier2Parts();

const net = (id, ...terminals) => ({
    id,
    terminals: terminals.map(([part, terminal]) => ({part, terminal}))
});
const KEYPAD_TERMINALS = ['r0', 'r1', 'r2', 'r3', 'c0', 'c1', 'c2', 'c3'];
const ENCODER_TERMINALS = [
    'y1', 'y2', 'y3', 'y4', 'osc', 'kbm', 'x4', 'x3', 'vss',
    'x2', 'x1', 'da', 'oeb', 'd', 'c', 'b', 'a', 'vcc'
];

function makeRig ({broken = null, outputBias = null} = {}) {
    const parts = [
        {id: 'vcc', kind: 'vcc', params: {}, terminals: ['vcc']},
        {id: 'gnd', kind: 'gnd', params: {}, terminals: ['gnd']},
        {id: 'keypad', kind: 'keypad_4x4', params: {pressed: -1}, terminals: KEYPAD_TERMINALS},
        {id: 'encoder', kind: '74c922', params: {}, terminals: ENCODER_TERMINALS},
        {id: 'probe', kind: 'mcu', params: {}, terminals: ['oe', 'a', 'b', 'c', 'd', 'da']}
    ];
    const nets = [
        net('vcc', ['vcc', 'vcc'], ['encoder', 'vcc']),
        net('gnd', ['gnd', 'gnd'], ['encoder', 'vss']),
        net('oe', ['probe', 'oe'], ['encoder', 'oeb']),
        ...['a', 'b', 'c', 'd', 'da'].map(pin =>
            net(`out-${pin}`, ['probe', pin], ['encoder', pin]))
    ];

    for (let row = 0; row < 4; row++) {
        if (broken !== `r${row}`) {
            nets.push(net(`row-${row}`, ['keypad', `r${row}`], ['encoder', `y${row + 1}`]));
        }
    }
    for (let column = 0; column < 4; column++) {
        if (broken !== `c${column}`) {
            nets.push(net(`column-${column}`, ['keypad', `c${column}`], ['encoder', `x${column + 1}`]));
        }
    }
    if (outputBias) {
        for (const pin of ['a', 'b', 'c', 'd']) {
            const resistor = `bias-${pin}`;
            parts.push({id: resistor, kind: 'resistor', params: {ohms: 10_000}, terminals: ['a', 'b']});
            nets.find(item => item.id === `out-${pin}`).terminals.push({part: resistor, terminal: 'a'});
            nets.find(item => item.id === outputBias).terminals.push({part: resistor, terminal: 'b'});
        }
    }

    const board = new BoardImpl(5);
    board.setNetlist(parts, nets);
    board.setPin('oe', 'pushpull', false);
    for (const pin of ['a', 'b', 'c', 'd', 'da']) board.setPin(pin, 'input', false);
    return board;
}

const readCode = board => ['a', 'b', 'c', 'd'].reduce((code, pin, bit) =>
    code | (board.readAnalog(pin) > 2.5 ? 1 << bit : 0), 0);

test('vendored 74C922 scans all 16 physical switches and clears DA on release', () => {
    const board = makeRig();
    let now = 0n;
    for (let key = 0; key < 16; key++) {
        board.setPartParam('keypad', 'pressed', key);
        board.advanceTo(now += 1_000_000n);
        assert.equal(readCode(board), key, `row-major switch ${key} appears on DCBA`);
        assert.ok(board.readAnalog('da') > 2.5, `switch ${key} asserts DA`);

        board.setPartParam('keypad', 'pressed', -1);
        board.advanceTo(now += 1_000_000n);
        assert.ok(board.readAnalog('da') < 0.5, `release ${key} clears DA`);
    }
});

test('74C922 logical core preserves two-key rollover order', () => {
    const events = [];
    const encoder = new M74C922({onChange: (code, da) => events.push([code, da])});
    encoder.press(11);
    encoder.press(5);
    encoder.release(11);
    assert.deepEqual(events, [[11, 1], [0, 0], [5, 1]]);
    assert.equal(encoder.registered, 5);
});

test('/OE leaves every A-D pin electrically high-Z without gating DA', () => {
    for (const [biasNet, expectedHigh] of [['vcc', true], ['gnd', false]]) {
        const board = makeRig({outputBias: biasNet});
        board.setPartParam('keypad', 'pressed', 15);
        board.advanceTo(1_000_000n);
        assert.ok(board.readAnalog('da') > 2.5);

        board.setPin('oe', 'pushpull', true);
        board.advanceTo(1_200_000n);
        for (const pin of ['a', 'b', 'c', 'd']) {
            assert.equal(board.readAnalog(pin) > 2.5, expectedHigh,
                `disabled ${pin.toUpperCase()} follows external ${biasNet} bias`);
        }
        assert.ok(board.readAnalog('da') > 2.5, 'DA remains driven while outputs are disabled');
    }
});

test('a broken row or column isolates its switches but leaves the scanner live', () => {
    for (const [broken, isolated, control] of [['r2', 9, 1], ['c3', 7, 6]]) {
        const board = makeRig({broken});
        board.setPartParam('keypad', 'pressed', isolated);
        board.advanceTo(1_000_000n);
        assert.ok(board.readAnalog('da') < 0.5, `${broken} isolates switch ${isolated}`);

        board.setPartParam('keypad', 'pressed', -1);
        board.advanceTo(2_000_000n);
        board.setPartParam('keypad', 'pressed', control);
        board.advanceTo(3_000_000n);
        assert.equal(readCode(board), control, `${broken} still scans neighboring switch ${control}`);
        assert.ok(board.readAnalog('da') > 2.5, `${broken} fixture is not globally disconnected`);
    }
});

test('scheduled scan result does not depend on advanceTo chunking', () => {
    const run = chunks => {
        const board = makeRig();
        board.setPartParam('keypad', 'pressed', 14);
        let now = 0n;
        for (const chunk of chunks) board.advanceTo(now += chunk);
        return [readCode(board), board.readAnalog('da') > 2.5,
            board.getDeviceState('encoder').encoder.registered];
    };

    assert.deepEqual(run([2_000_000n]), run(Array(20).fill(100_000n)));
    assert.deepEqual(run([300_000n, 500_000n, 1_200_000n]), [14, true, 14]);
});
