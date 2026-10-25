import test from 'node:test';
import assert from 'node:assert/strict';
import {parseMakeCodeTs} from '../overlay/scratch-gui/src/lib/bw-makecode/ts-import.js';
import {arcadeToPseudocode} from '../overlay/scratch-gui/src/lib/bw-makecode/arcade-translate.js';
import {projectToArcade} from '../overlay/scratch-gui/src/lib/bw-makecode/export-arcade.js';
import {runProgram,stepFrames,clearStrayTimers} from './helpers/bw-vm.mjs';
import {runPxtArcade} from './helpers/pxt-arcade-runtime.mjs';
const values=run=>Object.fromEntries(run.vm.runtime.targets.flatMap(t=>Object.values(t.variables)).map(v=>[v.name.replace(/^Game_/,''),v.value?.bwUndefined?undefined:v.value]));

test('generic calls retain nested type metadata, one callee and argument evaluation, and outer member chains',()=>{
    const calls=parseMakeCodeTs('let result=forward<Array<Array<number>>,string>(rows(),name());let chain=new Holder<number>(source()).read<string>(key())[0];').body.map(s=>s.decls[0].init);
    assert.deepEqual(calls[0].typeArguments,['Array<Array<number>>','string']);assert.equal(calls[0].callee.name,'forward');
    assert.deepEqual(calls[0].args.map(n=>n.callee.name),['rows','name']);
    assert.equal(calls[1].type,'Index');const read=calls[1].object;assert.deepEqual(read.typeArguments,['string']);
    assert.equal(read.callee.object.isNew,true);assert.deepEqual(read.callee.object.typeArguments,['number']);
    assert.equal(read.callee.object.args[0].callee.name,'source');assert.equal(read.args[0].callee.name,'key');
});

test('speculative call types preserve relational and shift expressions when no valid typed call follows',()=>{
    const nodes=parseMakeCodeTs('let a=left < right >> shift;let b=left < right+1 > (other);let c=left < right;').body.map(s=>s.decls[0].init);
    assert.equal(nodes[0].op,'<');assert.equal(nodes[0].right.op,'>>');
    assert.equal(nodes[1].op,'>');assert.equal(nodes[1].left.right.op,'+');
    assert.equal(nodes[2].op,'<');assert.ok(!nodes.some(n=>n.type==='Call'));
});

const main=`let actor=sprites.create(img\`1\`,SpriteKind.Player)
function forward<T>(value:T):T{return value}
function select<A,B>(left:A,right:B):A{return left}
function factory<T>(make:()=>T):T{return make()}
let trace=0
function left(){trace=trace*10+1;return 7}
function right(){trace=trace*10+2;return 8}
let selected=select<number,number>(left(),right())
let numberValue=forward<number>(3)
let textValue=forward<string>("typed")
let booleanValue=forward<boolean>(true)
let missingValue=forward<any>(undefined)
let rows=[1,2]
let alias:number[]=forward<number[]>(rows)
alias[0]=9
let shared=rows[0]
let nested:number[][]=forward<number[][]>([[3,4]])
let nestedValue=nested[0][1]
let removed:number[][]=forward<number[][]>([[5],[6]])
let popped=removed.pop()[0]
let shifted=removed.shift()[0]
let randomSource:number[][]=forward<number[][]>([[8]])
let picked=Math.pickRandom(randomSource)[0]
let typed:number[][]=[[13]]
let typedValue=typed[0][0]
let typedImages:Image[]=[img\`1\`]
let imageWidth=typedImages[0].width
let spriteAlias:Sprite=forward<Sprite>(actor)
spriteAlias.x=35
let actorX=actor.x
let made=factory<number>(()=>11)
let done=1
done+=0`;
const expected={trace:12,selected:7,numberValue:3,textValue:'typed',booleanValue:true,missingValue:undefined,shared:9,nestedValue:4,popped:6,shifted:5,picked:8,typedValue:13,imageWidth:1,actorX:35,made:11,done:1};
const check=actual=>{for(const [key,value]of Object.entries(expected))assert.equal(Object.hasOwn(actual,key)?actual[key]:actual['Game_'+key],value,key);};

test('explicit generic calls execute like original Arcade and retain aliases through Code, export and fresh SB3',async()=>{
    try{
        check(await runPxtArcade(main));
        const imported=arcadeToPseudocode(main);assert.deepEqual(imported.unsupported,[]);
        const ready=async run=>{const deadline=Date.now()+3000;while(values(run).done!==1&&Date.now()<deadline){await stepFrames(run.vm,4);await new Promise(resolve=>setTimeout(resolve,10));}assert.equal(values(run).done,1);};
        const execute=async input=>{const run=await runProgram(input.code,{frames:150,storage:true,uploads:input.costumes});await ready(run);assert.deepEqual(run.errors,[]);assert.deepEqual(run.creator.warnings,[]);check(values(run));return run;};
        const run=await execute(imported);await execute({...imported,code:run.creator.decompile()});
        const exported=projectToArcade(run.creator.project,{costumeSvg:(t,c)=>run.creator.assets.get(c.assetId)?.data});assert.deepEqual(exported.unsupported,[]);assert.match(exported.ts,/typedValue = typed\[0\]\[0\]/);assert.match(exported.ts,/imageWidth = typedImages\[0\]\.width/);check(await runPxtArcade(exported.files,{waitForGlobals:{done:1}}));
        const again=arcadeToPseudocode(exported.ts);assert.deepEqual(again.unsupported,[]);await execute(again);
        const saved=Buffer.from(await(await run.vm.saveProjectSb3()).arrayBuffer());await run.vm.loadProject(saved);run.vm.greenFlag();await stepFrames(run.vm,150);await ready(run);check(values(run));
        const fresh=await runProgram('SPRITE Placeholder:\nWHEN flag clicked:\n  hide',{frames:0,storage:true});await fresh.vm.loadProject(saved);fresh.vm.greenFlag();await stepFrames(fresh.vm,150);await ready(fresh);assert.deepEqual(fresh.errors,[]);check(values(fresh));
    }finally{clearStrayTimers();}
});

test('generic constructor and unknown method calls retain unsupported runtime class diagnostics',()=>{
    const imported=arcadeToPseudocode('class Holder<T>{constructor(public value:T){}read():T{return this.value}}let value=new Holder<number>(3).read<string>("x")');
    assert.ok(imported.unsupported.length);assert.ok(imported.unsupported.some(s=>/class Holder/.test(s)),JSON.stringify(imported.unsupported));
});
