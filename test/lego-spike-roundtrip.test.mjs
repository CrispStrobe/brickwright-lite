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
    // 4134b86 -> eb5b286 -> fdd9d7d -> b27da5a -> 73ac0b1 -> c20e434 -> 7952b31 -> ea30b80 -> 0a05c9c -> 414e8ef -> 365bf18 -> 5d17288 -> 42f5d92 -> 2a0280e -> d0b9e78 -> 01ed06a -> c8791ee -> a40a60d (P3/P2 shiftOut MicroPython driver; no SPIKE emitter change) (general not-equal parser repair and i8086 commented-zero refusal; no SPIKE emitter change) (N2d: SmallerC-safe i8086 minimum-int spelling; no SPIKE emitter change) (N2d: strict numeric-only i8086 C print; no SPIKE emitter change) (N2c: the i8086 toggle repair needed by two newly reachable wait programs; no SPIKE emitter change) (N2c: literal 8086 C waits; no SPIKE emitter change) (N2b step 2: i8086 numbers are a 16-bit int with refuse-by-name; goldens prove no other family moved a byte; no SPIKE emitter change) (P2 cont.: motor and servo each split into one protocol over per-family bus, byte-identical; no SPIKE emitter change) (0a05c9c P2: shift_out as one protocol over per-family bus, i8086 bus added) (2026-09-06: i8086 pins through the 8255 in generateC; the 64-byte raw-REPL write chunking moved upstream) on 2026-09-05: reader fixes (bitwise/shift,
    // MicroPython runtime skip, body fidelity, condition lift, loops) and one
    // emitter change (the STC driver is emitted for micro:bit/Pico targets so
    // STC pins resolve). Nothing in the SPIKE emitter changed; the artifact
    // assertions below were re-run at each pin.
    // -> 0a0e82e on 2026-09-08: the i8086-blink gallery example vendored, and
    // sb3-creator's tone work (setTone/tone_set, emitted AVR-only) rode the shared
    // pin. Neither touches the SPIKE emitter; this artifact is byte-identical and
    // was re-run at the new pin.
    // -> 6bda3b3 on 2026-09-08: the LED-polarity correction. This bump is the
    // rare one that carries NO emitter risk at all, and that is measured rather
    // than assumed: `git diff --name-only 0a0e82e 6bda3b3 -- src/` is EMPTY, so
    // every vendored `src/lib/sb3-creator*.js` file is byte-identical across it
    // and the sync reports `ok` for all of them. What moves is 135
    // `examples/**/circuit*.json` (69 benches re-wired to their target's output
    // polarity plus their 66 board-free twins), three generator scripts and one
    // manifest, none of which this file reads. The artifact assertions below
    // were re-run at the new pin regardless.
    // -> 8c17dfa on 2026-09-08: N2e adds bounded numeric lists only to the
    // i8086 C route. The SPIKE emitter is unchanged; this artifact is re-run
    // here rather than inferred from that scope statement.
    // -> e3ecc205e on 2026-09-08: P3 part 3 adds servo and DC-motor MicroPython
    // drivers for the Pico (upstream PR #11). MEASURED, not assumed: the range
    // `8c17dfa..e3ecc205e` touches ONE source file and ZERO examples, so this is
    // the rare pin bump with no gallery churn — no re-sync, no polarity or
    // flat-twin re-derivation. The servo/motor formula and clamp are rendered
    // from one shared body with the C arm, and the MicroPython arm is asserted
    // to within one `duty_u16` LSB of it rather than bit-exact, because the two
    // APIs have different resolutions over the 20 ms frame. Nothing in the SPIKE
    // emitter changed; the artifact assertions below were re-run at the new pin.
    // -> 5a0d559 on 2026-09-08: N2f adds deterministic bounded random and
    // direct-literal output to the i8086 C route. The SPIKE emitter is
    // unchanged; this artifact is re-run here rather than inferred from scope.
    // -> 33ab265 on 2026-09-08: 8051 debug builds make their scheduler state
    // and deadline volatile so SDCC must give the debugger linked RAM symbols;
    // release 8051 output and every other target retain their prior policy.
    // The SPIKE artifact below was re-run and remains byte-for-byte unchanged.
    // -> 9173ca75 on 2026-09-08: the active-low lesson repair and its follow-up
    // measurement corrections touch zero files under src/ through c593574;
    // the later range only converges the already-present examples catalogue
    // and adds upstream tests. The compiler emitter therefore does not move,
    // while this assertion still forces the round-trip artifact at the pin.
    // -> 2be3fe2b on 2026-09-20: this range DOES move the emitter — the SPIKE
    // consolidation rewrites `runtimeRegistry.generated.js` and
    // `spikeprimeDialect.js` (179 lines across two files under src/), which is
    // exactly why this assertion forces the round-trip artifact to be re-run at
    // the new pin rather than carried over. The rest of the range is the
    // examples work: 26 benches rebuilt from their programs, and three new
    // Codex trails for the digital and MCU domain.
    // -> 06a78ba2 on 2026-09-20: adds `PART <name> = SERVO|MOTOR <channel>` and
    // resolves a declared name at all seven actuator operand sites, so the
    // emitter changes again and the artifact is re-run, not carried over.
    // -> 8e1f4d11 on 2026-09-21: `git diff --name-only 06a78ba2 8e1f4d11 -- src/`
    // names ONE file, sb3Creator.js, and the change is the missing half of that
    // same feature: the DECOMPILER had no branch for the new part types, so it
    // fell through to the 74HC595 writer and threw on p.data for every retarget
    // of a program with a declared servo. The SPIKE emitter is untouched by it,
    // and the artifact below was re-run at the new pin rather than carried over.
    // The rest of the range is example data and gate repairs.
    // -> 830002ca on 2026-09-21: sb3-creator's CI siblings move to the engine
    // THIS APP ALREADY SHIPS — bw-board 1,409 commits forward, bw-circuit-ui 337
    // — and 37 numbers across its gallery are re-derived because an LED is now
    // solved on its junction instead of clamped at a knee. MEASURED, not
    // inferred: `git diff --name-only 8e1f4d11 830002ca -- src/` is EMPTY, so
    // every vendored compiler file is byte-identical across the range and the
    // SPIKE emitter cannot have moved. The artifact below is re-run at the new
    // pin regardless, which is the rule this assertion exists to enforce.
    // -> b7bfd2b71 on 2026-09-21: this range DOES move the emitter, and by
    // exactly one thing. MEASURED, not inferred: `git diff 830002ca b7bfd2b
    // -- src/` names ONE file, sb3Creator.js, and its 31 changed lines
    // content-hash identical to the escape fix alone (sb3-creator#21), so
    // nothing else in the range touched a vendored byte -- #17, #18, #19 and
    // #20 are gate and example work. What the fix changes: `display text
    // "..."` was parsed with `"([^"]*)"`, which stops at the first quote, so
    // a line carrying an escaped quote failed its own rule and fell through
    // to the GENERIC display handler -- a SPIKE program silently got a
    // micro:bit block, with no warning. The quieter half doubled a backslash
    // in the stored value, so `C:\path` was saved as `C:\\path`: corruption
    // rather than a parse failure, on every save. The decompiler now escapes
    // what it emits so the round trip closes. The artifact assertions below
    // were re-run at this pin, and test/transpiler-codegen.test.mjs now
    // asserts that no SPIKE program emits another device's block -- the
    // sentinel that was standing for this defect fired on the bump and was
    // replaced by that positive assertion.
    // PIN MOVED b7bfd2b7 -> 44d23f88 (2026-09-23), and the artifact assertions
    // below were re-run at it. What this bump costs is nothing, and that is
    // checked rather than hoped: `git diff --name-only b7bfd2b7..44d23f88`
    // names FIVE files — four under examples/ (sb3-creator#23, the AND and OR
    // gate lessons written as single boolean expressions instead of nested
    // IFs) and one under test/ (#22, driving ldr and ntc as continuous
    // controls). NO src/ FILE CHANGED, so the vendored sb3Creator.js is
    // byte-identical across the range and nothing the round trip reads can
    // have moved. The assertions below were still executed at the new pin.
    // PIN MOVED 44d23f88 -> 4a3996b9 (2026-09-25, sb3-creator#24): src/ DID
    // change this time — MakeCode's led/game helpers for generateMicroPython,
    // each emitted only when a microbitplus block uses it. None of the SPIKE
    // paths this round trip reads are touched; the assertions re-ran at it.
    assert.equal(JSON.parse(readFileSync(new URL('../vendor-pins.json', import.meta.url)))['sb3-creator'],
        '4a3996b9d6d1fa2860cfcef78d430336c06225f3');

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
