import {test} from 'node:test';
import assert from 'node:assert/strict';
import JSZip from 'jszip';
import {readFileSync} from 'node:fs';
import SB3Creator from '../overlay/scratch-gui/src/lib/sb3-creator.js';


const PROGRAM = `DEVICE SPIKE

GLOBAL dist = 0

WHEN flag clicked:
  start motor A forward
  wait 250 ms
  set dist to spike distance B
  display text "GO"
  stop motor A
`;

const projectFrom = async bytes => JSON.parse(await (await JSZip.loadAsync(bytes))
    .file('project.json').async('string'));

test('vendored SPIKE compiler emits a canonical executable round-trip artifact', async () => {
    // The pin is asserted so a vendor bump cannot pass this file by accident:
    // whoever moves it re-reads the assertions below against the new compiler.
    // 4134b86 -> eb5b286 -> fdd9d7d -> b27da5a -> 73ac0b1 -> c20e434 -> 7952b31 -> ea30b80 -> 0a05c9c -> 414e8ef -> 365bf18 -> 5d17288 -> 42f5d92 -> 2a0280e -> a40a60d (P3 part 2: the 74HC595 shift-out gains a Pico MicroPython driver rendered from the SAME protocol description as the C helper; bwcx's c8791ee not-equal repair is now in-pin as an ancestor; goldens byte-identical, no SPIKE emitter change) (N2c: the i8086 toggle repair needed by two newly reachable wait programs; no SPIKE emitter change) (N2c: literal 8086 C waits; no SPIKE emitter change) (N2b step 2: i8086 numbers are a 16-bit int with refuse-by-name; goldens prove no other family moved a byte; no SPIKE emitter change) (P2 cont.: motor and servo each split into one protocol over per-family bus, byte-identical; no SPIKE emitter change) (0a05c9c P2: shift_out as one protocol over per-family bus, i8086 bus added) (2026-09-06: i8086 pins through the 8255 in generateC; the 64-byte raw-REPL write chunking moved upstream) on 2026-09-05: reader fixes (bitwise/shift,
    // MicroPython runtime skip, body fidelity, condition lift, loops) and one
    // emitter change (the STC driver is emitted for micro:bit/Pico targets so
    // STC pins resolve). Nothing in the SPIKE emitter changed; the artifact
    // assertions below were re-run at each pin.
    assert.equal(JSON.parse(readFileSync(new URL('../vendor-pins.json', import.meta.url)))['sb3-creator'],
        'a40a60d34622fcccf1c6f101e8d1d76278c76f7f');

    const creator = new SB3Creator();
    creator.parse(PROGRAM);
    assert.deepEqual(creator.warnings, []);
    const project = await projectFrom(Buffer.from(await (await creator.generateSB3()).arrayBuffer()));
    // This fixture's first line is `GLOBAL dist = 0`, and until sb3-creator af09a0d that
    // declared a variable literally NAMED "dist = 0" and then created a second, uninitialized
    // "dist" the moment `set dist to ...` used it. Two variables where the program declares one.
    //
    // Asserted here because nothing else in this file or in the browser gate can see it: both
    // check OPCODES and three motor phrases, none of which touch the declaration line. A green
    // SPIKE round trip is not, on its own, evidence that the declaration parses correctly — so
    // the evidence is added rather than assumed.
    const declared = project.targets.flatMap(target => Object.values(target.variables || {}));
    assert.deepEqual(declared, [['dist', 0]],
        'the initializer must set the value, not become part of the variable name');
    assert.deepEqual(project.extensions, ['spikeprime']);
    assert.equal(project.extensionURLs.spikeprime,
        'https://crispstrobe.github.io/extensions/CrispStrobe/legospike_turbowarp_transpile.js');

    const target = project.targets.find(item => Object.values(item.blocks)
        .some(block => block.opcode === 'event_whenflagclicked'));
    const blocks = Object.values(target.blocks);
    const motor = blocks.find(block => block.opcode === 'spikeprime_motorStart');
    assert.deepEqual(motor.fields.DIRECTION, ['1', null],
        'the shipped extension multiplies this field, so a translated label would become NaN');
    const assignment = blocks.find(block => block.opcode === 'data_setvariableto');
    assert.equal(target.blocks[assignment.inputs.VALUE[1]].opcode, 'spikeprime_getDistance');

    const roundTrip = new SB3Creator();
    const decompiled = roundTrip.decompile(project);
    assert.match(decompiled, /start motor A forward/);
    assert.match(decompiled, /set dist to \(spike distance B\)/);
    assert.match(decompiled, /stop motor A/);
});
