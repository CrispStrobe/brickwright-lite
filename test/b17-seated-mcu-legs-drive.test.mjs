/**
 * Task B17: every seated MCU in the gallery drives its legs after load.
 *
 * The census is derived from the gallery itself: every circuit*.json under
 * overlay/scratch-gui/examples, every part with a breadboard seat whose engine
 * kind is the MCU surface (`mcu`, or a device that follows pin states -- the
 * STC benches, AVR, Pico, STM32 and the machine chips). Each file is loaded as
 * CircuitDesigner.handleLoad loads it (Circuit.fromJSON, then the file's nets
 * or _syncNetlist), through bw-circuit-ui and bw-board as the app injects them.
 *
 * The 16 A2 benches (79-82, one file per chip) store the seated 8051 as
 * `"terminals": []`, and bw-board drives only declared terminals. Up to
 * bw-circuit-ui 5f336b24 fromJSON kept that list, so all 160 wired port legs
 * on them stood in their strips with nothing able to drive them (driven high
 * or low, each net read 0 V), and 624 seated MCUs had undeclared legs. Since
 * bw-circuit-ui #83 (9a1f06e5) fromJSON makes every seated leg a terminal.
 *
 * Two checks per seated MCU, each failing with file, part, kind and legs:
 *   1. every seated leg is a terminal of the engine's part;
 *   2. every GPIO leg wired to another part answers a drive: its net voltage
 *      moves when the leg is driven high, then low. An undeclared leg has no
 *      source at all, so its net does not move by a single microvolt. A net
 *      held by an IDEAL source (vcc, gnd, vsource) cannot move and is the one
 *      exclusion -- counted, and pinned, so it cannot grow unseen.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

import {loadCircuitModel} from '../scripts/lib/polarity-oracle.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const EXAMPLES = path.join(ROOT, 'overlay/scratch-gui/examples');
const {Circuit} = await loadCircuitModel(ROOT);
const {getDevice} = await import(path.join(ROOT, 'node_modules/bw-board/src/devices.js'));

const GPIO = /^(p\d\.\d|d\d+|a\d+|gp\d+|p[a-f]\d+)$/i;
const IDEAL = new Set(['vcc', 'gnd', 'vsource']);

/** Load a gallery file the way the designer does; the console noise of a
 *  rejected netlist is the file's business, the census reads netlistError. */
function load (data) {
    const warn = console.warn;
    console.warn = () => {};
    try {
        const c = Circuit.fromJSON(data);
        if (Array.isArray(data.nets) && data.nets.length) c.syncWithExternalNets(data.nets);
        else c._syncNetlist();
        return c;
    } finally {
        console.warn = warn;
    }
}

/** Every gallery circuit file, as `<example>/<file>` paths. */
function circuitFiles () {
    return fs.readdirSync(EXAMPLES).sort()
        .filter(dir => fs.statSync(path.join(EXAMPLES, dir)).isDirectory())
        .flatMap(dir => fs.readdirSync(path.join(EXAMPLES, dir)).sort()
            .filter(f => /^circuit.*\.json$/.test(f))
            .map(f => `${dir}/${f}`));
}

/**
 * Every MCU-surface part that is seated AFTER load. A stored seat on a board
 * the file does not carry is stale data that fromJSON drops (the circuit-flat
 * twins): those legs stand in no hole, so they are counted, not checked.
 */
function census () {
    const rows = [];
    const staleSeats = [];
    for (const file of circuitFiles()) {
        const data = JSON.parse(fs.readFileSync(path.join(EXAMPLES, file), 'utf8'));
        const stored = (data.parts || []).filter(p => p && p.seat);
        const c = stored.length ? load(data) : null;
        for (const raw of stored) {
            const part = c.parts.find(p => p.id === raw.id);
            const ep = c.board.partMap && c.board.partMap.get(raw.id);
            const model = ep ? getDevice(ep.kind) : null;
            const mcu = ep && (ep.kind === 'mcu' || Boolean(model && model.gpioFollowsPinStates));
            if (mcu && part && part.seat) rows.push({file, raw, seat: part.seat, c});
            else if (mcu) staleSeats.push(file);
        }
    }
    return {rows, staleSeats};
}

const {rows: ROWS, staleSeats: STALE_SEATS} = census();

test('the census finds the gallery\'s seated MCUs, the A2 benches among them', t => {
    // 863 at sb3-creator c47b9680 (B17's measurement; 1036 files store a
    // seat, 173 of them on no board). A floor, so the gallery may grow but
    // the walk cannot silently find nothing.
    assert.ok(ROWS.length >= 850, `seated MCUs found: ${ROWS.length}`);
    // The skipped set, reported: MCUs whose stored seat names a board the file
    // does not carry (173 at B17). They are the flat twins, which carry no
    // breadboard; an authored bench losing its seat at load is a finding.
    t.diagnostic(`seated MCU-surface parts after load: ${ROWS.length}; stored seats dropped at load: ${STALE_SEATS.length}`);
    assert.deepEqual(STALE_SEATS.filter(f => !/\/circuit-flat[.\w-]*\.json$/.test(f)), [],
        'only circuit-flat twins may store a seat that does not survive load');
    const a2 = ROWS.filter(r => /^(79|80|81|82)-/.test(r.file));
    assert.equal(a2.length, 16, 'the 16 A2 benches (4 programs x 4 chip files)');
    assert.ok(a2.every(r => Array.isArray(r.raw.terminals) && r.raw.terminals.length === 0),
        'they still store "terminals": [] -- the shape this test exists for');
});

test('every seated MCU in the gallery declares every leg it is seated on', () => {
    const bad = [];
    for (const {file, raw, seat, c} of ROWS) {
        const ep = c.board.partMap.get(raw.id);
        const have = new Set(ep.terminals.map(t => String(t).toLowerCase()));
        const missing = Object.keys(seat.leadMap).filter(l => !have.has(l.toLowerCase()));
        if (missing.length) bad.push(`${file} ${raw.id} (${raw.kind}): ${missing.join(',')}`);
    }
    assert.deepEqual(bad, [], `seated legs that are not terminals after load:\n${bad.join('\n')}`);
});

test('every wired GPIO leg of a seated MCU answers a drive after load', () => {
    const bad = [];
    const held = [];
    let wired = 0;
    for (const {file, raw, seat, c} of ROWS) {
        const b = c.board;
        if (c.netlistError) {
            bad.push(`${file} ${raw.id} (${raw.kind}): netlist rejected: ${c.netlistError}`);
            continue;
        }
        b.setPower(true);
        for (const leg of Object.keys(seat.leadMap).filter(l => GPIO.test(l))) {
            const key = leg.toLowerCase();
            // Every net naming the leg: before B17 one pin could be TWO nets
            // (the strip's `P2.0` and a wire's `p2.0`, nothing declared to
            // canonicalise them to), and the wired half is the one that counts.
            const nets = b.nets.filter(n => n.terminals.some(t => t.part === raw.id && String(t.terminal).toLowerCase() === key));
            const others = nets.flatMap(n => n.terminals.filter(t => t.part !== raw.id));
            if (!others.length) continue;
            wired++;
            if (others.some(t => IDEAL.has((b.partMap.get(t.part) || {}).kind))) {
                held.push(`${file} ${leg}`);
                continue;
            }
            b.setPin(key, 'pushpull', true);
            const high = nets.map(n => b.nodeVoltage(n.id));
            b.setPin(key, 'pushpull', false);
            const low = nets.map(n => b.nodeVoltage(n.id));
            if (!high.every((v, i) => Math.abs(v - low[i]) > 1e-6)) {
                bad.push(`${file} ${raw.id} (${raw.kind}) ${leg}: ${high.join('/')} V driven high, ${low.join('/')} V driven low`);
            }
        }
    }
    assert.deepEqual(bad, [], `wired seated legs that do not answer a drive:\n${bad.join('\n')}`);
    // Measured at B17: 2750 wired GPIO legs; 4 sit on an ideal source
    // (blinkenrocket-pendant: a vsource on one leg per chip file).
    assert.ok(wired >= 2700, `wired GPIO legs checked: ${wired}`);
    assert.deepEqual(held.map(h => h.split('/')[0]).filter((v, i, a) => a.indexOf(v) === i), ['blinkenrocket-pendant'],
        `legs excused because an ideal source holds their net: ${held.join(', ')}`);
});
