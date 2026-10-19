// Authored fixtures: consumed updates must execute before dependent array use.
import test from 'node:test';
import assert from 'node:assert/strict';
import {arcadeToPseudocode} from '../overlay/scratch-gui/src/lib/bw-makecode/arcade-translate.js';
import {projectToArcade} from '../overlay/scratch-gui/src/lib/bw-makecode/export-arcade.js';
import {runPxtArcade} from './helpers/pxt-arcade-runtime.mjs';
import {runProgram, stepFrames} from './helpers/bw-vm.mjs';
const values=run=>Object.fromEntries(run.vm.runtime.targets.flatMap(t=>Object.values(t.variables || {})).map(v=>[v.name,v.value]));

async function compareRoundtrips(source,names) {
    const expected=await runPxtArcade(source);
    const check=run=>{
        assert.deepEqual(run.errors,[]);assert.deepEqual(run.creator.warnings,[]);
        const actual=values(run);for(const name of names)assert.equal(actual[name],expected[name],name);
    };
    const execute=async imported=>{
        assert.deepEqual(imported.unsupported,[]);
        const run=await runProgram(imported.code,{frames:30,storage:true,uploads:imported.costumes});check(run);return run;
    };
    const imported=arcadeToPseudocode(source),run=await execute(imported);
    await execute({...imported,code:run.creator.decompile()});
    const exported=projectToArcade(run.creator.project,{costumeSvg:(t,c)=>run.creator.assets.get(c.assetId)?.data});
    assert.deepEqual(exported.unsupported,[]);
    const originalExport=await runPxtArcade(exported.ts);
    for(const name of names)assert.equal(originalExport[name],expected[name],`exported ${name}`);
    await execute(arcadeToPseudocode(exported.ts));
    await run.vm.loadProject(Buffer.from(await(await run.vm.saveProjectSb3()).arrayBuffer()));
    run.vm.greenFlag();await stepFrames(run.vm,30);check(run);
}

test('prefix update in a condition performs required array initialization',async()=>{
    await compareRoundtrips(`let attempts=4
let entries:number[]
function prepare(){if(++attempts>=5){entries=[17,23]}}
prepare()
let found=entries.indexOf(23)
let length=entries.length`,['attempts','found','length']);
});

test('consumed prefix/postfix updates preserve values, lazy choice and evaluated-once targets',async()=>{
    await compareRoundtrips(`let counter=3
let post=counter++
let pre=++counter
let down=counter--
let preDown=--counter
let skipped=false&&++counter
let chosen=true&&counter++
let rows=[[5,6]]
let receiverCalls=0
function row(){receiverCalls++;return rows[0]}
function index(){return 0}
let oldItem=row()[index()]++
let newItem=++row()[index()]
let item=rows[0][0]
let actor=sprites.create(image.create(2,2),SpriteKind.Player)
actor.vx=8
let actorCalls=0
function owner(){actorCalls++;return actor}
let oldSpeed=owner().vx++
let newSpeed=++owner().vx
let speed=actor.vx
function pair(a:number,b:number){return a*10+b}
let paired=pair(counter++,++counter)
let last=counter`,['post','pre','down','preDown','skipped','chosen','receiverCalls','oldItem','newItem','item','actorCalls','oldSpeed','newSpeed','speed','paired','last']);
});


// Imported Arcade source uses the selected PXT expression staging, including
// repeated evaluation of a consumed update's side-effecting array index.
// Ordinary authored JavaScript lowering remains a separate source path.
test('complex update index effects retain selected PXT staging',async()=>{
    const source=`let slots=[4]
let indexCalls=0
function slot(){indexCalls++;return 0}
let before=slots[slot()]++
let after=++slots[slot()]
let result=slots[0]`;
    const original=await runPxtArcade(source);
    assert.equal(original.indexCalls,4,'pinned PXT duplicates index evaluation');
    const imported=arcadeToPseudocode(source);
    assert.deepEqual(imported.unsupported,[]);
    const run=await runProgram(imported.code,{frames:30,storage:true});
    assert.deepEqual(run.errors,[]);
    assert.equal(values(run).indexCalls,original.indexCalls,'imported Arcade retains selected index evaluation');
    for(const name of ['before','after','result'])assert.equal(values(run)[name],original[name],name);
});


test('native consumed complex update preserves selected index effects through editable routes',async()=>{
 const source='let slots=[4]\nlet indexCalls=0\nfunction slot(){indexCalls++;return 0}\nlet before=slots[slot()]++\nlet after=++slots[slot()]\nlet result=slots[0]';
 const imported=arcadeToPseudocode(source);assert.deepEqual(imported.unsupported,[]);const runs=[];
 const check=run=>{const actual=values(run);assert.equal(actual.indexCalls,4);assert.equal(actual.before,4);assert.equal(actual.after,6);assert.equal(actual.result,6);assert.deepEqual(run.errors,[]);assert.deepEqual(run.creator.warnings,[]);};
 try {
  const execute=async input=>{assert.deepEqual(input.unsupported,[]);const run=await runProgram(input.code,{frames:30,storage:true});runs.push(run);check(run);return run;};
  const run=await execute(imported);await execute({...imported,code:run.creator.decompile()});
  const exported=projectToArcade(run.creator.project);assert.deepEqual(exported.unsupported,[]);await execute(arcadeToPseudocode(exported.files));
  await run.vm.loadProject(Buffer.from(await(await run.vm.saveProjectSb3()).arrayBuffer()));run.vm.greenFlag();await stepFrames(run.vm,30);check(run);
 } finally {for(const run of runs){run.vm.stopAll();run.vm.quit();}}
});
