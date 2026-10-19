import {analyseSourceValueProducers,analyseSourceDeclarationIdentityForPreparation} from './source-value-producers.js';
import {callableSourceGate} from './callable-source-gate.js';
import {analyseCallableFlow} from './callable-flow.js';
const TYPES=Object.freeze({number:'Number',string:'String',boolean:'Boolean',any:'Any'});
const fail=message=>{throw Error('Procedure parameter constraint: '+message);};
// Only the bound prefix operation belongs on the executable AST. In particular,
// the preparation result's Program must never become an enumerable AST child.
export function procedureConstraintAstMetadata(prepared) {
 return Object.freeze({prefix:prepared.prefix});
}
function actualAnyDefaultPrologue(fn) {
 const defaults=fn.parameterDefaults||[];
 if(!Array.isArray(defaults)||defaults.some(row=>!row||typeof row!=='object'||Array.isArray(row)))return false;
 if(!defaults.length)return true;
 if(fn.parameterDefaultPrologue!==true||new Set(defaults.map(row=>row.name)).size!==defaults.length)return false;
 const expected=defaults.map(({name,value})=>({type:'If',test:{type:'Binary',op:'===',left:{type:'Identifier',name},right:{type:'Undefined'}},consequent:[{type:'ExpressionStatement',expr:{type:'Assignment',op:'=',left:{type:'Identifier',name},right:value}}],alternate:[]}));
 return defaults.every(row=>row&&Object.keys(row).length===2&&Object.hasOwn(row,'value')&&fn.params.includes(row.name)&&fn.optionalParams?.includes(row.name)&&fn.paramTypes?.[row.name]?.text==='any')&&JSON.stringify(fn.body?.slice(0,defaults.length))===JSON.stringify(expected);
}
function constraints(fn,explicit=false) {
 if(fn?.bwCallableDefinition || fn?.bwClassCallableMethod || fn?.bwObjectClass || !fn?.params?.length)return [];
 const annotated=fn.params.filter(name=>fn.paramTypes?.[name]?.text);
 if(!annotated.length)return [];
 // Reference/callable routes remain independently checked, outside this protocol.
 if(annotated.some(name=>!TYPES[fn.paramTypes[name].text]))return [];
 const optional=fn.optionalParams||[],firstOptional=fn.params.findIndex(name=>optional.includes(name));
 const optionalAny=optional.every(name=>fn.params.includes(name)&&fn.paramTypes?.[name]?.text==='any')&&(firstOptional<0||fn.params.slice(firstOptional).every(name=>optional.includes(name)));
 if(!optionalAny||!actualAnyDefaultPrologue(fn)||fn.defaultParams&&Object.keys(fn.defaultParams).length||fn.restParam||fn.typeParameters?.length){if(explicit)fail('optional typed/default/rest/generic parameters are outside the primitive protocol');return [];}
 return annotated.map(name=>Object.freeze({name,type:TYPES[fn.paramTypes[name].text]}));
}
export function procedureConstraintPrefix(fn,procedure,parameterName=name=>name) {
 return constraints(fn,true).map(({name,type})=>`  declare arcade procedure ${JSON.stringify(procedure)} parameter ${JSON.stringify(parameterName(name))} as ${type}`);
}
// This checker adds obligations, never types to the producer graph. Call it on
// the actual flattened ordinary-declaration AST before rendering its bodies.
export function validateProcedureConstraintSource(program,{onlyFunctions=null,ordinaryPrimitiveSdkNumbers=false,sceneClockNumbers=false}={}) {
 const graph=analyseSourceValueProducers(program,{unboundIsOpaque:true,opaqueDeclarationValues:true,ordinaryPrimitiveSdkNumbers,sceneClockNumbers,arrayCallbackParameters:true,arrayLoopEntries:true});
 const constraintTypes=graph.constraintTypesAt||graph.typesAt;
 const functions=new Map(),uses=[],calls=[],writes=[];
 const ordinary=new Set((program.body||[]).filter(node=>node.type==='FunctionDeclaration'&&(!onlyFunctions||onlyFunctions.has(node.name))));
 const walk=(node,parent=null,key=null)=>{
  if(!node||typeof node!=='object')return;
  if(Array.isArray(node)){node.forEach(child=>walk(child,parent,key));return;}
  if(ordinary.has(node)) {const selected=constraints(node);if(selected.length)functions.set(node,{selected,escaped:false});}
  if(node.type==='Identifier')uses.push({node,parent,key});
  if(node.type==='Call')calls.push(node);
  if(node.type==='Assignment'||node.type==='Update')writes.push(node);
  for(const [name,value] of Object.entries(node))if(value&&typeof value==='object')walk(value,node,name);
 };
 walk(program);
 // The callable/named/registered-callback lanes retain escaped function values.
 // This ordinary declaration protocol only handles truly unescaped declarations.
 for(const {node,parent,key} of uses) {
  const declaration=graph.unchangedFunctionAt(node),entry=functions.get(declaration);
  if(entry&&!(parent?.type==='Call'&&key==='callee'))entry.escaped=true;
 }
 const diagnostics=[];
 for(const [fn,entry] of functions) {
  if(entry.escaped)continue;
  const requireTypes=(types,type,label)=>{if(type==='Any')return;if(!types.size||[...types].some(actual=>actual!==type))diagnostics.push(`Procedure parameter constraint: ${label} requires ${type} from actual producers`);};
  // Default metadata is not a producer. Check the actual conditional RHS on
  // the same source AST; only this bounded primitive default slice is selected.
  for(let index=0;index<(fn.parameterDefaults||[]).length;index++){
   const value=fn.body[index].consequent[0].expr.right,types=constraintTypes(value),parameterIndex=fn.params.indexOf(fn.parameterDefaults[index].name);
   const formalBindings=new Map(fn.params.map((name,index)=>[graph.bindingOf(fn.body[0],name),index]).filter(([binding])=>binding));
   const inspect=node=>{if(!node||typeof node!=='object')return;if(Array.isArray(node)){node.forEach(inspect);return;}if(node.type==='Identifier'&&formalBindings.has(graph.bindingOf(node))&&formalBindings.get(graph.bindingOf(node))>=parameterIndex)diagnostics.push(`Procedure parameter constraint: ${fn.name} default cannot reference its own or a later formal`);for(const child of Object.values(node))if(child&&typeof child==='object')inspect(child);};inspect(value);
   if(!types.size||[...types].some(type=>!['Number','String','Boolean','Null','Undefined'].includes(type)))diagnostics.push(`Procedure parameter constraint: ${fn.name} default requires actual primitive producers`);
  }
  const incoming=calls.filter(call=>graph.unchangedFunctionAt(call)===fn);
  for(const call of incoming) {
   if(call.isNew||call.typeArguments?.length||call.args.length>fn.params.length||fn.params.slice(call.args.length).some(name=>!fn.optionalParams?.includes(name)||fn.paramTypes?.[name]?.text!=='any')){diagnostics.push('Procedure parameter constraint: actual call argument count/shape differs');continue;}
   for(const constraint of entry.selected)requireTypes(constraintTypes(call.args[fn.params.indexOf(constraint.name)]),constraint.type,`${fn.name}.${constraint.name}`);
  }
  // All assignments into an actual formal must discharge its contract. Its
  // declared type is deliberately absent from the actual RHS producer proof.
  const formalBindings=new Map(),anchor=fn.body?.[0];
  for(const name of fn.params)if(anchor&&graph.bindingKindsAt(anchor,name).has('parameter'))formalBindings.set(graph.bindingOf(anchor,name),name);
  for(const writer of writes) {
   const lhs=writer.type==='Update'?writer.argument:writer.left;
   if(lhs?.type!=='Identifier')continue;const name=formalBindings.get(graph.bindingOf(lhs)),constraint=entry.selected.find(c=>c.name===name);if(!constraint)continue;
   if(writer.type==='Update'||writer.op!=='='){
    if(constraint.type==='Any')continue;
    const numeric=constraint.type==='Number'&&(writer.type==='Update'?['++','--'].includes(writer.op):['+=','-=','*=','/=','%=','|=','&=','^=','<<=','>>=','>>>='].includes(writer.op));
    if(!numeric)diagnostics.push(`Procedure parameter constraint: ${fn.name}.${name} compound writer differs`);
    else if(writer.type!=='Update')requireTypes(constraintTypes(writer.right),'Number',`${fn.name}.${name} compound writer`);
   }else requireTypes(constraintTypes(writer.right),constraint.type,`${fn.name}.${name} writer`);
  }
 }
 return Object.freeze([...new Set(diagnostics)]);
}

// Defaults in the selected target are applied only to omitted arguments. Keep
// one editable default body and carry omission through ordinary visible formals.
// Number flags are explicit 1/0 operands, checked with strict equality to 1.
// They remain visible in Code/Blocks/export; GUI authoring is not qualified here.
// This is a source transformation, not a runtime value or annotation grant.
function lowerOmittedDefaults(program,selected,graph) {
 const occupied=new Set();
 const scan=node=>{if(!node||typeof node!=='object')return;if(Array.isArray(node)){node.forEach(scan);return;}if(typeof node.name==='string')occupied.add(node.name);for(const name of node.params||[])occupied.add(name);for(const child of Object.values(node))if(child&&typeof child==='object')scan(child);};scan(program);
 let next=0;
 const plans=new Map();
 for(const entry of selected.values())if(entry.fn.parameterDefaults?.length){
  const flags=entry.fn.parameterDefaults.map(row=>{let name;do{name='__bwOmittedDefault'+next++;}while(occupied.has(name));occupied.add(name);return {name,index:entry.fn.params.indexOf(row.name)};});
  plans.set(entry.fn,flags);
 }
 if(!plans.size)return program;
 const rewrite=node=>{
  if(!node||typeof node!=='object')return node;
  if(Array.isArray(node)){const values=node.map(rewrite);return values.every((value,index)=>value===node[index])?node:values;}
  if(Object.getPrototypeOf(node)!==Object.prototype)return node;
  const out=Object.fromEntries(Object.entries(node).map(([key,value])=>[key,rewrite(value)]));
  let changed=Object.keys(out).some(key=>out[key]!==node[key]);
  if(node.type==='Call'){
   const fn=graph.unchangedFunctionAt(node),flags=plans.get(fn);
   if(flags){changed=true;const supplied=node.args.length;out.args=[...out.args,...fn.params.slice(supplied).map(()=>({type:'Undefined'})),...flags.map(flag=>({type:'Number',value:supplied<=flag.index?'1':'0'}))];}
  }
  const flags=plans.get(node);
  if(flags){
   changed=true;out.body=[...out.body];
   out.params=[...node.params,...flags.map(flag=>flag.name)];
   out.paramTypes={...out.paramTypes,...Object.fromEntries(flags.map(flag=>[flag.name,{text:'number'}]))};
   out.optionalParams=[];out.parameterDefaults=[];out.parameterDefaultPrologue=false;
   flags.forEach((flag,index)=>{out.body[index]={...out.body[index],test:{type:'Binary',op:'===',left:{type:'Identifier',name:flag.name},right:{type:'Number',value:'1'}}};});
   const entry=selected.get(node.name);entry.params=[...out.params];entry.types=out.params.map(name=>out.paramTypes?.[name]?.text);
  }
  return changed?out:node;
 };
 return rewrite(program);
}

// Select only real module/flattened-namespace ordinary declarations BEFORE class
// lowering creates additional functions. The catalogue retains constraints only.
export function prepareProcedureConstraintSource(program,{mode='prototype'}={}) {
 if(!['prototype','supported-default'].includes(mode))fail('unknown ordinary constraint selection policy');
 return prepareConstraints(program,mode,false);
}

// Only the actual translator parse/known-lowering callchain uses this demand.
// Public/external low-level preparation keeps its original eager observation.
export function prepareProcedureConstraintSourceForTranslation(program,{mode='prototype'}={}) {
 if(!['prototype','supported-default'].includes(mode))fail('unknown ordinary constraint selection policy');
 return prepareConstraints(program,mode,true);
}

function prepareConstraints(program,mode,declarationIdentityOnly) {
 const excludedSignature=(messages,message)=>{if(mode==='prototype')messages.push(message);};
 const graph=declarationIdentityOnly?analyseSourceDeclarationIdentityForPreparation(program):
  analyseSourceValueProducers(program,{unboundIsOpaque:true,opaqueDeclarationValues:true});
 // A complete existing callable certificate owns its factory ABI. Primitive
 // annotations on that factory do not opt it into this ordinary protocol.
 const callable=callableSourceGate(program),independent=new Set();
 if(callable.eligible){const flow=analyseCallableFlow(program);for(const scope of flow.lexical.functions)if(flow.profiles.get(scope.node)?.result?.kind==='callable')independent.add(scope.node);}
 const selected=new Map(),duplicates=new Set(),excluded=[];
 for(const fn of program.body||[])if(fn.type==='FunctionDeclaration'){
  if(independent.has(fn))continue;
  const primitive=(fn.params||[]).some(name=>TYPES[fn.paramTypes?.[name]?.text]);
  if(!constraints(fn).length){if(primitive)excludedSignature(excluded,'Procedure parameter constraint: '+fn.name+' optional/default/rest/generic or mixed reference formals are outside the ordinary primitive protocol');continue;}
  if(new Set(fn.params).size!==fn.params.length){excluded.push('Procedure parameter constraint: '+fn.name+' requires unique actual formal bindings');continue;}
  if(selected.has(fn.name))duplicates.add(fn.name);
  selected.set(fn.name,{fn,params:[...fn.params],types:fn.params.map(name=>fn.paramTypes?.[name]?.text)});
 }
 const uses=[];const visit=(node,parent=null,key=null)=>{if(!node||typeof node!=='object')return;if(Array.isArray(node)){node.forEach(child=>visit(child,parent,key));return;}if(node.type==='Identifier')uses.push({node,parent,key});for(const [name,value]of Object.entries(node))if(value&&typeof value==='object')visit(value,node,name);};visit(program);
 for(const {node,parent,key}of uses){const entry=selected.get(node.name);if(entry&&graph.unchangedFunctionAt(node)===entry.fn&&!(parent?.type==='Call'&&key==='callee'&&!parent.isNew&&!parent.typeArguments?.length)){selected.delete(node.name);excluded.push('Procedure parameter constraint: '+node.name+' escaped or nonordinary call remains outside this protocol');}}
 for(const [name,entry]of selected)if(graph.unchangedFunctionAt(entry.fn)!==entry.fn){selected.delete(name);excluded.push('Procedure parameter constraint: '+name+' requires a unique unchanged actual ordinary declaration');}
 const validation={onlyFunctions:new Set(selected.keys()),ordinaryPrimitiveSdkNumbers:mode==='supported-default',sceneClockNumbers:mode==='supported-default'};
 const diagnostics=[...excluded,...validateProcedureConstraintSource(program,validation)];
 for(const name of duplicates)diagnostics.push('Procedure parameter constraint: duplicate ordinary declaration '+name);
 const lowered=diagnostics.length?program:lowerOmittedDefaults(program,selected,graph);
 if(lowered!==program)diagnostics.push(...validateProcedureConstraintSource(lowered,validation));
 return Object.freeze({program:lowered,independentRoutes:Object.freeze([...independent].map(fn=>Object.freeze({name:fn.name,protocol:'existing-numeric-callable'}))),diagnostics:Object.freeze([...diagnostics]),prefix(fn,procedure,parameterName=name=>name){
  const entry=selected.get(fn.source||fn.name);if(!entry||duplicates.has(fn.source||fn.name))return [];
  if(JSON.stringify(fn.params)!==JSON.stringify(entry.params)||JSON.stringify(fn.params.map(name=>fn.paramTypes?.[name]?.text))!==JSON.stringify(entry.types))fail('lowered ordinary formal metadata differs from its actual source declaration');
  return procedureConstraintPrefix(fn,procedure,parameterName);
 }});
}
