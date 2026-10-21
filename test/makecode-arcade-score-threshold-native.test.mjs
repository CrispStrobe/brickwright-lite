import test from 'node:test';
import assert from 'node:assert/strict';
import {arcadeToPseudocode} from '../overlay/scratch-gui/src/lib/bw-makecode/arcade-translate.js';
import {projectToArcade} from '../overlay/scratch-gui/src/lib/bw-makecode/export-arcade.js';
import {runProgram, stepFrames} from './helpers/bw-vm.mjs';
import {runPxtArcade} from './helpers/pxt-arcade-runtime.mjs';
import {restartTimedArcadeRun} from './helpers/arcade-timed-native.mjs';
import {SCORE_THRESHOLD_SOURCE} from './fixtures/arcade-score-threshold.mjs';
const values = run => Object.fromEntries(run.vm.runtime.targets.flatMap(target => Object.values(target.variables))
    .map(value => [value.name.replace(/^Game_/, ''), value.value]));
const names = ['trace','noImmediate','integerScore','nested','nestedFirst','mpScore','live','firstLive','zeroFirst','scenes','ready'];

test('actual score crossings, replacement, live dispatch and scene/player state agree with original PXT and Code/SB3/current export', async () => {
    // One genuine original compilation/execution. The native current export is
    // reimported below, not relabelled as execution of this original binary.
    const expected = await runPxtArcade(SCORE_THRESHOLD_SOURCE, {dependencies: {device:'*',multiplayer:'*'}, waitForGlobals: {ready:true}});
    assert.equal(expected.noImmediate, ''); assert.equal(expected.trace, 'AFABFABFF');
    assert.equal(expected.integerScore, 1); assert.equal(expected.nestedFirst, 'XXRN');
    assert.equal(expected.nested, 'XXRNXRX'); assert.equal(expected.mpScore, -2);
    assert.equal(expected.firstLive, 'XR'); assert.equal(expected.live, 'XRXRN');
    assert.equal(expected.zeroFirst, 'Z'); assert.equal(expected.scenes, 'CP');
    const runs = [];
    const check = run => {
        assert.deepEqual(run.errors, [], 'complete actual runtime diagnostics');
        assert.deepEqual(run.creator.warnings, []);
        for (const name of names) assert.equal(values(run)[name], expected[name], name);
    };
    const execute = async imported => {
        assert.deepEqual(imported.unsupported, []);
        const run = await runProgram(imported.code, {frames: 5, storage: true}); runs.push(run); check(run); return run;
    };
    try {
        const imported = arcadeToPseudocode(SCORE_THRESHOLD_SOURCE);
        const run = await execute(imported);
        const code = run.creator.decompile();
        assert.match(code, /arcade register score player/);
        await execute({...imported, code});
        const bytes = Buffer.from(await (await run.vm.saveProjectSb3()).arrayBuffer());
        await run.vm.loadProject(bytes); run.vm.greenFlag(); await stepFrames(run.vm, 5); check(run);
        const fresh = await runProgram('DEVICE ARCADE\nSPRITE Fresh:\nWHEN flag clicked:\n  wait 0 seconds\n', {frames: 0, storage: true}); runs.push(fresh);
        await fresh.vm.loadProject(bytes); fresh.vm.greenFlag(); await stepFrames(fresh.vm, 5); check(fresh);
        const exported = projectToArcade(JSON.parse(run.vm.toJSON()));
        assert.deepEqual(exported.unsupported, []); assert.match(exported.ts, /\.onScore\(/);
        await execute(arcadeToPseudocode(exported.files));
    } finally {for (const run of runs) {run.vm.stopAll(); run.vm.quit();}}
});

test('actual paused callback completes before generic and multiplayer setters continue; Stop cancels the suspended lineage', async () => {
    const source = `let trace=""
let done=false
info.onScore(1,function(){trace+="A";pause(40);trace+="B"})
info.setScore(1)
trace+="C"
let two=mp.playerSelector(mp.PlayerNumber.Two)
info.player2.onScore(1,function(){trace+="D";pause(40);trace+="E"})
mp.setPlayerState(two,MultiplayerState.score,1)
trace+="F"
done=true`;
    const imported = arcadeToPseudocode(source); assert.deepEqual(imported.unsupported, []);
    const run = await runProgram(imported.code, {frames: 0, storage: true, frameAuthority:'timed'});
    try {
        const first = await restartTimedArcadeRun(run, 20);
        assert.deepEqual(run.errors, []); assert.equal(values(run).trace, 'A'); assert.equal(values(run).done, false);
        await first.advanceTo(120);
        assert.deepEqual(run.errors, []); assert.equal(values(run).trace, 'ABCDEF'); assert.equal(values(run).done, true);
        const pending = await restartTimedArcadeRun(run, 20);
        assert.equal(values(run).trace, 'A'); run.vm.stopAll(); await pending.advanceTo(120);
        assert.deepEqual(run.errors, []); assert.equal(values(run).trace, 'A'); assert.equal(values(run).done, false);
        const fresh = await restartTimedArcadeRun(run, 120);
        assert.deepEqual(run.errors, []); assert.equal(values(run).trace, 'ABCDEF'); assert.equal(values(run).done, true);
        assert.ok(fresh);
    } finally {run.vm.stopAll(); run.vm.quit();}
});
