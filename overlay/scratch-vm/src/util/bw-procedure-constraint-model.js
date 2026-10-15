// Structural obligations only. This model never produces runtime value types.
const TYPES=Object.freeze(['Number','String','Boolean','Any']);
const OPCODE='arcade_declareParameterConstraint';
const fail=message=>{throw Error('Procedure parameter constraint: '+message);};
const blocksOf=target=>target?.blocks?._blocks || target?.blocks || {};
const input=(block,name)=>{const slot=block?.inputs?.[name];return Array.isArray(slot)?slot[1]:slot?.block;};
const field=(block,name)=>{if(block?.inputs?.[name])fail(name+' must be a fixed field');const value=block?.fields?.[name];return Array.isArray(value)?value[0]:value?.value;};
const list=(value,name)=>{let result;try{result=JSON.parse(value);}catch(_){fail('malformed '+name);}if(!Array.isArray(result)||result.some(x=>typeof x!=='string')||new Set(result).size!==result.length)fail('invalid or duplicate '+name);return result;};
const readonly=map=>Object.freeze({get:key=>map.get(key),has:key=>map.has(key),values:()=>map.values(),entries:()=>map.entries(),[Symbol.iterator]:()=>map[Symbol.iterator]()});
const semantic=block=>JSON.stringify([block.opcode,block.inputs,block.fields,block.mutation,block.next,block.parent,block.topLevel,block.shadow]);
function prepare(target) {
 const blocks=blocksOf(target),procedures=new Map(),declarations=new Map();
 const snapshot=Object.entries(blocks).map(([id,block])=>[id,block,semantic(block)]);
 for(const [definitionId,definition] of Object.entries(blocks)) {
  if(definition?.opcode!=='procedures_definition')continue;
  const prototypeId=input(definition,'custom_block'),prototype=blocks[prototypeId],code=prototype?.mutation?.proccode;
  let first=blocks[definition.next];
  // Unrelated existing procedure protocols retain their existing validators.
  if(first?.opcode!==OPCODE)continue;
  if(typeof code!=='string'||!code||definition.topLevel!==true||definition.parent!=null||prototype?.opcode!=='procedures_prototype'||prototype.parent!==definitionId||prototype.next!=null)fail('definition/prototype ownership differs');
  const matches=Object.values(blocks).filter(b=>b?.opcode==='procedures_prototype'&&b.mutation?.proccode===code);
  if(matches.length!==1||procedures.has(code))fail('procedure is not unique');
  const names=list(prototype.mutation.argumentnames,'formal names'),ids=list(prototype.mutation.argumentids,'formal IDs');
  let defaults;try{defaults=JSON.parse(prototype.mutation.argumentdefaults);}catch(_){fail('malformed defaults');}
  if((code.match(/%[sbn]/g)||[]).length!==ids.length||names.length!==ids.length||!Array.isArray(defaults)||defaults.length!==ids.length||names.some(n=>!n)||Object.keys(prototype.inputs||{}).length!==ids.length)fail('ordered formal mapping differs');
  for(let i=0;i<ids.length;i++) {
   const reporter=blocks[input(prototype,ids[i])];
   if(!reporter||!['argument_reporter_string_number','argument_reporter_boolean'].includes(reporter.opcode)||reporter.parent!==prototypeId||field(reporter,'VALUE')!==names[i])fail('formal reporter binding differs');
  }
  const constraints=new Map(),seen=new Set();let previous=definitionId;
  while(first?.opcode===OPCODE) {
   if(seen.has(first)||first.parent!==previous)fail('cyclic or detached declaration prefix');seen.add(first);
   const procedure=field(first,'PROCEDURE'),parameter=field(first,'PARAMETER'),type=field(first,'TYPE');
   // PARAMETER is the real name in visible Code/Blocks; the certificate binds
   // that unique name to the actual ordered ID, never a guessed external ID.
   const index=names.indexOf(parameter);
   if(procedure!==code||index<0||!TYPES.includes(type)||constraints.has(parameter))fail('stale, duplicate or unsupported declaration');
   if(blocks[input(prototype,ids[index])]?.opcode==='argument_reporter_boolean'&&!['Boolean','Any'].includes(type))fail('Boolean socket constraint differs');
   const binding=Object.freeze({name:parameter,id:ids[index],index,type,block:first});constraints.set(parameter,binding);declarations.set(first,binding);
   previous=Object.keys(blocks).find(id=>blocks[id]===first);if(!previous)fail('missing declaration identity');first=blocks[first.next];
  }
  const owned=new Set();
  const visit=(id,parent)=>{
   if(id==null)return;
   if(typeof id!=='string'||!blocks[id])fail('body contains a missing current block');
   if(owned.has(id))fail('body contains a cycle or shared child');owned.add(id);
   const node=blocks[id];if(node.parent!==parent||node.topLevel===true)fail('body parent ownership differs');
   for(const name of Object.keys(node.inputs||{})){const child=input(node,name);if(typeof child==='string')visit(child,id);}
   visit(node.next,id);
  };
  visit(definition.next,definitionId);
  procedures.set(code,Object.freeze({code,definition,definitionId,prototype,prototypeId,names:Object.freeze(names),ids:Object.freeze(ids),defaults:Object.freeze(defaults),constraints:readonly(constraints),body:first}));
 }
 for(const block of Object.values(blocks))if(block?.opcode===OPCODE&&!declarations.has(block))fail('declarations must form an actual DEFINE prefix');
 const current=()=>{const now=blocksOf(target);return target?.blocks && snapshot.length===Object.keys(now).length&&snapshot.every(([id,block,saved])=>now[id]===block&&semantic(block)===saved);};
 return Object.freeze({target,procedures:readonly(procedures),declarations:readonly(declarations),current});
}
function stockFormal(target,call,name) {
 const model=prepare(target),entry=model.procedures.get(call?.mutation?.proccode);
 if(!entry||call.opcode!=='procedures_call')return null;
 const ids=list(call.mutation.argumentids,'call formal IDs');
 if(JSON.stringify(ids)!==JSON.stringify(entry.ids))fail('call ordered formal IDs differ');
 const index=entry.ids.indexOf(name);
 return index<0||!entry.constraints.has(entry.names[index])?null:entry.constraints.get(entry.names[index]);
}
module.exports=Object.freeze({TYPES,OPCODE,prepare,stockFormal,input,field,blocksOf});
