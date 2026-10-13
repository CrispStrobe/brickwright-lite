/**
 * Task B14 of docs/OPEN-TASKS-2026-09-29.md: B1/B5/B7's two small leftovers,
 * held against what Lite ships (node_modules/bw-board at vendor-pins.json, the
 * bundled devices/stc12 extensions, the vendored sb3-creator, emu8051 and the
 * GPL SDCC toolchain CI fetches).
 *
 * WHAT WAS MEASURED at the previous pins (bw-board 9c8777d5, extensions
 * 6bda206e, sb3-creator b2195604):
 *  1. gearmotor and dc_motor_encoder clamped omega at 0: driven backwards
 *     through an L293D both sat at 0 (the encoder never moved), and the
 *     devices blocks' speed/direction were refused on them ("no simulator
 *     action"); "motor 1" counted dc_motor only. Found on the way: both
 *     stamped the back-EMF inverted (dc_motor's old bug), so a driven one ran
 *     at ~40 % of V/kV and an open one braked itself.
 *  2. stc12 `show number -42` put the minus one digit too far left
 *     ("    - 42") in the block AND in the compiled C (sb3-creator's and
 *     stc-compiler's bw_<part>_show_number); a 7-digit negative lost its sign
 *     in the block.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createRequire} from 'node:module';
import path from 'node:path';
import {fileURLToPath, pathToFileURL} from 'node:url';

import {loadExtensionClass, stubRuntime} from './helpers/bw-extensions.mjs';
import {compileWithToolchain} from '../overlay/scratch-gui/src/lib/sdcc-wasm/compiler.js';
import SB3Creator from '../overlay/scratch-gui/src/lib/sb3-creator.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const BWB = path.join(ROOT, 'node_modules/bw-board/src');
const {BoardImpl} = await import(path.join(BWB, 'board.js'));
(await import(path.join(BWB, 'register-all.js'))).registerAllDevices();

const MS = 1_000_000n;
const T = (part, terminal) => ({part, terminal});
const run = (b, ms) => {
    const end = b.timeNs + BigInt(ms) * MS;
    for (let t = b.timeNs + 10n * MS; t <= end; t += 10n * MS) b.advanceTo(t);
};
const refusals = b => b.getWarnings().map(w => w.message).join('\n');
const withBoard = (id, board, stc = {pins: [], ports: [], parts: [], tables: []}) => {
    const runtime = stubRuntime(stc);
    runtime.circuitBoard = board;
    const Ext = loadExtensionClass(id);
    return new Ext(runtime);
};

const MOTOR = {kV: 0.05, J: 1e-5, windingR: 5};

/** MCU -> L293D channel 1 -> motor (B7's bench); EN P1.4, IN1 P3.4, IN2 P3.5. */
function l293dBench (kind) {
    const terminals = kind === 'dc_motor_encoder' ? ['a', 'b', 'enc_a', 'enc_b'] : ['a', 'b'];
    const b = new BoardImpl(5);
    b.setNetlist([
        {id: 'mcu', kind: 'mcu', params: {}, terminals: ['P1.4', 'P3.4', 'P3.5']},
        {id: 'v', kind: 'vcc', params: {}, terminals: ['vcc']},
        {id: 'g', kind: 'gnd', params: {}, terminals: ['gnd']},
        {id: 'u1', kind: 'h_bridge', params: {}, terminals: ['vcc', 'gnd', 'en1', 'in1', 'in2', 'out1', 'out2', 'en2', 'in3', 'in4', 'out3', 'out4']},
        {id: 'm1', kind, params: {...MOTOR}, terminals}
    ], [
        {id: 'nv', terminals: [T('v', 'vcc'), T('u1', 'vcc')]},
        {id: 'ng', terminals: [T('g', 'gnd'), T('u1', 'gnd')]},
        {id: 'nen', terminals: [T('mcu', 'P1.4'), T('u1', 'en1')]},
        {id: 'ni1', terminals: [T('mcu', 'P3.4'), T('u1', 'in1')]},
        {id: 'ni2', terminals: [T('mcu', 'P3.5'), T('u1', 'in2')]},
        {id: 'na', terminals: [T('u1', 'out1'), T('m1', 'a')]},
        {id: 'nb', terminals: [T('u1', 'out2'), T('m1', 'b')]}
    ]);
    b.setPower(true);
    return b;
}

for (const kind of ['gearmotor', 'dc_motor_encoder']) {
    test(`devices: "motor 1" turns a ${kind} both ways through an L293D`, () => {
        const b = l293dBench(kind);
        const ext = withBoard('devices', b);
        ext.setmotor({MOTOR: '1', SPEED: 100});
        ext.setdirection({MOTOR: '1', DIR: 'forward'});
        run(b, 200);
        assert.equal(ext.motordirection({MOTOR: '1'}), 'forward');
        const forward = ext.motorspeed({MOTOR: '1'});
        // V/kV = 2.2 V / 0.05 = 44 rad/s across the bridge's 3.6 V / 1.4 V outputs.
        assert.ok(forward > 40 && forward < 44.5, `forward speed ${forward} (inverted EMF settled at ~17.5)`);
        ext.setdirection({MOTOR: '1', DIR: 'reverse'});
        run(b, 400);
        assert.equal(ext.motordirection({MOTOR: '1'}), 'reverse', `velocity ${b.getDeviceState('m1').velocity}`);
        assert.ok(Math.abs(ext.motorspeed({MOTOR: '1'}) - forward) < 0.01 * forward, 'the same speed both ways');
        if (kind === 'dc_motor_encoder') {
            assert.ok(b.getDeviceState('m1').count < 0, `the encoder counts down (${b.getDeviceState('m1').count})`);
        }
        assert.doesNotMatch(refusals(b), /m1/, 'nothing refused');
    });
}

/** The Prechin A2's 7-segment wiring: segments P0, 74HC138 select P2.2-P2.4. */
function a2Display () {
    const seg = ['seg_a', 'seg_b', 'seg_c', 'seg_d', 'seg_e', 'seg_f', 'seg_g', 'seg_dp'];
    const b = new BoardImpl(5);
    b.setNetlist([
        {id: 'v', kind: 'vcc', params: {}, terminals: ['vcc']},
        {id: 'g', kind: 'gnd', params: {}, terminals: ['gnd']},
        {id: 'mcu', kind: 'mcu', params: {}, terminals: [...seg.map((_, i) => `P0.${i}`), 'P2.2', 'P2.3', 'P2.4']},
        {id: 'sevenseg', kind: 'sevenseg8', params: {}, terminals: ['vcc', 'gnd', ...seg, 'sel_a', 'sel_b', 'sel_c']}
    ], [
        {id: 'nv', terminals: [T('v', 'vcc'), T('sevenseg', 'vcc')]},
        {id: 'ng', terminals: [T('g', 'gnd'), T('sevenseg', 'gnd')]},
        ...seg.map((t, i) => ({id: `s${i}`, terminals: [T('mcu', `P0.${i}`), T('sevenseg', t)]})),
        ...['sel_a', 'sel_b', 'sel_c'].map((t, i) => ({id: `sel${i}`, terminals: [T('mcu', `P2.${i + 2}`), T('sevenseg', t)]}))
    ]);
    b.setPower(true);
    return b;
}
const pin = (port, bit) => ({port, bit});
const A2_STC = () => ({
    device: 'stc89c52rc', pins: [], tables: [], ports: [],
    parts: [{name: 'display', type: 'sevenseg8', segPort: 0, selPins: [pin(2, 2), pin(2, 3), pin(2, 4)], claims: [], commonAnode: false}]
});

const CASES = [[-42, '     -42'], [42, '      42'], [-7, '      -7'], [-32768, '  -32768'], [0, '       0']];

test('stc12 block: show number puts the minus directly before the number on the A2 display', () => {
    for (const [n, want] of [...CASES, [-1234567, '-1234567']]) {
        const b = a2Display();
        withBoard('stc12', b, A2_STC()).seg_shownum({NUM: n, PART: 'display'});
        // sevenseg8 shows 0x40 as its raw byte; the face draws segment g.
        assert.equal(b.getDeviceState('sevenseg').text.map(c => (c === '0x40' ? '-' : c)).join(''), want, `show number ${n}`);
    }
});

// ── The compiled C, on the same wiring ─────────────────────────────────────
const distUrl = new URL('../overlay/scratch-gui/src/lib/sdcc-wasm/dist/', import.meta.url);
const skipIfNoSdcc = fs.existsSync(fileURLToPath(new URL('sdcc.js', distUrl)))
    ? false
    : 'the GPL SDCC toolchain is not present (not tracked here; fetched from its own origin)';
const require = createRequire(import.meta.url);
async function importFactory (name) {
    const source = await fs.promises.readFile(new URL(`${name}.js`, distUrl), 'utf8');
    const module = {exports: {}};
    const filename = fileURLToPath(new URL(`${name}.js`, distUrl));
    Function('module', 'exports', 'require', '__filename', '__dirname',
        source.replace(/export default createSDCC;\s*$/, ''))(
        module, module.exports, require, filename, path.dirname(filename));
    return module.exports;
}
async function sdccToolchain () {
    const packed = JSON.parse(await fs.promises.readFile(new URL('runtime.json', distUrl), 'utf8'));
    return {
        factories: await Promise.all(['cc1', 'sdcc', 'sdas8051', 'sdld'].map(importFactory)),
        runtime: new Map(Object.entries(packed.files).map(([name, data]) =>
            [name, Uint8Array.from(Buffer.from(data, 'base64'))])),
        resolve: name => pathToFileURL(fileURLToPath(new URL(name, distUrl))).href
    };
}

const FONT = [0x3f, 0x06, 0x5b, 0x4f, 0x66, 0x6d, 0x7d, 0x07, 0x7f, 0x6f];
const glyph = b => (b === 0 ? ' ' : b === 0x40 ? '-' : FONT.includes(b) ? String(FONT.indexOf(b)) : '?');

/**
 * What the display shows, decoded from the firmware's own pin writes: per
 * select address, the segment byte held for at least 200 us (the ISR blanks P0
 * for microseconds around each switch and holds each digit for 1 ms).
 * sevenseg8 is not read here: it latches at the select change, which this
 * ISR's order (blank, select, segments) makes the blank -- a gap B14 names.
 */
function scanned (writes, fromMs) {
    const lv = {};
    const frame = new Array(8).fill(null);
    let t0 = null;
    for (const e of writes) {
        if (t0 !== null && e.t !== t0 && e.t - t0 >= 200_000 && t0 >= fromMs * 1e6) {
            let seg = 0;
            for (let i = 0; i < 8; i++) seg |= (lv[`P0.${i}`] ? 1 : 0) << i;
            frame[(lv['P2.2'] ? 1 : 0) | (lv['P2.3'] ? 2 : 0) | (lv['P2.4'] ? 4 : 0)] = seg;
        }
        lv[e.pin] = e.high;
        t0 = e.t;
    }
    return frame.map(b => (b === null ? '_' : glyph(b))).join('');
}

test('compiled C: show number puts the minus directly before the number, scanned onto the A2 wiring',
    {skip: skipIfNoSdcc, timeout: 300000}, async () => {
        const toolchain = await sdccToolchain();
        const {default: createEmu8051} = await import(pathToFileURL(path.join(ROOT, 'overlay/scratch-gui/src/lib/emu8051/emu8051.js')));
        const {createEmu8051Adapter} = await import(pathToFileURL(path.join(BWB, 'emu8051-adapter.js')));
        for (const [n, want] of CASES) {
            const creator = new SB3Creator();
            creator.parse(`DEVICE STC89C52RC:\n  CLOCK 11059200\n  PART display = SEVENSEG8 SEGMENTS P0 SELECT P2.2 P2.3 P2.4\n\n  WHEN started:\n    show number ${n} on display\n`);
            const built = await compileWithToolchain(creator.generateC(), {target: 'stc89c52rc'}, toolchain);
            assert.equal(built.success, true, `${n}: ${built.error || ''}`);
            const board = a2Display();
            const writes = [];
            const setPin = board.setPin.bind(board);
            board.setPin = (p, mode, high) => {
                writes.push({t: Number(board.timeNs), pin: String(p).toUpperCase().replace(/^P(\d)\.(\d)$/, 'P$1.$2'), high: !!high});
                return setPin(p, mode, high);
            };
            const adapter = createEmu8051Adapter(await createEmu8051(), {part: 'stc89c52rc', fosc: 11059200, ports: [0, 1, 2, 3]});
            adapter.loadHex(built.hex);
            adapter.attachBoard(board);
            adapter.runNs(60_000_000);
            assert.ok(writes.length > 100, `${n}: the ISR scans (${writes.length} writes)`);
            assert.equal(scanned(writes, 20), want, `show number ${n}`);
        }
    });
