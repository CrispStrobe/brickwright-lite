import test from 'node:test';
import assert from 'node:assert/strict';
import {writeFileSync} from 'node:fs';
import Creator from '../packages/scratch-gui/src/lib/sb3-creator-register-art.js';
import {arcadeToPseudocode} from '../packages/scratch-gui/src/lib/bw-makecode/arcade-translate.js';
import {projectJsonToArcade} from '../packages/scratch-gui/src/lib/bw-makecode/export-arcade.js';
import {createProjectJsonSnapshot,isProjectJsonSnapshot} from '../packages/scratch-gui/src/lib/bw-makecode/project-json-snapshot.js';
import {createArrayReferenceExportAuthority} from '../packages/scratch-gui/src/lib/bw-makecode/array-reference-export-authority.js';
import {numericAuthoringFiles} from './fixtures/arcade-numeric-authoring-game.mjs';

const clean=value=>{for(const key of ['unsupported','warnings','errors','unparsed'])if(Object.hasOwn(value,key))assert.deepEqual(value[key],[],key);};
const rows=project=>project.targets.flatMap(target=>Object.entries(target.blocks).map(([id,node])=>({target,id,node})));
const literal=(target,node,name)=>{const raw=node.inputs?.[name]?.[1];if(Array.isArray(raw)&&raw[0]===10)return raw[1];const leaf=target.blocks[raw];return leaf?.opcode==='text'?leaf.fields.TEXT[0]:null;};
function checkedCode(creator,project=creator.project){
 const code=creator.decompile(project);assert.equal(typeof code,'string');assert.match(code,/DEVICE ARCADE/);
 assert.doesNotMatch(code,/^\s*# unsupported:/m,'Code feedback cannot silently erase an unsupported block');return code;
}
// Artwork remains associated with the exact serialized project, rather
// than a visible sprite name or an asset ID shared by another fixture.
const projectArtwork=new Map();
function svgProvider(creator){
 const assets=new Map([...creator.assets].filter(([,asset])=>asset.type==='svg'&&typeof asset.data==='string').map(([id,asset])=>[id,asset.data]));
 return (_target,costume)=>assets.get(costume.assetId)??null;
}
function rememberArtwork(creator){projectArtwork.set(JSON.stringify(creator.project),svgProvider(creator));return creator;}
function applyArtwork(creator,costumes){
 for(const costume of costumes||[]){
  assert.equal(typeof costume.sprite,'string');assert.equal(typeof costume.svg,'string');
  const added=costume.mode==='add';
  assert.equal(added?creator.addCustomSVGCostume(costume.sprite,costume.svg,costume.name):creator.applyCustomSVG(costume.sprite,costume.svg),true,'real imported artwork target');
  const target=creator.project.targets.find(t=>!t.isStage&&t.name===costume.sprite);assert.ok(target);
  if(!added&&costume.name)target.costumes[0].name=String(costume.name);
  const installed=added?target.costumes.at(-1):target.costumes[0];
  assert.equal(creator.assets.get(installed.assetId)?.data,costume.svg,'exact imported SVG bytes');
 }
 return creator;
}
function carryArtwork(previous,next){
 const costumes=[];
 for(const target of previous.project.targets.filter(t=>!t.isStage))for(const [index,costume]of target.costumes.entries()){
  const asset=previous.assets.get(costume.assetId);
  assert.ok(asset&&asset.type==='svg'&&typeof asset.data==='string','real previous Creator artwork');
  costumes.push({sprite:target.name,name:costume.name,svg:asset.data,mode:index?'add':'replace'});
 }
 return rememberArtwork(applyArtwork(next,costumes));
}
function imported(files){
 const translated=arcadeToPseudocode(files);clean(translated);
 const creator=new Creator();creator.parse(translated.code);clean(creator);applyArtwork(creator,translated.costumes);
 // The GUI's original export/reimport precedes its final From blocks ->
 // Code -> To blocks feedback. The real export emits local declarations;
 // their actual initializers must return through the public source importer.
 const exported=projectJsonToArcade(JSON.stringify(creator.project),{costumeSvg:svgProvider(creator)});clean(exported);
 assert.ok(exported.files&&typeof exported.files==='object'&&!Array.isArray(exported.files));
 assert.equal(typeof exported.files['main.ts'],'string');assert.ok(exported.files['main.ts'].length);
 for(const value of Object.values(exported.files))assert.equal(typeof value,'string');
 const reimported=arcadeToPseudocode(exported.files);clean(reimported);
 assert.doesNotMatch(reimported.code,/^\s*# unsupported:/m);
 const blocks=new Creator();blocks.parse(reimported.code);clean(blocks);applyArtwork(blocks,reimported.costumes);
 const savedProject=JSON.parse(JSON.stringify(blocks.project));
 const code=new Creator().decompile(savedProject);
 assert.equal(typeof code,'string');assert.match(code,/DEVICE ARCADE/);
 assert.doesNotMatch(code,/^\s*# unsupported:/m);
 const feedback=new Creator();feedback.parse(code);clean(feedback);return carryArtwork(blocks,feedback);
}
const fullFiles=()=>numericAuthoringFiles({maximum:12,operation:'max',message:'PLAY'});
function prefixFiles(prefix){const files=fullFiles();files['main.ts']=prefix+`
bwStringArraySettings.write("bw-owned-numeric-gui", ["Ä", "PLAY"])
let saved = bwStringArraySettings.read("bw-owned-numeric-gui")[1]
let pressed = 0
controller.A.onEvent(ControllerButtonEvent.Pressed, function () { pressed += 1 })
`;return files;}
let failureSerial=0;
const sourceProjects=new Map(),positiveInputs=new Set(),cleanExports=new Set();
function fixture(files=fullFiles()){const key=JSON.stringify(files);if(!sourceProjects.has(key))sourceProjects.set(key,JSON.stringify(imported(files).project));return JSON.parse(sourceProjects.get(key));}
function consumers(project){const found=rows(project).filter(({node})=>['arrays_mutateReference','arrays_referenceItem'].includes(node.opcode));assert.ok(found.some(r=>r.node.opcode==='arrays_mutateReference'));assert.ok(found.some(r=>r.node.opcode==='arrays_referenceItem'));return found;}
function selected(project){const found=consumers(project).filter(({target,node})=>node.opcode==='arrays_mutateReference'&&literal(target,node,'VALUE')==='Ä');assert.equal(found.length,1,'real first Unicode Array push');return found[0];}
function binding(project){const push=selected(project),read=push.target.blocks[push.node.inputs.ARRAY[1]];assert.equal(read?.opcode,'arcade_getLocal');const name=literal(push.target,read,'NAME');assert.equal(typeof name,'string');const stores=rows(project).filter(({target,node})=>target===push.target&&node.opcode==='arcade_setLocal'&&literal(target,node,'NAME')===name);assert.equal(stores.length,2,'actual entry reset and direct fresh overwrite');const reset=stores.find(({target,node})=>target.blocks[node.inputs.VALUE[1]]?.opcode==='arrays_specialValue');const overwrite=stores.find(({target,node})=>target.blocks[node.inputs.VALUE[1]]?.opcode==='arrays_createReference');assert.ok(reset);assert.ok(overwrite);assert.equal(reset.target.blocks[reset.node.inputs.VALUE[1]].fields.KIND[0],'null');return {target:push.target,push,read,name,reset,overwrite};}
function accepted(draft,{exportClean=true}={}){const project=createProjectJsonSnapshot(JSON.stringify(draft));assert.equal(isProjectJsonSnapshot(project),true);binding(project);const proof=createArrayReferenceExportAuthority(project);for(const {target,id,node}of consumers(project)){
 const decision=proof.validateInput(target,node);
 // Optional failure-only source evidence; retain the original evaluated result
 // without another producer query or any graph/asset normalization.
 if(!decision.ok&&process.env.BW_NATIVE_FRAME_FAILURE_DIR){
  try{writeFileSync(`${process.env.BW_NATIVE_FRAME_FAILURE_DIR}/frame-failure-${failureSerial++}.json`,
   JSON.stringify({target:target.name,id,opcode:node.opcode,decision,project},null,2),{flag:'wx',mode:0o600});}
  catch(_){console.warn('Native frame failure capture unavailable');}
 }
 assert.equal(decision.ok,true,node.opcode);
 }const input=JSON.stringify(draft);if(exportClean&&!cleanExports.has(input)){const costumeSvg=projectArtwork.get(input);assert.equal(typeof costumeSvg,'function','artwork bound to this exact project');clean(projectJsonToArcade(input,{costumeSvg}));cleanExports.add(input);}positiveInputs.add(input);return {project,proof,push:selected(project)};}
function refused(edit,files=fullFiles()){const draft=fixture(files);if(!positiveInputs.has(JSON.stringify(draft)))accepted(draft,{exportClean:false});const before=consumers(draft).map(r=>r.id),id=selected(draft).id;edit(draft,binding(draft));const owned=createProjectJsonSnapshot(JSON.stringify(draft));assert.deepEqual(consumers(owned).map(r=>r.id),before,'edits retain original actual Array consumers');const push=selected(owned);assert.equal(push.id,id);assert.equal(createArrayReferenceExportAuthority(owned).validateInput(push.target,push.node).ok,false,'fresh graph preserves reset obligation');return owned;}
function insertBefore(row,newID,node){const {target,id}=row;assert.equal(Object.hasOwn(target.blocks,newID),false);const parents=Object.entries(target.blocks).filter(([,n])=>n.next===id);assert.equal(parents.length,1,'unique sequential predecessor');const [parentID,parent]=parents[0];parent.next=newID;target.blocks[newID]={...node,parent:parentID,next:id,shadow:false,topLevel:false};row.node.parent=newID;}
const sprite='let hero = sprites.create(img`22\n22`, SpriteKind.Player)\nhero.setPosition(40, 60)';
const loop='let count = 0\nwhile (count < 3) { count += 1 }';
const math='let ordered = Math.max(1, 4)\nlet noise = Math.random()\nlet range = Math.randomRange(-3, -3)\nlet never = Math.percentChance(0)\nlet always = Math.percentChance(100)';

test('whole owned numeric source prefix retains actual allocation, Unicode pushes and StringArray storage authority',()=>{
 const draft=fixture(),before=JSON.stringify(draft),{project}=accepted(draft),actual=rows(project),cell=binding(project);
 for(const opcode of ['arcade_setBackgroundColor','arcade_createSprite','arcade_spriteKindValue','arcade_setSpritePosition','arcade_sourceWhile','arrays_valueCompare','arrays_valueBinary','arcade_mathBinary','arcade_randomNumber','arcade_percentChance','arcade_settingsWrite','arcade_settingsRead'])assert.ok(actual.some(r=>r.node.opcode===opcode),opcode);
 const registrations=actual.filter(r=>r.node.opcode==='arcade_registerButtonHandler');assert.equal(registrations.length,1);assert.ok(literal(registrations[0].target,registrations[0].node,'CAPTURES').split(',').map(s=>s.trim()).includes(cell.name),'the candidate really is captured later');
 assert.equal(JSON.stringify(draft),before,'proof and export do not rewrite source');
});

test('each audited prefix and their composition keep an independent entry reset separated from allocation',()=>{
 for(const prefix of ['scene.setBackgroundColor(15)',sprite,loop,math,['scene.setBackgroundColor(15)',sprite,loop,math].join('\n')]){
  const draft=fixture(prefixFiles(prefix)),cell=binding(draft);assert.notEqual(cell.reset.node.next,cell.overwrite.id,'not an adjacent-overwrite control');accepted(draft);
 }
});

test('alpha-renamed source bindings and genuine Code decompile/reparse keep the complete proof',()=>{
 const files=fullFiles();files['main.ts']=files['main.ts'].replace(/\bhero\b/g,'actor').replace(/\bcount\b/g,'ticks').replace(/\bpressed\b/g,'presses');const creator=imported(files);accepted(creator.project);
 const again=new Creator();again.parse(checkedCode(creator));clean(again);carryArtwork(creator,again);accepted(again.project);
});

test('a later capture is allowed, but the same genuine registration moved before overwrite is not',()=>{
 refused((project,cell)=>{const reg=rows(project).find(r=>r.node.opcode==='arcade_registerButtonHandler');assert.ok(reg);assert.ok(literal(reg.target,reg.node,'CAPTURES').includes(cell.name));const oldParent=reg.target.blocks[reg.node.parent];assert.equal(oldParent.next,reg.id);oldParent.next=reg.node.next;if(reg.node.next)reg.target.blocks[reg.node.next].parent=reg.node.parent;const original={...reg.node};delete reg.target.blocks[reg.id];insertBefore(cell.overwrite,reg.id,original);});
});

test('independently runnable entries and matching created callbacks cannot borrow fresh-frame privacy',()=>{
 refused((_project,cell)=>{cell.target.blocks.__independent={opcode:'event_whenflagclicked',next:null,parent:null,inputs:{},fields:{},shadow:false,topLevel:true,x:0,y:0};});
 const files=fullFiles();files['main.ts']+='\nsprites.onCreated(SpriteKind.Player, function (spawned) { info.setScore(7) })\n';
 const draft=fixture(files);assert.ok(rows(draft).some(r=>r.node.opcode==='arcade_registerSpriteCreated'||r.node.opcode==='arcade_whenSpriteCreated'||r.node.opcode==='arcade_whenRegisteredCreated'),'real source-created callback exists');
 // Move its real registration before the candidate overwrite when source
 // translation represents this callback as a later registered handler.
 const cell=binding(draft),reg=rows(draft).find(r=>r.node.opcode==='arcade_registerSpriteCreated');
 if(reg){const parent=reg.target.blocks[reg.node.parent];assert.equal(parent.next,reg.id);parent.next=reg.node.next;if(reg.node.next)reg.target.blocks[reg.node.next].parent=reg.node.parent;const original={...reg.node};delete reg.target.blocks[reg.id];insertBefore(cell.overwrite,reg.id,original);}
 const owned=createProjectJsonSnapshot(JSON.stringify(draft)),push=selected(owned);assert.equal(createArrayReferenceExportAuthority(owned).validateInput(push.target,push.node).ok,false);
});

test('candidate reads and alias publication before overwrite retain their real reset writer',()=>{
 for(const opcode of ['arcade_setLocal','data_setvariableto'])refused((_p,cell)=>{
  const readID='__prefixRead';cell.overwrite.target.blocks[readID]={...structuredClone(cell.read),parent:'__prefixLeak',next:null};
  const node=opcode==='arcade_setLocal'?{opcode,inputs:{NAME:[1,[10,'leaked']],VALUE:[3,readID,[4,'0']]},fields:{}}:{opcode,inputs:{VALUE:[3,readID,[4,'0']]},fields:{VARIABLE:['hero',Object.values(cell.target.blocks).find(n=>n.opcode==='data_setvariableto'&&n.fields.VARIABLE?.[0]==='hero').fields.VARIABLE[1]]}};
  if(opcode==='data_setvariableto')assert.equal(typeof node.fields.VARIABLE[1],'string');insertBefore(cell.overwrite,'__prefixLeak',node);
 });
 refused((_p,cell)=>{cell.target.blocks.__selfRead={...structuredClone(cell.read),parent:cell.overwrite.id,next:null};cell.overwrite.node.inputs.VALUE=[3,'__selfRead',[4,'0']];});
});

test('operand schema, actual producer and native menu obligations are not replaced by opcode names',()=>{
 for(const edit of [
  project=>{const r=rows(project).find(r=>r.node.opcode==='arcade_setBackgroundColor');r.target.blocks.__badColour={...structuredClone(binding(project).read),parent:r.id,next:null};r.node.inputs.COLOR=[3,'__badColour',[4,'0']];},
  project=>{const r=rows(project).find(r=>r.node.opcode==='arcade_setSpritePosition');r.target.blocks.__badPosition={...structuredClone(binding(project).read),parent:r.id,next:null};r.node.inputs.X=[3,'__badPosition',[4,'0']];},
  project=>{const r=rows(project).find(r=>r.node.opcode==='arcade_mathBinary');r.node.fields.OP[0]='unknown';},
  project=>{const r=rows(project).find(r=>r.node.opcode==='arcade_percentChance');r.node.inputs.EXTRA=[1,[4,'0']];},
  project=>{const r=rows(project).find(r=>r.node.opcode==='arcade_randomNumber');r.node.inputs.VALUE=[1,[4,'0']];}
 ])refused(edit);
});

test('loop bodies cannot read the reset, register its capture or invent a dominating overwrite',()=>{
 refused((project,cell)=>{const body=rows(project).find(r=>r.node.opcode==='arcade_sourceWhile');const assignment=body.target.blocks[body.node.inputs.SUBSTACK[1]];const assignmentID=body.node.inputs.SUBSTACK[1];body.target.blocks.__loopRead={...structuredClone(cell.read),parent:assignmentID,next:null};assignment.inputs.VALUE=[3,'__loopRead',[4,'0']];});
 refused((project,cell)=>{const loop=rows(project).find(r=>r.node.opcode==='arcade_sourceWhile');const before=cell.target.blocks[cell.overwrite.node.parent];assert.equal(before.next,cell.overwrite.id);before.next=cell.overwrite.node.next;cell.target.blocks[cell.overwrite.node.next].parent=cell.overwrite.node.parent;const body=cell.target.blocks[loop.node.inputs.SUBSTACK[1]];assert.equal(body.next,null);body.next=cell.overwrite.id;cell.overwrite.node.parent=loop.node.inputs.SUBSTACK[1];cell.overwrite.node.next=null;});
});

test('all writers, exact allocation and ordinary caller identity remain independent obligations',()=>{
 refused((_p,cell)=>{const allocation=cell.target.blocks[cell.overwrite.node.inputs.VALUE[1]];allocation.inputs.VALUES=[1,[10,'0']];});
 refused((_p,cell)=>{
  const original=cell.target.blocks[cell.reset.node.inputs.VALUE[1]];assert.ok(original);
  cell.target.blocks.__secondNullValue={...structuredClone(original),parent:'__secondNull',next:null};
  insertBefore(cell.push,'__secondNull',{opcode:'arcade_setLocal',inputs:{NAME:[1,[10,cell.name]],VALUE:[3,'__secondNullValue',[4,'0']]},fields:{}});
 });
 refused(project=>{const prototype=rows(project).find(r=>r.node.opcode==='procedures_prototype');assert.ok(prototype);
  prototype.target.blocks.__foreignPrototype={...structuredClone(prototype.node),parent:null,
   mutation:{...structuredClone(prototype.node.mutation),proccode:'foreignUncalled'}};
 });
 refused(project=>{const prototype=rows(project).find(r=>r.node.opcode==='procedures_prototype');assert.ok(prototype);prototype.node.shadow=false;});
 refused(project=>{const call=rows(project).find(r=>r.node.opcode==='procedures_call');assert.ok(call);call.node.mutation.proccode='foreign';});
 refused(project=>{const root=rows(project).find(r=>r.node.opcode==='arcade_whenSourceStarts');root.node.opcode='event_whenflagclicked';});
});

test('owned snapshot freezes physical source and each fresh edited input gets a fresh decision',()=>{
 const draft=fixture(),{project,proof,push}=accepted(draft);const source=rows(project).find(r=>r.node.opcode==='arcade_setBackgroundColor');
 assert.equal(Object.isFrozen(project),true);assert.equal(Object.isFrozen(source.node.inputs.COLOR),true);
 assert.throws(()=>{source.node.inputs.COLOR[1]=[10,'unknown'];},TypeError);
 assert.equal(proof.validateInput(push.target,push.node).ok,true,'failed frozen write is not an actual source mutation');
 const edited=structuredClone(draft),actual=rows(edited).find(r=>r.node.opcode==='arcade_mathBinary');actual.node.fields.OP[0]='unknown';
 const next=createProjectJsonSnapshot(JSON.stringify(edited)),consumer=selected(next);assert.equal(createArrayReferenceExportAuthority(next).validateInput(consumer.target,consumer.node).ok,false);
 assert.equal(proof.validateInput(push.target,push.node).ok,true,'another export cannot poison the prior owned graph');
});

test('prototype changes and raw caller objects cannot manufacture native frame authority',()=>{
 const draft=fixture(),raw=selected(draft);assert.equal(isProjectJsonSnapshot(draft),false);assert.equal(createArrayReferenceExportAuthority(draft).validateInput(raw.target,raw.node).ok,false);
 const {proof,push}=accepted(draft);const name='__bwNativeFramePrototypeControl';assert.equal(Object.hasOwn(Object.prototype,name),false);let changed,restored;
 try{Object.defineProperty(Object.prototype,name,{value:1,configurable:true});changed=proof.validateInput(push.target,push.node).ok;delete Object.prototype[name];restored=proof.validateInput(push.target,push.node).ok;}finally{delete Object.prototype[name];}
 assert.equal(changed,false);assert.equal(restored,false);
 const next=accepted(draft),descriptor=Object.getOwnPropertyDescriptor(Array.prototype,'every');let forged,again;
 try{Object.defineProperty(Array.prototype,'every',{...descriptor,value:()=>true});
  forged=next.proof.validateInput(next.push.target,next.push.node).ok;
 }finally{Object.defineProperty(Array.prototype,'every',descriptor);}
 again=next.proof.validateInput(next.push.target,next.push.node).ok;
 assert.equal(forged,false,'a replaced collection predicate cannot verify its own prototype');
 assert.equal(again,false,'restoration cannot revive an observed intrinsic failure');
});
