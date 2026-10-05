import test from 'node:test';
import assert from 'node:assert/strict';
import {EventEmitter} from 'node:events';
import BWValues from '../overlay/scratch-vm/src/util/bw-values.js';
import {runPxtCore} from './helpers/pxt-core-runtime.mjs';
import {arcadeToPseudocode} from '../overlay/scratch-gui/src/lib/bw-makecode/arcade-translate.js';
import {projectToArcade} from '../overlay/scratch-gui/src/lib/bw-makecode/export-arcade.js';
import {runProgram,stepFrames} from './helpers/bw-vm.mjs';
import {compile} from '../scripts/lib/pxt-node.mjs';
const vars=run=>Object.fromEntries(run.vm.runtime.targets.flatMap(t=>Object.values(t.variables)).map(v=>[v.name.replace(/^Game_/,''),v.value]));

test('array coercion and comparison agree with genuinely compiled PXT, including aliases through calls',async()=>{
    const source=`let first:any=[5]
let second:any=[5]
let empty:any=[]
let nested:any=[[5]]
let cycle:any[]=[]
cycle.push(cycle)
function echo(value:any){return value}
let alias=echo(first)
let references:any[]=[first,second]
let joined=first+2
let text=first+""
let sum=first+second
let product=first*2
let difference=first-2
let divided=first/2
let remainder=first%2
let converted=+empty
let negated=-nested
let cyclicText=cycle+""
let same=first===alias
let different=first!==second
let loose=first==5
let objectText=first=="[object Object]"
let textCollision=first==="array-reference:1"
let ordered=first<=second
let index=references.indexOf(alias)
let removed=references.removeElement(alias)
let removedStrict=removed===true
let remaining=references.length`;
    const original=await runPxtCore(source);
    const names=['joined','text','sum','product','difference','divided','remainder','converted','negated','cyclicText','same','different','loose','objectText','textCollision','ordered','index','removed','removedStrict','remaining'];
    const check=run=>{
        const actual=vars(run);
        for(const name of names)assert.deepEqual(actual[name],original[name],name);
        assert.equal(actual.first,actual.alias,'procedure JSON must restore the same reference value');
        assert.deepEqual(run.errors,[]);assert.deepEqual(run.creator.warnings,[]);
    };
    const execute=async imported=>{
        assert.deepEqual(imported.unsupported,[]);
        const run=await runProgram(imported.code,{frames:80,storage:true,uploads:imported.costumes});check(run);return run;
    };
    const imported=arcadeToPseudocode(source),run=await execute(imported);
    await execute({...imported,code:run.creator.decompile()});
    const exported=projectToArcade(run.creator.project,{costumeSvg:(t,c)=>run.creator.assets.get(c.assetId)?.data});assert.deepEqual(exported.unsupported,[]);
    const built=await compile('arcade',exported.files);assert.equal(built.success,true,JSON.stringify({diagnostics:built.diagnostics,ts:exported.ts}));
    await execute(arcadeToPseudocode(exported.ts));
    await run.vm.loadProject(Buffer.from(await(await run.vm.saveProjectSb3()).arrayBuffer()));run.vm.greenFlag();await stepFrames(run.vm,80);check(run);
});

test('reference tags survive JSON and SB3 without aliasing ordinary text or another runtime',async()=>{
    const a=new EventEmitter(),b=new EventEmitter();
    const first=BWValues.reference(a,'array','array-reference:1'),other=BWValues.reference(b,'array','array-reference:1');
    assert.equal(BWValues.decode(JSON.parse(JSON.stringify(first))),first);
    assert.equal(String(first),'[object Object]');
    assert.equal(BWValues.compare(first,'===',other),false);
    assert.equal(BWValues.compare(first,'==','array-reference:1'),false);
    assert.equal(BWValues.referenceId(a,'array-reference:1','array'),null);
    assert.equal(BWValues.referenceId(b,first,'array'),null);
    assert.equal(BWValues.referenceId(a,JSON.parse(JSON.stringify(first)),'array'),'array-reference:1');
    assert.equal(BWValues.indexOf([first],JSON.parse(JSON.stringify(first))),0);
    const sparse=new Array(3);sparse[2]=undefined;
    assert.equal(BWValues.indexOf(sparse,undefined),2);assert.equal(BWValues.indexOf([first],first,Infinity),-1);
    a.emit('PROJECT_START');assert.equal(BWValues.compare(first,'===',BWValues.reference(a,'array','array-reference:1')),false);
    const imported=arcadeToPseudocode('let rows=[[1]];let ordinary="array-reference:1"'),run=await runProgram(imported.code,{frames:30,storage:true});
    const before=vars(run),p=run.vm.runtime._primitives;
    assert.equal(p.arrays_referenceLength({ARRAY:before.rows}),1);
    assert.equal(p.arrays_referenceItem({ARRAY:before.rows.bwReference.id,INDEX:0}),'', 'ordinary text cannot access the reference table');
    assert.equal(run.errors.length,1);
    await run.vm.loadProject(Buffer.from(await(await run.vm.saveProjectSb3()).arrayBuffer()));
    const after=vars(run);assert.equal(BWValues.compare(before.rows,'===',after.rows),true);
    assert.equal(after.ordinary,'array-reference:1');assert.ok(BWValues.isReference(after.rows));assert.equal(String(after.rows),String(before.rows));
});

test('an uninitialized typed array stays undefined until an explicit array assignment',async()=>{
    const source=`let absent:any[]
let text=absent+""
let numeric=+absent
let before=absent===undefined
let truth=!!absent
absent=[5]
let after=absent+""
let item=absent[0]`;
    const expected=await runPxtCore(source),names=['text','numeric','before','truth','after','item'];
    const check=run=>{
        for(const name of names)assert.deepEqual(vars(run)[name],expected[name],name);
        assert.deepEqual(run.errors,[]);assert.deepEqual(run.creator.warnings,[]);
    };
    const execute=async imported=>{
        assert.deepEqual(imported.unsupported,[]);
        const run=await runProgram(imported.code,{frames:60,storage:true});check(run);return run;
    };
    const imported=arcadeToPseudocode(source),run=await execute(imported);
    await execute({...imported,code:run.creator.decompile()});
    const exported=projectToArcade(run.creator.project);assert.deepEqual(exported.unsupported,[]);
    const built=await compile('arcade',exported.files);assert.equal(built.success,true,JSON.stringify({diagnostics:built.diagnostics,ts:exported.ts}));
    await execute(arcadeToPseudocode(exported.ts));
    await run.vm.loadProject(Buffer.from(await(await run.vm.saveProjectSb3()).arrayBuffer()));run.vm.greenFlag();await stepFrames(run.vm,60);check(run);
});
