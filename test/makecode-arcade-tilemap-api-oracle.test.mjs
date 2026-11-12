import test from 'node:test';
import assert from 'node:assert/strict';
import {arcadeToPseudocode} from '../overlay/scratch-gui/src/lib/bw-makecode/arcade-translate.js';
import {runProgram, stepFrames, clearStrayTimers} from './helpers/bw-vm.mjs';
import {createArcadeDiscreteTimers} from './helpers/arcade-discrete-timers.mjs';
import {runPxtArcade} from './helpers/pxt-arcade-runtime.mjs';
import {QUERY_SOURCE, QUERY_KEYS, DATA_SOURCE, DATA_KEYS, EDGE_SOURCE, EDGE_KEYS, EVENTS_SOURCE, EVENTS_KEYS, PHYSICS_SOURCE, PHYSICS_KEYS} from './fixtures/arcade-tilemap-api.mjs';

// The pinned PXT Arcade simulator is the oracle: every tiles.* / Location query
// in the fixture must read the same in Brickwright.

// Only the Arcade extension's random draws are pinned, so the VM's own id
// generation keeps working.
async function lite(source, entropy) {
    const translated = arcadeToPseudocode(source);
    assert.deepEqual(translated.unsupported, []);
    const real = Math.random;
    Math.random = () => /crispstrobe\/arcade|CrispStrobeExtension/.test(new Error().stack) ? entropy : real();
    let run;
    try {
        run = await runProgram(translated.code, {frames: 6, uploads: translated.costumes || [], storage: true});
        const values = Object.fromEntries(run.vm.runtime.targets.flatMap(target => Object.values(target.variables))
            .map(variable => [variable.name.replace(/^Game_/, ''), variable.value]));
        assert.deepEqual(run.errors, []);
        return values;
    } finally { Math.random = real; run?.vm.quit(); clearStrayTimers(); }
}

for (const entropy of [0, 0.99]) {
    test(`tile queries, locations, neighbours and random picks match the original (entropy ${entropy})`, async () => {
        const original = await runPxtArcade(QUERY_SOURCE, {fakeClock: true, waitForGlobals: {done: true}, fixedEntropy: entropy});
        const actual = await lite(QUERY_SOURCE, entropy);
        assert.equal(actual.done, true);
        for (const key of QUERY_KEYS) assert.equal(actual[key], original[key], key);
    });
}

test('TileMapData values, level arrays, shared edits and Loaded/Unloaded events match the original', async () => {
    const original = await runPxtArcade(DATA_SOURCE, {fakeClock: true, waitForGlobals: {done: true}});
    const actual = await lite(DATA_SOURCE, 0.5);
    assert.equal(actual.done, true);
    for (const key of DATA_KEYS) assert.equal(actual[key], original[key], key);
});

test('queries before any tilemap, outside the map and on null locations match the original', async () => {
    const original = await runPxtArcade(EDGE_SOURCE, {fakeClock: true, waitForGlobals: {done: true}});
    const actual = await lite(EDGE_SOURCE, 0.5);
    assert.equal(actual.done, true);
    for (const key of EDGE_KEYS) assert.equal(actual[key], original[key], key);
});

// Programs that pause run on the program clock; both sides use a paused clock.
async function liteTimed(source) {
    const translated = arcadeToPseudocode(source);
    assert.deepEqual(translated.unsupported, []);
    const run = await runProgram(translated.code, {frames: 0, frameAuthority: 'timed', uploads: translated.costumes || [], storage: true});
    const {vm} = run, clock = createArcadeDiscreteTimers();
    const values = () => Object.fromEntries(vm.runtime.targets.flatMap(target => Object.values(target.variables))
        .map(variable => [variable.name.replace(/^Game_/, ''), variable.value]));
    try {
        vm.stopAll(); vm.runtime.bwArcadeProgramClock = clock;
        vm.runtime.updateCurrentMSecs = () => { vm.runtime.currentMSecs = clock.now(); };
        vm.greenFlag(); await stepFrames(vm, 1, 0);
        for (let t = 20; t <= 8000 && values().done !== true; t += 20) await clock.advanceTo(t);
        assert.deepEqual(run.errors, []);
        return values();
    } finally { vm.quit(); clearStrayTimers(); }
}

for (const [name, source, keys] of [
    ['overlap, wall-hit and setTileAt events on a platformer', EVENTS_SOURCE, EVENTS_KEYS],
    ['bounce, ghost, destroy-on-wall and tilemap camera physics', PHYSICS_SOURCE, PHYSICS_KEYS]]) {
    test(`${name} reproduce the original frame for frame`, async () => {
        const original = await runPxtArcade(source, {fakeClock: true, waitForGlobals: {done: true}});
        const actual = await liteTimed(source);
        assert.equal(actual.done, true);
        for (const key of keys) assert.equal(actual[key], original[key], key);
    });
}
