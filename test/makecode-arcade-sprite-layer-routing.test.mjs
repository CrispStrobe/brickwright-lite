import test from 'node:test';
import assert from 'node:assert/strict';
import {arcadeToPseudocode} from '../overlay/scratch-gui/src/lib/bw-makecode/arcade-translate.js';
import {projectToArcade} from '../overlay/scratch-gui/src/lib/bw-makecode/export-arcade.js';
import {runProgram,stepFrames} from './helpers/bw-vm.mjs';
import {runPxtArcade} from './helpers/pxt-arcade-runtime.mjs';

const values=run=>Object.fromEntries(run.vm.runtime.targets.flatMap(t=>Object.values(t.variables))
    .map(v=>[v.name.replace(/^Game_/,''),v.value]));
const setup='let actor=sprites.create(img`2`,SpriteKind.Player)\n';
test('each typed property independently selects native property blocks',async()=>{
    for(const [property,value] of [['z',5],['lifespan',10000],['ax',25],['ay',-30]]) {
        const source=setup+`actor.${property}=${value}\nlet observed=actor.${property}\n`;
        const expected=await runPxtArcade(source),imported=arcadeToPseudocode(source);
        assert.deepEqual(imported.unsupported,[],property);
        assert.match(imported.code,new RegExp(`arcade property ${property}`));
        const run=await runProgram(imported.code,{frames:6,uploads:imported.costumes});
        assert.deepEqual(run.errors,[]);assert.deepEqual(run.creator.warnings,[]);
        assert.equal(values(run).observed,expected.observed,property);
    }
});

test('layer assignment evaluation and editable SB3/export round trips agree with original PXT',async()=>{
    const source=setup+`let other=sprites.create(img\`5\`,SpriteKind.Enemy)
let calls=0
function layer(){calls++;return 7}
actor.z=layer()
let high=actor.z
actor.z-=9
let low=actor.z
other.z=actor.z+1
let peer=other.z
let done=calls===1 && high===7 && low===-2 && peer===-1`;
    const expected=await runPxtArcade(source);
    const check=run=>{
        assert.deepEqual(run.errors,[]);assert.deepEqual(run.creator.warnings,[]);
        for(const key of ['calls','high','low','peer','done'])assert.equal(values(run)[key],expected[key],key);
        assert.deepEqual(Object.values(run.vm.runtime.bwArcadeDeviceState.sprites).map(s=>s.z),[-2,-1]);
    };
    const imported=arcadeToPseudocode(source);assert.deepEqual(imported.unsupported,[]);
    const run=await runProgram(imported.code,{frames:16,uploads:imported.costumes,storage:true});check(run);
    const edited=await runProgram(run.creator.decompile(),{frames:16,uploads:imported.costumes});check(edited);
    const assets=Object.fromEntries(run.vm.runtime.targets.flatMap(t=>t.getCostumes().map(c=>[c.assetId,c.asset])));
    const exported=await projectToArcade(JSON.parse(run.vm.toJSON()),{costumeSvg:(target,costume)=>assets[costume.assetId]?.decodeText()});
    assert.deepEqual(exported.unsupported,[]);
    const original=await runPxtArcade(exported.files);
    for(const key of ['calls','high','low','peer','done'])assert.equal(original[key],expected[key],key+' exported');
    const reimported=arcadeToPseudocode(exported.files);assert.deepEqual(reimported.unsupported,[]);
    check(await runProgram(reimported.code,{frames:16,uploads:reimported.costumes}));
    await run.vm.loadProject(Buffer.from(await(await run.vm.saveProjectSb3()).arrayBuffer()));
    run.vm.greenFlag();await stepFrames(run.vm,16);check(run);
});
