import {test} from 'node:test';
import assert from 'node:assert/strict';
import {arcadeToPseudocode} from '../overlay/scratch-gui/src/lib/bw-makecode/arcade-translate.js';
import {projectToArcade} from '../overlay/scratch-gui/src/lib/bw-makecode/export-arcade.js';
import {runProgram,stepFrames} from './helpers/bw-vm.mjs';
import {runPxtArcade} from './helpers/pxt-arcade-runtime.mjs';

const values = run => Object.fromEntries(run.vm.runtime.targets.flatMap(target => Object.values(target.variables)).map(variable => [variable.name.replace(/^Game_/,''),variable.value]));

test('qualified namespace procedures preserve private state, sprite return values and numeric enum roundtrips', async () => {
    const source=`enum Direction { Left=-3, Right=Left+2, Next }
namespace Robot {
    let offset=5
    export function make(){ let actor=sprites.create(img\`2\`,SpriteKind.Player);actor.x=offset;return actor; }
    export function shift(actor:Sprite){offset+=3;actor.x+=offset;return offset;}
    export function shadow(offset:number){return offset+1;}
}
namespace Rival { let offset=10;export function shadow(value:number){return value+offset;} }
let actor=Robot.make()
let start=actor.x
let changed=Robot.shift(actor)
let moved=actor.x
let shadowed=Robot.shadow(4)
let other=Rival.shadow(4)
let signed=Direction.Left
let implicit=Direction.Next
signed+=0
implicit+=0`;
    const expected={start:5,changed:8,moved:13,shadowed:5,other:14,signed:-3,implicit:0};
    const original=await runPxtArcade(source);
    for(const [name,value] of Object.entries(expected))assert.equal(original[name],value,'original '+name);
    const execute=async imported=>{
        assert.deepEqual(imported.unsupported,[]);
        const run=await runProgram(imported.code,{frames:100,uploads:imported.costumes,storage:true});
        const actual=values(run);for(const [name,value] of Object.entries(expected))assert.equal(actual[name],value,name);
        assert.deepEqual(run.errors,[]);assert.deepEqual(run.creator.warnings,[]);return run;
    };
    const imported=arcadeToPseudocode(source),run=await execute(imported);
    await execute({...imported,code:run.creator.decompile()});
    const exported=projectToArcade(run.creator.project,{costumeSvg:(target,costume)=>run.creator.assets.get(costume.assetId)?.data});
    assert.deepEqual(exported.unsupported,[]);
    const pxt=await runPxtArcade(exported.ts);for(const [name,value] of Object.entries(expected))assert.equal(pxt[name],value,'exported '+name);
    await execute(arcadeToPseudocode(exported.ts));
    await run.vm.loadProject(Buffer.from(await(await run.vm.saveProjectSb3()).arrayBuffer()));run.vm.greenFlag();await stepFrames(run.vm,100);
    const restart=values(run);for(const [name,value] of Object.entries(expected))assert.equal(restart[name],value,'SB3 '+name);
    assert.deepEqual(run.errors,[]);
});
