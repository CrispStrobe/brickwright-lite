import test from 'node:test';
import assert from 'node:assert/strict';
import {appendFileSync} from 'node:fs';
import JSZip from 'jszip';
import Creator from '../overlay/scratch-gui/src/lib/sb3-creator.js';
import {parseMakeCodeTs} from '../overlay/scratch-gui/src/lib/bw-makecode/ts-import.js';
import {proveClassCallableSource,classMethodSourceSignature} from '../overlay/scratch-gui/src/lib/bw-makecode/class-callable-source-flow.js';
import {withClassResultFlowProof} from '../overlay/scratch-gui/src/lib/bw-makecode/class-callable-result-flow-proof.js';
import {ordinaryConstructorParameterProperties} from '../overlay/scratch-gui/src/lib/bw-makecode/class-parameter-property-source.js';
import {arcadeToPseudocode} from '../overlay/scratch-gui/src/lib/bw-makecode/arcade-translate.js';
import {projectToArcade} from '../overlay/scratch-gui/src/lib/bw-makecode/export-arcade.js';

const source=`class Counter {
 trace:number;
 constructor(public readonly seed:number,private step:(value:number)=>number,public tick:()=>void){this.trace=this.seed;}
 read(){return this.step(this.seed);}
 bump(){this.trace+=1;this.tick();}
}
let seen=0;let box=new Counter(2,(value:number)=>value+3,()=>{seen+=1;});
let first=box.read();box.bump();let last=box.trace;let seed=box.seed;`;
const parse=text=>parseMakeCodeTs(text,{parameterDefaults:true,retainParentheses:true,retainClassHeritage:true,retainCallableMetadata:true});
const cls=program=>program.body.find(node=>node.type==='Class');
const accepted=()=>{const program=parse(source),proof=proveClassCallableSource(program);assert.equal(proof.eligible,true,proof.unsupported.join('\n'));return {program,proof};};
const record=row=>{if(process.env.BW_SHARED_FRAME_SNAPSHOTS)appendFileSync(process.env.BW_SHARED_FRAME_SNAPSHOTS,JSON.stringify(row)+'\n');};
const clean=(value,required)=>{
 const names=new Set(['unsupported','warnings','errors','unparsed','diagnostics','fetchRefusals','refused','netAttempts',
  ...Object.getOwnPropertyNames(value).filter(name=>/unsupported|warn|error|unparsed|diagnostic|refus|netAttempts/i.test(name))]);
 const observed=Object.fromEntries([...names].map(name=>{const row=Object.getOwnPropertyDescriptor(value,name);
  return [name,!row?{state:'ABSENT'}:!Object.hasOwn(row,'value')?{state:'ACCESSOR_UNOBSERVED'}:{state:'PROVIDED',value:row.value}];}));
 record({stage:'parameter-property-provided-channels',channels:observed,required});
 for(const name of required)assert.ok(Array.isArray(Object.getOwnPropertyDescriptor(value,name)?.value),name);
 for(const [name,row]of Object.entries(observed))if(row.state!=='ABSENT'){
  assert.equal(row.state,'PROVIDED',name);assert.ok(Array.isArray(row.value),name);assert.deepEqual(row.value,[],name);
 }
};

test('ordinary parameter properties retain Number and Void callable constraints and actual ordered writes',()=>{
 const {program}=accepted(),owner=cls(program),ctor=owner.ctor;
 assert.equal(proveClassCallableSource(parse(source.replace('private step:','protected step:'))).eligible,true);
 assert.equal(ordinaryConstructorParameterProperties(owner),true);
 assert.equal(ctor.parameterProperties,ctor.params.parameterProperties);
 assert.deepEqual(ctor.parameterProperties.map(value=>value.name),['seed','step','tick']);
 assert.deepEqual(Object.getOwnPropertyDescriptor(ctor.params,'parameterProperties'),{value:ctor.parameterProperties,writable:false,enumerable:false,configurable:false});
 assert.deepEqual(ctor.body.slice(0,3).map(statement=>[statement.expr.left.name,statement.expr.right.name]),[['seed','seed'],['step','step'],['tick','tick']]);
 assert.equal(ctor.body[3].expr.right.name,'seed');
});

test('parameter property correspondence refuses independent metadata, fields, modifiers and write order',()=>{
 for(const change of [
  owner=>{owner.ctor.parameterProperties=structuredClone(owner.ctor.parameterProperties);},
  owner=>{owner.ctor.parameterProperties.reverse();},
  owner=>{owner.ctor.params.push('seed');},
  owner=>{owner.fields.find(field=>field.name==='seed').typeName='string';},
  owner=>{owner.fields.find(field=>field.name==='seed').modifiers=['public'];},
  owner=>{owner.fields.find(field=>field.name==='seed').parameterProperty=false;},
  owner=>{owner.ctor.body.splice(0,1);},
  owner=>{[owner.ctor.body[0],owner.ctor.body[1]]=[owner.ctor.body[1],owner.ctor.body[0]];},
  owner=>{owner.ctor.body[0].expr.right.name='trace';},
  owner=>{owner.ctor.body.unshift({type:'ExpressionStatement',expr:{type:'Call',callee:{type:'Identifier',name:'unknown'},args:[]}});},
 ]){const program=parse(source);change(cls(program));assert.equal(ordinaryConstructorParameterProperties(cls(program)),false);assert.equal(proveClassCallableSource(program).eligible,false);}
});

test('actual argument producers, readonly, visibility and complete neighboring bodies remain required',()=>{
 for(const text of [
  source.replace('new Counter(2,','new Counter("wrong" as any,'),
  source.replace('value+3','"wrong"'),
  source+'box.seed=9;',source+'let leaked=box.step;',
  source.replace('constructor(public readonly seed:number,','constructor(public readonly seed:number=2,'),
  source+'function unvisited(value:any){return value.missing();}',
  source.replace('this.trace=this.seed;','this.trace=unknown();'),
  source.replace('trace:number;','trace:number=this.seed;'),
 ])assert.equal(proveClassCallableSource(parse(text)).eligible,false,text);
});

test('reflection transfers hidden parser roles and shared metadata without preinitializing fields',()=>{
 const {program,proof}=accepted(),lowered=withClassResultFlowProof(program,proof),owner=cls(lowered);
 assert.notEqual(lowered,program);assert.notEqual(owner.ctor.params,cls(program).ctor.params);
 assert.equal(owner.ctor.parameterProperties,owner.ctor.params.parameterProperties);
 assert.notEqual(owner.ctor.parameterProperties,cls(program).ctor.parameterProperties);
 assert.deepEqual(Object.getOwnPropertyDescriptor(owner.ctor.params,'parameterProperties'),{value:owner.ctor.parameterProperties,writable:false,enumerable:false,configurable:false});
 assert.equal(ordinaryConstructorParameterProperties(owner),true);
 assert.deepEqual(owner.ctor.body,cls(program).ctor.body);
 assert.ok(owner.fields.filter(field=>field.parameterProperty).every(field=>field.init===null));
 assert.equal(proveClassCallableSource(lowered).eligible,true);
});

test('hidden metadata mutation expires a completed proof permanently while fresh source can reprove',()=>{
 for(const mutate of [
  owner=>{const values=owner.ctor.params.parameterProperties;const old=values[0].modifiers;values[0].modifiers=['private'];return()=>{values[0].modifiers=old;};},
  owner=>{const old=owner.ctor.params;owner.ctor.params=[...old];return()=>{owner.ctor.params=old;};},
  owner=>{const old=owner.ctor.parameterProperties;owner.ctor.parameterProperties=[...old];return()=>{owner.ctor.parameterProperties=old;};},
 ]){const {program,proof}=accepted(),owner=cls(program),method=owner.methods[0],restore=mutate(owner);
  assert.throws(()=>classMethodSourceSignature(proof,program,method),/actual unchanged source proof/);restore();
  assert.throws(()=>withClassResultFlowProof(program,proof),/actual unchanged source proof/);
  assert.equal(proveClassCallableSource(program).eligible,true);
 }
});

test('descriptor accessors are observed without invoking them and cannot revive a proof',()=>{
 const {program,proof}=accepted(),owner=cls(program),property=owner.ctor.parameterProperties[0];
 const descriptor=Object.getOwnPropertyDescriptor(property,'typeName');let invoked=0;
 Object.defineProperty(property,'typeName',{configurable:true,enumerable:true,get(){invoked++;throw Error('must not invoke');}});
 assert.throws(()=>withClassResultFlowProof(program,proof),/actual unchanged source proof/);assert.equal(invoked,0);
 Object.defineProperty(property,'typeName',descriptor);
 assert.throws(()=>withClassResultFlowProof(program,proof),/actual unchanged source proof/);assert.equal(invoked,0);
 const fresh=parse(source),ctor=cls(fresh).ctor,top=Object.getOwnPropertyDescriptor(ctor,'parameterProperties');
 Object.defineProperty(ctor,'parameterProperties',{configurable:true,enumerable:true,get(){invoked++;throw Error('must not invoke');}});
 assert.equal(proveClassCallableSource(fresh).eligible,false);assert.equal(invoked,0);
 Object.defineProperty(ctor,'parameterProperties',top);assert.equal(proveClassCallableSource(fresh).eligible,true);
});

test('parameter property public Code and two actual SB3 projects export and reimport full bodies',async()=>{
 const original=parse(source),before=structuredClone(original),imported=arcadeToPseudocode({'main.ts':source});
 record({stage:'parameter-property-import',source,result:imported});clean(imported,['unsupported','warnings']);assert.deepEqual(original,before);
 const first=new Creator();first.parse(imported.code);record({stage:'parameter-property-Creator',project:first.project,errors:first.errors,warnings:first.warnings,unparsed:first.unparsed});clean(first,['errors','warnings','unparsed']);
 const firstBytes=Buffer.from(await(await first.generateSB3()).arrayBuffer()),firstZip=await JSZip.loadAsync(firstBytes),firstProject=JSON.parse(await firstZip.file('project.json').async('string'));
 record({stage:'parameter-property-SB3',bytes:firstBytes.toString('base64'),project:firstProject});assert.deepEqual(firstProject,first.project);
 const exported=projectToArcade(firstProject);record({stage:'parameter-property-export',result:exported});clean(exported,['unsupported','warnings']);
 const again=arcadeToPseudocode(exported.files);record({stage:'parameter-property-reimport',result:again});clean(again,['unsupported','warnings']);
 const second=new Creator();second.parse(again.code);record({stage:'parameter-property-second-Creator',project:second.project,errors:second.errors,warnings:second.warnings,unparsed:second.unparsed});clean(second,['errors','warnings','unparsed']);
 const secondBytes=Buffer.from(await(await second.generateSB3()).arrayBuffer()),secondZip=await JSZip.loadAsync(secondBytes),secondProject=JSON.parse(await secondZip.file('project.json').async('string'));
 record({stage:'parameter-property-second-SB3',bytes:secondBytes.toString('base64'),project:secondProject});assert.deepEqual(secondProject,second.project);
 const final=projectToArcade(secondProject);record({stage:'parameter-property-second-export',result:final});clean(final,['unsupported','warnings']);
 const reconstructed=parse(final.ts);assert.equal(proveClassCallableSource(reconstructed).eligible,true);
 assert.match(final.ts,/Counter/);assert.match(final.ts,/trace/);assert.match(final.ts,/step/);assert.match(final.ts,/tick/);
});
