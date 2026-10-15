import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import {arcadeToPseudocode} from '../overlay/scratch-gui/src/lib/bw-makecode/arcade-translate.js';
import {projectToArcade} from '../overlay/scratch-gui/src/lib/bw-makecode/export-arcade.js';
import {SB3Creator} from './helpers/bw-vm.mjs';
import {source} from './fixtures/arcade/sdk-image-class-callables.mjs';
const Creator=process.env.SB3_CREATOR_DIR?(await import(pathToFileURL(path.join(process.env.SB3_CREATOR_DIR,'src/utils/sb3Creator.js')).href)).default:SB3Creator;
const options={classCallablePrototype:true,sdkImagePrototype:true};
const fixture=()=>{const translated=arcadeToPseudocode(source,{sdkImagePrototype:true});assert.deepEqual(translated.unsupported,[]);const creator=new Creator();creator.parse(translated.code);return structuredClone(creator.project);};
const rows=project=>project.targets.flatMap(target=>Object.entries(target.blocks).map(([id,block])=>({id,block,target})));
const text=(target,block,name)=>{const slot=block.inputs[name][1];return Array.isArray(slot)?slot:target.blocks[slot].fields.TEXT;};
const refusal=project=>{const out=projectToArcade(project,options);assert.ok(out.unsupported.length,'edited project must refuse');return out;};
test('current export Image domains come from safe connected numeric factories and clones',()=>{
 const baseline=fixture();assert.deepEqual(projectToArcade(baseline,options).unsupported,[]);
 assert.ok(projectToArcade(baseline,{classCallablePrototype:true}).unsupported.length,'the older class prototype alone grants no SDK domain');
 assert.deepEqual(projectToArcade(baseline).unsupported,[],'default admission requires the completed current SDK graph');
 for(const value of ['-1','2001','NaN','Infinity']){const project=fixture(),factory=rows(project).find(row=>row.block.opcode==='arcade_createImage');factory.block.inputs.WIDTH=[1,[4,value]];refusal(project);}
 for(const mutation of ['text','foreignParent','missing','computed']){
  const project=fixture(),factory=rows(project).find(row=>row.block.opcode==='arcade_createImage');
  if(mutation==='text')factory.block.inputs.WIDTH=[1,[10,'2']];
  if(mutation==='foreignParent')factory.block.parent='missing';
  if(mutation==='missing')delete factory.block.inputs.HEIGHT;
  if(mutation==='computed')factory.block.inputs.WIDTH=[3,[12,'width',Object.entries(project.targets.find(target=>target.isStage).variables).find(([,row])=>row[0]==='width')[0]],[4,'2']];
  refusal(project);
 }
 const zero=fixture();rows(zero).find(row=>row.block.opcode==='arcade_createImage').block.inputs.WIDTH=[1,[4,'0']];assert.deepEqual(projectToArcade(zero,options).unsupported,[]);
});
test('current export validates SDK field, constructor and method roles against the exact plan',()=>{
 for(const mutation of ['field','ctor','method','callback','forgedCtor']){
  const project=fixture(),entry=rows(project).find(row=>row.block.opcode==='arcade_declareClass'&&text(row.target,row.block,'NAME')[1]===(mutation==='callback'?'Holder':'Picture'));
  const input=mutation==='field'||mutation==='callback'?'FIELDS':mutation==='method'?'METHODS':'PARAMETERS',literal=text(entry.target,entry.block,input),metadata=JSON.parse(literal[1]);
  if(mutation==='field'){delete metadata[0].sdkType;delete metadata[0].valueKind;}
  if(mutation==='ctor')delete metadata[0].sdkType;
  if(mutation==='forgedCtor')metadata[0].sdkType={kind:'sdk',name:'Image',extra:1};
  if(mutation==='callback')metadata[0].callableSignature.result={kind:'named',name:'number'};
  if(mutation==='method')metadata[0].callableSignature.parameters[0].type.parameters[0].type={kind:'named',name:'number'};
  literal[1]=JSON.stringify(metadata);refusal(project);
 }
});
test('current Image globals cannot borrow later initialization or hide incompatible writers and results',()=>{
 for(const mutation of ['lateWrongWriter','foreignWriter','earlyRead','signatureOnlyResult']){
  const project=fixture(),all=rows(project),imageWriter=all.find(row=>row.block.opcode==='data_setvariableto'&&row.block.fields.VARIABLE[0]==='imageValue');
  if(mutation==='signatureOnlyResult'){
   const clone=all.find(row=>row.block.opcode==='arcade_cloneImage');clone.block.opcode='text';clone.block.inputs={};clone.block.fields={TEXT:['not an Image',null]};clone.block.shadow=true;
  }else if(mutation==='earlyRead'){
   const blocks=imageWriter.target.blocks,previous=blocks[imageWriter.block.parent],following=blocks[imageWriter.block.next],firstCtor=all.find(row=>row.target===imageWriter.target&&row.block.opcode==='arcade_setLocal'&&blocks[row.block.inputs.VALUE?.[1]]?.opcode==='arcade_createObject');
   previous.next=imageWriter.block.next;following.parent=imageWriter.block.parent;
   imageWriter.block.next=firstCtor.block.next;if(blocks[firstCtor.block.next])blocks[firstCtor.block.next].parent=imageWriter.id;
   imageWriter.block.parent=firstCtor.id;firstCtor.block.next=imageWriter.id;
  }else{
   const target=mutation==='foreignWriter'?project.targets.find(target=>target.isStage):imageWriter.target;
   target.blocks.extraWrong={opcode:'data_setvariableto',parent:null,next:null,topLevel:true,shadow:false,inputs:{VALUE:[1,[4,'20']]},fields:{VARIABLE:structuredClone(imageWriter.block.fields.VARIABLE)}};
  }
  refusal(project);
 }
});

test('ordinary nominal Image classes do not become SDK Image signatures during export',()=>{
 const nominal='class Image{value:number;constructor(value:number){this.value=value}}class Holder{read:(picture:Image)=>number;constructor(){this.read=(picture:Image)=>{return picture.value}}}let picture=new Image(5);let holder=new Holder();let n=holder.read(picture);';
 const translated=arcadeToPseudocode(nominal,{sdkImagePrototype:true});assert.deepEqual(translated.unsupported,[]);
 const creator=new Creator();creator.parse(translated.code);const exported=projectToArcade(creator.project,options);assert.deepEqual(exported.unsupported,[]);assert.match(exported.ts,/class Image/);assert.match(exported.ts,/new Image\(/);assert.doesNotMatch(exported.ts,/image\.create\(/);assert.deepEqual(arcadeToPseudocode(exported.files,{sdkImagePrototype:true}).unsupported,[]);
});
