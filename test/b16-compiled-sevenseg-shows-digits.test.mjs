/**
 * Task B16: a compiled 7-segment program shows its digits in the circuit view.
 *
 * The gallery's 79-a2-sampler (keypad + the A2's 8-digit display, one bench
 * per chip) runs here as the designer runs it: the program compiled to C by
 * the vendored sb3-creator, built by SDCC, executed by emu8051 on the
 * example's own circuit.<chip>.json loaded through bw-circuit-ui's Circuit
 * model -- and what the display SHOWS is read from bw-board's sevenseg8 state,
 * the bytes the canvas draws.
 *
 * The C's Timer-0 ISR blanks the segments, sets the 74HC138 address, then
 * writes the digit's segments (sb3-creator `_cSevenSegScan`, stc-compiler
 * stc_pseudocode.py). Up to bw-board 7254f240 sevenseg8 latched a digit at
 * the instant the address changed, so it latched the blank: every chip showed
 * "        " (measured 2026-10-13; B14's test decoded the pin trace instead).
 * Since B16 sevenseg8 integrates each segment's on-time over a 20 ms
 * persistence window, lit at >= 1/32 of it -- and the stc12 block path, which
 * pushes a whole frame at one instant of board time, shows the same digits.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createRequire} from 'node:module';
import path from 'node:path';
import {fileURLToPath, pathToFileURL} from 'node:url';

import {loadExtensionClass, stubRuntime} from './helpers/bw-extensions.mjs';
import {loadCircuitModel} from '../scripts/lib/polarity-oracle.mjs';
import {compileWithToolchain} from '../overlay/scratch-gui/src/lib/sdcc-wasm/compiler.js';
import SB3Creator from '../overlay/scratch-gui/src/lib/sb3-creator.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const BWB = path.join(ROOT, 'node_modules/bw-board/src');
const {Circuit} = await loadCircuitModel(ROOT);
const EX = path.join(ROOT, 'overlay/scratch-gui/examples/79-a2-sampler');
const PROGRAM = fs.readFileSync(path.join(EX, 'program.bw'), 'utf8');
const CHIPS = [['STC89C52RC', 'stc89c52rc'], ['STC12C5A60S2', 'stc12c5a60s2'], ['STC15F2K60S2', 'stc15f2k60s2']];
const MS = 1_000_000;

/**
 * The example's bench for `chip`, powered. Its MCU is SEATED on the
 * breadboard and declares no terminals (`"terminals": []`, as 33 seated MCUs
 * in the gallery do), and bw-board drives only an MCU's declared terminals --
 * so the seat's legs are declared here, the pins the breadboard already wires.
 */
function bench (chip) {
    const c = Circuit.fromJSON(JSON.parse(fs.readFileSync(path.join(EX, `circuit.${chip}.json`), 'utf8')));
    const mcu = c.parts.find(p => p.id === 'MCU');
    assert.ok(mcu && mcu.seat, `${chip}: the bench seats its MCU`);
    mcu.terminals = Object.keys(mcu.seat.leadMap);
    c._syncNetlist();
    assert.ok(c.board && !c.netlistError, `${chip}: the bench loads (${c.netlistError || ''})`);
    c.board.setPower(true);
    return c.board;
}
/** What the display shows; the minus (segment g alone) as '-'. */
const shown = b => b.getDeviceState('DISP_display').text.map(ch => (ch === '0x40' ? '-' : ch)).join('');

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

test('compiled C: the 79-a2-sampler shows its digits on every chip\'s bench in the circuit view',
    {skip: skipIfNoSdcc, timeout: 300000}, async () => {
        const toolchain = await sdccToolchain();
        const {default: createEmu8051} = await import(pathToFileURL(path.join(ROOT, 'overlay/scratch-gui/src/lib/emu8051/emu8051.js')));
        const {createEmu8051Adapter} = await import(pathToFileURL(path.join(BWB, 'emu8051-adapter.js')));
        for (const [device, chip] of CHIPS) {
            const creator = new SB3Creator();
            creator.parse(PROGRAM.replace(/^DEVICE STC89C52RC:/m, `DEVICE ${device}:`));
            const built = await compileWithToolchain(creator.generateC(), {target: chip}, toolchain);
            assert.equal(built.success, true, `${chip}: ${built.error || ''}`);
            const b = bench(chip);
            const adapter = createEmu8051Adapter(await createEmu8051(), {part: chip, fosc: 11059200, ports: [0, 1, 2, 3]});
            adapter.loadHex(built.hex);
            adapter.attachBoard(b);
            adapter.runNs(100 * MS);
            // `show number 0`: the ISR scans all eight digits, seven of them blank.
            assert.equal(shown(b), '       0', `${chip}: show number 0`);
            b.setPartParam('KEYPAD_keys', 'pressed', 6);
            adapter.runNs(100 * MS);
            assert.equal(shown(b), '       6', `${chip}: key 6 is shown`);
            // Every lit segment is scanned, not held: 1 ms of each 8 ms frame.
            const st = b.getDeviceState('DISP_display');
            const on = st.segDuty[7 * 8 + 2]; // digit 7, segment c of "6"
            assert.ok(on > 0.09 && on < 0.15, `${chip}: digit 7 segment c on ${on} of the window`);
            b.setPartParam('KEYPAD_keys', 'pressed', -1);
        }
    });

test('stc12 blocks: the same program\'s display shows the same digits on the same bench', () => {
    const pin = (port, bit) => ({port, bit});
    for (const [, chip] of CHIPS) {
        const b = bench(chip);
        const runtime = stubRuntime({
            device: chip, pins: [], ports: [], tables: [],
            parts: [{name: 'display', type: 'sevenseg8', segPort: 0, selPins: [pin(2, 2), pin(2, 3), pin(2, 4)], claims: [], commonAnode: false}]
        });
        runtime.circuitBoard = b;
        const ext = new (loadExtensionClass('stc12'))(runtime);
        b.advanceTo(30n * BigInt(MS));
        ext.seg_shownum({NUM: 0, PART: 'display'});
        b.advanceTo(b.timeNs + 100n * BigInt(MS));
        assert.equal(shown(b), '       0', `${chip}: show number 0`);
        ext.seg_shownum({NUM: 6, PART: 'display'});
        b.advanceTo(b.timeNs + 100n * BigInt(MS));
        assert.equal(shown(b), '       6', `${chip}: show number 6`);
    }
});
