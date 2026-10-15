import test from 'node:test';
import assert from 'node:assert/strict';
import {arcadeToPseudocode} from '../overlay/scratch-gui/src/lib/bw-makecode/arcade-translate.js';
import {runProgram,stepFrames,clearStrayTimers} from './helpers/bw-vm.mjs';
import {restartTimedArcadeRun} from './helpers/arcade-timed-native.mjs';
import {importGuiDependency} from './helpers/bw-integrated.mjs';
const dispatch=(await importGuiDependency('scratch-vm/src/dispatch/central-dispatch.js')).default;
const values=(await importGuiDependency('scratch-vm/src/util/bw-values.js')).default;
const owners=new WeakMap();
const variables=run=>Object.fromEntries(run.vm.runtime.targets.flatMap(target=>Object.values(target.variables)).map(v=>[v.name.replace(/^Game_/,''),v.value]));
const actual=run=>{const ext=owners.get(run.vm);assert.equal(ext?._runtime,run.vm.runtime);return ext;};
async function fixture(source,{kindText=false,invalidImage=false,timed=false,computedTemplate=false}={}) {
 const imported=arcadeToPseudocode(source);assert.deepEqual(imported.unsupported,[]);
 const run=await runProgram(imported.code,{frames:0,retainExtensionTimers:true,frameAuthority:timed?'timed':'manual'});
 try {
  const service=run.vm.extensionManager._loadedExtensions.get('arcade'),extension=dispatch.services[service]?._inst;
  assert.equal(extension?._runtime,run.vm.runtime);owners.set(run.vm,extension);
  run.vm.stopAll();let edited=0;
  for(const target of run.creator.project.targets)for(const block of Object.values(target.blocks))if(block.opcode==='arcade_createImageSprite') {
   if(computedTemplate){const id='ownedComputedTemplate_'+edited,shadow=block.inputs.TEMPLATE[1];target.blocks[id]={opcode:'operator_join',next:null,parent:Object.keys(target.blocks).find(key=>target.blocks[key]===block),inputs:{STRING1:[1,shadow],STRING2:[1,[10,'']]},fields:{},shadow:false,topLevel:false};block.inputs.TEMPLATE=[3,id,shadow];}
   block.opcode='arcade_createOwnedImageSprite';block.inputs.KIND=[1,[kindText?10:4,'0']];if(invalidImage)block.inputs.IMAGE=[1,[10,'']];edited++;
  }
  assert.ok(edited>0);assert.deepEqual(run.creator.warnings,[]);
  await run.vm.loadProject(Buffer.from(await(await run.creator.generateSB3()).arrayBuffer()));
  run.errors.length=0;run.vm.greenFlag();return run;
 }catch(error){run.vm.stopAll();run.vm.quit();clearStrayTimers();throw error;}
}
const stop=run=>{run.vm.stopAll();run.vm.quit();clearStrayTimers();};

test('registered owned Sprite factory preserves actual Image aliases, cached heap dispatch and saved Blocks',async()=>{
 const run=await fixture('let picture=image.create(2,2);let actor=sprites.create(picture,0);let second=sprites.create(picture,0);let cloned=picture.clone();let twin=sprites.create(cloned,0);');
 try {
  await stepFrames(run.vm,8);assert.deepEqual(run.errors,[]);
  const e=actual(run),v=variables(run),body=e._image(v.picture),actor=e._objectHeap.inspect(v.actor);
  assert.equal(actor.className,'__bwOwnedSDKSprite');assert.equal(v.actor.bwReference.kind,'object');
  const raw=e._state().sprites,physical=Object.values(raw).find(s=>s.image===body);
  assert.ok(physical);assert.equal(Object.values(raw).filter(s=>s.image===body).length,2);
  assert.equal(Object.values(raw).filter(s=>s.image===e._image(v.cloned)).length,1);
  e.setImagePixel({IMAGE:v.picture,X:0,Y:0,COLOR:7});
  for(const sprite of Object.values(raw).filter(s=>s.image===body))assert.equal(sprite.image.pixels[0],7);
  assert.equal(e._image(v.cloned).pixels[0],0);
  e._objectHeap.set(v.actor,'x',20);e._objectHeap.set(v.actor,'y',30);
  assert.equal(e._objectHeap.get(v.actor,'x'),20);assert.equal(e._objectHeap.get(v.actor,'y'),30);
  assert.equal(e._objectHeap.get(v.actor,'width'),2);assert.equal(e._objectHeap.get(v.actor,'height'),2);
  await e.callObjectMethod({OBJECT:v.actor,METHOD:'setPosition',ARGS:JSON.stringify([40,50])});
  assert.equal(e._objectHeap.get(v.actor,'x'),40);assert.equal(e._objectHeap.get(v.actor,'y'),50);
  assert.throws(()=>e._objectHeap.set(v.actor,'width',3),/readonly/);
  const forged={bwReference:{...v.actor.bwReference,extra:1}};
  assert.throws(()=>e._objectHeap.get(forged,'x'),/issued object reference/);
  assert.throws(()=>e._objectHeap.hold(forged),/issued object reference/);
  assert.equal(e._objectHeap.inspect(physical.id).className,'Sprite','legacy raw handles retain their separate existing class domain');
  const saved=Buffer.from(await(await run.vm.saveProjectSb3()).arrayBuffer());
  run.vm.stopAll();assert.throws(()=>e._objectHeap.get(v.actor,'x'),/not issued|inactive/);
  await run.vm.loadProject(saved);run.vm.greenFlag();await stepFrames(run.vm,8);
  const fresh=variables(run);assert.equal(e._objectHeap.inspect(fresh.actor).className,'__bwOwnedSDKSprite');
  assert.notEqual(fresh.actor,v.actor);assert.throws(()=>e._objectHeap.get(v.actor,'x'),/stale|issued/);
  assert.deepEqual(run.errors,[]);
 } finally {stop(run);}
});
test('actual physical Number kind is accepted while identical text and missing Image never allocate',async()=>{
 const text=await fixture('let picture=image.create(1,1);let actor=sprites.create(picture,0);',{kindText:true});
 try {await stepFrames(text.vm,4);assert.ok(text.errors.some(error=>/actual template String and Number kind/.test(error)));assert.equal(Object.keys(actual(text)._state().sprites).length,0);}
 finally {stop(text);}
 const empty=await fixture('let picture=image.create(0,0);let actor=sprites.create(picture,0);');
 try {await stepFrames(empty.vm,4);const e=actual(empty),v=variables(empty);assert.equal(e._objectHeap.get(v.actor,'width'),0);assert.equal(e._objectHeap.get(v.actor,'height'),0);assert.deepEqual(empty.errors,[]);}
 finally {stop(empty);}
 const missing=await fixture('let picture=image.create(1,1);let actor=sprites.create(picture,0);',{invalidImage:true});
 try {await stepFrames(missing.vm,4);assert.ok(missing.errors.some(error=>/owned Image reference/.test(error)));assert.equal(Object.keys(actual(missing)._state().sprites).length,0);}
 finally {stop(missing);}
});
test('owned factory waits for actual created handlers and Stop cancels pending issuance',async()=>{
 const run=await fixture('let seen=0;let finished=0;sprites.onCreated(0,function(sprite){seen++;pause(40);seen++});let picture=image.create(1,1);let actor=sprites.create(picture,0);finished=1;',{timed:true});
 try {
  const clock=await restartTimedArcadeRun(run,0);const e=actual(run);assert.equal(variables(run).seen,1);
  assert.notEqual(variables(run).finished,1);assert.equal(e._creationWaits.size,1);
  await clock.advanceTo(39);assert.notEqual(variables(run).finished,1);
  await clock.advanceTo(80);assert.equal(variables(run).seen,2);assert.equal(variables(run).finished,1);
  assert.equal(e._objectHeap.inspect(variables(run).actor).className,'__bwOwnedSDKSprite');
  const again=await restartTimedArcadeRun(run,0);const physical=Object.values(e._state().sprites)[0];
  assert.equal(e._creationWaits.size,1);run.vm.stopAll();await again.advanceTo(100);
  assert.equal(e._creationWaits.size,0);assert.notEqual(variables(run).finished,1);
  assert.equal(e._spriteValues.get(physical.id),physical,'cancellation must not invent physical rollback');
  assert.deepEqual(run.errors,[]);
 } finally {stop(run);}
});
test('destroyed and push-pop scene values cannot survive cached heap object access',async()=>{
 const run=await fixture('let picture=image.create(1,1);let actor=sprites.create(picture,0);');
 try {
  await stepFrames(run.vm,4);const e=actual(run),ref=variables(run).actor;
  assert.equal(e._objectHeap.get(ref,'x'),79.5);
  e.pushScene({});assert.throws(()=>e._objectHeap.get(ref,'x'),/inactive|not issued|epoch/);
  e.popScene({});assert.throws(()=>e._objectHeap.get(ref,'x'),/not issued|epoch/);
  run.vm.stopAll();run.vm.greenFlag();await stepFrames(run.vm,4);
  const next=variables(run).actor,x=e._objectHeap.get(next,'x');
  const body=Object.values(e._state().sprites).find(s=>s.x===x);e.destroySprite({ID:body.id});
  assert.equal(e._spriteValues.get(body.id),body);
  for(const read of [()=>e._objectHeap.get(next,'x'),()=>e._objectHeap.inspect(next),()=>e._objectHeap.method(next,'setPosition'),()=>e._objectHeap.hold(next)])assert.throws(read,/physical body/);
 } finally {stop(run);}
});

test('connected computed template text cannot allocate even when equal to the literal shadow',async()=>{
 const run=await fixture('let picture=image.create(1,1);let actor=sprites.create(picture,0);',{computedTemplate:true});
 try {await stepFrames(run.vm,4);assert.ok(run.errors.some(error=>/actual literal TEMPLATE shadow/.test(error)));assert.equal(Object.keys(actual(run)._state().sprites).length,0);}
 finally {stop(run);}
});
