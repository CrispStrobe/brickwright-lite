/**
 * Task B3: a Calliope mini or Circuit Playground Express program seats ITS
 * board in the circuit, the program's pins on the board's pads — and so does a
 * micro:bit program.
 *
 * Before bw-circuit-ui's `makeCodeBoardFor` (infer-seated.js), the designer's
 * seated inference knew the Arduino/Pico/PyBadge boards only: `DEVICE
 * CALLIOPEMINI` / `DEVICE MICROBIT` with `PIN led = P0 OUTPUT` built the
 * generic 8051 `mcu` DIP instead, its pins named `Pundefined.undefined`, so
 * nothing the program declared reached a pad.
 *
 * This drives the whole chain the Circuit tab runs: the program text through
 * Lite's own dialect (sb3-creator) to its `stc` declarations, those through the
 * installed designer's inference, and the result through the installed
 * bw-board — whose micro:bit model is Lite's pin (bw-board #137), so the
 * micro:bit case is measured here rather than skipped as it is upstream. The
 * Lite dialect has no Circuit Playground device (a CPX program is a MakeCode
 * `adafruit` project), so its declarations are given directly.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import {boot} from '../scripts/lesson-bench.mjs';

const ROOT = path.resolve(import.meta.dirname, '..');
const CUI = path.join(ROOT, 'node_modules/bw-circuit-ui/src');
const {Circuit} = await boot();
const {buildSeatedFromDeclarations} = await import(path.join(CUI, 'model/infer-seated.js'));
const {default: SB3Creator} = await import('../overlay/scratch-gui/src/lib/sb3-creator.js');

const fromProgram = device => {
    const stc = new SB3Creator().parse(
        `DEVICE ${device}\nPIN led = P0 OUTPUT\nWHEN flag clicked:\n  set led to 1\n`).stc;
    assert.equal(stc.device, device.toLowerCase(), `the dialect did not keep DEVICE ${device}`);
    assert.deepEqual(stc.pins.map(p => [p.name, p.where]), [['led', 'P0']]);
    return stc;
};

const CASES = [
    ['calliopemini', fromProgram('CALLIOPEMINI'), 'p0'],
    ['microbit', fromProgram('MICROBIT'), 'p0'],
    ['circuit_playground_express',
        {device: 'circuit_playground_express', pins: [{name: 'led', where: 'A1', direction: 'output', activeLow: false}]},
        'a1']
];

for (const [kind, stc, pad] of CASES) {
    test(`${kind}: the program seats the board and ${pad} lights an LED through its own GND pad`, () => {
        const c = new Circuit(5);
        buildSeatedFromDeclarations(c, stc);
        assert.equal(c.netlistError, null, 'the inferred netlist was rejected');
        const board = c.parts.find(p => p.kind === kind);
        assert.ok(board, `no ${kind} part; placed ${c.parts.map(p => p.kind).join(', ')}`);
        assert.ok(!c.parts.some(p => p.kind === 'mcu'), 'fell through to the generic mcu');
        const enginePart = c.board.parts.find(p => p.id === board.id);
        assert.equal(enginePart && enginePart.kind, kind, `${kind} reached bw-board as another kind`);

        const led = c.parts.find(p => p.kind === 'led');
        const r = c.parts.find(p => p.kind === 'resistor');
        const padsOn = (id, t) => c.board.nets
            .find(n => n.terminals.some(x => x.part === id && x.terminal === t))
            .terminals.filter(x => x.part === board.id).map(x => x.terminal);
        assert.deepEqual(padsOn(r.id, 'a'), [pad], 'the resistor hangs on the declared pad');
        assert.deepEqual(padsOn(led.id, 'cathode'), ['gnd'], 'the LED returns to the board GND pad');

        c.board.setPin(pad, 'pushpull', true);
        const iLed = Math.abs(c.board.branchCurrent(led.id, 'anode')) * 1000;
        const iGnd = Math.abs(c.board.branchCurrent(board.id, 'gnd')) * 1000;
        // 3.3 V pad, 1k, red LED: ~1.45 mA, all of it back into the board.
        assert.ok(iLed > 1 && iLed < 2, `LED carries ${iLed.toFixed(3)} mA`);
        assert.ok(Math.abs(iGnd - iLed) < 0.01, `GND pad carries ${iGnd.toFixed(3)} mA, LED ${iLed.toFixed(3)} mA`);
        c.board.setPin(pad, 'pushpull', false);
        assert.equal(c.board.ledBrightness(led.id), 0, 'pad low: dark');
    });
}
