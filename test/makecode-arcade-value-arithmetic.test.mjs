import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {VM_SRC} from './helpers/bw-extensions.mjs';
const BW=createRequire(import.meta.url)(VM_SRC+'/util/bw-values.js');
import {arcadeToPseudocode} from '../overlay/scratch-gui/src/lib/bw-makecode/arcade-translate.js';
import {projectToArcade} from '../overlay/scratch-gui/src/lib/bw-makecode/export-arcade.js';
import {runProgram,stepFrames,clearStrayTimers} from './helpers/bw-vm.mjs';
import {runPxtArcade} from './helpers/pxt-arcade-runtime.mjs';
import {compile} from '../scripts/lib/pxt-node.mjs';
const vars=run=>Object.fromEntries(run.vm.runtime.targets.flatMap(t=>Object.values(t.variables)).map(v=>[v.name.replace(/^Game_/,''),v.value]));
async function execute(imported){
    assert.deepEqual(imported.unsupported,[]);
    const run=await runProgram(imported.code,{frames:80,uploads:imported.costumes,storage:true});
    assert.deepEqual(run.errors,[],JSON.stringify({vars:vars(run),code:imported.code}));assert.deepEqual(run.creator.warnings,[]);return run;
}
async function roundtrip(source,check){
    const imported=arcadeToPseudocode(source),run=await execute(imported);await check(run);
    await check(await execute({...imported,code:run.creator.decompile()}));
    const exported=projectToArcade(run.creator.project,{costumeSvg:(t,c)=>run.creator.assets.get(c.assetId)?.data});assert.deepEqual(exported.unsupported,[]);
    const built=await compile('arcade',exported.files);assert.equal(built.success,true,JSON.stringify({diagnostics:built.diagnostics,ts:exported.ts}));
    await check(await execute(arcadeToPseudocode(exported.ts)));
    await run.vm.loadProject(Buffer.from(await(await run.vm.saveProjectSb3()).arrayBuffer()));run.vm.greenFlag();await stepFrames(run.vm,80);await check(run);
}
test('primitive value arithmetic preserves missing values, coercion, remainder and nonfinite numbers',async()=>{
    await roundtrip(`let absent:any=undefined
let nothing:any=null
let bool:any=true
let text:any="5"
let sum=text+2
let numeric=text-2
let boolSum=bool+2
let nullSum=nothing+2
let nan=absent+2
let positive=1/0
let negative=-1/0
let remainder=-7%3
let remainder2=7%-3
let unary=+text
let negate=-text
let values=[sum,numeric,boolSum,nullSum,nan,positive,negative,remainder,remainder2,unary,negate]
let checks=0
if(nan!==nan){checks+=1}
if(!(nan<1) && !(nan>=1)){checks+=2}
if("10"<"2"){checks+=4}
if("2"<10){checks+=8}
if(!(absent<=0)){checks+=16}`,run=>{
        const v=vars(run),p=run.vm.runtime._primitives;
        assert.equal(Number(v.checks),31);
        const actual=Array.from({length:11},(_,i)=>p.arrays_referenceItem({ARRAY:v.values,INDEX:i}));
        assert.deepEqual(actual,['52',3,3,2,NaN,Infinity,-Infinity,-1,1,5,-5]);
    });
});
test('compound stores, numeric increments and paused calls retain actual value types',async()=>{
    await roundtrip(`let force:any=undefined
let text:any="5"
text+=2
let counter:any="5"
counter++
let rows:any[]=["5",undefined]
rows[0]+=2
rows[1]-=2
function compute(value:any){pause(20);return value+2}
let returned=compute(undefined)
let minusZero=-0
function echo(value:any){return value}
let copiedZero=echo(minusZero)
let values=[text,counter,rows[0],rows[1],returned,minusZero,copiedZero]`,async run=>{
        const deadline=Date.now()+20000; // wall-clock guard only: the loop exits as soon as the program has run (3 s was too short on a busy CI runner)
        while(vars(run).values?.bwReference?.kind!=='array' && Date.now()<deadline){await stepFrames(run.vm,4);await new Promise(done=>setTimeout(done,10));}
        const v=vars(run),p=run.vm.runtime._primitives;
        const actual=Array.from({length:7},(_,i)=>p.arrays_referenceItem({ARRAY:v.values,INDEX:i}));
        assert.deepEqual(actual,['52',6,'52',NaN,NaN,0,0]);
        assert.equal(v.text,'52');assert.equal(v.counter,6);assert.ok(Number.isNaN(v.returned));assert.ok(Object.is(v.minusZero,0));
    });
});

test('numeric array reads select native missing-value arithmetic without a lazy-expression marker',async()=>{
    await roundtrip(`let numbers=[1]
let missing=numbers[99]+2
let divide=1/0
let remainder=-7%3
let minusZero=-0
let checks=0
if(missing!==missing){checks+=1}
if(!(missing<=1)){checks+=2}`,run=>{
        const v=vars(run);assert.ok(Number.isNaN(v.missing));assert.equal(v.divide,Infinity);assert.equal(v.remainder,-1);assert.ok(Object.is(v.minusZero,0));assert.equal(Number(v.checks),3);
    });
});

test('native value programs retain life-zero callbacks and their rearming behavior',async()=>{
    await roundtrip(`let missing:any=undefined
let hits=0
info.setLife(2)
info.onLifeZero(function(){hits+=1;info.setLife(1)})`,async run=>{
        const life=run.vm.runtime.bwArcadeDeviceState.players[0];
        assert.ok(life);assert.equal(Number(vars(run).hits),0);
        for(let count=1;count<=2;count++){
            run.vm.runtime._primitives.arcade_setLife({PLAYER:1,VALUE:0},{});
            const deadline=Date.now()+20000; // wall-clock guard only: the loop exits as soon as the program has run (3 s was too short on a busy CI runner)
            while(Number(vars(run).hits)!==count && Date.now()<deadline){await stepFrames(run.vm,4);await new Promise(done=>setTimeout(done,10));}
            assert.equal(Number(vars(run).hits),count);assert.equal(Number(life.life),1);
            await stepFrames(run.vm,5);
        }
        assert.deepEqual(run.errors,[]);
    });
});

test('selected Arcade defaults distinguish omission from supplied Undefined and preserve operand order',async()=>{
    await roundtrip(`let calls=0
function count(times?:number){if(!times){times=3};calls+=times}
function choose(value:any=7){return value}
count()
count(5)
let omitted=choose()
let explicit=choose(undefined)
let nothing=choose(null)
let zero=choose(0)
let text=choose("0")
let suppliedCalls=0
let suppliedOrder=""
function suppliedMissing(){suppliedCalls+=1;suppliedOrder+="U";return undefined}
function chooseAfter(value:any=7){suppliedOrder+="C";return value}
let dynamic=chooseAfter(suppliedMissing())
let dynamicOrder=suppliedOrder
let omittedAfter=chooseAfter()`,run=>{
        // The selected original compiler substitutes defaults at omitted calls;
        // supplied Undefined stays a value, including a real expression result.
        const v=vars(run);assert.equal(Number(v.calls),8);assert.equal(v.omitted,7);assert.equal(BW.decode(v.explicit),undefined);assert.equal(v.nothing,null);assert.equal(v.zero,0);assert.equal(v.text,'0');
        assert.equal(BW.decode(v.dynamic),undefined);assert.equal(v.suppliedCalls,1);assert.equal(v.dynamicOrder,'UC');assert.equal(v.suppliedOrder,'UCC');assert.equal(v.omittedAfter,7);
    });
});

test('SB3 retains nonfinite scalar values and the selected SDK folded zero without restarting',async()=>{
    const imported=arcadeToPseudocode(`let nan=0/0
let positive=1/0
let negative=-1/0
let minusZero=-0
let ordinary="NaN"`),run=await execute(imported);
    await run.vm.loadProject(Buffer.from(await(await run.vm.saveProjectSb3()).arrayBuffer()));
    const v=vars(run);assert.ok(Number.isNaN(v.nan));assert.equal(v.positive,Infinity);assert.equal(v.negative,-Infinity);assert.ok(Object.is(v.minusZero,0));assert.equal(v.ordinary,'NaN');
});

test('numeric sums retain their type through index variables and procedure returns', {todo:"Array export authority cannot yet prove the Array receiver \u2014 see docs/ARCADE-888-OPEN-FAILURES.md"},async()=>{
    await roundtrip(`let rows=[[3,4]]
function shift(index:number){return index+1}
let column=0
column=column+1
let selected=rows[shift(0)-1][column]
rows[0][column]=selected+2
let result=rows[0][column]`,run=>{
        assert.equal(vars(run).selected,4);assert.equal(vars(run).result,6);
    });
});


test('selected source constant zero matches actual SDK while authored typed unary negative zero survives original export and saved SB3',async()=>{
 const original=await runPxtArcade('let minusZero=-0;minusZero*=1;', {fakeClock:true});assert.ok(Object.is(original.minusZero,0),'selected SDK folds literal -0 to +0');
 const imported=await execute(arcadeToPseudocode('let minusZero=-0;minusZero*=1;'));assert.ok(Object.is(vars(imported).minusZero,original.minusZero));
 const run=await runProgram('DEVICE ARCADE\nGLOBAL minusZero\nSPRITE Game:\nWHEN arcade source starts:\n  set minusZero to (convert value ((0 + (0))) op "-")\n  set minusZero to (calculate value (minusZero) op "*" with ((0 + (1))))',{frames:8,storage:true});
 try{assert.ok(Object.is(vars(run).minusZero,-0));assert.deepEqual(run.errors,[]);const exported=projectToArcade(run.creator.project);assert.deepEqual(exported.unsupported,[]);
  const oracle=await runPxtArcade(exported.files,{fakeClock:true});assert.ok(Object.is(oracle.minusZero??oracle.Game_minusZero,-0),'authored unary sign survives actual original export');
  const again=await execute(arcadeToPseudocode(exported.files));assert.ok(Object.is(vars(again).minusZero,-0));again.vm.quit();
  await run.vm.loadProject(Buffer.from(await(await run.vm.saveProjectSb3()).arrayBuffer()));assert.ok(Object.is(vars(run).minusZero,-0),'stored value retains sign without restarting');
 }finally{imported.vm.quit();run.vm.quit();clearStrayTimers();}
});
