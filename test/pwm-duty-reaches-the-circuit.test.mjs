/**
 * A program's PWM duty reaches the circuit: an LED on a PWM pin shows the
 * duty-cycle average, not on/off (task B1, docs/OPEN-TASKS-2026-09-29.md).
 *
 * WHY. Firmware on an emulated timer (avr8js, rp2040js, the STM32F0 tier,
 * emu8051) already published real PWM edges, and bw-board's LED integrator
 * averaged them. Hosts with no timer could only say "this pin is at N %", and
 * the board had nowhere to put it: the stc12 drivers' guarded `b.setPwm` hit no
 * method, and the MakeCode bridge drove `value >= 512`. bw-board's `setPwm`
 * (spec-updates/set-pwm.md) now switches the pin itself.
 *
 * WHAT THIS HOLDS, at the pinned bw-board and bw-circuit-ui:
 *  1. The MakeCode bridge (lib/bw-makecode/pin-drive.js, used by
 *     makecode-sim-pane.jsx) turns `analog write pin P0 to 256` into a 25 %
 *     LED on a real micro:bit board part, where the old rule read 0 mA.
 *  2. Every PWM pin the example corpus declares, on the bench the app loads
 *     for it: an LED that pin drives reads LINEAR in duty (25 % sits a quarter
 *     of the way from its 0 % reading to its 100 % reading, either polarity),
 *     over a denominator, so a walk that finds nothing cannot pass.
 *
 * MEASURED at two pins so it can fail: at bw-board d29c3482 (no setPwm) the
 * bridge falls back to the half-scale level (0.000 mA at 25 %) and part 2 has
 * no method to call; at the B1 pin both hold.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync, readdirSync, existsSync} from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {loadCircuitModel} from '../scripts/lib/polarity-oracle.mjs';
import {driveMakeCodeOutput, MAKECODE_ANALOG_HZ} from '../overlay/scratch-gui/src/lib/bw-makecode/pin-drive.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const BWB = path.join(ROOT, 'node_modules/bw-board/src');
const {BoardImpl} = await import(path.join(BWB, 'board.js'));
(await import(path.join(BWB, 'register-all.js'))).registerAllDevices();
const {Circuit} = await loadCircuitModel(ROOT);
const EX = path.join(ROOT, 'overlay/scratch-gui/examples');

const MS = 1_000_000n;

/** micro:bit P0 → 220 Ω → red LED → the micro:bit's own GND pad (task A1's loop). */
function microbitLed () {
    const board = new BoardImpl(3.3);
    board.setNetlist([
        {id: 'mb', kind: 'microbit', params: {}, terminals: ['p0', 'p1', 'p2', '3v', 'gnd']},
        {id: 'r1', kind: 'resistor', params: {ohms: 220}, terminals: ['a', 'b']},
        {id: 'led1', kind: 'led', params: {vf: 2.0, color: 'red'}, terminals: ['anode', 'cathode']}
    ], [
        {id: 'n1', terminals: [{part: 'mb', terminal: 'p0'}, {part: 'r1', terminal: 'a'}]},
        {id: 'n2', terminals: [{part: 'r1', terminal: 'b'}, {part: 'led1', terminal: 'anode'}]},
        {id: 'n3', terminals: [{part: 'led1', terminal: 'cathode'}, {part: 'mb', terminal: 'gnd'}]}
    ]);
    board.setPower(true);
    return board;
}

/** The LED's average mA after 200 ms of the designer's 50 ms clock. */
function settleMa (board, id) {
    for (let t = 50n; t <= 200n; t += 50n) board.advanceTo(t * MS);
    return board.ledBrightness(id) * 20;
}

test('the MakeCode bridge: analog write pin P0 to N gives N/1023 of full-on', () => {
    assert.equal(MAKECODE_ANALOG_HZ, 50, 'the DAL default analog period is 20 ms');
    const full = (() => {
        const b = microbitLed();
        assert.equal(driveMakeCodeOutput(b, 'p0', {out: true, analog: false, value: 1023}), 'level');
        return settleMa(b, 'led1');
    })();
    assert.ok(full > 4, `full-on through the micro:bit's own GND pad: ${full} mA`);
    for (const value of [0, 256, 512, 768]) {
        const b = microbitLed();
        const used = driveMakeCodeOutput(b, 'p0', {out: true, analog: true, value});
        assert.equal(used, 'pwm', 'an analog write is a PWM, not a level');
        const ma = settleMa(b, 'led1');
        const want = full * value / 1023;
        assert.ok(Math.abs(ma - want) <= 0.005 * full,
            `analog ${value}: ${ma.toFixed(4)} mA, want ${want.toFixed(4)} mA `
            + `(the old half-scale rule gave ${value >= 512 ? full.toFixed(3) : '0.000'} mA)`);
    }
});

test('the MakeCode bridge keeps the old level on a board without setPwm', () => {
    const calls = [];
    const legacy = {setPin: (...a) => calls.push(a)};
    assert.equal(driveMakeCodeOutput(legacy, 'p0', {out: true, analog: true, value: 768}), 'level');
    assert.deepEqual(calls, [['p0', 'pushpull', true]]);
});

// `PIN led1 = D9 PWM`. Recreated per use: a /g regex carries lastIndex.
const pwmRe = () => /^\s*PIN\s+(\w+)\s*=\s*(\S+)\s+PWM\b/gim;

function survey () {
    const rows = [];
    const skipped = new Map();
    const skip = reason => skipped.set(reason, (skipped.get(reason) || 0) + 1);
    for (const id of readdirSync(EX).sort()) {
        const prog = path.join(EX, id, 'program.bw');
        // Every skip is counted, and a denominator is asserted below.
        if (!existsSync(prog)) { skip('no program.bw'); continue; }
        const src = readFileSync(prog, 'utf8');
        const pins = [...src.matchAll(pwmRe())].map(m => m[2]);
        if (!pins.length) { skip('no PWM pin'); continue; }
        const bench = path.join(EX, id, 'circuit.json');
        if (!existsSync(bench)) { skip('no circuit.json'); continue; }
        const load = () => {
            const c = Circuit.fromJSON(JSON.parse(readFileSync(bench, 'utf8')));
            if (!c.board || c.netlistError) return null;
            c.board.setPower(true);
            return c;
        };
        const probe = load();
        if (!probe) { skip('the engine rejected the bench'); continue; }
        const leds = (probe.parts || []).filter(p => p.kind === 'led').map(p => p.id);
        if (!leds.length) { skip('no LED on the bench'); continue; }
        for (const pin of pins) {
            const at = pct => {
                const c = load();
                assert.equal(c.board.setPwm(String(pin), pct), true, `${id}: setPwm(${pin})`);
                for (let t = 50n; t <= 200n; t += 50n) c.board.advanceTo(t * MS);
                return Object.fromEntries(leds.map(l => [l, c.board.ledBrightness(l)]));
            };
            const b0 = at(0);
            const b25 = at(25);
            const b100 = at(100);
            for (const led of leds) {
                // Only an LED this pin actually drives: it must differ 0 % vs 100 %.
                if (Math.abs(b100[led] - b0[led]) < 0.01) continue;
                rows.push({id, pin, led, b0: b0[led], b25: b25[led], b100: b100[led]});
            }
        }
    }
    return {rows, skipped};
}

test('every PWM pin the corpus declares dims its LED linearly with duty', t => {
    const {rows, skipped} = survey();
    t.diagnostic(`${rows.length} PWM-driven LEDs across `
        + `${new Set(rows.map(r => r.id)).size} examples; skips: `
        + `${[...skipped].map(([k, n]) => `${n} ${k}`).join('; ')}`);
    assert.ok(rows.length >= 8,
        `only ${rows.length} PWM-driven LEDs were found — the walk stopped finding them, so a green `
        + `here would mean nothing. Skips: ${[...skipped].map(([k, n]) => `${n} ${k}`).join('; ')}`);
    const bad = rows.filter(r => {
        const want = r.b0 + (r.b100 - r.b0) * 0.25;
        return Math.abs(r.b25 - want) > 0.01 * Math.abs(r.b100 - r.b0);
    });
    assert.deepEqual(bad.map(r => `${r.id} ${r.pin}->${r.led}: 0% ${r.b0.toFixed(4)} `
        + `25% ${r.b25.toFixed(4)} 100% ${r.b100.toFixed(4)}`), [],
    `a 25 % PWM is not a quarter of the way between off and on for these LEDs (${bad.length} of ${rows.length})`);
});
