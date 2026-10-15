import {analyseSourceValueProducers} from './source-value-producers.js';
import {callableSourceGate} from './callable-source-gate.js';
import {analyseCallableFlow} from './callable-flow.js';
const TYPES=Object.freeze({number:'Number',string:'String',boolean:'Boolean',any:'Any'});
const fail=message=>{throw Error('Procedure parameter constraint: '+message);};
function constraints(fn,explicit=false) {
 if(fn?.bwCallableDefinition || fn?.bwClassCallableMethod || fn?.bwObjectClass || !fn?.params?.length)return [];
 const annotated=fn.params.filter(name=>fn.paramTypes?.[name]?.text);
 if(!annotated.length)return [];
 // Reference/callable routes remain independently checked, outside this protocol.
 if(annotated.some(name=>!TYPES[fn.paramTypes[name].text]))return [];
 if(fn.optionalParams?.length||fn.defaultParams&&Object.keys(fn.defaultParams).length||fn.restParam||fn.typeParameters?.length){if(explicit)fail('optional/default/rest/generic parameters are outside the primitive protocol');return [];}
 return annotated.map(name=>Object.freeze({name,type:TYPES[fn.paramTypes[name].text]}));
}
export function procedureConstraintPrefix(fn,procedure,parameterName=name=>name) {
 return constraints(fn,true).map(({name,type})=>`  declare arcade procedure ${JSON.stringify(procedure)} parameter ${JSON.stringify(parameterName(name))} as ${type}`);
}
// This checker adds obligations, never types to the producer graph. Call it on
// the actual flattened ordinary-declaration AST before rendering its bodies.
export function validateProcedureConstraintSource(program,{onlyFunctions=null}={}) {
 const graph=analyseSourceValueProducers(program,{unboundIsOpaque:true,opaqueDeclarationValues:true});
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
  const declaration=graph.immutableFunctionAt(node),entry=functions.get(declaration);
  if(entry&&!(parent?.type==='Call'&&key==='callee'))entry.escaped=true;
 }
 const diagnostics=[];
 for(const [fn,entry] of functions) {
  if(entry.escaped)continue;
  const requireTypes=(types,type,label)=>{if(type==='Any')return;if(!types.size||[...types].some(actual=>actual!==type))diagnostics.push(`Procedure parameter constraint: ${label} requires ${type} from actual producers`);};
  const incoming=calls.filter(call=>graph.immutableFunctionAt(call)===fn);
  for(const call of incoming) {
   if(call.isNew||call.typeArguments?.length||call.args.length!==fn.params.length){diagnostics.push('Procedure parameter constraint: actual call argument count/shape differs');continue;}
   for(const constraint of entry.selected)requireTypes(constraintTypes(call.args[fn.params.indexOf(constraint.name)]),constraint.type,`${fn.name}.${constraint.name}`);
  }
  // All assignments into an actual formal must discharge its contract. Its
  // declared type is deliberately absent from the actual RHS producer proof.
  const formalBindings=new Map(),anchor=fn.body?.[0];
  for(const name of fn.params)if(anchor&&graph.bindingKindsAt(anchor,name).has('parameter'))formalBindings.set(graph.bindingOf(anchor,name),name);
  for(const writer of writes) {
   const lhs=writer.type==='Update'?writer.argument:writer.left;
   if(lhs?.type!=='Identifier')continue;const name=formalBindings.get(graph.bindingOf(lhs)),constraint=entry.selected.find(c=>c.name===name);if(!constraint)continue;
   if(writer.type==='Update'||writer.op!=='='){if(constraint.type!=='Number'&&constraint.type!=='Any')diagnostics.push(`Procedure parameter constraint: ${fn.name}.${name} compound writer differs`);}
   else requireTypes(constraintTypes(writer.right),constraint.type,`${fn.name}.${name} writer`);
  }
 }
 return Object.freeze([...new Set(diagnostics)]);
}

// Select only real module/flattened-namespace ordinary declarations BEFORE class
// lowering creates additional functions. The catalogue retains constraints only.
export function prepareProcedureConstraintSource(program) {
 const graph=analyseSourceValueProducers(program,{unboundIsOpaque:true,opaqueDeclarationValues:true});
 // A complete existing callable certificate owns its factory ABI. Primitive
 // annotations on that factory do not opt it into this ordinary protocol.
 const callable=callableSourceGate(program),independent=new Set();
 if(callable.eligible){const flow=analyseCallableFlow(program);for(const scope of flow.lexical.functions)if(flow.profiles.get(scope.node)?.result?.kind==='callable')independent.add(scope.node);}
 const selected=new Map(),duplicates=new Set(),excluded=[];
 for(const fn of program.body||[])if(fn.type==='FunctionDeclaration'){
  if(independent.has(fn))continue;
  const primitive=(fn.params||[]).some(name=>TYPES[fn.paramTypes?.[name]?.text]);
  if(!constraints(fn).length){if(primitive)excluded.push('Procedure parameter constraint: '+fn.name+' optional/default/rest/generic or mixed reference formals are outside the ordinary primitive protocol');continue;}
  if(new Set(fn.params).size!==fn.params.length){excluded.push('Procedure parameter constraint: '+fn.name+' requires unique actual formal bindings');continue;}
  if(selected.has(fn.name))duplicates.add(fn.name);
  selected.set(fn.name,{fn,params:[...fn.params],types:fn.params.map(name=>fn.paramTypes?.[name]?.text)});
 }
 const uses=[];const visit=(node,parent=null,key=null)=>{if(!node||typeof node!=='object')return;if(Array.isArray(node)){node.forEach(child=>visit(child,parent,key));return;}if(node.type==='Identifier')uses.push({node,parent,key});for(const [name,value]of Object.entries(node))if(value&&typeof value==='object')visit(value,node,name);};visit(program);
 for(const {node,parent,key}of uses){const entry=selected.get(node.name);if(entry&&graph.immutableFunctionAt(node)===entry.fn&&!(parent?.type==='Call'&&key==='callee'&&!parent.isNew&&!parent.typeArguments?.length)){selected.delete(node.name);excluded.push('Procedure parameter constraint: '+node.name+' escaped or nonordinary call remains outside this protocol');}}
 for(const [name,entry]of selected)if(graph.immutableFunctionAt(entry.fn)!==entry.fn){selected.delete(name);excluded.push('Procedure parameter constraint: '+name+' requires a unique unchanged actual ordinary declaration');}
 const diagnostics=[...excluded,...validateProcedureConstraintSource(program,{onlyFunctions:new Set(selected.keys())})];
 for(const name of duplicates)diagnostics.push('Procedure parameter constraint: duplicate ordinary declaration '+name);
 return Object.freeze({independentRoutes:Object.freeze([...independent].map(fn=>Object.freeze({name:fn.name,protocol:'existing-numeric-callable'}))),diagnostics:Object.freeze([...diagnostics]),prefix(fn,procedure,parameterName=name=>name){
  const entry=selected.get(fn.source||fn.name);if(!entry||duplicates.has(fn.source||fn.name))return [];
  if(JSON.stringify(fn.params)!==JSON.stringify(entry.params)||JSON.stringify(fn.params.map(name=>fn.paramTypes?.[name]?.text))!==JSON.stringify(entry.types))fail('lowered ordinary formal metadata differs from its actual source declaration');
  return procedureConstraintPrefix(fn,procedure,parameterName);
 }});
}
