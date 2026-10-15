const model=require('../../../util/bw-procedure-constraint-model');
const primitiveOwner=require('../../../util/bw-primitive-owner');
const primitive=require('./console-inspect-values').primitive;
const currentNumberInput=require('../../../util/bw-current-number-input');
const fail=message=>{throw Error('Procedure parameter constraint: '+message);};
const accepts=(type,value)=>type==='Any'||(type==='Number'?typeof value==='number':type==='String'?typeof value==='string':typeof value==='boolean');
module.exports=function createProcedureConstraints(runtime,provenance) {
 const bound=!!runtime&&typeof runtime.on==='function'&&Array.isArray(runtime.targets);
 let active=false,disposed=false,models=new WeakMap(),cells=new WeakMap(),generation=0;
 const tickets=new WeakMap();
 const issue=(values,target,record,caller)=>{tickets.set(values,{target,record,caller,generation});return values;};
 const invalidate=()=>{active=false;models=new WeakMap();generation++;};
 const assertTarget=target=>{if(!bound||!active||disposed||!runtime.targets.includes(target))fail('inactive or foreign runtime/target');};
 const prepare=target=>{assertTarget(target);const old=models.get(target);if(old){if(!old.current())fail('current graph changed; restart required');return old;}const next=model.prepare(target);if(next.procedures.values().next().done)return next;models.set(target,next);return next;};
 const entry=(target,code)=>prepare(target).procedures.get(code)||null;
 const check=(record,values)=>{
  if(values.length!==record.names.length)fail('required argument count differs');
  for(const constraint of record.constraints.values())if(!accepts(constraint.type,constraint.type==='Any'?values[constraint.index]:primitive(values[constraint.index])))fail(constraint.name+' requires '+constraint.type);
  return Object.freeze(values.slice());
 };
 const domains=(record,args,util,paths)=>{
  const selected=[...record.constraints.values()].filter(constraint=>constraint.type!=='Any');
  if(!selected.length)return;
  if(typeof provenance?.inputDomains!=='function')fail('actual producer domain owner is missing');
  const actual=provenance.inputDomains(args,util,[...selected.map(constraint=>paths[constraint.index]),...selected.map(constraint=>({procedure:record.code,formal:constraint.name}))]);
  for(let i=0;i<selected.length;i++)if(!actual[i]?.length||actual[i].some(type=>type!==selected[i].type.toLowerCase())||!actual[i+selected.length]?.length||actual[i+selected.length].some(type=>type!==selected[i].type.toLowerCase()))fail(selected[i].name+' requires '+selected[i].type+' from every actual producer');
 };
 const owned=util=>{const thread=util?.thread,target=thread?.target;if(!thread||thread.isKilled||util.runtime!==runtime||runtime.sequencer?.activeThread!==thread||!runtime.threads?.includes(thread)||thread.blockContainer!==target?.blocks)fail('entry caller is not current');assertTarget(target);return target;};
 const stockEntry=(proccode,args,util)=>{
  const target=util?.thread?.target,record=entry(target,proccode);if(!record)return null;
  if(owned(util)!==target)fail('stock target differs');
  const call=primitiveOwner.current(util,args);
  if(call?.opcode!=='procedures_call'||call.mutation?.proccode!==proccode)fail('stock call requires its actual current primitive');
  for(const id of record.ids)if(!model.stockFormal(target,call,id)&&record.constraints.has(record.names[record.ids.indexOf(id)]))fail('stock formal binding differs');
  for(const id of record.ids)if(!Object.hasOwn(args,id))fail('required argument is missing');
  domains(record,args,util,record.ids);
  const values=record.ids.map(id=>{if(!Object.hasOwn(args,id))fail('required argument is missing');return currentNumberInput(runtime,args,util,'procedures_call',id);});
  return Object.freeze({names:record.names,ids:record.ids,values:issue(check(record,values),target,record,util.thread)});
 };
 const managedEntry=(target,code,values,rawValues,util,operationArgs)=>{
  const record=entry(target,code);if(!record)return null;
  if(owned(util)!==target)fail('managed target differs');
  const block=primitiveOwner.current(util,operationArgs),all=target.blocks._blocks;
  if(block?.opcode!=='arcade_callFunction')fail('managed entry requires its actual current primitive');
  const name=all[model.input(block,'NAME')];
  if(name?.opcode!=='text'||name.fields?.TEXT?.value!==code||operationArgs.NAME!==code)fail('managed procedure name is not its fixed actual input');
  const paths=[];let current=all[model.input(block,'ARGS')],path=['ARGS'];const seen=new Set();
  while(current?.opcode==='arcade_functionArgument'){
   if(seen.has(current))fail('cyclic actual argument chain');seen.add(current);paths.push([...path,'VALUE']);path=[...path,'REST'];current=all[model.input(current,'REST')];
  }
  if(current?.opcode!=='text'||current.fields?.TEXT?.value!=='[]'||paths.length!==record.names.length)fail('managed actual argument chain differs');
  if(!Array.isArray(rawValues)||rawValues.length!==values.length)fail('raw argument list differs');
  let actualRaw;try{actualRaw=JSON.parse(operationArgs.ARGS);}catch{fail('actual managed argument transport differs');}
  if(!Array.isArray(actualRaw)||JSON.stringify(actualRaw)!==JSON.stringify(rawValues))fail('raw arguments differ from actual current transport');
  for(const constraint of record.constraints.values())if(constraint.type!=='Any'&&!Object.is(primitive(rawValues[constraint.index]),primitive(values[constraint.index])))fail('decoded primitive argument differs from actual raw transport');
  domains(record,operationArgs,util,paths);check(record,rawValues);return issue(check(record,values),target,record,util.thread);
 };
 const bind=(thread,target,code,params,entryValues)=>{
  assertTarget(target);const record=entry(target,code);if(!record)return;
  const ticket=entryValues&&tickets.get(entryValues);
  if(!ticket||ticket.target!==target||ticket.record!==record||ticket.generation!==generation||runtime.sequencer.activeThread!==ticket.caller||ticket.caller.isKilled||!runtime.threads.includes(ticket.caller))fail('entry proof is missing or stale');
  tickets.delete(entryValues);
  if(record.names.some((name,index)=>!Object.hasOwn(params,name)||!Object.is(params[name],entryValues[index])))fail('installed argument cells differ from validated entry');
  if(thread?.target!==target||thread.blockContainer!==target.blocks||!runtime.threads.includes(thread)||!thread.stackFrames?.some(frame=>frame.params===params))fail('actual invocation parameter map required');
  check(record,record.names.map(name=>params[name]));cells.set(params,{target,thread,record,generation});
 };
 const write=(params,name,value,util,operationArgs)=>{
  const saved=cells.get(params);if(!saved)return value;
  const {target,thread,record}=saved;assertTarget(target);
  if(saved.generation!==generation||entry(target,record.code)!==record)fail('stale invocation cell');
  owned(util);const caller=util.thread;
  const ownFrame=caller===thread&&caller.stackFrames.some(frame=>frame.params===params);
  const capture=[...(caller.bwArcadeCaptures?.values()||[])].some(cell=>cell?.values===params&&cell.key===name);
  if(!ownFrame&&!capture)fail('writer does not own the actual formal/capture cell');
  const constraint=record.constraints.get(name);
  if(constraint){
   const block=primitiveOwner.current(util,operationArgs),all=model.blocksOf(target);
   if(!['arcade_setLocal','arcade_setCaptured'].includes(block?.opcode)||all[model.input(block,'NAME')]?.opcode!=='text'||all[model.input(block,'NAME')].fields?.TEXT?.value!==name||operationArgs.NAME!==name)fail('writer requires its actual fixed formal/capture primitive');
   if(constraint.type!=='Any'){
    if(typeof provenance?.inputDomains!=='function')fail('actual producer domain owner is missing');
    const actual=provenance.inputDomains(operationArgs,util,['VALUE',{procedure:record.code,formal:name}]);
    if(actual.some(types=>!types.length||types.some(type=>type!==constraint.type.toLowerCase())))fail(name+' requires '+constraint.type+' from every actual producer');
   }
   if(!accepts(constraint.type,constraint.type==='Any'?value:primitive(value)))fail(name+' requires '+constraint.type);
  }
  return value;
 };
 const declare=(args,util)=>{const target=owned(util),block=target.blocks.getBlock(util.thread.peekStack());if(block?.opcode!==model.OPCODE)fail('actual declaration command required');const prepared=prepare(target);if(!prepared.declarations.has(block)||['PROCEDURE','PARAMETER','TYPE'].some(name=>model.field(block,name)!==args[name]))fail('declaration selectors changed');};
 return Object.freeze({prepare,declare,stockEntry,managedEntry,bind,write,
  start:()=>{invalidate();if(bound&&!disposed)active=true;},invalidate,
  projectLoaded:()=>{invalidate();},dispose:()=>{invalidate();disposed=true;}});
};
