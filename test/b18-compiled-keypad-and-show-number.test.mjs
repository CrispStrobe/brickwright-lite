/**
 * Task B18 of docs/OPEN-TASKS-2026-09-29.md: two compiled-C gaps B16 found,
 * held against what Lite ships (the vendored sb3-creator, the GPL SDCC
 * toolchain CI fetches, emu8051, bw-board's sevenseg8 on the gallery's own
 * 79-a2-sampler benches loaded through bw-circuit-ui).
 *
 * WHAT WAS MEASURED before the fix (Lite 1b47c80dd, sb3-creator c47b9680,
 * stc-compiler bcfe34e2):
 *  1. Keypad. B16 saw stc-compiler's C miss key 6 on stc12/stc15; the sweep
 *     says it missed EVERY key there: 0/15 of keys 1..15 shown on
 *     stc12c5a60s2 and stc15f2k60s2 (16/16 on stc89c52rc). Its setup made
 *     the keypad's rows and columns push-pull on the parts with port modes,
 *     and a push-pull column drives its own 1 against the row pulled low
 *     through the key. sb3-creator's C (what Lite compiles) never did and
 *     read 16/16 on all three; stc-compiler is fixed upstream
 *     (CrispStrobe/stc-compiler, test_keypad.py TestKeypadPortModes). The
 *     sweep below holds Lite's emitter to all sixteen keys on all three
 *     chips -- B16 checked key 6 only.
 *  2. `show number` in both C emitters took SDCC's 16-bit int: 32768 showed
 *     "  -32768", 65536 "       0", 99999 "  -31073", 12345678 "   24910".
 *     The helper now takes a long; the display must equal what the stc12
 *     block shows for the same number on the same bench -- including its
 *     rule for a number wider than the display (the low eight digits, no
 *     minus).
 *
 * FIXED UPSTREAM and adopted with the sb3-creator pin 8472098b, which
 * contains sb3-creator #142 (the long `show_number`); stc-compiler #17
 * carries the same helper and the keypad port-mode fix. The show-number
 * test is red at the previous pin 0e486e0f; the keypad sweep holds Lite's
 * emitter to 16/16 on every chip.
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

/** The example's bench for `chip`, powered, loaded as the designer loads it. */
function bench (chip) {
    const c = Circuit.fromJSON(JSON.parse(fs.readFileSync(path.join(EX, `circuit.${chip}.json`), 'utf8')));
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
let toolchainOnce = null;
function sdccToolchain () {
    toolchainOnce = toolchainOnce || (async () => {
        const packed = JSON.parse(await fs.promises.readFile(new URL('runtime.json', distUrl), 'utf8'));
        return {
            factories: await Promise.all(['cc1', 'sdcc', 'sdas8051', 'sdld'].map(importFactory)),
            runtime: new Map(Object.entries(packed.files).map(([name, data]) =>
                [name, Uint8Array.from(Buffer.from(data, 'base64'))])),
            resolve: name => pathToFileURL(fileURLToPath(new URL(name, distUrl))).href
        };
    })();
    return toolchainOnce;
}

/** Compile `source` for `chip` with Lite's emitter and run it on the chip's bench. */
async function runCompiled (source, device, chip) {
    const creator = new SB3Creator();
    creator.parse(source.replace(/^DEVICE STC89C52RC:/m, `DEVICE ${device}:`));
    const built = await compileWithToolchain(creator.generateC(), {target: chip}, await sdccToolchain());
    assert.equal(built.success, true, `${chip}: ${built.error || ''}`);
    const {default: createEmu8051} = await import(pathToFileURL(path.join(ROOT, 'overlay/scratch-gui/src/lib/emu8051/emu8051.js')));
    const {createEmu8051Adapter} = await import(pathToFileURL(path.join(BWB, 'emu8051-adapter.js')));
    const b = bench(chip);
    const adapter = createEmu8051Adapter(await createEmu8051(), {part: chip, fosc: 11059200, ports: [0, 1, 2, 3]});
    adapter.loadHex(built.hex);
    adapter.attachBoard(b);
    return {b, adapter};
}

test('compiled C: every one of the sixteen keys shows on every chip\'s 79-a2-sampler bench',
    {skip: skipIfNoSdcc, timeout: 300000}, async () => {
        for (const [device, chip] of CHIPS) {
            const {b, adapter} = await runCompiled(PROGRAM, device, chip);
            adapter.runNs(100 * MS);
            assert.equal(shown(b), '       0', `${chip}: show number 0`);
            const seen = [];
            for (let key = 0; key < 16; key++) {
                b.setPartParam('KEYPAD_keys', 'pressed', key);
                adapter.runNs(100 * MS);
                seen.push(shown(b).trim());
                b.setPartParam('KEYPAD_keys', 'pressed', -1);
                adapter.runNs(60 * MS);
            }
            assert.deepEqual(seen, [...Array(16).keys()].map(String), `${chip}: keys 0..15`);
        }
    });

// 16-bit edges, both signs, eight digits, and wider than the display.
const NUMBERS = [32767, 32768, -32768, -32769, 65535, 65536, 99999, 1234567, 12345678,
    -1234567, -9999999, -12345678, 99999999, 100000000, 123456789];
const STEP_MS = 100;

/** What the stc12 block shows for `n` on the same bench (the reference). */
function blockShows (chip, n) {
    const pin = (port, bit) => ({port, bit});
    const b = bench(chip);
    const runtime = stubRuntime({
        device: chip, pins: [], ports: [], tables: [],
        parts: [{name: 'display', type: 'sevenseg8', segPort: 0, selPins: [pin(2, 2), pin(2, 3), pin(2, 4)], claims: [], commonAnode: false}]
    });
    runtime.circuitBoard = b;
    const ext = new (loadExtensionClass('stc12'))(runtime);
    b.advanceTo(30n * BigInt(MS));
    ext.seg_shownum({NUM: n, PART: 'display'});
    b.advanceTo(b.timeNs + 100n * BigInt(MS));
    return shown(b);
}

test('compiled C: show number past 16 bits shows what the stc12 block shows, on every chip',
    {skip: skipIfNoSdcc, timeout: 300000}, async () => {
        const source = [
            'DEVICE STC89C52RC:',
            '  CLOCK 11059200',
            '  PART display = SEVENSEG8 SEGMENTS P0 SELECT P2.2 P2.3 P2.4',
            '',
            '  WHEN started:',
            ...NUMBERS.flatMap(n => [`    show number ${n} on display`, `    wait ${STEP_MS} ms`]),
            '    FOREVER:',
            '      wait 30 ms',
            ''
        ].join('\n');
        const want = NUMBERS.map(n => blockShows('stc12c5a60s2', n));
        // The reference itself, so a block change cannot pass silently.
        assert.deepEqual(want.slice(0, 3), ['   32767', '   32768', '  -32768']);
        assert.equal(want[NUMBERS.indexOf(12345678)], '12345678');
        assert.equal(want[NUMBERS.indexOf(-12345678)], '12345678');
        assert.equal(want[NUMBERS.indexOf(123456789)], '23456789');
        for (const [device, chip] of CHIPS) {
            const {b, adapter} = await runCompiled(source, device, chip);
            // Read the display every 5 ms and keep each reading that held
            // for at least 40 ms: the numbers in the order they were shown,
            // whatever each show_number call cost on this core.
            const got = [];
            let last = null, held = 0;
            for (let t = 0; t < (NUMBERS.length + 1) * STEP_MS * 1.5; t += 5) {
                adapter.runNs(5 * MS);
                const now = shown(b);
                held = now === last ? held + 5 : 0;
                last = now;
                if (held === 40 && now.trim() && got[got.length - 1] !== now) got.push(now);
            }
            assert.deepEqual(got.map((s, i) => `${NUMBERS[i]} -> ${s}`),
                want.map((s, i) => `${NUMBERS[i]} -> ${s}`), `${chip}: compiled C vs the stc12 block`);
        }
    });
