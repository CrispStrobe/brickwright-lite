/**
 * An imported MakeCode Arcade game RUNS in the real Scratch VM.
 *
 * Everything else in this suite proves the translation compiles and that
 * the named opcodes appear. That is a parse-level claim, and this repo's
 * own bar is higher: `example-vm-execution.test.mjs` exists because a
 * project can compile into blocks that start no thread and change
 * nothing. An imported game is exactly the kind of program that could —
 * it is machine-translated from another machine's vocabulary, and the
 * two precedence bugs found by reading one generated line are proof that
 * "it compiled" is not "it works".
 *
 * So: package the translation as a real .sb3, load it into the real VM
 * with lite's real extensions, pull the green flag, and insist that
 * threads start, blocks run, and the VM reports no block errors.
 *
 * (The device referee in trace-oracle cannot do this job: it models
 * hardware programs and refuses motion/looks/sensing outright.)
 */

import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync, existsSync} from 'node:fs';
import {join} from 'node:path';

import {INTEGRATED, REPO} from './helpers/bw-integrated.mjs';
import {arcadeToPseudocode} from '../overlay/scratch-gui/src/lib/bw-makecode/arcade-translate.js';
import {unpackMakeCodeSource} from '../overlay/scratch-gui/src/lib/bw-makecode/embedded-source.js';

const CAN_RUN = existsSync(join(INTEGRATED, 'node_modules', 'scratch-vm', 'src', 'index.js')) &&
    existsSync(join(INTEGRATED, 'src', 'lib', 'sb3-creator.js'));
const {runProgram} = CAN_RUN ? await import('./helpers/bw-vm.mjs') : {};

const projectOf = async name => (await unpackMakeCodeSource(
    new Uint8Array(readFileSync(join(REPO, 'test', 'fixtures', 'makecode', name))))).files;

const SKIP = CAN_RUN ? false : 'needs the integrated tree and its scratch-vm — run `npm run integrate` and install';

test('a translated Arcade game starts and computes in the real VM', {skip: SKIP}, async () => {
    const files = await projectOf('arcade-assets.hex');
    const {code} = arcadeToPseudocode(files, {name: 'unterwasser'});
    // 120 frames, not 24: this game's spawners wait 2.5 seconds, so a
    // shorter run proves only that nothing had happened YET. (The VM warns
    // about costume assets it cannot fetch without a storage module —
    // that is the harness, not the project.)
    const run = await runProgram(code, {frames: 120});

    assert.deepEqual(run.errors, [], 'the VM reported block errors');
    assert.ok(run.threadsStarted > 0, 'the green flag started nothing');
    assert.ok(run.blockCount > 40, `only ${run.blockCount} blocks survived packaging`);
    // A program can start threads and still be inert. Something has to move.
    assert.ok(run.variablesChanged > 0, 'nothing changed in 120 frames');
});

test('the hostile game runs too, refusals and all', {skip: SKIP}, async () => {
    // The pong is the one a single script drives, so most of its
    // cross-sprite work is refused. What is left must still be a program
    // that runs rather than a shell that throws.
    const files = await projectOf('arcade-shield.hex');
    const {code} = arcadeToPseudocode(files, {name: 'ping-pong'});
    const run = await runProgram(code, {frames: 24});

    assert.deepEqual(run.errors, []);
    assert.ok(run.threadsStarted > 0);
});

test('a platformer with tilemaps and animations runs', {skip: SKIP}, async () => {
    const files = await projectOf('arcade-tilemap.hex');
    const {code} = arcadeToPseudocode(files, {name: 'jumpy platformer'});
    const run = await runProgram(code, {frames: 24});

    assert.deepEqual(run.errors, []);
    assert.ok(run.threadsStarted > 0);
});
