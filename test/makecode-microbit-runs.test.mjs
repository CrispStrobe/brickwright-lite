/**
 * An imported MakeCode micro:bit program RUNS, and reaches the extension.
 *
 * The Arcade counterpart of this gate lives in
 * makecode-arcade-runs.test.mjs; this is the device half, and it can ask
 * for more. An Arcade translation only has to start and change
 * something, because its blocks are core Scratch. A micro:bit
 * translation lowers onto lite's OWN bundled extension, so the bar is
 * the one example-vm-execution.test.mjs sets for hardware programs:
 * a bundled extension method must actually be invoked. Variables
 * changing is not enough — that is the defect class that whole gate was
 * built for, where a program assigns variables enthusiastically and
 * drives nothing.
 *
 * The device referee cannot stand in here: trace-oracle refuses
 * `microbit_display` outright, and flags a translated `basic.forever` as
 * a zero-time spin because it models a chip rather than Scratch's
 * per-frame yield.
 */

import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync, existsSync} from 'node:fs';
import {join} from 'node:path';

import {INTEGRATED, REPO} from './helpers/bw-integrated.mjs';
import {microbitToPseudocode} from '../overlay/scratch-gui/src/lib/bw-makecode/microbit-translate.js';
import {unpackMakeCodeSource} from '../overlay/scratch-gui/src/lib/bw-makecode/embedded-source.js';

const CAN_RUN = existsSync(join(INTEGRATED, 'node_modules', 'scratch-vm', 'src', 'index.js')) &&
    existsSync(join(INTEGRATED, 'src', 'lib', 'sb3-creator.js'));
const {runProgram} = CAN_RUN ? await import('./helpers/bw-vm.mjs') : {};
const SKIP = CAN_RUN ? false : 'needs the integrated tree and its scratch-vm — run `npm run integrate` and install';

const mainTs = async name => (await unpackMakeCodeSource(
    new Uint8Array(readFileSync(join(REPO, 'test', 'fixtures', 'makecode', name))))).files['main.ts'];

test('an imported micro:bit program drives the real extension', {skip: SKIP}, async () => {
    // The fixture reads pin P0 in a forever loop and displays it, so the
    // proof is not that blocks exist but that analogread is CALLED.
    const {code, unsupported} = microbitToPseudocode(await mainTs('microbit-blocks.hex'));
    assert.deepEqual(unsupported, [], 'this project needs no excuses');

    const run = await runProgram(code, {frames: 30});
    assert.deepEqual(run.errors, [], 'the VM reported block errors');
    assert.ok(run.threadsStarted > 0, 'the green flag started nothing');
    assert.ok(run.loadedExtensions.has('microbitplus'),
        `microbitplus was not loaded; got ${[...run.loadedExtensions].join(', ') || 'nothing'}`);
    assert.ok(run.calls.get('microbitplus_analogread') > 0,
        'the pin read never reached the extension — blocks that exist but never run');
});

test('a translated gesture and touch program reaches its blocks', {skip: SKIP}, async () => {
    // These two were REFUSED until sb3-creator b4a8129 closed the round
    // trip. Compiling was the first proof; this is the second — the
    // reporters have to be real blocks the VM can evaluate.
    const {code, unsupported} = microbitToPseudocode(`
        basic.forever(function () {
            if (input.isGesture(Gesture.Shake)) { basic.clearScreen() }
            if (input.pinIsPressed(TouchPin.P1)) { basic.showNumber(1) }
        })
    `);
    assert.deepEqual(unsupported, []);

    const run = await runProgram(code, {frames: 20});
    assert.deepEqual(run.errors, []);
    assert.ok(run.loadedOpcodes.has('microbitplus_isgesture'), 'the gesture block survived packaging');
    assert.ok(run.loadedOpcodes.has('microbitplus_istouch'), 'and the touch block');
    assert.ok(run.extensionCalls > 0, 'and the extension was actually reached');
});

test('an imported Calliope program drives the arrays extension', {skip: SKIP}, async () => {
    // The Calliope half of the same bar. This fixture builds an array of
    // pictures and reads it by index, and arrays were the construct that
    // used to collapse to `set liste to 0` — so "it compiled" proves
    // nothing here. The array blocks have to be loaded AND called.
    const {importArtefact} = await import(
        '../overlay/scratch-gui/src/lib/bw-makecode/index.js');
    const result = await importArtefact(
        new Uint8Array(readFileSync(join(REPO, 'test', 'fixtures', 'makecode', 'calliope-images.hex'))),
        {name: 'calliope-images.hex'});
    assert.equal(result.lang, 'pseudocode');

    const run = await runProgram(result.code, {frames: 30});
    assert.deepEqual(run.errors, [], 'the VM reported block errors');
    assert.ok(run.threadsStarted > 0, 'the green flag started nothing');
    assert.ok(run.loadedExtensions.has('arrays'),
        `arrays was not loaded; got ${[...run.loadedExtensions].join(', ') || 'nothing'}`);
    assert.ok(run.loadedOpcodes.has('arrays_create1D') || run.loadedOpcodes.has('arrays_createEmpty'),
        'no array was ever created — the declaration collapsed again');
    assert.ok(run.extensionCalls > 0, 'blocks that exist but never run');
});

test('a translated bitwise program reaches the bitops extension', {skip: SKIP}, async () => {
    // `x & 255` used to compile to a string literal whose text was
    // `x & 255`. Compiling is not the proof; being CALLED is.
    const {code, unsupported} = microbitToPseudocode(`
        let maske = 0
        basic.forever(function () {
            maske = (maske << 1) & 255
            basic.showNumber(maske)
        })
    `);
    assert.deepEqual(unsupported, []);

    const run = await runProgram(code, {frames: 20});
    assert.deepEqual(run.errors, []);
    assert.ok(run.loadedExtensions.has('bitops'),
        `bitops was not loaded; got ${[...run.loadedExtensions].join(', ') || 'nothing'}`);
    assert.ok(run.calls.get('bitops_and') > 0, 'the mask never reached the extension');
    assert.ok(run.calls.get('bitops_shl') > 0, 'the shift never reached the extension');
});
