import {analyseSourceValueProducers,analyseSourceDeclarationIdentityForPreparation,validateProcedureConstraintSource,validateCompilerOwnedProcedureConstraintSource} from './source-value-producers.js';
import {TYPES,constraints} from './ordinary-procedure-constraint-metadata.js';
export {validateProcedureConstraintSource} from './source-value-producers.js';
import {callableSourceGate} from './callable-source-gate.js';
import {analyseCallableFlow} from './callable-flow.js';
const fail=message=>{throw Error('Procedure parameter constraint: '+message);};
// Only the bound prefix operation belongs on the executable AST. In particular,
// the preparation result's Program must never become an enumerable AST child.
export function procedureConstraintAstMetadata(prepared) {
 return Object.freeze({prefix:prepared.prefix});
}
export function procedureConstraintPrefix(fn,procedure,parameterName=name=>name) {
 return constraints(fn,true).map(({name,type})=>`  declare arcade procedure ${JSON.stringify(procedure)} parameter ${JSON.stringify(parameterName(name))} as ${type}`);
}
// This checker adds obligations, never types to the producer graph. Call it on
// the actual flattened ordinary-declaration AST before rendering its bodies.

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
 // A declaration passed directly as a call argument is a static callback; the
 // supported default leaves it on the existing callback route, unconstrained.
 // Every other escape or nonordinary use (alias, write, new, generics) refuses.
 const escapes=new Map();
 for(const {node,parent,key}of uses){const entry=selected.get(node.name);if(entry&&graph.unchangedFunctionAt(node)===entry.fn&&!(parent?.type==='Call'&&key==='callee'&&!parent.isNew&&!parent.typeArguments?.length)){if(!escapes.has(node.name))escapes.set(node.name,[]);escapes.get(node.name).push(parent?.type==='Call'&&key==='args'&&!parent.isNew);}}
 for(const [name,callbacks]of escapes){selected.delete(name);if(mode==='supported-default'&&callbacks.every(Boolean))continue;excluded.push('Procedure parameter constraint: '+name+' escaped or nonordinary call remains outside this protocol');}
 for(const [name,entry]of selected)if(graph.unchangedFunctionAt(entry.fn)!==entry.fn){selected.delete(name);excluded.push('Procedure parameter constraint: '+name+' requires a unique unchanged actual ordinary declaration');}
 const validation={onlyFunctions:new Set(selected.keys()),ordinaryPrimitiveSdkNumbers:mode==='supported-default',sceneClockNumbers:mode==='supported-default'};
 const validate=declarationIdentityOnly?validateCompilerOwnedProcedureConstraintSource:validateProcedureConstraintSource;
 const diagnostics=[...excluded,...validate(program,validation)];
 for(const name of duplicates)diagnostics.push('Procedure parameter constraint: duplicate ordinary declaration '+name);
 const lowered=diagnostics.length?program:lowerOmittedDefaults(program,selected,graph);
 if(lowered!==program)diagnostics.push(...validate(lowered,validation));
 return Object.freeze({program:lowered,independentRoutes:Object.freeze([...independent].map(fn=>Object.freeze({name:fn.name,protocol:'existing-numeric-callable'}))),diagnostics:Object.freeze([...diagnostics]),prefix(fn,procedure,parameterName=name=>name){
  const entry=selected.get(fn.source||fn.name);if(!entry||duplicates.has(fn.source||fn.name))return [];
  if(JSON.stringify(fn.params)!==JSON.stringify(entry.params)||JSON.stringify(fn.params.map(name=>fn.paramTypes?.[name]?.text))!==JSON.stringify(entry.types))fail('lowered ordinary formal metadata differs from its actual source declaration');
  return procedureConstraintPrefix(fn,procedure,parameterName);
 }});
}
