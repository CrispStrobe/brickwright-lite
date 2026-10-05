import test from 'node:test';
import assert from 'node:assert/strict';
import {arcadeToPseudocode} from '../overlay/scratch-gui/src/lib/bw-makecode/arcade-translate.js';
import {runProgram,stepFrames} from './helpers/bw-vm.mjs';
// Task E1 keeps the import half of these round trips; the export half (projectToArcade, then compiling or running the exported TypeScript in PXT, then re-importing it) returns with task E2 (docs/OPEN-TASKS-2026-09-29.md).
const vars=run=>Object.fromEntries(run.vm.runtime.targets.flatMap(t=>Object.values(t.variables)).map(v=>[v.name.replace(/^Game_/,''),v.value]));
async function execute(imported){
    assert.deepEqual(imported.unsupported,[]);
    const run=await runProgram(imported.code,{frames:80,uploads:imported.costumes,storage:true});
    assert.deepEqual(run.errors,[],JSON.stringify({vars:vars(run),code:imported.code}));assert.deepEqual(run.creator.warnings,[]);return run;
}
async function roundtrip(source,check){
    const imported=arcadeToPseudocode(source),run=await execute(imported);await check(run);
    await check(await execute({...imported,code:run.creator.decompile()}));
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
        const deadline=Date.now()+3000;
        while(vars(run).values?.bwReference?.kind!=='array' && Date.now()<deadline){await stepFrames(run.vm,4);await new Promise(done=>setTimeout(done,10));}
        const v=vars(run),p=run.vm.runtime._primitives;
        const actual=Array.from({length:7},(_,i)=>p.arrays_referenceItem({ARRAY:v.values,INDEX:i}));
        assert.deepEqual(actual,['52',6,'52',NaN,NaN,-0,-0]);
        assert.equal(v.text,'52');assert.equal(v.counter,6);assert.ok(Number.isNaN(v.returned));assert.ok(Object.is(v.minusZero,-0));
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
        const v=vars(run);assert.ok(Number.isNaN(v.missing));assert.equal(v.divide,Infinity);assert.equal(v.remainder,-1);assert.ok(Object.is(v.minusZero,-0));assert.equal(Number(v.checks),3);
    });
});

test('native value programs retain life-zero callbacks and their rearming behavior',async()=>{
    await roundtrip(`let missing:any=undefined
let hits=0
info.setLife(2)
info.onLifeZero(function(){hits+=1;info.setLife(1)})`,async run=>{
        const life=run.vm.runtime.targets.flatMap(t=>Object.values(t.variables)).find(v=>v.name.replace(/^Game_/,'')==='lives');
        assert.ok(life);assert.equal(Number(vars(run).hits),0);
        for(let count=1;count<=2;count++){
            life.value=0;
            const deadline=Date.now()+3000;
            while(Number(vars(run).hits)!==count && Date.now()<deadline){await stepFrames(run.vm,4);await new Promise(done=>setTimeout(done,10));}
            assert.equal(Number(vars(run).hits),count);assert.equal(Number(life.value),1);
            await stepFrames(run.vm,5);
        }
        assert.deepEqual(run.errors,[]);
    });
});

test('omitted optional parameters are undefined and defaults run only for undefined',async()=>{
    await roundtrip(`let calls=0
function count(times?:number){if(!times){times=3};calls+=times}
function choose(value:any=7){return value}
count()
count(5)
let omitted=choose()
let explicit=choose(undefined)
let nothing=choose(null)
let zero=choose(0)
let text=choose("0")`,run=>{
        const v=vars(run);assert.equal(Number(v.calls),8);assert.equal(v.omitted,7);assert.equal(v.explicit,7);assert.equal(v.nothing,null);assert.equal(v.zero,0);assert.equal(v.text,'0');
    });
});

test('SB3 retains nonfinite scalar values and negative zero without restarting',async()=>{
    const imported=arcadeToPseudocode(`let nan=0/0
let positive=1/0
let negative=-1/0
let minusZero=-0
let ordinary="NaN"`),run=await execute(imported);
    await run.vm.loadProject(Buffer.from(await(await run.vm.saveProjectSb3()).arrayBuffer()));
    const v=vars(run);assert.ok(Number.isNaN(v.nan));assert.equal(v.positive,Infinity);assert.equal(v.negative,-Infinity);assert.ok(Object.is(v.minusZero,-0));assert.equal(v.ordinary,'NaN');
});

test('numeric sums retain their type through index variables and procedure returns',async()=>{
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
