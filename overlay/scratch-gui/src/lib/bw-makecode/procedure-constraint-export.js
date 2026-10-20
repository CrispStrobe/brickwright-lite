import model from 'scratch-vm/src/util/bw-procedure-constraint-model.js';
import {analyseConsoleCaptures} from './console-capture-provenance.js';
const fail=message=>{throw Error('Procedure parameter constraint: '+message);};
const field=(block,name)=>block.fields?.[name]?.[0];
const child=(target,block,name)=>target.blocks[block.inputs?.[name]?.[1]];
const literal=(block,name,target)=>{if(block.fields?.[name])return field(block,name);const value=block.inputs?.[name]?.[1];return Array.isArray(value)&&value[0]===10?value[1]:target.blocks[value]?.opcode==='text'?field(target.blocks[value],'TEXT'):null;};
export function prepareProcedureConstraintExport(project) {
 const models=new Map(project.targets.map(target=>[target,model.prepare(target)]));
 const obligations=new WeakMap(),allObligations=[],declarations=new Set(),annotations=new Map();
 const add=(block,record,input,type)=>{const entries=obligations.get(block)||[];const obligation=Object.freeze({record,input,type});entries.push(obligation);allObligations.push({block,obligation});obligations.set(block,entries);};
 const captures=analyseConsoleCaptures({targets:project.targets,blocks:target=>target.blocks,input:(block,name,target)=>child(target,block,name),literal});
 for(const [target,prepared] of models) {
  const byCode=new Map();annotations.set(target,byCode);
  for(const [code,entry] of prepared.procedures)byCode.set(code,entry);
  for(const [block] of prepared.declarations)declarations.add(block);
 }
 for(const target of project.targets)for(const block of Object.values(target.blocks||{})) {
  const prepared=models.get(target);
  if(block.opcode==='procedures_call') {
   const entry=prepared.procedures.get(block.mutation?.proccode);if(!entry)continue;
   for(const constraint of entry.constraints.values()) {
    model.stockFormal(target,block,constraint.id);
    if(!block.inputs?.[constraint.id])fail('required stock call input is missing');
    add(block,entry,constraint.id,constraint.type);
   }
  }
  if(block.opcode==='arcade_callFunction') {
   const entry=prepared.procedures.get(literal(block,'NAME',target));if(!entry)continue;
   model.exactInputs(block,['NAME','ARGS'],'managed call');
   const args=[],seen=new Set();let current=child(target,block,'ARGS'),tail=block.inputs?.ARGS?.[1];
   while(current?.opcode==='arcade_functionArgument') {
    model.exactInputs(current,['VALUE','REST'],'managed argument');
    if(seen.has(current))fail('cyclic managed argument chain');seen.add(current);args.push(current);tail=current.inputs?.REST?.[1];current=child(target,current,'REST');
   }
   const empty=Array.isArray(tail)&&tail[0]===10&&tail[1]==='[]'||current?.opcode==='text'&&field(current,'TEXT')==='[]';
   if(!empty||args.length!==entry.names.length)fail('managed argument list differs');
   for(const constraint of entry.constraints.values())add(args[constraint.index],entry,'VALUE',constraint.type);
  }
  if(['arcade_setLocal','arcade_setCaptured'].includes(block.opcode)) {
   const scope=captures.scopeOf(block),name=literal(block,'NAME',target);
   if(typeof name!=='string') {
    if(annotations.get(target)?.has(scope?.procedure))fail('computed formal writer cannot prove a distinct binding');
    continue;
   }
   const cell=block.opcode==='arcade_setCaptured'?captures.captured(scope,name):captures.local(scope,name);
   const record=cell&&annotations.get(cell.scope.target)?.get(cell.scope.procedure),constraint=record?.constraints.get(cell.name);
   if(constraint)add(block,record,'VALUE',constraint.type);
  }
 }
 return Object.freeze({
  declaration:block=>declarations.has(block),
  annotation:(target,code,index)=>annotations.get(target)?.get(code)?.constraints.get(annotations.get(target)?.get(code)?.names[index])?.type.toLowerCase()||null,
  obligations:block=>obligations.get(block)||[],
  allObligations:Object.freeze(allObligations),
  procedures:()=>[...models].flatMap(([target,prepared])=>[...prepared.procedures].map(([code])=>({target,code}))),
  current:()=>[...models.values()].every(prepared=>prepared.current())
 });
}
