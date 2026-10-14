import test from 'node:test';
import assert from 'node:assert/strict';
import {arcadeToPseudocode} from '../overlay/scratch-gui/src/lib/bw-makecode/arcade-translate.js';
import {projectToArcade} from '../overlay/scratch-gui/src/lib/bw-makecode/export-arcade.js';
import {runProgram,stepFrames} from './helpers/bw-vm.mjs';
import {compile} from '../scripts/lib/pxt-node.mjs';
const vars=run=>Object.fromEntries(run.vm.runtime.targets.flatMap(t=>Object.values(t.variables)).map(v=>[v.name.replace(/^Game_/,''),v.value]));
async function execute(imported){
    assert.deepEqual(imported.unsupported,[]);
    const run=await runProgram(imported.code,{frames:80,uploads:imported.costumes,storage:true});
    assert.deepEqual(run.errors,[]);assert.deepEqual(run.creator.warnings,[]);return run;
}
async function roundtrip(source,check){
    const imported=arcadeToPseudocode(source),run=await execute(imported);await check(run);
    await check(await execute({...imported,code:run.creator.decompile()}));
    const exported=projectToArcade(run.creator.project,{costumeSvg:(t,c)=>run.creator.assets.get(c.assetId)?.data});assert.deepEqual(exported.unsupported,[]);
    const built=await compile('arcade',exported.files);assert.equal(built.success,true,JSON.stringify({diagnostics:built.diagnostics,ts:exported.ts}));
    await check(await execute(arcadeToPseudocode(exported.ts)));
    await run.vm.loadProject(Buffer.from(await(await run.vm.saveProjectSb3()).arrayBuffer()));run.vm.greenFlag();await stepFrames(run.vm,80);await check(run);
}
test('logical values preserve selected primitives and evaluate each selected operand once',async()=>{
    await roundtrip(`let calls=0
function tap(value:any){calls+=1;return value}
let a=tap(0)||tap(7)
let b=tap("0")||tap(8)
let c=tap(false)&&tap(9)
let d=tap(undefined)||tap(null)
let e=""&&"unused"
let f=true&&"false"
let g=undefined&&12
let values=[a,b,c,d,e,f,g]
let result=0
if(a===7){result+=1}
if(b==="0"){result+=2}
if(c===false){result+=4}
if(d===null){result+=8}
if(e===""){result+=16}
if(f==="false"){result+=32}
if(g===undefined){result+=64}`,run=>{
        assert.equal(Number(vars(run).calls),6);assert.equal(Number(vars(run).result),127);
        const p=run.vm.runtime._primitives,values=vars(run).values;
        assert.deepEqual(Array.from({length:7},(_,i)=>p.arrays_referenceItem({ARRAY:values,INDEX:i})),[7,'0',false,null,'','false',{bwUndefined:true}]);
    });
});
test('nested logical arguments and array elements retain left-to-right evaluation order',async()=>{
    await roundtrip(`let trace=0
function tap(value:number){trace=trace*10+value;return value}
function pair(a:number,b:number){return a+b}
let sum=tap(1)+(0||tap(2))
let paired=pair(tap(3),0||tap(4))
let values=[tap(5),false&&tap(9),0||tap(6)]
let rows=[[0]]
let receiverCalls=0
let indexCalls=0
function getRow(){receiverCalls+=1;tap(7);return rows[0]}
function index(){indexCalls+=1;tap(8);return 0}
getRow()[index()]=0||tap(9)`,run=>{
        assert.equal(Number(vars(run).trace),123456789);assert.equal(Number(vars(run).sum),3);assert.equal(Number(vars(run).paired),7);
        assert.equal(Number(vars(run).receiverCalls),1);assert.equal(Number(vars(run).indexCalls),1);
        const p=run.vm.runtime._primitives,row=p.arrays_referenceItem({ARRAY:vars(run).rows,INDEX:0});
        assert.equal(p.arrays_referenceItem({ARRAY:row,INDEX:0}),9);
    });
});
test('logical and conditional selections retain Sprite, Image and array reference identity',async()=>{
    await roundtrip(`let first=sprites.create(img\`2\`,SpriteKind.Player)
let second=sprites.create(img\`7\`,SpriteKind.Food)
let chosen=first||second
chosen.x=25
let pictureA=img\`3\`
let pictureB=img\`5\`
let picture=(false&&pictureA)||pictureB
picture.fill(6)
let attached=sprites.create(picture,SpriteKind.Enemy)
let rows=[[first],[second]]
let row=rows[99]||rows[0]
row.push(second)
let fallback=rows[99]?rows[1]:row
fallback[1].y=35
let evaluations=0
function pick(flag:boolean){let selected=flag?pictureA:pictureB;return selected}
let returned=pick(false)
returned.fill(4)`,run=>{
        const [a,b,attached]=Object.values(run.vm.runtime.bwArcadeDeviceState.sprites);assert.equal(a.x,25);assert.equal(b.y,35);
        const value=vars(run),p=run.vm.runtime._primitives;
        assert.equal(value.chosen,value.first);assert.equal(value.picture,value.pictureB);assert.equal(value.returned,value.pictureB);
        assert.equal(value.row,value.fallback);assert.equal(p.arrays_referenceLength({ARRAY:value.row}),2);
        assert.equal(attached.image.pixels[0],4);
    });
});
test('lazy loop guards reevaluate selections and conditionals without executing skipped calls',async()=>{
    await roundtrip(`let calls=0
function limit(){calls+=1;return 3}
let i=0
while(i<(0||limit())){i++}
let j=0
for(let n=0;n<(false?limit():2);n++){j+=1}
let selected=0
function choose(flag:boolean){let local=flag?10:20;return local}
selected=choose(true)+(false?limit():choose(false))`,async run=>{
        const deadline=Date.now()+3000;
        while(Number(vars(run).selected)!==30 && Date.now()<deadline){await stepFrames(run.vm,5);await new Promise(done=>setTimeout(done,10));}
        assert.equal(Number(vars(run).calls),4,JSON.stringify({vars:vars(run),code:run.creator.decompile()}));assert.equal(Number(vars(run).i),3);assert.equal(Number(vars(run).j),2);assert.equal(Number(vars(run).selected),30);
    });
});
test('compound array assignment snapshots its reference, index and old value before a lazy right operand',async()=>{
    await roundtrip(`let rows=[[5]]
let receivers=0
let indexes=0
function receiver(){receivers+=1;return rows[0]}
function index(){indexes+=1;return 0}
function change(){rows[0][0]=100;return 7}
receiver()[index()]+=false?0:change()`,run=>{
        const p=run.vm.runtime._primitives,row=p.arrays_referenceItem({ARRAY:vars(run).rows,INDEX:0});
        assert.equal(p.arrays_referenceItem({ARRAY:row,INDEX:0}),12);
        assert.equal(Number(vars(run).receivers),1);assert.equal(Number(vars(run).indexes),1);
    });
});
test('ordinary compound assignments evaluate array receivers and indexes once before mutating calls',async()=>{
    await roundtrip(`let rows=[[5],[30]]
let selected=rows[0]
let receivers=0
let indexes=0
let trace=0
function receiver(){receivers+=1;trace=trace*10+1;return selected}
function index(){indexes+=1;trace=trace*10+2;return 0}
function change(){trace=trace*10+3;selected[0]=100;selected=rows[1];return 7}
receiver()[index()]+=change()
let result=rows[0][0]
let other=rows[1][0]`,run=>{
        assert.equal(Number(vars(run).receivers),1);assert.equal(Number(vars(run).indexes),1);
        assert.equal(Number(vars(run).trace),123);assert.equal(vars(run).result,12);assert.equal(vars(run).other,30);
    });
});
test('array increments and decrements convert old values and evaluate nested targets once',async()=>{
    await roundtrip(`let values:any[]=["5",undefined]
let calls=0
function receiver(){calls+=1;return values}
receiver()[0]++
++receiver()[1]
receiver()[0]--
--receiver()[0]
let numeric=values[0]
let absent=values[1]`,run=>{
        assert.equal(Number(vars(run).calls),4);assert.equal(vars(run).numeric,4);assert.ok(Number.isNaN(vars(run).absent));
    });
});
test('sprite compound properties retain the original receiver and old value across a mutating call',async()=>{
    await roundtrip(`let first=sprites.create(img\`2\`,SpriteKind.Player)
let second=sprites.create(img\`7\`,SpriteKind.Food)
function initial(){return 5}
first.x=initial()
second.x=30
let selected=first
let calls=0
function receiver(){calls+=1;return selected}
function change(){selected.x=100;selected=second;return 7}
receiver().x+=change()
receiver().x++`,run=>{
        const v=vars(run),sprites=run.vm.runtime.bwArcadeDeviceState.sprites;
        assert.equal(Number(v.calls),2);assert.equal(sprites[v.first].x,12);assert.equal(sprites[v.second].x,31);
    });
});
test('concurrent controller callbacks keep lazy value cells separate across paused procedure calls',async()=>{
    await roundtrip(`let results:any[]=[]
function delayed(value:any){pause(20);return value}
controller.A.onEvent(ControllerButtonEvent.Pressed,function(){let selected=delayed(0)||delayed("0");results.push(selected)})
controller.B.onEvent(ControllerButtonEvent.Pressed,function(){let selected=delayed(false)?99:(delayed(undefined)||delayed(null));results.push(selected)})`,async run=>{
        const p=run.vm.runtime._primitives,array=vars(run).results;
        assert.equal(p.arrays_referenceLength({ARRAY:array}),0);
        for(const key of [' ','z'])run.vm.postIOData('keyboard',{key,isDown:true});await stepFrames(run.vm,3);
        for(const key of [' ','z'])run.vm.postIOData('keyboard',{key,isDown:false});
        const deadline=Date.now()+3000;
        while(p.arrays_referenceLength({ARRAY:array})!==2 && Date.now()<deadline){await stepFrames(run.vm,4);await new Promise(done=>setTimeout(done,10));}
        const results=Array.from({length:p.arrays_referenceLength({ARRAY:array})},(_,i)=>p.arrays_referenceItem({ARRAY:array,INDEX:i}));
        assert.equal(results.length,2,JSON.stringify({results,vars:vars(run),errors:run.errors,code:run.creator.decompile(),threads:run.vm.runtime.threads.map(t=>({status:t.status,stack:t.stack.map(id=>t.target.blocks.getBlock(id)?.opcode),frames:t.stackFrames}))}));assert.ok(results.includes('0'));assert.ok(results.includes(null));
        assert.deepEqual(run.errors,[]);
    });
});

test('for-loop initializers and updates lower lazy values with an ordinary guard',async()=>{
    await roundtrip(`let calls=0
function next(value:number){calls+=1;return value}
let total=0
for(let i=0||next(1);i<4;i=i+(false?next(99):next(1))){total+=i}`,async run=>{
        const deadline=Date.now()+3000;
        while(Number(vars(run).total)!==6 && Date.now()<deadline){await stepFrames(run.vm,5);await new Promise(done=>setTimeout(done,10));}
        assert.equal(Number(vars(run).total),6);assert.equal(Number(vars(run).calls),4);
    });
});
