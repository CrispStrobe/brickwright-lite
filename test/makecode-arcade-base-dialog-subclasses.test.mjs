import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {runPxtArcade} from './helpers/pxt-arcade-runtime.mjs';
import {importGuiDependency} from './helpers/bw-integrated.mjs';
import {arcadeToPseudocode} from '../overlay/scratch-gui/src/lib/bw-makecode/arcade-translate.js';
import {projectToArcade} from '../overlay/scratch-gui/src/lib/bw-makecode/export-arcade.js';
import {runProgram,stepFrames,clearStrayTimers} from './helpers/bw-vm.mjs';
const source=`class Card extends game.BaseDialog {
 calls:number
 constructor(frame:Image){super(24,16,frame);this.calls=0}
 drawTextCore(){this.calls+=1;this.image.setPixel(5,6,this.calls+3)}
 tickBase(){super.update()}
}
let frame=img\`1 1 1\nf 3 f\n1 1 1\`
let card=new Card(frame)
let oldImage=card.image
card.update()
let firstCalls=card.calls
let firstPixel=card.image.getPixel(5,6)
card.resize(27,17,frame)
let freshImage=oldImage!==card.image
let frameAlias=card.frame===frame
card.tickBase()
let secondCalls=card.calls
let oldPixel=oldImage.getPixel(5,6)
let finalImage=card.image
let newPixel=finalImage.getPixel(5,6)`;
const expected={firstCalls:1,firstPixel:4,freshImage:true,frameAlias:true,secondCalls:2,oldPixel:4,newPixel:5};
const vars=run=>Object.fromEntries(run.vm.runtime.targets.flatMap(t=>Object.values(t.variables)).map(v=>[v.name.replace(/^Game_/,''),v.value]));
async function native(code,uploads){const run=await runProgram(code,{frames:60,uploads,storage:true});await retainNativeOwner(run);assert.deepEqual(run.errors,[]);assert.deepEqual(run.creator.warnings,[]);const actual=vars(run);for(const[k,v]of Object.entries(expected))assert.equal(actual[k],v,k);return run;}
test('BaseDialog virtual drawing and super update preserve genuine image identity in actual VM and Code',async()=>{
 const imported=arcadeToPseudocode(source);assert.deepEqual(imported.unsupported,[]);const runs=[];
 try{const run=await native(imported.code,imported.costumes);runs.push(run);const code=await native(run.creator.decompile(),imported.costumes);runs.push(code);
 const exported=projectToArcade(code.creator.project,{costumeSvg:(t,c)=>code.creator.assets.get(c.assetId)?.data});assert.deepEqual(exported.unsupported,[]);assert.match(exported.ts,/class Card extends game.BaseDialog/);assert.match(exported.ts,/super\.update\(\)/);
 }finally{for(const run of runs){run.vm.stopAll();run.vm.quit();}clearStrayTimers();}
});
test('BaseDialog constructor and layout override boundaries remain explicit',()=>{
 for(const name of ['resize','drawBorder','clearInterior','drawCursorRow']){
  const imported=arcadeToPseudocode(`class Unsafe extends game.BaseDialog {constructor(){super(24,16)} ${name}(){}} let card=new Unsafe()`);
  assert.ok(imported.unsupported.some(d=>/constructor or layout override/.test(d)),name);
 }
 const before=arcadeToPseudocode('class Before extends game.BaseDialog {before:number=this.cursorCount;constructor(){super(24,16)}} let card=new Before()');
 assert.ok(before.unsupported.some(d=>/selected Arcade SDK instance-field this initializers/.test(d)));
 const imported=arcadeToPseudocode('class Unsafe extends game.SplashDialog {constructor(){super(24,16)} drawTextCore(){}} let card=new Unsafe()');
 assert.ok(imported.unsupported.some(d=>/SplashDialog subclasses/.test(d)));
});

test('BaseDialog serial update waits for authored method pause and Stop cancels cursor work',async()=>{
 const {runTimedArcadeProgram}=await import('./helpers/arcade-timed-native.mjs');
 const {importGuiDependency}=await import('./helpers/bw-integrated.mjs');
 const input=source.replace('this.calls+=1;this.image.setPixel(5,6,this.calls+3)','this.calls+=1;pause(40);this.image.setPixel(5,6,this.calls+3)');
 const imported=arcadeToPseudocode(input);assert.deepEqual(imported.unsupported,[]);
 const run=await runTimedArcadeProgram(imported.code,{milliseconds:20,uploads:imported.costumes,storage:true});
 const dispatch=(await importGuiDependency('scratch-vm/src/dispatch/central-dispatch.js')).default;
 const native=dispatch.services[run.vm.extensionManager._loadedExtensions.get('arcade')]._inst;
 try{
  const card=vars(run).card,image=native._image(native._objectHeap.get(card,'image'));
  assert.equal(native._objectHeap.get(card,'cursorCount'),0,'cursor waits for drawTextCore');
  assert.equal(image.pixels[6*24+5],3,'paused override has not painted');
  await run.clock.advanceTo(40);
  assert.equal(vars(run).firstCalls,1);assert.equal(vars(run).firstPixel,4);
  assert.equal(native._objectHeap.get(card,'cursorCount'),1,'cursor follows completed drawTextCore');
  // The second source call is genuinely waiting at 40, with the new image.
  const second=native._image(native._objectHeap.get(card,'image'));
  assert.equal(second.pixels[6*27+5],3);
  run.vm.stopAll();await run.clock.advanceTo(100);
  assert.equal(second.pixels[6*27+5],3,'cancelled source method has no stale image write');
  assert.equal(native._objectHeap.get(card,'cursorCount'),1,'cancelled update has no cursor continuation');
  assert.deepEqual(run.errors,[]);
 }finally{run.vm.stopAll();run.vm.quit();clearStrayTimers();}
});

function evidence(label,value){if(!process.env.BW_DIALOG_SUBCLASS_EVIDENCE_DIR)return;fs.mkdirSync(process.env.BW_DIALOG_SUBCLASS_EVIDENCE_DIR,{recursive:true});fs.writeFileSync(path.join(process.env.BW_DIALOG_SUBCLASS_EVIDENCE_DIR,label+'.json'),JSON.stringify(value));}
async function retainNativeOwner(run){const dispatch=(await importGuiDependency('scratch-vm/src/dispatch/central-dispatch.js')).default;run.native=dispatch.services[run.vm.extensionManager._loadedExtensions.get('arcade')]._inst;assert.equal(run.native._runtime,run.vm.runtime,'capture actual registered runtime owner before another VM registers');}
async function imageState(run){const native=run.native,out={};assert.equal(native._runtime,run.vm.runtime,'image observer uses actual retained runtime owner');for(const name of ['oldImage','finalImage']){const image=native._image(vars(run)[name]);out[name]={width:image.width,height:image.height,pixels:Array.from(image.pixels)};}return out;}
async function original(label,input){const result=await runPxtArcade(input,{fakeClock:true,inspectImageGlobals:['oldImage','finalImage'],onCompilation:record=>evidence(label+'-compilation',record)});evidence(label+'-result',result);for(const[k,v]of Object.entries(expected))assert.equal(result[k]??result['Game_'+k],v,k);return {oldImage:result.$images.oldImage||result.$images.Game_oldImage,finalImage:result.$images.finalImage||result.$images.Game_finalImage};}
test('BaseDialog derived method image pixels survive original execution, Code, saved projects and export',async()=>{
 const baseline=await original('source',source),imported=arcadeToPseudocode(source);assert.deepEqual(imported.unsupported,[]);const runs=[];
 try{const run=await native(imported.code,imported.costumes);runs.push(run);assert.deepEqual(await imageState(run),baseline);
 const code=await native(run.creator.decompile(),imported.costumes);runs.push(code);assert.deepEqual(await imageState(code),baseline);
 const saved=Buffer.from(await(await run.vm.saveProjectSb3()).arrayBuffer());run.vm.stopAll();await run.vm.loadProject(saved);run.vm.greenFlag();await stepFrames(run.vm,60);assert.deepEqual(run.errors,[]);for(const[k,v]of Object.entries(expected))assert.equal(vars(run)[k],v,k);assert.deepEqual(await imageState(run),baseline);
 const fresh=await runProgram(imported.code,{frames:0,uploads:imported.costumes,storage:true});runs.push(fresh);await retainNativeOwner(fresh);fresh.vm.stopAll();await fresh.vm.loadProject(saved);fresh.vm.greenFlag();await stepFrames(fresh.vm,60);assert.deepEqual(fresh.errors,[]);for(const[k,v]of Object.entries(expected))assert.equal(vars(fresh)[k],v,k);assert.deepEqual(await imageState(fresh),baseline);
 const exported=projectToArcade(code.creator.project,{costumeSvg:(t,c)=>code.creator.assets.get(c.assetId)?.data});assert.deepEqual(exported.unsupported,[]);evidence('export-files',exported.files);assert.deepEqual(await original('export',exported.files),baseline);
 const restored=arcadeToPseudocode(exported.files);assert.deepEqual(restored.unsupported,[]);const reimport=await native(restored.code,restored.costumes);runs.push(reimport);assert.deepEqual(await imageState(reimport),baseline);
 }finally{for(const run of runs){run.vm.stopAll();run.vm.quit();}clearStrayTimers();}
});

test('native BaseDialog declaration guard refuses layout overrides even in authored metadata',async()=>{
 const {createRequire}=await import('node:module');const require=createRequire(import.meta.url);
 const provider=require('../overlay/scratch-vm/src/extensions/crispstrobe/arcade/sdk-dialog-classes.js');
 const values=require('../overlay/scratch-vm/src/util/bw-values.js');const {EventEmitter}=await import('node:events');
 const runtime=new EventEmitter();runtime.threads=[];let def;
 const host=provider.create({_runtime:runtime,_objectHeap:{definition:()=>def}},values);
 try{
  const base=host.heapHooks.definition('__bwSDK_BaseDialog');
  for(const name of ['resize','drawBorder','clearInterior','drawPartial','fastFill','drawCursorRow']){
   def={...base,name:'Authored',parent:base.name,methods:new Map(base.methods)};
   def.methods.set(name,{name,procedure:'authored '+name,parameters:[],returnType:'void',visibility:'public'});
   assert.throws(()=>host.heapHooks.reserve(def),/override is not qualified/,name);
  }
  def={...base,name:'Authored',parent:base.name,methods:new Map(base.methods)};
  def.methods.set('drawTextCore',{name:'drawTextCore',procedure:'authored draw',parameters:[{name:'n',type:'number',optional:false}],returnType:'void',visibility:'public'});
  assert.throws(()=>host.heapHooks.reserve(def),/zero parameters/);
 }finally{host.dispose();}
});
