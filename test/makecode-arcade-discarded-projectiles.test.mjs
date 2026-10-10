import test from 'node:test';
import assert from 'node:assert/strict';
import {arcadeToPseudocode} from '../overlay/scratch-gui/src/lib/bw-makecode/arcade-translate.js';
import {projectToArcade} from '../overlay/scratch-gui/src/lib/bw-makecode/export-arcade.js';
import {runProgram, stepFrames} from './helpers/bw-vm.mjs';
import {runPxtArcade} from './helpers/pxt-arcade-runtime.mjs';
const vars = run => Object.fromEntries(run.vm.runtime.targets.flatMap(t => Object.values(t.variables || {})).map(v => [v.name, v.value]));
import {DISCARDED_PROJECTILE_SOURCE as source} from './fixtures/arcade-discarded-projectiles.mjs';

test('discarded projectile handles create once with callbacks, identity and native roundtrips', async () => {
    const imported=arcadeToPseudocode(source);assert.deepEqual(imported.unsupported,[]);
    const expected=await runPxtArcade(source);
    const names=['created','colours','enemies','projectiles','protectedValue','protectedCreatedValue'];
    assert.equal(expected.created,3);assert.equal(expected.colours,10);
    const check=run=>{assert.deepEqual(run.errors,[]);assert.deepEqual(run.creator.warnings,[]);for(const n of names)assert.equal(vars(run)[n],expected[n],n);};
    const run=await runProgram(imported.code,{frames:40,uploads:imported.costumes,storage:true});check(run);
    const round=await runProgram(run.creator.decompile(),{frames:40,uploads:imported.costumes,storage:true});check(round);
    const exported=projectToArcade(run.creator.project,{costumeSvg:(t,c)=>run.creator.assets.get(c.assetId)?.data});assert.deepEqual(exported.unsupported,[]);
    const native=await runPxtArcade(exported.ts);for(const n of names)assert.equal(native[n],expected[n],n+' in exported PXT');
    const again=arcadeToPseudocode(exported.ts);assert.deepEqual(again.unsupported,[]);
    check(await runProgram(again.code,{frames:40,uploads:again.costumes,storage:true}));
    await run.vm.loadProject(Buffer.from(await(await run.vm.saveProjectSb3()).arrayBuffer()));run.vm.greenFlag();await stepFrames(run.vm,40);check(run);
});

for(const call of ['sprites.createProjectile(img`2`,0,0,SpriteKind.Enemy)',
    'sprites.createProjectileFromSide(img`3`,0,0)',
    'sprites.createProjectileFromSprite(img`4`,null,0,0)']) {
    test('standalone projectile program selects runtime creation: '+call, async()=>{
        const imported=arcadeToPseudocode(call);assert.deepEqual(imported.unsupported,[]);
        const run=await runProgram(imported.code,{frames:1,uploads:imported.costumes,storage:true});assert.deepEqual(run.errors,[]);assert.deepEqual(run.creator.warnings,[]);
        const sprites=Object.values(run.vm.runtime.bwArcadeDeviceState.sprites).filter(s=>s.id);assert.equal(sprites.length,1);
        assert.equal(sprites[0].kind,call.includes('SpriteKind.Enemy')?'Enemy':'Projectile');
    });
}
