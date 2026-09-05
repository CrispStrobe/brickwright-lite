import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {readFileSync} from 'node:fs';
import SB3Creator from '../packages/scratch-gui/src/lib/sb3-creator.js';

const requireFromGui = createRequire(new URL('../packages/scratch-gui/package.json', import.meta.url));
const JSZip = requireFromGui('jszip');

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
    // 4134b86 -> eb5b286 on 2026-09-05: the Python and JavaScript READERS gained
    // bitwise/shift operators (sb3-creator fix/reader-bitwise-shift); nothing in
    // the SPIKE emitter changed, and the artifact assertions below still hold.
    assert.equal(JSON.parse(readFileSync(new URL('../vendor-pins.json', import.meta.url)))['sb3-creator'],
        'eb5b286af6673dea720b6d78acd061386fd5c266');

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
