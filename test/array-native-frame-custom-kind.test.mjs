import test from 'node:test';
import assert from 'node:assert/strict';
import {writeFileSync} from 'node:fs';
import Creator from '../overlay/scratch-gui/src/lib/sb3-creator-register-art.js';
import {projectJsonToArcade} from '../overlay/scratch-gui/src/lib/bw-makecode/export-arcade.js';
import {createProjectJsonSnapshot,isProjectJsonSnapshot} from '../overlay/scratch-gui/src/lib/bw-makecode/project-json-snapshot.js';
import {createArrayReferenceExportAuthority} from '../overlay/scratch-gui/src/lib/bw-makecode/array-reference-export-authority.js';
import {numericAuthoringFiles} from './fixtures/arcade-numeric-authoring-game.mjs';
import {clean,checkedCode,createFrameSourceProjects} from './fixtures/arcade-frame-source-project.mjs';

const {imported,carryArtwork,artworkForProject}=createFrameSourceProjects();
const rows=project=>project.targets.flatMap(target=>Object.entries(target.blocks).map(([id,node])=>({target,id,node})));
const literal=(target,node,name)=>{const raw=node.inputs?.[name]?.[1];if(Array.isArray(raw)&&raw[0]===10)return raw[1];const leaf=target.blocks[raw];return leaf?.opcode==='text'?leaf.fields.TEXT[0]:null;};
const rowOf=(project,opcode)=>{const found=rows(project).filter(r=>r.node.opcode===opcode);assert.equal(found.length,1,opcode);return found[0];};
function filesFor(variant){
 const files=numericAuthoringFiles({maximum:12,operation:'max',message:'PLAY'});
 if(variant==='variable')files['main.ts']='let activeKind = SpriteKind.create()\n'+files['main.ts'].replace('SpriteKind.Player','activeKind');
 else{
  const name=variant==='renamed'?'Treasure':'Coin';
  files['main.ts']=`namespace SpriteKind { export const ${name} = SpriteKind.create() }\n`+files['main.ts'].replace('SpriteKind.Player',`SpriteKind.${name}`);
  if(variant==='created')files['main.ts']+='\nsprites.onCreated(SpriteKind.Coin, function (spawned) { info.setScore(7) })\n';
 }
 return files;
}
const creators=new Map();
function creatorFor(variant='namespace'){
 if(!creators.has(variant)){
  if(variant==='named'){
   const original=creatorFor('namespace'),code=checkedCode(original),lines=code.split('\n');
   const positions=lines.flatMap((line,index)=>line.includes('arcade create template')?[index]:[]);
   assert.equal(positions.length,1,'one real source Sprite creation to author in Code');
   const index=positions[0],line=lines[index];
   assert.match(line,/ kind .+ width /);
   lines[index]=line.replace(/ kind .+? width /,' kind (arcade sprite kind value "Coin") width ');
   assert.notEqual(lines[index],line,'actual Code authoring changes the KIND expression');
   const authored=new Creator();authored.parse(lines.join('\n'));clean(authored);
   creators.set(variant,carryArtwork(original,authored));
  }else creators.set(variant,imported(filesFor(variant)));
 }
 return creators.get(variant);
}
const fixture=(variant='namespace')=>JSON.parse(JSON.stringify(creatorFor(variant).project));
function consumers(project){const found=rows(project).filter(r=>['arrays_mutateReference','arrays_referenceItem'].includes(r.node.opcode));assert.ok(found.some(r=>r.node.opcode==='arrays_mutateReference'));assert.ok(found.some(r=>r.node.opcode==='arrays_referenceItem'));return found;}
function selected(project){const found=consumers(project).filter(r=>r.node.opcode==='arrays_mutateReference'&&literal(r.target,r.node,'VALUE')==='Ä');assert.equal(found.length,1,'actual first Unicode push');return found[0];}
function binding(project){
 const push=selected(project),read=push.target.blocks[push.node.inputs.ARRAY[1]];assert.equal(read?.opcode,'arcade_getLocal');
 const name=literal(push.target,read,'NAME'),stores=rows(project).filter(r=>r.target===push.target&&r.node.opcode==='arcade_setLocal'&&literal(r.target,r.node,'NAME')===name);
 assert.equal(stores.length,2,'actual null reset and fresh Array overwrite');
 const reset=stores.find(r=>r.target.blocks[r.node.inputs.VALUE[1]]?.opcode==='arrays_specialValue');
 const overwrite=stores.find(r=>r.target.blocks[r.node.inputs.VALUE[1]]?.opcode==='arrays_createReference');
 assert.ok(reset);assert.ok(overwrite);assert.equal(reset.target.blocks[reset.node.inputs.VALUE[1]].fields.KIND[0],'null');
 return {push,read,name,reset,overwrite,target:push.target};
}
let failureSerial=0;
function accepted(draft,{exportClean=true}={}){
 const before=JSON.stringify(draft),project=createProjectJsonSnapshot(before);assert.equal(isProjectJsonSnapshot(project),true);binding(project);
 const proof=createArrayReferenceExportAuthority(project);
 for(const {target,id,node}of consumers(project)){
  const decision=proof.validateInput(target,node);
  if(!decision.ok&&process.env.BW_NATIVE_FRAME_FAILURE_DIR){
   try{writeFileSync(`${process.env.BW_NATIVE_FRAME_FAILURE_DIR}/frame-custom-failure-${failureSerial++}.json`,JSON.stringify({target:target.name,id,opcode:node.opcode,decision,project},null,2),{flag:'wx',mode:0o600});}
   catch(_){console.warn('Native frame failure capture unavailable');}
  }
  assert.equal(decision.ok,true,node.opcode);
 }
 if(exportClean){const costumeSvg=artworkForProject(before);assert.equal(typeof costumeSvg,'function','exact-project SVG provider');clean(projectJsonToArcade(before,{costumeSvg}));}
 assert.equal(JSON.stringify(draft),before,'analysis/export preserve actual source');
 return {project,proof,push:selected(project)};
}
function refused(edit,variant='named'){
 const draft=fixture(variant),before=consumers(draft).map(r=>r.id),id=selected(draft).id;
 edit(draft,binding(draft));
 const project=createProjectJsonSnapshot(JSON.stringify(draft));
 assert.deepEqual(consumers(project).map(r=>r.id),before,'original actual Array consumers remain');
 const push=selected(project);assert.equal(push.id,id);
 assert.equal(createArrayReferenceExportAuthority(project).validateInput(push.target,push.node).ok,false,'fresh graph preserves the reset obligation');
 return project;
}
function removeInputTree(target,node,name){
 const remove=id=>{if(typeof id!=='string'||!Object.hasOwn(target.blocks,id))return;const child=target.blocks[id];for(const slot of Object.values(child.inputs||{})){remove(slot[1]);if(slot.length>2)remove(slot[2]);}delete target.blocks[id];};
 const slot=node.inputs[name];if(slot){remove(slot[1]);if(slot.length>2)remove(slot[2]);}
}
function replaceInput(row,name,input){removeInputTree(row.target,row.node,name);row.node.inputs[name]=input;}
function setName(row,name){const raw=row.node.inputs.NAME[1];if(Array.isArray(raw)){assert.equal(raw[0],10);raw[1]=name;}else{const leaf=row.target.blocks[raw];assert.equal(leaf.opcode,'text');leaf.fields.TEXT[0]=name;}}
function detach(row){
 const parent=row.target.blocks[row.node.parent];assert.ok(parent);assert.equal(parent.next,row.id,'direct command predecessor');
 parent.next=row.node.next;if(row.node.next)row.target.blocks[row.node.next].parent=row.node.parent;
}
function placeBefore(row,destination){
 assert.equal(row.target,destination.target);const parent=destination.target.blocks[destination.node.parent];assert.ok(parent);assert.equal(parent.next,destination.id);
 row.node.parent=destination.node.parent;row.node.next=destination.id;parent.next=row.id;destination.node.parent=row.id;
}
function moveBefore(row,destination){detach(row);placeBefore(row,destination);}
function removeCommand(row){detach(row);for(const name of Object.keys(row.node.inputs))removeInputTree(row.target,row.node,name);delete row.target.blocks[row.id];}
function statementFor(project,row){
 const seen=new Set();while(row.node.parent){assert.equal(seen.has(row.id),false);seen.add(row.id);const parent=row.target.blocks[row.node.parent];assert.ok(parent);if(parent.next===row.id||['procedures_definition','arcade_whenSourceStarts'].includes(parent.opcode))return row;row={target:row.target,id:row.node.parent,node:parent};}
 assert.fail('reporter must belong to an actual command');
}
function orderedPrefix(project){
 const cell=binding(project),definition=rows(project).find(r=>r.target===cell.target&&r.node.opcode==='procedures_definition'&&r.node.next===cell.reset.id);assert.ok(definition);
 const prototype=definition.target.blocks[definition.node.inputs.custom_block[1]];assert.ok(prototype);
 const calls=rows(project).filter(r=>r.node.opcode==='procedures_call'&&r.node.mutation?.proccode===prototype.mutation.proccode);assert.equal(calls.length,1);
 const call=calls[0],root=rows(project).find(r=>r.target===call.target&&r.node.opcode==='arcade_whenSourceStarts'&&r.node.parent===null);assert.ok(root);
 const sequence=(target,id)=>{const out=[],seen=new Set();while(id){assert.equal(seen.has(id),false);seen.add(id);const node=target.blocks[id];assert.ok(node);out.push({target,id,node});id=node.next;}return out;};
 const outer=sequence(root.target,root.node.next),index=outer.findIndex(r=>r.id===call.id);assert.ok(index>=0);
 return [...outer.slice(0,index),...sequence(definition.target,definition.node.next)];
}

test('actual namespace and variable kind producers retain the complete real source/artwork/export journey',()=>{
 for(const variant of ['namespace','variable','renamed']){
  const draft=fixture(variant),actual=rows(draft),create=rowOf(draft,'arcade_createSpriteKind'),sprite=rowOf(draft,'arcade_createSprite');
  assert.equal(Object.keys(create.node.inputs).length,0);assert.equal(Object.keys(create.node.fields).length,0);
  const kind=sprite.target.blocks[sprite.node.inputs.KIND[1]];assert.ok(kind);assert.ok(['data_variable','arcade_getLocal'].includes(kind.opcode),'actual numeric kind cell reader');
  if(variant!=='variable'){
   const binder=rowOf(draft,'arcade_bindSpriteKind');assert.equal(literal(binder.target,binder.node,'NAME'),variant==='renamed'?'Treasure':'Coin');
   const operand=binder.target.blocks[binder.node.inputs.KIND[1]];assert.ok(operand);assert.ok(['data_variable','arcade_getLocal'].includes(operand.opcode));
  }
  for(const opcode of ['arcade_setBackgroundColor','arcade_setSpritePosition','arcade_sourceWhile','arcade_mathBinary','arcade_randomNumber','arcade_percentChance','arcade_settingsWrite','arcade_settingsRead','arcade_registerButtonHandler'])assert.ok(actual.some(r=>r.node.opcode===opcode),opcode);
  accepted(draft);
 }
});

test('genuine authored Code uses an earlier actual custom binder before named lookup; missing, late and loop-only bindings refuse',()=>{
 const draft=fixture('named'),lookup=rowOf(draft,'arcade_spriteKindValue'),binder=rowOf(draft,'arcade_bindSpriteKind');
 assert.equal(literal(lookup.target,lookup.node,'NAME'),'Coin');assert.equal(literal(binder.target,binder.node,'NAME'),'Coin');
 const prefix=orderedPrefix(draft),use=statementFor(draft,lookup);assert.ok(prefix.findIndex(r=>r.id===binder.id)>=0);assert.ok(prefix.findIndex(r=>r.id===binder.id)<prefix.findIndex(r=>r.id===use.id),'actual earlier numeric binder');
 accepted(draft); // Validate this actual named graph before export can lower it.
 refused(project=>removeCommand(rowOf(project,'arcade_bindSpriteKind')));
 refused(project=>{const cell=binding(project);moveBefore(rowOf(project,'arcade_bindSpriteKind'),cell.overwrite);});
 refused(project=>setName(rowOf(project,'arcade_bindSpriteKind'),'OtherKind'));
 refused(project=>{
  const binder=rowOf(project,'arcade_bindSpriteKind'),loop=rowOf(project,'arcade_sourceWhile'),cell=binding(project);
  const sprite=statementFor(project,rowOf(project,'arcade_createSprite')),position=rowOf(project,'arcade_setSpritePosition');
  moveBefore(sprite,cell.overwrite);moveBefore(position,cell.overwrite);
  detach(binder);let tailID=loop.node.inputs.SUBSTACK[1],tail=loop.target.blocks[tailID];assert.ok(tail);
  while(tail.next){tailID=tail.next;tail=loop.target.blocks[tailID];assert.ok(tail);}
  assert.equal(tail.next,null);tail.next=binder.id;binder.node.parent=tailID;binder.node.next=null;
 });
});

test('kind operand, literal name and exact native schemas cannot lend frame authority',()=>{
 for(const name of ['constructor','__proto__','Player','Projectile','Food','Enemy','Text','create','', 'not an identifier'])refused(project=>setName(rowOf(project,'arcade_bindSpriteKind'),name));
 for(const name of ['UnknownKind','constructor','1',''])refused(project=>setName(rowOf(project,'arcade_spriteKindValue'),name));
 for(const opcode of ['arcade_createSpriteKind','arcade_bindSpriteKind','arcade_spriteKindValue']){
  for(const edit of [r=>{r.node.inputs.EXTRA=[1,[4,'0']];},r=>{r.node.fields.EXTRA=['unexpected',null];},r=>{r.node.mutation={unexpected:true};}])refused(project=>edit(rowOf(project,opcode)));
 }
 refused(project=>replaceInput(rowOf(project,'arcade_bindSpriteKind'),'KIND',[1,[10,'not numeric']]));
 for(const opcode of ['arcade_bindSpriteKind','arcade_spriteKindValue'])refused(project=>replaceInput(rowOf(project,opcode),'NAME',[1,[4,'1']]));
 for(const opcode of ['arcade_bindSpriteKind','arcade_spriteKindValue'])for(const value of [['Coin'],{name:'Coin'},1])refused(project=>replaceInput(rowOf(project,opcode),'NAME',[1,[10,value]]));
 for(const name of ['NAME','KIND'])refused((project,cell)=>{
  const row=rowOf(project,'arcade_bindSpriteKind'),id=`__dynamicKind${name}`;removeInputTree(row.target,row.node,name);
  row.target.blocks[id]={...structuredClone(cell.read),parent:row.id,next:null};row.node.inputs[name]=[3,id,name==='NAME'?[10,'Coin']:[4,'0']];
 });
 refused((project,cell)=>{
  const row=rowOf(project,'arcade_spriteKindValue');removeInputTree(row.target,row.node,'NAME');row.target.blocks.__dynamicLookup={...structuredClone(cell.read),parent:row.id,next:null};row.node.inputs.NAME=[3,'__dynamicLookup',[10,'Coin']];
 });
});

test('custom kind effects retain early-capture, extra-writer, caller and permanent currentness fences',()=>{
 refused((project,cell)=>moveBefore(rowOf(project,'arcade_registerButtonHandler'),cell.overwrite));
 const created=fixture('created');assert.ok(rows(created).some(r=>['arcade_registerSpriteCreated','arcade_whenSpriteCreated','arcade_whenRegisteredCreated'].includes(r.node.opcode)),'genuine source-created callback');
 const createdOwned=createProjectJsonSnapshot(JSON.stringify(created)),createdPush=selected(createdOwned);assert.deepEqual(consumers(createdOwned).map(r=>r.id),consumers(created).map(r=>r.id));assert.equal(createArrayReferenceExportAuthority(createdOwned).validateInput(createdPush.target,createdPush.node).ok,false);
 refused((project,cell)=>{
  const valueID='__secondNullValue',id='__secondNull';cell.target.blocks[valueID]={...structuredClone(cell.target.blocks[cell.reset.node.inputs.VALUE[1]]),parent:id,next:null};
  const node={opcode:'arcade_setLocal',inputs:{NAME:[1,[10,cell.name]],VALUE:[3,valueID,[4,'0']]},fields:{},parent:null,next:null,shadow:false,topLevel:false};
  cell.target.blocks[id]=node;placeBefore({target:cell.target,id,node},cell.push);
 });
 refused(project=>{const call=rowOf(project,'procedures_call');call.node.mutation.proccode='foreign';});
 refused(project=>{project.monitors=[{id:'unexpectedMonitor',opcode:'data_variable',mode:'default',params:{VARIABLE:'hero'},spriteName:null,value:0,width:0,height:0,x:0,y:0,visible:true}];});
 const raw=fixture('named'),rawPush=selected(raw);assert.equal(createArrayReferenceExportAuthority(raw).validateInput(rawPush.target,rawPush.node).ok,false);
 const {project,proof,push}=accepted(raw),source=rowOf(project,'arcade_bindSpriteKind');assert.equal(Object.isFrozen(source.node),true);assert.throws(()=>{source.node.inputs.NAME=[1,[10,'OtherKind']];},TypeError);
 assert.equal(proof.validateInput(push.target,push.node).ok,true,'failed frozen write leaves original current');
 const name='__bwCustomKindPrototypeControl';assert.equal(Object.hasOwn(Object.prototype,name),false);let changed,restored;
 try{Object.defineProperty(Object.prototype,name,{value:1,configurable:true});changed=proof.validateInput(push.target,push.node).ok;delete Object.prototype[name];restored=proof.validateInput(push.target,push.node).ok;}finally{delete Object.prototype[name];}
 assert.equal(changed,false);assert.equal(restored,false,'restoration cannot revive an observed dependency change');
});
