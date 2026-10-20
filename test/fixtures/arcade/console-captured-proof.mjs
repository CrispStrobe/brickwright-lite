export const CAPTURED_PROOF_SOURCE='let capturedProofTicks=0;let capturedProofSeedCalls=0;let capturedProofNumber=0;let capturedProofObservation="";let capturedProofReady=false;function capturedProofSeed():number{capturedProofSeedCalls+=1;return 2}function capturedProofSetup(initial:number,prefix:string){let current=initial;let label=prefix;let unrelated=image.create(1,1);game.onUpdate(function(){if(capturedProofTicks<2){current+=1;label=label+"!";capturedProofTicks+=1;capturedProofNumber=current;capturedProofObservation=console.inspect(label+current);unrelated.setPixel(0,0,1);capturedProofReady=capturedProofTicks===2}})}capturedProofSetup(capturedProofSeed(),"captured ");';
export const capturedProofExpected=initial=>({capturedProofTicks:2,capturedProofSeedCalls:1,capturedProofNumber:initial+2,capturedProofObservation:'captured !!'+(initial+2),capturedProofReady:true});

export function editCapturedProofSeed(project){
 const matches=[];
 for(const target of project.targets)for(const [id,definition]of Object.entries(target.blocks||{}))if(definition.opcode==='procedures_definition'){
  const prototype=target.blocks[definition.inputs?.custom_block?.[1]];
  if(!prototype?.mutation?.proccode?.includes('capturedProofSeed'))continue;
  const seen=new Set(),visit=(block,id)=>{if(!block||seen.has(block))return;seen.add(block);
   if(block.opcode==='arcade_returnValue'){
    const collect=(node,nodeId)=>{if(!node)return;if(node.opcode==='math_number'&&Number(node.fields?.NUM?.[0])===2)matches.push({kind:'field',target,id:nodeId,field:node.fields.NUM});
     for(const[name,slot]of Object.entries(node.inputs||{})){if(Array.isArray(slot[1])){if([4,5,6,7,8].includes(slot[1][0])&&Number(slot[1][1])===2)matches.push({kind:'inline',target,id:nodeId,input:name,field:slot[1]});}else collect(target.blocks[slot[1]],slot[1]);}};
    collect(target.blocks[block.inputs.VALUE?.[1]],block.inputs.VALUE?.[1]);
   }
   for(const slot of Object.values(block.inputs||{}))if(typeof slot[1]==='string')visit(target.blocks[slot[1]],slot[1]);if(block.next)visit(target.blocks[block.next],block.next);
  };visit(target.blocks[definition.next],definition.next);
 }
 if(matches.length!==1)throw Error('Expected one actual seed return Number2 leaf, found '+matches.length);
 const selected=matches[0];selected.field[selected.kind==='field'?0:1]='7';return{target:selected.target.name,id:selected.id,kind:selected.kind,input:selected.input,from:2,to:7};
}
