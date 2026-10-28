// Execution ancestry is distinct from the operand's primitive producer proof.
export function throwExportOwners(project,classProcedures=new Set()) {
 const owners=new WeakMap(),roots=[],byProcedure=new Map(),incoming=new Map(),throws=[];
 const literal=(blocks,block,name)=>{const slot=block.inputs?.[name]?.[1];return Array.isArray(slot)&&slot[0]===10?slot[1]:blocks[slot]?.opcode==='text'?blocks[slot].fields?.TEXT?.[0]:null;};
 const key=(target,code)=>`${target.isStage?'':target.name}:${code}`;
 for(const target of project.targets)for(const [id,root]of Object.entries(target.blocks||{}))if(root.topLevel){
  const blocks=target.blocks,prototype=root.opcode==='procedures_definition'?blocks[root.inputs?.custom_block?.[1]]:null;
  const scope={target,root,code:prototype?.mutation?.proccode,invalid:false,id};roots.push(scope);
  if(scope.code){const identity=key(target,scope.code);if(byProcedure.has(identity)){scope.invalid=true;byProcedure.get(identity).invalid=true;}else byProcedure.set(identity,scope);}
  const seen=new Set(),visit=(node,parent)=>{if(!node)return;if(seen.has(node)){scope.invalid=true;return;}seen.add(node);if(node.parent!==parent)scope.invalid=true;if(owners.has(node)&&owners.get(node)!==scope){owners.get(node).invalid=true;scope.invalid=true;}owners.set(node,scope);if(node.opcode==='arcade_throwValue')throws.push(node);for(const slot of Object.values(node.inputs||{}))if(typeof slot[1]==='string')visit(blocks[slot[1]],Object.keys(blocks).find(id=>blocks[id]===node));visit(blocks[node.next],Object.keys(blocks).find(id=>blocks[id]===node));};visit(blocks[root.next],id);
 }
 for(const target of project.targets)for(const block of Object.values(target.blocks||{})){
  const code=block.opcode==='procedures_call'?block.mutation?.proccode:block.opcode==='arcade_callFunction'?literal(target.blocks,block,'NAME'):null;
  if(!code)continue;const identity=key(target,code);if(!byProcedure.has(identity))continue;
  if(!incoming.has(identity))incoming.set(identity,[]);incoming.get(identity).push(owners.get(block)||null);
 }
 const allowed=(scope,seen=new Set())=>{
  if(!scope||scope.invalid||seen.has(scope))return false;
  if(!scope.code)return ['event_whenflagclicked','arcade_whenSourceStarts','event_whenkeypressed','arcade_whenRegisteredButton'].includes(scope.root.opcode);
  const identity=key(scope.target,scope.code);if(classProcedures.has(identity))return false;
  const next=new Set([...seen,scope]);return (incoming.get(identity)||[]).every(caller=>allowed(caller,next));
 };
 return new Set(throws.filter(block=>allowed(owners.get(block))));
}
