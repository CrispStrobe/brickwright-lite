import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {EventEmitter} from 'node:events';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';
import {qualifiedCallableCodecSource} from './helpers/callable-codec-source.mjs';
import {parseMakeCodeTs} from '../overlay/scratch-gui/src/lib/bw-makecode/ts-import.js';
import {lowerCallableValues} from '../overlay/scratch-gui/src/lib/bw-makecode/lower-callable-values.js';
import {callableDeclarationEnvelope} from '../overlay/scratch-gui/src/lib/bw-makecode/callable-export-graph.js';
const require=createRequire(import.meta.url);
const values=require('../overlay/scratch-vm/src/util/bw-values.js');
const CallableValues=require('../overlay/scratch-vm/src/extensions/crispstrobe/arcade/callable-values.js');
const fixture=()=>{
    const runtime=new EventEmitter();
    let definition=true, names=[];
    const target={blocks:{getProcedureDefinition:code=>definition&&code==='counter'?'definition':null,
        getProcedureParamNamesIdsAndDefaults:()=>[names,[],[]]}};
    runtime.targets=[target];
    const service=new CallableValues(runtime,values);
    return {runtime,target,service,setDefinition:value=>{definition=value;},setNames:value=>{names=value;}};
};
test('actual host and canonical supplier factories have identical callable data transport rules',()=>{
    const source=qualifiedCallableCodecSource();
    const start=source.indexOf('  const makeValues = () => {'),end=source.indexOf('\n  };\n',start);
    const supplier=runInNewContext(source.slice(start,end+5)+'\nmakeValues();');
    const host=readFileSync(new URL('../overlay/scratch-vm/src/util/bw-values.js',import.meta.url),'utf8');
    const factory=host.slice(host.indexOf('const makeValues = () => {'),host.lastIndexOf('\nmodule.exports')).trim();
    assert.equal(factory,source.slice(start,end+5).split('\n').map(line=>line.startsWith('  ')?line.slice(2):line).join('\n').trim());
    for(const codec of [values,supplier]) {
        const runtime=new EventEmitter(),ref=codec.reference(runtime,'callable','one');
        assert.equal(codec.referenceId(runtime,codec.decode(JSON.parse(JSON.stringify(ref))),'callable'),'one');
        assert.equal(codec.referenceId({},ref,'callable'),null);
        assert.equal(codec.isReference(codec.reference(runtime,'unknown-function','one')),false);
        runtime.emit('PROJECT_START');assert.equal(codec.referenceId(runtime,ref,'callable'),null);
    }
});
test('a codec carrier without an actual registered native body cannot invoke or claim function typeof',()=>{
    const f=fixture(),ref=values.reference(f.runtime,'callable','transport-only');
    assert.throws(()=>f.service.invocation(ref,[]),/Stale or foreign callable/);
    assert.throws(()=>f.service.typeOf(ref),/Stale or foreign callable/);
    f.setDefinition(false);
    assert.throws(()=>f.service.declare(f.target,{procedure:'counter',site:'site',parameters:[],captures:[]}),/exact native procedure/);
    f.service.dispose();
});
test('current body parameter mutation, unknown metadata and resource lifetime stay explicit refusals',()=>{
    const f=fixture();
    assert.throws(()=>f.service.declare(f.target,{procedure:'counter',site:'site',parameters:[],captures:[],body:'return 1'}),/Unknown callable definition fields/);
    f.service.declare(f.target,{procedure:'counter',site:'site',parameters:[],captures:[]});
    const ref=f.service.create(f.target,'counter');assert.equal(f.service.typeOf(ref),'function');
    f.setNames(['foreign']);assert.throws(()=>f.service.invocation(ref,[]),/matching current native procedure/);
    f.setNames([]);f.setDefinition(false);assert.throws(()=>f.service.hold(ref),/matching current native procedure/);
    f.setDefinition(true);f.runtime.emit('PROJECT_STOP_ALL');assert.throws(()=>f.service.hold(ref),/Stale or foreign callable/);
    f.service.dispose();
});

test('source plans bind creation to the actual lexical factory frame rather than matching local names',()=>{
    const result=lowerCallableValues(parseMakeCodeTs('function makeCounter(start:number):()=>number {let n=start;return()=>{n+=1;return n}} let first=makeCounter(2);',{retainCallableMetadata:true}));
    assert.deepEqual(result.unsupported,[]);const plan=result.program.bwCallableLexicalPlan,site=plan.sites[0];
    plan.owners.find(owner=>owner.id===site.owner).procedure='counter';
    const f=fixture();f.service.declare(f.target,{...callableDeclarationEnvelope(plan,site.id),procedure:'counter'});
    const binding=plan.bindings.find(binding=>binding.id===site.captures[0].binding),locals={[binding.nativeName]:2};
    assert.throws(()=>f.service.create(f.target,'counter',{locals}),/actual lexical frame owner/);
    assert.throws(()=>f.service.create(f.target,'counter',{locals,ownerProcedure:'unrelated'}),/actual lexical frame owner/);
    const ref=f.service.create(f.target,'counter',{locals,ownerProcedure:'makeCounter %s'});
    assert.equal(f.service.typeOf(ref),'object');f.service.dispose();
});
