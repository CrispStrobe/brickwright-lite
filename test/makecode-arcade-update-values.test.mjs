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


// Pinned PXT evaluates a side-effecting array index twice for a consumed
// update. The general TS lowerer deliberately retains JavaScript's once-only
// lvalue evaluation. This is an explicit compatibility difference, not a
// claim of complete PXT parity for side-effecting complex update targets.
test('complex update index effects retain JS semantics; pinned PXT duplication stays named',async()=>{
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
    assert.equal(values(run).indexCalls,2,'each JS lvalue index evaluates once');
    for(const name of ['before','after','result'])assert.equal(values(run)[name],original[name],name);
});
