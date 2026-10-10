import test from 'node:test';
import assert from 'node:assert/strict';
import {arcadeProjectSource} from '../overlay/scratch-gui/src/lib/bw-makecode/project-source.js';
import {arcadeToPseudocode} from '../overlay/scratch-gui/src/lib/bw-makecode/arcade-translate.js';
import {projectToArcade} from '../overlay/scratch-gui/src/lib/bw-makecode/export-arcade.js';
import {runProgram,stepFrames} from './helpers/bw-vm.mjs';
import {runPxtArcade} from './helpers/pxt-arcade-runtime.mjs';
import {MULTIFILE_ARCADE_FILES} from './fixtures/arcade-multifile-source.mjs';
const values=run=>Object.fromEntries(run.vm.runtime.targets.flatMap(t=>Object.values(t.variables)).map(v=>[v.name.replace(/^Game_/,''),v.value]));

test('declared files, root testFiles, reopened namespace state and main-last ordering match original PXT through roundtrips',async()=>{
    const files=MULTIFILE_ARCADE_FILES;
    const expected=await runPxtArcade(files);
    assert.equal(expected.observed,1243);assert.equal(expected.finalOrder,1243);
    assert.equal(expected.first,6);assert.equal(expected.second,39);assert.equal(expected.third,8);
    const names=['observed','finalOrder','first','second','third','actorX'];
    const check=run=>{for(const name of names)assert.equal(values(run)[name],expected[name],name);assert.deepEqual(run.errors,[]);assert.deepEqual(run.creator.warnings,[]);};
    const execute=async imported=>{assert.deepEqual(imported.unsupported,[]);const run=await runProgram(imported.code,{frames:100,uploads:imported.costumes,storage:true});check(run);return run;};
    const imported=arcadeToPseudocode(files),run=await execute(imported);
    await execute({...imported,code:run.creator.decompile()});
    const exported=projectToArcade(run.creator.project,{costumeSvg:(target,costume)=>run.creator.assets.get(costume.assetId)?.data});
    assert.deepEqual(exported.unsupported,[]);
    const original=await runPxtArcade(exported.ts);for(const name of names)assert.equal(original[name],expected[name],'native export '+name);
    await execute(arcadeToPseudocode(exported.ts));
    await run.vm.loadProject(Buffer.from(await(await run.vm.saveProjectSb3()).arrayBuffer()));run.vm.greenFlag();await stepFrames(run.vm,100);check(run);
});

test('unlisted files do not execute; missing and conditional sources remain named',()=>{
    const selected=arcadeProjectSource(MULTIFILE_ARCADE_FILES);
    assert.deepEqual(selected.entries.map(entry=>entry.name),['alpha.ts','beta.ts','tests.ts','main.ts','_onCodeStop.ts']);
    assert.deepEqual(selected.diagnostics,[]);
    const config={files:['missing.ts','main.ts','condition.ts','native.asm'],fileDependencies:{'condition.ts':'radio'}};
    const imported=arcadeToPseudocode({'main.ts':'let x=1','condition.ts':'notARealApi()','native.asm':'nop','pxt.json':JSON.stringify(config)});
    for(const name of ['missing.ts','condition.ts','native.asm'])assert.ok(imported.unsupported.some(reason=>reason.includes(name)),name);
});

test('a malformed supplemental file reports its own file name',()=>{
    assert.throws(()=>arcadeToPseudocode({'main.ts':'let x=1','broken.ts':'let =','pxt.json':JSON.stringify({files:['broken.ts','main.ts']})}),/broken\.ts/);
});
