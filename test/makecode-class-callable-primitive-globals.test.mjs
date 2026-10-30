import test from 'node:test';
import assert from 'node:assert/strict';
import {arcadeToPseudocode} from '../overlay/scratch-gui/src/lib/bw-makecode/arcade-translate.js';
import Creator from '../overlay/scratch-gui/src/lib/sb3-creator.js';
import {parseMakeCodeTs} from '../overlay/scratch-gui/src/lib/bw-makecode/ts-import.js';
import {projectToArcade} from '../overlay/scratch-gui/src/lib/bw-makecode/export-arcade.js';
const source=`class Counter {
 trace:number;
 constructor(public readonly seed:number,private step:(value:number)=>number,public tick:()=>void){this.trace=this.seed;}
 read(){return this.step(this.seed);}
 bump(){this.trace+=1;this.tick();}
}
let offset=3;let seen=0;
let firstBox=new Counter(2,(value:number)=>value+offset,()=>{seen+=1;});
let secondBox=new Counter(7,(value:number)=>value+offset,()=>{seen+=10;});
let first=firstBox.read();offset=4;let firstAgain=firstBox.read();let second=secondBox.read();
firstBox.bump();secondBox.bump();let traceFirst=firstBox.trace;let traceSecond=secondBox.trace;
let seedFirst=firstBox.seed;let seedSecond=secondBox.seed;let finished=1;`;
const numericArrowBodies=(text,parse)=>{
 const program=parse(text,{retainCallableMetadata:true,parameterDefaults:true,retainParentheses:true,retainClassHeritage:true,retainOrdinaryDefaultProvenance:true}),unparen=node=>node?.type==='Parenthesized'?unparen(node.expression):node,constructions=[];
 for(const owner of [program,...program.body.filter(node=>node.type==='FunctionDeclaration')])for(const statement of owner.body){
  if(statement.type==='Declaration')for(const declaration of statement.decls){const call=unparen(declaration.init);if(call?.type==='Call'&&call.isNew&&call.callee.type==='Identifier'&&call.callee.name==='Counter')constructions.push(call);}
  if(statement.type==='ExpressionStatement'){const assignment=unparen(statement.expr),call=unparen(assignment?.right);if(assignment?.type==='Assignment'&&assignment.op==='='&&call?.type==='Call'&&call.isNew&&call.callee.type==='Identifier'&&call.callee.name==='Counter')constructions.push(call);}
 }
 assert.equal(constructions.length,2,'two actual Counter constructor expressions, not a loose whole-file operator match');
 const declarations=[],parameters=[],assignments=[],seen=new Set();
 const visit=node=>{if(!node||typeof node!=='object'||seen.has(node))return;seen.add(node);if(Array.isArray(node)){for(const item of node)visit(item);return;}if(node.type==='Declaration')for(const declaration of node.decls)if(declaration.name==='offset')declarations.push(declaration);if(Array.isArray(node.params))parameters.push(...node.params);if(node.type==='Assignment'&&unparen(node.left)?.type==='Identifier'&&unparen(node.left).name==='offset')assignments.push(node);for(const [key,value]of Object.entries(node))if(!['originalBody','parameterDefaults','paramTypes'].includes(key))visit(value);};visit(program);
 const globals=program.body.filter(node=>node.type==='Declaration').flatMap(node=>node.decls).filter(declaration=>declaration.name==='offset');
 assert.equal(globals.length,1,'unique actual global offset declaration');assert.equal(globals[0].init,null);assert.deepEqual(declarations,globals,'no local offset declaration shadows the module cell');assert.equal(parameters.includes('offset'),false,'no parameter shadow');
 const startup=program.body.filter(node=>node.type==='FunctionDeclaration'&&node.name==='__bwStartup');assert.equal(startup.length,1);
 const writes=startup[0].body.map((statement,index)=>({node:statement.type==='ExpressionStatement'?unparen(statement.expr):null,index})).filter(row=>row.node?.type==='Assignment'&&unparen(row.node.left)?.type==='Identifier'&&unparen(row.node.left).name==='offset');
 assert.equal(writes.length,2);assert.deepEqual(assignments,writes.map(row=>row.node),'both writes belong directly to the one startup, not another owner');
 const finiteLiteral=node=>{node=unparen(node);return node?.type==='Number'&&Number.isFinite(Number(node.value))?Number(node.value):null;};
 const writtenNumber=node=>{node=unparen(node);const literal=finiteLiteral(node);if(literal!==null)return literal;if(node?.type==='Binary'&&node.op==='+'&&finiteLiteral(node.left)===0)return finiteLiteral(node.right);return null;};
 assert.deepEqual(writes.map(row=>{assert.equal(row.node.op,'=');return writtenNumber(row.node.right);}),[3,4],'actual ordered writes preserve mutable 3 then 4, accepting only literals or canonical zero-plus-literal');
 const newCommands=startup[0].body.map((statement,index)=>({statement,index})).filter(({statement})=>statement.type==='Declaration'&&statement.decls.some(declaration=>{const call=unparen(declaration.init);return call?.type==='Call'&&call.isNew&&call.callee.type==='Identifier'&&call.callee.name==='Counter';}));
 assert.equal(newCommands.length,2);for(const row of newCommands)assert.ok(writes[0].index<row.index&&row.index<writes[1].index,'both closures created after initialization and before mutable update');
 for(const call of constructions){const arrow=call.args[1];assert.equal(arrow.type,'FunctionExpression');assert.equal(arrow.functionKind,'arrow');assert.deepEqual(arrow.params,['value']);assert.equal(arrow.body.length,1);assert.equal(arrow.body[0].type,'Return');const returned=unparen(arrow.body[0].value);assert.equal(returned.type,'Binary');assert.equal(returned.op,'+');assert.equal(unparen(returned.left).type,'Identifier');assert.equal(unparen(returned.left).name,arrow.params[0]);assert.equal(unparen(returned.right).type,'Identifier');assert.equal(unparen(returned.right).name,'offset');}
};
const clean=value=>{assert.deepEqual(value.unsupported,[]);assert.deepEqual(value.warnings,[]);};
const buildBaseline=()=>{
 const imported=arcadeToPseudocode({'main.ts':source});clean(imported);
 const initial=new Creator();initial.parse(imported.code);assert.deepEqual(initial.errors,[]);assert.deepEqual(initial.warnings,[]);assert.deepEqual(initial.unparsed,[]);
 // The native guest rebuilds current Code in a new Creator. Exercise that
 // normalization, without pretending this pure control runs a VM.
 const code=initial.decompile(structuredClone(initial.project));const second=new Creator();second.parse(code);assert.deepEqual(second.errors,[]);assert.deepEqual(second.warnings,[]);assert.deepEqual(second.unparsed,[]);
 return second.project;
};
// Lazily build the real import/Creator/Code/Creator fixture once. Each control still
// receives a separate complete graph and invokes the current exporter itself.
let baseline,initializationError;
let fixtureState='uninitialized';
const assertPlainProject=value=>{
 const seen=new Set(),active=new Set();let properties=0;
 const visit=(node,depth)=>{
  assert.ok(depth<=128,'fixture own-data depth bound');
  if(node===null||typeof node==='string'||typeof node==='boolean')return;
  if(typeof node==='number'){assert.ok(Number.isFinite(node),'finite fixture number');return;}
  assert.equal(typeof node,'object','fixture contains only JSON own data');
  assert.equal(active.has(node),false,'fixture has no cycles');
  if(seen.has(node))return;
  seen.add(node);assert.ok(seen.size<=100000,'fixture own-data object bound');active.add(node);
  const array=Array.isArray(node),descriptors=Object.getOwnPropertyDescriptors(node),keys=Reflect.ownKeys(descriptors);
  assert.equal(Object.getPrototypeOf(node),array?Array.prototype:Object.prototype,'plain fixture prototype');
  assert.equal(Object.isExtensible(node),true,'ordinary extensible fixture object');
  if(array){
   const length=descriptors.length;assert.ok(length&&Object.hasOwn(length,'value')&&!length.enumerable&&length.writable&&!length.configurable,'ordinary array length');
   assert.ok(Number.isSafeInteger(length.value)&&length.value>=0,'ordinary array size');
   assert.equal(keys.length,length.value+1,'dense array without hidden properties');
   for(let index=0;index<length.value;index++)assert.ok(Object.hasOwn(descriptors,String(index)),'dense fixture array');
  }
  for(const key of keys){
   assert.equal(typeof key,'string','no fixture symbol metadata');
   if(array&&key==='length')continue;
   const descriptor=descriptors[key];assert.ok(Object.hasOwn(descriptor,'value')&&descriptor.enumerable&&descriptor.writable&&descriptor.configurable,'ordinary enumerable own data only');
   if(array)assert.ok(/^(0|[1-9][0-9]*)$/.test(key)&&Number(key)<descriptors.length.value,'ordinary array index');
   assert.ok(++properties<=1000000,'fixture own-data property bound');visit(descriptor.value,depth+1);
  }
  active.delete(node);
 };visit(value,0);return seen;
};
const assertSeparateClone=(original,copy,originalObjects)=>{
 const pairs=new Map(),reverse=new Map();
 const visit=(left,right)=>{
  if(left===null||typeof left!=='object'){assert.ok(Object.is(left,right));return;}
  assert.ok(right!==null&&typeof right==='object');assert.equal(originalObjects.has(right),false,'clone shares no fixture object');
  if(pairs.has(left)){assert.equal(pairs.get(left),right,'clone retains shared-reference topology');return;}
  assert.equal(reverse.has(right),false,'distinct fixture objects remain distinct');pairs.set(left,right);reverse.set(right,left);
  assert.equal(Object.getPrototypeOf(left),Object.getPrototypeOf(right));
  const leftDescriptors=Object.getOwnPropertyDescriptors(left),rightDescriptors=Object.getOwnPropertyDescriptors(right);
  const keys=Reflect.ownKeys(leftDescriptors);assert.deepEqual(Reflect.ownKeys(rightDescriptors),keys);
  for(const key of keys){assert.equal(Object.hasOwn(rightDescriptors[key],'value'),true);visit(leftDescriptors[key].value,rightDescriptors[key].value);}
 };visit(original,copy);assert.equal(pairs.size,originalObjects.size,'clone includes the complete fixture graph');
};
const create=()=>{
 if(fixtureState==='initializing'){
  initializationError=Error('Reentrant actual fixture initialization');fixtureState='failed';throw initializationError;
 }
 if(fixtureState==='failed')throw initializationError;
 if(fixtureState==='uninitialized'){
  fixtureState='initializing';
  try{
   baseline=buildBaseline();const objects=assertPlainProject(baseline),probe=structuredClone(baseline);
   assertPlainProject(probe);assert.deepEqual(probe,baseline);assertSeparateClone(baseline,probe,objects);
   if(fixtureState!=='initializing')throw initializationError;
   fixtureState='ready';
  }catch(error){
   if(fixtureState!=='failed')initializationError=error;
   fixtureState='failed';throw initializationError;
  }
 }
 return structuredClone(baseline);
};
const rows=project=>project.targets.flatMap(target=>Object.entries(target.blocks).map(([id,block])=>({target,id,block})));
const offset=project=>{
 const owners=project.targets.flatMap(target=>Object.entries(target.variables).filter(([,v])=>v[0]==='offset').map(([id])=>({target,id})));assert.equal(owners.length,1);
 const id=owners[0].id,writers=rows(project).filter(row=>row.block.opcode==='data_setvariableto'&&row.block.fields.VARIABLE[1]===id);assert.equal(writers.length,2);
 return {...owners[0],writers};
};
const refuse=project=>{const result=projectToArcade(project);assert.ok(result.unsupported.length,JSON.stringify(result));return result;};
test('mutable numeric module reads survive complete current Code constructor export without constant capture',()=>{
 const project=create(),before=JSON.stringify(project),cell=offset(project);const result=projectToArcade(project);clean(result);assert.equal(JSON.stringify(project),before);
 assert.ok(result.ts.includes('offset'));numericArrowBodies(result.ts,parseMakeCodeTs);
 assert.equal(rows(project).filter(row=>row.block.opcode==='arcade_declareCallable').length,4);assert.equal(cell.writers.length,2);
 assert.equal(typeof result.files['main.ts'],'string');assert.equal(typeof result.files['pxt.json'],'string');
});
test('a current String or unknown writer cannot borrow Number from the scalar declaration or saved default',()=>{
 for(const kind of ['string','unknown']){
  const project=create(),cell=offset(project),writer=cell.writers[1];
  writer.block.inputs.VALUE=kind==='string'?[1,[10,'wrong']]:[1,'unproved-number'];
  if(kind==='unknown')writer.target.blocks['unproved-number']={opcode:'unknown_dynamic_number',parent:writer.id,next:null,inputs:{},fields:{},shadow:false,topLevel:false};
  refuse(project);
 }
});
test('edited concrete Arrow return remains independently constrained after numeric global admission',()=>{
 const project=create(),target=offset(project).writers[0].target;
 const returns=rows(project).filter(row=>row.block.opcode==='arcade_returnValue'&&target.blocks[row.block.inputs.VALUE?.[1]]?.opcode==='arrays_valueBinary');assert.equal(returns.length,2);
 returns[0].block.inputs.VALUE=[1,[10,'wrong']];refuse(project);
});
test('numeric authority is recomputed on writer edits and valid restoration never freezes a saved value',()=>{
 const project=create(),cell=offset(project);clean(projectToArcade(project));const value=cell.writers[1].block.inputs.VALUE;
 cell.writers[1].block.inputs.VALUE=[1,[10,'wrong']];refuse(project);cell.writers[1].block.inputs.VALUE=value;clean(projectToArcade(project));
});
test('same name with a foreign ID, duplicate ID owner, or missing actual owner cannot acquire the numeric cell',()=>{
 for(const mode of ['shadow','duplicate','missing']){
  const project=create(),cell=offset(project),target=cell.writers[0].target;
  if(mode==='duplicate'){assert.notEqual(target,cell.target);target.variables[cell.id]=['offset',4];}
  if(mode==='missing')delete cell.target.variables[cell.id];
  if(mode==='shadow')for(const {block}of rows(project))for(const input of Object.values(block.inputs||{}))if(Array.isArray(input[1])&&input[1][0]===12&&input[1][2]===cell.id&&block.opcode!=='arcade_declareSourceScalar')input[1]=[12,'offset','foreign-offset-id'];
  refuse(project);
 }
});
test('foreign target and unknown dynamic variable writers remain refused despite an existing numeric anchor',()=>{
 for(const mode of ['foreign','dynamic']){
  const project=create(),cell=offset(project),writer=cell.writers[1];
  if(mode==='foreign'){
   const target=project.targets.find(target=>target!==writer.target);target.blocks['foreign-writer']={...structuredClone(writer.block),parent:null,next:null,topLevel:true,inputs:{VALUE:[1,[4,'8']]}};
  }else writer.block.opcode='unknown_dynamic_variable_write';
  refuse(project);
 }
});
test('a closure created before the actual numeric initializer cannot borrow a later Number write',()=>{
 const project=create(),cell=offset(project),target=cell.writers[0].target,first=cell.writers[0];
 // Move the actual initializer after the first physical closure creation,
 // retaining all original nodes, parent links and complete bodies.
 let previous=target.blocks[first.block.parent];const afterFirst=first.block.next;previous.next=afterFirst;target.blocks[afterFirst].parent=first.block.parent;
 const creates=rows(project).filter(row=>row.target===target&&row.block.opcode==='arcade_createCallable');assert.ok(creates.length);
 const startup=Object.values(target.blocks).find(block=>block.opcode==='arcade_whenSourceStarts'),commands=new Set();let cursor=startup.next;
 while(cursor){commands.add(cursor);cursor=target.blocks[cursor].next;}
 let command=creates[0];while(!commands.has(command.id))command={id:command.block.parent,block:target.blocks[command.block.parent]};
 assert.notEqual(command.id,first.id);assert.equal(command.block.opcode,'arcade_setLocal');
 const tail=command.block.next;command.block.next=first.id;first.block.parent=command.id;first.block.next=tail;if(tail)target.blocks[tail].parent=first.id;
 refuse(project);
});
test('other event entries or an uninitialized repeated change cannot bypass startup dominance',()=>{
 for(const mode of ['other-entry','change-before-init','no-declaration','direct-statement','direct-reporter']){
  const project=create(),cell=offset(project),target=cell.writers[0].target;
  if(mode.startsWith('direct-')){
   // Insert a real direct ingress before initialization while leaving every
   // closure creation after it. Creation dominance alone cannot admit this.
   const literalName=block=>{const slot=block.inputs.NAME[1];return Array.isArray(slot)?slot[1]:target.blocks[slot]?.fields.TEXT[0];};
   const prototypes=Object.values(target.blocks).filter(block=>block.opcode==='procedures_prototype');
   const create=Object.values(target.blocks).find(block=>block.opcode==='arcade_createCallable'&&prototypes.some(proto=>proto.mutation?.proccode===literalName(block)&&JSON.parse(proto.mutation.argumentids).length===1));assert.ok(create);
   const procedure=literalName(create),prototype=prototypes.find(block=>block.mutation?.proccode===procedure);assert.ok(prototype);
   const ids=JSON.parse(prototype.mutation.argumentids);assert.equal(ids.length,1);
   const first=cell.writers[0],prior=target.blocks[first.block.parent],commandId='before-init-direct-call';
   target.blocks[commandId]={opcode:'procedures_call',parent:first.block.parent,next:first.id,inputs:{[ids[0]]:[1,[4,'2']]},fields:{},shadow:false,topLevel:false,mutation:{tagName:'mutation',children:[],proccode:procedure,argumentids:JSON.stringify(ids),warp:String(prototype.mutation.warp)}};
   if(mode==='direct-reporter'){
    const seen=Object.entries(project.targets.find(row=>row.isStage).variables).find(([,value])=>value[0]==='seen');assert.ok(seen);
    target.blocks[commandId]={opcode:'data_setvariableto',parent:first.block.parent,next:first.id,inputs:{VALUE:[1,'direct-reporter']},fields:{VARIABLE:['seen',seen[0]]},shadow:false,topLevel:false};
    target.blocks['direct-reporter']={opcode:'arcade_callFunction',parent:commandId,next:null,inputs:{NAME:[1,[10,procedure]],ARGS:[1,'direct-argument']},fields:{},shadow:false,topLevel:false};
    target.blocks['direct-argument']={opcode:'arcade_functionArgument',parent:'direct-reporter',next:null,inputs:{VALUE:[1,[4,'2']],REST:[1,[10,'[]']]},fields:{},shadow:false,topLevel:false};
   }
   prior.next=commandId;first.block.parent=commandId;
   const startup=Object.values(target.blocks).find(block=>block.opcode==='arcade_whenSourceStarts');assert.ok(startup);
   let cursor=startup.next,before=false,after=false;
   while(cursor){if(cursor===commandId)before=true;if(cursor===first.id){assert.equal(before,true);after=true;}cursor=target.blocks[cursor].next;}
   assert.equal(after,true);
  }
  if(mode==='other-entry')target.blocks['foreign-entry']={opcode:'event_whenkeypressed',parent:null,next:null,topLevel:true,inputs:{},fields:{KEY_OPTION:['space',null]}};
  if(mode==='change-before-init')cell.writers[0].block.opcode='data_changevariableby';
  if(mode==='no-declaration'){const row=rows(project).find(row=>row.block.opcode==='arcade_declareSourceScalar'&&row.block.inputs.VARIABLE[1][2]===cell.id);assert.ok(row);row.block.opcode='unknown_source_declaration';}
  refuse(project);
 }
});
