import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {arcadeToPseudocode} from '../overlay/scratch-gui/src/lib/bw-makecode/arcade-translate.js';
import {projectToArcade} from '../overlay/scratch-gui/src/lib/bw-makecode/export-arcade.js';
import {parseMakeCodeTs} from '../overlay/scratch-gui/src/lib/bw-makecode/ts-import.js';
import {selectClassCallableSourceProof} from '../overlay/scratch-gui/src/lib/bw-makecode/class-callable-source-gate.js';
import {classSdkImageRoles} from '../overlay/scratch-gui/src/lib/bw-makecode/class-callable-source-flow.js';
import {runArcadeSourceCode} from './helpers/arcade-source-program.mjs';
import {SB3Creator,stepFrames,clearStrayTimers} from './helpers/bw-vm.mjs';
import {source} from './fixtures/arcade/sdk-image-class-callables.mjs';
const originalSource="let imageProofCalls:number=0;class ImageProofBox{value:Image;constructor(value:Image){this.value=value}apply<T>(action:(value:Image)=>T):T{return action(this.value)}}class ImageProofHolder{read:()=>Image;constructor(box:ImageProofBox){this.read=()=>{imageProofCalls+=1;return box.value.clone()}}}let imageProofInput=image.create(2,2);let imageProofBox=new ImageProofBox(imageProofInput);let imageProofHolder=new ImageProofHolder(imageProofBox);let imageProofCopied=imageProofBox.apply((input:Image)=>{imageProofCalls+=1;return input.clone()});let imageProofCaptured=imageProofHolder.read();let imageProofWidth:number=imageProofCopied.width;let imageProofHeight:number=imageProofCaptured.height;let imageProofSame:boolean=imageProofBox.value===imageProofInput;let imageProofDifferent:boolean=imageProofCopied!==imageProofInput;let imageProofZero=image.create(0,0);let imageProofZeroBox=new ImageProofBox(imageProofZero);let imageProofZeroClone=imageProofZeroBox.apply((input:Image)=>{imageProofCalls+=1;return input.clone()});let imageProofZeroWidth:number=imageProofZeroClone.width;let imageProofZeroHeight:number=imageProofZeroClone.height;let imageProofZeroDistinct:boolean=imageProofZeroClone!==imageProofZero;let imageProofCheck:number=0;if(imageProofSame){imageProofCheck+=1}if(imageProofDifferent){imageProofCheck+=2}if(imageProofZeroDistinct){imageProofCheck+=4}let imageProofScore:number=imageProofWidth+imageProofHeight+imageProofZeroWidth+imageProofZeroHeight+imageProofCheck+imageProofCalls;info.setScore(imageProofScore);";
const hash=value=>createHash('sha256').update(value).digest('hex');
const parse=value=>parseMakeCodeTs(value,{retainCallableMetadata:true,retainParentheses:true});
const fixture=(value=source)=>{const imported=arcadeToPseudocode(value);assert.deepEqual(imported.unsupported,[]);const creator=new SB3Creator();creator.parse(imported.code);return creator.project;};
const rows=project=>project.targets.flatMap(target=>Object.entries(target.blocks).map(([id,block])=>({id,block,target})));
const literal=(row,name)=>{const slot=row.block.inputs[name][1];return Array.isArray(slot)?slot:row.target.blocks[slot].fields.TEXT;};
test('default SDK selection retains the completed actual proof identity and keeps nominal Image distinct',()=>{
 const program=parse(source),selected=selectClassCallableSourceProof(program);assert.equal(selected.proof.eligible,true);assert.equal(selected.sdkImageEnabled,true);
 assert.ok(classSdkImageRoles(selected.proof,program,program.body.find(node=>node.type==='Class')));
 assert.throws(()=>classSdkImageRoles({...selected.proof},program,program.body.find(node=>node.type==='Class')),/actual unchanged source proof/);
 const nominal='class Image{value:number;constructor(value:number){this.value=value}}class Holder{read:(picture:Image)=>number;constructor(){this.read=(picture:Image)=>{return picture.value}}}let picture=new Image(5);let holder=new Holder();let n=holder.read(picture);';
 const other=selectClassCallableSourceProof(parse(nominal));assert.equal(other.proof.eligible,true);assert.equal(other.sdkImageEnabled,false);assert.deepEqual(arcadeToPseudocode(nominal).unsupported,[]);
});
test('default Image selection refuses annotations, opaque or deferred producers, lexical shadows and adjacent bodies',()=>{
 for(const value of ['20 as Image','unknown as Image','image.create(-1,2)','image.create(2001,2)','image.create(width,2)','img`1`','screen','sprites.create(img`1`,SpriteKind.Player).image']){
  const input=source.replace('image.create(2,2)',value);assert.ok(arcadeToPseudocode(input).unsupported.length,value);assert.ok(arcadeToPseudocode(input,{sdkImagePrototype:true}).unsupported.length,value+' explicit option');
 }
 for(const input of [
  'let image:any;'+source,
  source.replace('let imageValue=image.create(2,2);','let imageValue:Image;let early=imageValue;imageValue=image.create(2,2);'),
  source.replace('let copied=picture.apply','imageValue=20 as any;let copied=picture.apply'),
  source.replace('constructor(picture:Image)','constructor<Image>(picture:Image)'),
  source+'function neighbor(){return unknown}',
  source.replace('constructor(picture:Image)','constructor(picture:Image,unused:Image)').replace('new Picture(imageValue)','new Picture(imageValue,20 as Image)')
 ])assert.ok(arcadeToPseudocode(input).unsupported.length,input);
});
test('default current export cannot acquire Image authority from edited metadata, unused roles or disconnected writers',()=>{
 assert.deepEqual(projectToArcade(fixture()).unsupported,[]);
 assert.ok(projectToArcade(fixture(),{classCallablePrototype:true}).unsupported.length,'older explicit class vocabulary grants no SDK domain');
 for(const change of [
  p=>{const f=rows(p).find(row=>row.block.opcode==='arcade_createImage');f.block.inputs.WIDTH=[1,[10,'2']];},
  p=>{const f=rows(p).find(row=>row.block.opcode==='arcade_createImage');f.block.parent='foreign';},
  p=>{const f=rows(p).find(row=>row.block.opcode==='arcade_cloneImage');f.block.opcode='text';f.block.inputs={};f.block.fields={TEXT:['opaque',null]};},
  p=>{const f=rows(p).find(row=>row.block.opcode==='arcade_declareClass'&&literal(row,'NAME')[1]==='Picture');const value=literal(f,'PARAMETERS'),parameters=JSON.parse(value[1]);delete parameters[0].sdkType;value[1]=JSON.stringify(parameters);},
  p=>{const f=rows(p).find(row=>row.block.opcode==='arcade_declareCallable');literal(f,'METADATA')[1]='{}';},
  p=>{const f=rows(p).find(row=>row.block.opcode==='data_setvariableto'&&row.block.fields.VARIABLE[0]==='imageValue');f.target.blocks.wrong={opcode:'data_setvariableto',parent:null,next:null,topLevel:true,shadow:false,inputs:{VALUE:[1,[4,'20']]},fields:{VARIABLE:structuredClone(f.block.fields.VARIABLE)}};},
  p=>{const f=rows(p).find(row=>row.block.opcode==='data_setvariableto'&&row.block.fields.VARIABLE[0]==='imageValue');f.block.next=f.id;}
 ]){const project=fixture();change(project);assert.ok(projectToArcade(project).unsupported.length);}
 const unused=fixture(source.replace('constructor(picture:Image)','constructor(picture:Image,unused:Image)').replace('new Picture(imageValue)','new Picture(imageValue,imageValue)'));
 const ctor=rows(unused).find(row=>row.block.opcode==='arcade_declareClass'&&literal(row,'NAME')[1]==='Picture'),value=literal(ctor,'PARAMETERS'),parameters=JSON.parse(value[1]);delete parameters[1].sdkType;value[1]=JSON.stringify(parameters);assert.ok(projectToArcade(unused).unsupported.length);
});
test('default Image routes preserve current bodies and exact qualified original inputs without SDK replay',async()=>{
 assert.equal(hash(originalSource),'823bcee5ef0d4ec5d589820cc9939d53a956c4786c5f34410b3c9790e9b28d0d');
 const expected={imageProofWidth:2,imageProofHeight:2,imageProofSame:true,imageProofDifferent:true,imageProofZeroWidth:0,imageProofZeroHeight:0,imageProofZeroDistinct:true,imageProofCheck:7,imageProofCalls:3,imageProofScore:14};
 const observe=run=>{assert.deepEqual(run.errors,[]);assert.deepEqual(run.creator.warnings,[]);const variables=run.vm.runtime.targets.flatMap(target=>Object.values(target.variables));return Object.fromEntries(Object.keys(expected).map(name=>[name,variables.find(variable=>variable.name===name)?.value]));};
 const runs=[];try{
  const imported=arcadeToPseudocode(originalSource);assert.deepEqual(imported.unsupported,[]);const first=await runArcadeSourceCode(imported.code,{frames:72});runs.push(first);assert.deepEqual(observe(first),expected);
  const project=JSON.parse(first.vm.toJSON()),code=await runArcadeSourceCode(first.creator.decompile(project),{frames:72});runs.push(code);assert.deepEqual(observe(code),expected);
  const factory=rows(project).find(row=>row.block.opcode==='arcade_createImage'&&row.block.inputs.WIDTH?.[1]?.[1]==='2');assert.ok(factory);factory.block.inputs.WIDTH[1][1]='3';
  const edited=await runArcadeSourceCode(first.creator.decompile(project),{frames:72});runs.push(edited);const wanted={...expected,imageProofWidth:3,imageProofScore:15};assert.deepEqual(observe(edited),wanted);
  const saved=Buffer.from(await(await edited.vm.saveProjectSb3()).arrayBuffer());edited.vm.stopAll();await edited.vm.loadProject(saved);edited.vm.runtime.bwArcadeFrameAuthority='manual';edited.vm.greenFlag();await stepFrames(edited.vm,72,20);assert.deepEqual(observe(edited),wanted);
  const fresh=await runArcadeSourceCode('SPRITE Placeholder:\nWHEN flag clicked:\n  hide',{frames:0});runs.push(fresh);fresh.vm.stopAll();await fresh.vm.loadProject(saved);fresh.vm.runtime.bwArcadeFrameAuthority='manual';fresh.vm.greenFlag();await stepFrames(fresh.vm,72,20);assert.deepEqual(observe(fresh),wanted);
  const exported=projectToArcade(JSON.parse(edited.vm.toJSON()));assert.deepEqual(exported.unsupported,[]);assert.deepEqual(exported.warnings,[]);assert.equal(hash(exported.files['main.ts']),'d6933a2228cb26058a8017f78179a77592e842c8e16e2a0aa0327286d7357e50');assert.equal(hash(exported.files['pxt.json']),'163d7ba270795fb339f3a12133cd8a08b876ea7af807b622382654cd7f8da52c');
  const importedAgain=arcadeToPseudocode(exported.files);assert.deepEqual(importedAgain.unsupported,[]);const again=await runArcadeSourceCode(importedAgain.code,{frames:80});runs.push(again);assert.deepEqual(observe(again),wanted);
 }finally{for(const run of runs){run.vm.stopAll();run.vm.quit();}clearStrayTimers();}
});
