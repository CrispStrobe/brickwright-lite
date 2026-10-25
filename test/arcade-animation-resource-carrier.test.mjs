import test from 'node:test';import assert from 'node:assert/strict';import {createHash} from 'node:crypto';
import JSZip from 'jszip';
import Creator from '../overlay/scratch-gui/src/lib/sb3-creator.js';
import {arcadeToPseudocode} from '../overlay/scratch-gui/src/lib/bw-makecode/arcade-translate.js';
import {encodeAnimationJres} from '../overlay/scratch-gui/src/lib/bw-makecode/animation-jres.js';
import {installAnimationImport} from '../overlay/scratch-gui/src/lib/bw-animation-import.js';
import {inspectArtwork,applyArtwork,setCostumeDocument,getCostumeDocument,syncAnimationResources,writeArtworkToZip} from '../overlay/scratch-gui/src/lib/bw-artwork-bundle.js';
import {getAssetLibraryRole,withoutAssetLibraries} from '../overlay/scratch-gui/src/lib/bw-asset-library.js';
import {projectToArcade} from '../overlay/scratch-gui/src/lib/bw-makecode/export-arcade.js';
import {VM,ownerOf,projectOpcodes,stepFrames,runProgram} from './helpers/bw-vm.mjs';
import {loadExtensionClass} from './helpers/bw-extensions.mjs';
import {importGuiDependency} from './helpers/bw-integrated.mjs';
const importProjectFiles=(files,opts)=>arcadeToPseudocode(files,opts);
const files=()=>({'main.ts':'let frames=assets.animation`Walk`\nlet count=frames.length\nlet first=frames[0].getPixel(0,0)\nlet second=frames[1].getPixel(0,0)\ncount+=0\nfirst+=0\nsecond+=0',
 'pxt.json':JSON.stringify({name:'Owned staged animation',dependencies:{device:'*'},files:['main.ts','images.g.jres']}),
 'images.g.jres':JSON.stringify({Walk:encodeAnimationJres({id:'Walk',name:'Walk',width:1,height:1,intervalMs:100,frames:[{pixels:[2]},{pixels:[5]}]})})});
const hash=bytes=>createHash('md5').update(bytes).digest('hex');
const open=async bytes=>{
 const zip=await JSZip.loadAsync(bytes),project=JSON.parse(await zip.file('project.json').async('text'));
 const vm=new VM();vm.runtime.bwArcadeFrameAuthority='manual';const Storage=(await importGuiDependency('scratch-storage/dist/node/scratch-storage.js')).default;vm.attachStorage(new Storage());
 for(const id of new Set([...projectOpcodes(project)].map(ownerOf).filter(Boolean))){const service=vm.extensionManager._registerInternalExtension(new(loadExtensionClass(id))(vm.runtime));vm.extensionManager._loadedExtensions.set(id,service);}
 const inspection=await inspectArtwork(bytes);assert.equal(inspection.outcome,'loaded');await vm.loadProject(bytes);applyArtwork(inspection,vm);vm.runtime.stc=project.stc;
 return {vm,inspection,project};
};
const values=vm=>Object.fromEntries(vm.runtime.targets.flatMap(t=>Object.values(t.variables)).map(v=>[v.name.replace(/^Game_/,''),v.value]));
const run=async(vm,expected)=>{vm.stopAll();vm.greenFlag();await stepFrames(vm,3);for(const[k,v]of Object.entries(expected))assert.equal(values(vm)[k],v,k);};
test('edited resource pixels persist through current Code, same and fresh SB3 and current export',async()=>{
 const imported=importProjectFiles(files(),{target:'arcade',animationResources:true});assert.deepEqual(imported.unsupported,[]);
 const original=new Creator();original.parse(imported.code);assert.deepEqual(original.warnings,[]);
 const replay=new Creator();replay.parse(original.decompile());assert.deepEqual(replay.warnings,[]);assert.equal(replay.decompile(),original.decompile());
 const zip=await JSZip.loadAsync(await(await replay.generateSB3()).arrayBuffer());await installAnimationImport(zip,imported.animationResources,hash);
 const opened=await open(await zip.generateAsync({type:'uint8array'}));let fresh,last;
 try{
  await run(opened.vm,{count:2,first:2,second:5});
  const costume=opened.vm.runtime.targets.find(getAssetLibraryRole).sprite.costumes[0],document=structuredClone(getCostumeDocument(costume));
  document.animation.resource.name="Renamed Walk";document.animation.frames[0].layers[0].content.value.pixels=[4];document.layers=structuredClone(document.animation.frames[0].layers);
  setCostumeDocument(costume,document);syncAnimationResources(opened.vm);await run(opened.vm,{count:2,first:4,second:5});
  const saved=await JSZip.loadAsync(await(await opened.vm.saveProjectSb3()).arrayBuffer());assert.equal(await writeArtworkToZip(saved,opened.vm),true);const bytes=await saved.generateAsync({type:'uint8array'});
  const sameInspection=await inspectArtwork(bytes);await opened.vm.loadProject(bytes);applyArtwork(sameInspection,opened.vm);await run(opened.vm,{count:2,first:4,second:5});
  fresh=await open(bytes);await run(fresh.vm,{count:2,first:4,second:5});assert.equal(fresh.inspection.records.find(row=>row.document?.animation).document.animation.resource.name,"Renamed Walk");
  const exported=projectToArcade(withoutAssetLibraries(JSON.parse(fresh.vm.toJSON()),fresh.inspection.libraries),{animationDocuments:fresh.inspection.records.map(row=>row.document)});assert.deepEqual(exported.unsupported,[]);assert.deepEqual(exported.warnings,[]);
  const again=importProjectFiles(exported.files,{animationResources:true});assert.deepEqual(again.unsupported,[]);assert.equal(again.animationResources[0].frames[0].pixels[0],4);assert.equal(again.animationResources[0].document.animation.resource.name,"Renamed Walk");
  const next=new Creator();next.parse(again.code);assert.deepEqual(next.warnings,[]);const finalZip=await JSZip.loadAsync(await(await next.generateSB3()).arrayBuffer());await installAnimationImport(finalZip,again.animationResources,hash);last=await open(await finalZip.generateAsync({type:'uint8array'}));await run(last.vm,{count:2,first:4,second:5});assert.equal(Object.values(last.vm.runtime.bwArcadeDeviceState.sprites).length,0,'resource-only program has no hidden Player');
 }finally{for(const row of [opened,fresh,last])if(row){row.vm.stopAll();row.vm.quit();}}

});

test('resource factories create no data-only Player, creation event, overlap or allOfKind member',async()=>{
 const art=Array(16).fill('2121212121212121').join('\n');const source=files();source['images.g.jres']=JSON.stringify({Walk:encodeAnimationJres({id:'Walk',name:'Walk',width:16,height:16,intervalMs:100,frames:[{pixels:Array(256).fill(2)},{pixels:Array(256).fill(5)}]})});source['main.ts']=`let made=0
let touched=0
sprites.onCreated(SpriteKind.Player,function(sprite){made+=1})
sprites.onOverlap(SpriteKind.Player,SpriteKind.Projectile,function(left,right){touched+=1})
let actor=sprites.createProjectileFromSide(img\`${art}\`,0,0)
actor.setPosition(80,60)
animation.runImageAnimation(actor,assets.animation\`Walk\`,100,true)
let players=sprites.allOfKind(SpriteKind.Player).length`;
 const imported=importProjectFiles(source,{target:'arcade',animationResources:true});assert.deepEqual(imported.unsupported,[]);
 const creator=new Creator();creator.parse(imported.code);assert.deepEqual(creator.warnings,[]);
 for(const costume of imported.costumes||[]){if(costume.mode==='add')creator.addCustomSVGCostume(costume.sprite,costume.svg,costume.name);else creator.applyCustomSVG(costume.sprite,costume.svg);}
 const zip=await JSZip.loadAsync(await(await creator.generateSB3()).arrayBuffer());await installAnimationImport(zip,imported.animationResources,hash);
 const first=await open(await zip.generateAsync({type:'uint8array'}));let second;
 try{
  await run(first.vm,{made:0,touched:0,players:0});
  const state=first.vm.runtime.bwArcadeDeviceState;assert.equal(Object.values(state.sprites).length,1,'only the authored Projectile exists');assert.equal(Object.values(state.sprites)[0].kindName,'Projectile');
  const currentZip=await JSZip.loadAsync(await(await first.vm.saveProjectSb3()).arrayBuffer());const svg=new Map();for(const [name,entry]of Object.entries(currentZip.files))if(name.endsWith('.svg'))svg.set(name,await entry.async('string'));
  const exported=projectToArcade(withoutAssetLibraries(JSON.parse(first.vm.toJSON()),first.inspection.libraries||[]),{costumeSvg:(_t,c)=>svg.get(c.md5ext),animationDocuments:first.inspection.records.filter(row=>row.document?.animation).map(row=>row.document)});
  assert.deepEqual(exported.unsupported,[]);assert.deepEqual(exported.warnings,[]);
  const again=importProjectFiles(exported.files,{target:'arcade',animationResources:true});assert.deepEqual(again.unsupported,[]);
  const next=new Creator();next.parse(again.code);assert.deepEqual(next.warnings,[]);for(const costume of again.costumes||[]){if(costume.mode==='add')next.addCustomSVGCostume(costume.sprite,costume.svg,costume.name);else next.applyCustomSVG(costume.sprite,costume.svg);}const saved=await JSZip.loadAsync(await(await next.generateSB3()).arrayBuffer());await installAnimationImport(saved,again.animationResources,hash);
  second=await open(await saved.generateAsync({type:'uint8array'}));await run(second.vm,{made:0,touched:0,players:0});assert.equal(Object.values(second.vm.runtime.bwArcadeDeviceState.sprites).length,1,'export/reimport does not add an invisible Player');
 }finally{for(const opened of [first,second])if(opened){opened.vm.stopAll();opened.vm.quit();}}
});

test('ordinary inline frame arrays and genuine unmarked hidden actors retain their distinct semantics',async()=>{
 const legacy=arcadeToPseudocode({...files(),'main.ts':'let frames=assets.animation`Walk`;let actor=sprites.createProjectileFromSide(img`2`,0,0);animation.runImageAnimation(actor,frames,100,true)'});
 assert.deepEqual(legacy.unsupported,[]);assert.doesNotMatch(legacy.code,/animation fresh frames resource/);const ordinary=new Creator();ordinary.parse(legacy.code);assert.deepEqual(ordinary.warnings,[]);assert.ok(legacy.costumes.length>=2,'ordinary frame image templates remain available');
 const actor=new Creator();actor.parse('DEVICE ARCADE\nSPRITE Citizen:\nWHEN flag clicked:\n  hide');
 const exported=projectToArcade(actor.project,{costumeSvg:()=>'<svg xmlns="http://www.w3.org/2000/svg" width="4" height="4" viewBox="0 0 4 4"><rect x="0" y="0" width="4" height="4" fill="#ff2121"/></svg>'});assert.deepEqual(exported.unsupported,[]);assert.match(exported.ts,/sprites\.create\(/);assert.match(exported.ts,/SpriteKind\.Invisible|setFlag\(SpriteFlag\.Invisible, true\)/,'authored hidden target remains an actual actor');
 const imported=arcadeToPseudocode(exported.files['main.ts']+'\nlet kept=sprites.allOfKind(SpriteKind.Player).length');assert.deepEqual(imported.unsupported,[]);const actual=await runProgram(imported.code,{frames:3,storage:true,uploads:imported.costumes});
 try{assert.deepEqual(actual.errors,[]);assert.equal(Object.values(actual.vm.runtime.bwArcadeDeviceState.sprites).length,1);assert.equal(Object.values(actual.vm.runtime.bwArcadeDeviceState.sprites)[0].invisible,true);assert.equal(values(actual.vm).kept,1,'unmarked invisible actor remains observable by actual allOfKind');}finally{actual.vm.stopAll();actual.vm.quit();}

});
