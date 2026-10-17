import test from 'node:test';
import assert from 'node:assert/strict';
import {appendFileSync} from 'node:fs';
import JSZip from 'jszip';
import Creator from '../overlay/scratch-gui/src/lib/sb3-creator.js';
import {parseMakeCodeTs} from '../overlay/scratch-gui/src/lib/bw-makecode/ts-import.js';
import {proveClassCallableSource,classMethodSourceSignature,classConstructorSourceSignature} from '../overlay/scratch-gui/src/lib/bw-makecode/class-callable-source-flow.js';
import {withClassResultFlowProof} from '../overlay/scratch-gui/src/lib/bw-makecode/class-callable-result-flow-proof.js';
import {createClassCallableDescriptors} from '../overlay/scratch-gui/src/lib/bw-makecode/callable-class-descriptors.js';
import {validateClassCallablePlan} from '../overlay/scratch-gui/src/lib/bw-makecode/class-callable-plan.js';
import {classCallableExportTypes} from '../overlay/scratch-gui/src/lib/bw-makecode/class-callable-export-types.js';
import {ordinaryConstructorParameterProperties} from '../overlay/scratch-gui/src/lib/bw-makecode/class-parameter-property-source.js';
import {lowerStaticCallbackHelpers} from '../overlay/scratch-gui/src/lib/bw-makecode/static-callback-helpers.js';
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
 const signature=classConstructorSourceSignature(proof,program,cls(program));
 assert.throws(()=>classConstructorSourceSignature({...proof},program,cls(program)),/actual unchanged source proof/);
 assert.equal(signature.parameters[1].type.kind,'callable');assert.equal(signature.parameters[1].type.result.name,'number');
 assert.deepEqual(owner.ctor.bwClassCallableSignature,signature);signature.parameters[1].type.result.name='string';
 assert.equal(classConstructorSourceSignature(proof,program,cls(program)).parameters[1].type.result.name,'number');
 // An ordinary user class named callable retains its existing named codec;
 // only the explicit signature selects the function resource domain.
 const types=classCallableExportTypes(new Map([['callable',{name:'callable',parent:null}]]));
 assert.equal(types.parameter({name:'value',type:'callable',optional:false}),'callable');
 assert.match(types.parameter({name:'value',type:'callable',optional:false,callableSignature:classConstructorSourceSignature(proof,program,cls(program)).parameters[1].type}),/=>\s*number/);
 assert.deepEqual(owner.ctor.body,cls(program).ctor.body);
 assert.ok(owner.fields.filter(field=>field.parameterProperty).every(field=>field.init===null));
 // Unqualified legacy higher-order helpers still specialize and refuse escapes;
 // retaining the checked class constructor must not exempt these templates.
 const legacy=lowerStaticCallbackHelpers(parse('function apply(handler:()=>number){return handler()}let result=apply(function(){return 3})'));
 assert.deepEqual(legacy.unsupported,[]);assert.ok(!legacy.program.body.some(node=>node.type==='FunctionDeclaration'&&node.name==='apply'));
 assert.ok(legacy.program.loweredStaticCallbacks);
 const escaped=lowerStaticCallbackHelpers(parse('let stored=0;function save(handler:()=>number){stored=handler}save(function(){return 3})'));
 assert.ok(escaped.unsupported.some(message=>/escapes/.test(message)));

 assert.equal(proveClassCallableSource(lowered).eligible,true);
 owner.ctor.bwClassCallableSignature.parameters[1].type.result.name='string';
 assert.ok(createClassCallableDescriptors(lowered).unsupported.length);
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
 // Mutations keep the actual declaration/procedure graph and supplied
 // closures. They must fail current export rather than acquire type authority
 // from an edited declaration or repeated lexical-plan payload.
 const literal=(target,block,name)=>{const slot=block.inputs[name][1];return Array.isArray(slot)?slot[1]:target.blocks[slot].fields.TEXT[0];};
 const setLiteral=(target,block,name,value)=>{const slot=block.inputs[name][1];if(Array.isArray(slot))slot[1]=value;else target.blocks[slot].fields.TEXT[0]=value;};
 const declaration=project=>{const found=project.targets.flatMap(target=>Object.values(target.blocks).filter(block=>block.opcode==='arcade_declareClass'&&literal(target,block,'NAME')==='Counter').map(block=>({target,block})));assert.equal(found.length,1);return found[0];};
 const constructorBindings=project=>{
  const {target,block}=declaration(project),code=literal(target,block,'CONSTRUCTOR');
  const prototypes=Object.entries(target.blocks).filter(([,value])=>value.opcode==='procedures_prototype'&&value.mutation.proccode===code);
  assert.equal(prototypes.length,1,'actual declared constructor survives callback lowering');
  const [prototypeID,prototype]=prototypes[0],names=JSON.parse(prototype.mutation.argumentnames),definition=target.blocks[prototype.parent];
  assert.equal(definition.opcode,'procedures_definition');assert.equal(definition.inputs.custom_block[1],prototypeID);
  assert.deepEqual(names.slice(1),['seed','step','tick']);
  let parent=prototype.parent,current=definition.next;
  for(const field of JSON.parse(literal(target,block,'FIELDS')).filter(field=>field.parameterProperty)){
   const write=target.blocks[current];assert.equal(write.opcode,'arcade_setObjectField');assert.equal(write.parent,parent);assert.equal(literal(target,write,'FIELD'),field.name);
   for(const [input,name]of [['OBJECT',names[0]],['VALUE',field.name]]){
    const id=write.inputs[input][1],value=target.blocks[id];assert.equal(value.opcode,'arcade_getLocal');assert.equal(value.parent,current);assert.equal(literal(target,value,'NAME'),name);
   }
   parent=current;current=write.next;
  }
  assert.ok(current,'authored constructor body follows its actual parameter writes');
 };
 constructorBindings(firstProject);
 const exported=projectToArcade(firstProject);record({stage:'parameter-property-export',result:exported});clean(exported,['unsupported','warnings']);
 const unparen=node=>node?.type==='Parenthesized'?unparen(node.expression):node;
 const exportArrowBindings=(program,proof,phase,sourceText)=>{
  const constructions=program.body.flatMap(node=>node.type==='FunctionDeclaration'?node.body:[node])
   .filter(node=>node.type==='Declaration').flatMap(node=>node.decls.map(decl=>unparen(decl.init)))
   .filter(node=>node?.type==='Call'&&node.isNew&&node.callee.type==='Identifier'&&node.callee.name==='Counter');
  const numberArrow=constructions[0]?.args[1],voidArrow=constructions[0]?.args[2],
   numberSignature=numberArrow&&proof.flow.signature(proof.flow.profiles.get(numberArrow)),
   voidSignature=voidArrow&&proof.flow.signature(proof.flow.profiles.get(voidArrow)),
   assignment=unparen(voidArrow?.body?.[0]?.expr),fallback=unparen(assignment?.right),
   helper=fallback?.callee?.type==='Identifier'&&program.body.find(node=>node.type==='FunctionDeclaration'&&node.name===fallback.callee.name);
  record({stage:'parameter-property-export-arrow-bindings',phase,sourceText,program,eligible:proof.eligible,unsupported:proof.unsupported,constructionCount:constructions.length,numberArrow,numberSignature,voidArrow,voidSignature,helper});
  assert.equal(proof.eligible,true,proof.unsupported.join('\n'));assert.equal(constructions.length,1);
  assert.equal(numberArrow.type,'FunctionExpression');assert.equal(numberArrow.functionKind,'arrow');assert.deepEqual(numberArrow.params,['value']);
  assert.equal(numberSignature.parameters[0].type.name,'number');assert.equal(numberSignature.result.kind,'named');assert.equal(numberSignature.result.name,'number');
  assert.equal(numberArrow.body.length,1);assert.equal(numberArrow.body[0].type,'Return');
  const returned=unparen(numberArrow.body[0].value);assert.equal(returned.type,'Binary');assert.equal(returned.op,'+');
  assert.equal(unparen(returned.left).type,'Identifier');assert.equal(unparen(returned.left).name,numberArrow.params[0]);
  const increment=unparen(returned.right);assert.equal(increment.type,'Binary');assert.equal(increment.op,'+');assert.equal(unparen(increment.left).type,'Number');assert.equal(unparen(increment.right).type,'Number');assert.equal(unparen(increment.left).value,'0');assert.equal(unparen(increment.right).value,'3');
  // The separately unproved captured global stays on its generic path. The
  // Number Arrow's success must not grant that Void callback a Number fact.
  assert.equal(voidArrow.type,'FunctionExpression');assert.equal(voidArrow.functionKind,'arrow');assert.deepEqual(voidArrow.params,[]);assert.equal(voidSignature.result.name,'void');
  assert.equal(assignment.type,'Assignment');assert.equal(assignment.op,'=');assert.equal(assignment.left.name,'seen');assert.equal(fallback.type,'Call');
  assert.ok(helper);assert.match(helper.name,/^__bwBinaryAdd_*$/);assert.deepEqual(helper.params,['left','right']);
  assert.equal(helper.paramTypes.left.text,'any');assert.equal(helper.paramTypes.right.text,'any');assert.equal(helper.returnType,'any');
  assert.equal(helper.body.length,1);const operation=unparen(helper.body[0].value);assert.equal(operation.type,'Binary');assert.equal(operation.op,'+');
  assert.equal(operation.left.name,helper.params[0]);assert.equal(operation.right.name,helper.params[1]);
 };
 const exportedProgram=parse(exported.ts),exportedProof=proveClassCallableSource(exportedProgram);exportArrowBindings(exportedProgram,exportedProof,'first',exported.ts);
 const actual=declaration(firstProject),parameters=JSON.parse(literal(actual.target,actual.block,'PARAMETERS'));
 assert.deepEqual(parameters.map(parameter=>parameter.type),['number','callable','callable']);
 assert.equal(parameters[1].callableSignature.result.name,'number');assert.equal(parameters[2].callableSignature.result.name,'void');
 const edits=[
  project=>{const {target,block}=declaration(project),values=JSON.parse(literal(target,block,'PARAMETERS'));values[1].callableSignature.result.name='string';setLiteral(target,block,'PARAMETERS',JSON.stringify(values));},
  project=>{const {target,block}=declaration(project),values=JSON.parse(literal(target,block,'PARAMETERS'));values[1].callableSignature.parameters[0].type.name='string';setLiteral(target,block,'PARAMETERS',JSON.stringify(values));},
  project=>{const {target,block}=declaration(project),values=JSON.parse(literal(target,block,'PARAMETERS'));values[1].type='(value:number)=>number';delete values[1].callableSignature;setLiteral(target,block,'PARAMETERS',JSON.stringify(values));},
  project=>{const {target,block}=declaration(project),code=literal(target,block,'CONSTRUCTOR'),prototypes=Object.values(target.blocks).filter(value=>value.opcode==='procedures_prototype'&&value.mutation.proccode===code);assert.equal(prototypes.length,1);const names=JSON.parse(prototypes[0].mutation.argumentnames);assert.deepEqual(names.slice(1),['seed','step','tick']);names[2]='wrongStep';prototypes[0].mutation.argumentnames=JSON.stringify(names);},
  project=>{let count=0;for(const target of project.targets)for(const block of Object.values(target.blocks))if(block.opcode==='arcade_declareCallable'){
   const metadata=JSON.parse(literal(target,block,'METADATA')),owners=metadata.plan.owners.filter(owner=>owner.kind==='constructor'&&owner.className==='Counter');assert.equal(owners.length,1);
   const binding=metadata.plan.bindings.find(binding=>binding.id===owners[0].parameters[1]);assert.ok(binding);assert.equal(binding.owner,owners[0].id);assert.equal(binding.sourceName,'step');
   owners[0].signature.parameters[1].type.result.name='string';binding.type.result.name='string';
   assert.doesNotThrow(()=>validateClassCallablePlan(metadata.plan));setLiteral(target,block,'METADATA',JSON.stringify(metadata));count++;
  }assert.equal(count,2);},
 ];
 for(let index=0;index<edits.length;index++){const edited=structuredClone(firstProject);edits[index](edited);const result=projectToArcade(edited);record({stage:'parameter-property-edited-constructor-refusal',index,project:edited,result});assert.ok(result.unsupported.length,index);}
 // Neither a callable declaration nor a Number parameter may rescue an
 // edited physical operand or captured global writer.
 for(const mode of ['callback-operand','captured-global-writer']){
  const edited=structuredClone(firstProject),game=edited.targets.find(target=>target.name==='Game');
  if(mode==='callback-operand'){
   const prototypes=Object.values(game.blocks).filter(block=>block.opcode==='procedures_prototype'&&JSON.stringify(JSON.parse(block.mutation.argumentnames))==='["value"]');assert.equal(prototypes.length,1);
   const definition=game.blocks[prototypes[0].parent],ret=game.blocks[definition.next];assert.equal(ret.opcode,'arcade_returnValue');
   const add=game.blocks[ret.inputs.VALUE[1]];assert.equal(add.opcode,'arrays_valueBinary');assert.equal(add.fields.OP[0],'+');
   const prior=add.inputs.RIGHT[1],number=game.blocks[prior];assert.equal(number.opcode,'operator_add');assert.ok(Object.values(number.inputs).every(input=>Array.isArray(input[1])));delete game.blocks[prior];
   add.inputs.RIGHT=[1,[10,'wrong']];
  }else{
   const owners=edited.targets.flatMap(target=>Object.entries(target.variables).filter(([,value])=>value[0]==='seen').map(([id])=>({target,id})));assert.equal(owners.length,1);
   const writers=Object.values(game.blocks).filter(block=>block.opcode==='data_setvariableto'&&block.fields.VARIABLE[1]===owners[0].id);assert.ok(writers.length);
   // Change the actual dominating source startup writer, keeping the same ID
   // and all declarations/captures/other writers intact.
   const starts=Object.values(game.blocks).filter(block=>block.opcode==='arcade_whenSourceStarts');assert.equal(starts.length,1);
   let current=starts[0].next;const visited=new Set();while(current&&!writers.includes(game.blocks[current])){assert.ok(!visited.has(current));visited.add(current);current=game.blocks[current].next;}assert.ok(current);
   const writer=game.blocks[current],prior=writer.inputs.VALUE[1],number=game.blocks[prior];assert.equal(number.opcode,'operator_add');assert.ok(Object.values(number.inputs).every(input=>Array.isArray(input[1])));delete game.blocks[prior];
   writer.inputs.VALUE=[1,[10,'wrong']];
  }
  const result=projectToArcade(edited);record({stage:'parameter-property-edited-numeric-refusal',mode,project:edited,result});assert.ok(result.unsupported.length,mode);
 }

 const again=arcadeToPseudocode(exported.files);record({stage:'parameter-property-reimport',result:again});clean(again,['unsupported','warnings']);
 const second=new Creator();second.parse(again.code);record({stage:'parameter-property-second-Creator',project:second.project,errors:second.errors,warnings:second.warnings,unparsed:second.unparsed});clean(second,['errors','warnings','unparsed']);
 const secondBytes=Buffer.from(await(await second.generateSB3()).arrayBuffer()),secondZip=await JSZip.loadAsync(secondBytes),secondProject=JSON.parse(await secondZip.file('project.json').async('string'));
 record({stage:'parameter-property-second-SB3',bytes:secondBytes.toString('base64'),project:secondProject});assert.deepEqual(secondProject,second.project);constructorBindings(secondProject);
 const final=projectToArcade(secondProject);record({stage:'parameter-property-second-export',result:final});clean(final,['unsupported','warnings']);
 const reconstructed=parse(final.ts),finalProof=proveClassCallableSource(reconstructed);exportArrowBindings(reconstructed,finalProof,'second',final.ts);
 assert.match(final.ts,/Counter/);assert.match(final.ts,/trace/);assert.match(final.ts,/step/);assert.match(final.ts,/tick/);
});
