import test from 'node:test';import assert from 'node:assert/strict';import {createHash} from 'node:crypto';
import JSZip from 'jszip';
import {parseMakeCodeTs} from '../overlay/scratch-gui/src/lib/bw-makecode/ts-import.js';
import {lowerPxtStagedValues} from '../overlay/scratch-gui/src/lib/bw-makecode/lower-pxt-staged-values.js';
import Creator from '../overlay/scratch-gui/src/lib/sb3-creator.js';
import {importProjectFiles} from '../overlay/scratch-gui/src/lib/bw-makecode/index.js';
import {encodeAnimationJres} from '../overlay/scratch-gui/src/lib/bw-makecode/animation-jres.js';
import {installAnimationImport} from '../overlay/scratch-gui/src/lib/bw-animation-import.js';
import {inspectArtwork,applyArtwork,setCostumeDocument,getCostumeDocument,syncAnimationResources,writeArtworkToZip} from '../overlay/scratch-gui/src/lib/bw-artwork-bundle.js';
import {getAssetLibraryRole,withoutAssetLibraries} from '../overlay/scratch-gui/src/lib/bw-asset-library.js';
import {projectToArcade} from '../overlay/scratch-gui/src/lib/bw-makecode/export-arcade.js';
import {VM,ownerOf,projectOpcodes,stepFrames} from './helpers/bw-vm.mjs';
import {loadExtensionClass} from './helpers/bw-extensions.mjs';
import {importGuiDependency} from './helpers/bw-integrated.mjs';
import {runPxtArcade} from './helpers/pxt-arcade-runtime.mjs';
const walk=(node,visit)=>{if(!node||typeof node!=='object')return;visit(node);for(const v of Object.values(node))if(Array.isArray(v))v.forEach(x=>walk(x,visit));else walk(v,visit);};
test('tagged complete animation factory is eagerly evaluated once without ordinary literal pushes',()=>{
 const ast=parseMakeCodeTs('let frames=[1,2]');ast.body[0].decls[0].init.bwAnimationResourceId='owned:walk';
 const snapshot=structuredClone(ast),out=lowerPxtStagedValues(ast),factories=[],pushes=[];
 walk(out,n=>{if(n.bwAnimationResourceId)factories.push(n);if(n.type==='Call'&&n.callee?.name==='push')pushes.push(n);});
 assert.deepEqual(ast,snapshot,'input/provenance is immutable');assert.equal(factories.length,1);assert.equal(pushes.length,0);
 assert.equal(out.body[0].decls[0].init.bwAnimationResourceId,'owned:walk');assert.deepEqual(out.body[0].decls[0].init.items,snapshot.body[0].decls[0].init.items);
 assert.equal(out.body.at(-1).decls[0].init.name,out.body[0].decls[0].name);
});
test('ordinary effectful arrays keep their eager allocation and ordered item staging',()=>{
 const out=lowerPxtStagedValues(parseMakeCodeTs('let frames=[first(),second()]')),calls=[];
 walk(out,n=>{if(n.type==='Call')calls.push(n.callee.name);});assert.deepEqual(calls,['push','first','push','second']);
 assert.deepEqual(out.body[0].decls[0].init.items,[]);assert.equal(out.body.at(-1).decls[0].init.type,'Identifier');
});
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
test('edited native resource pixels replace original payload without stale appended frames through fresh SB3 and export', {todo:"animation resource ID/name validation \u2014 see docs/ARCADE-888-OPEN-FAILURES.md"},async()=>{
 const imported=importProjectFiles(files(),{target:'arcade',animationResources:true});assert.deepEqual(imported.unsupported,[]);assert.doesNotMatch(imported.code,/mutate array reference[^\n]*op "push"/);
 const creator=new Creator();creator.parse(imported.code);assert.deepEqual(creator.warnings,[]);
 const zip=await JSZip.loadAsync(await(await creator.generateSB3()).arrayBuffer());await installAnimationImport(zip,imported.animationResources,hash);
 const opened=await open(await zip.generateAsync({type:'uint8array'}));let fresh;
 try{
  await run(opened.vm,{count:2,first:2,second:5});
  const library=opened.vm.runtime.targets.find(getAssetLibraryRole),costume=library.sprite.costumes[0],document=structuredClone(getCostumeDocument(costume));
  document.animation.frames[0].layers[0].content.value.pixels=[4];document.layers=structuredClone(document.animation.frames[0].layers);
  setCostumeDocument(costume,document);syncAnimationResources(opened.vm);
  await run(opened.vm,{count:2,first:4,second:5});
  const saved=await JSZip.loadAsync(await(await opened.vm.saveProjectSb3()).arrayBuffer());assert.equal(await writeArtworkToZip(saved,opened.vm),true);
  fresh=await open(await saved.generateAsync({type:'uint8array'}));await run(fresh.vm,{count:2,first:4,second:5});
  const exported=projectToArcade(withoutAssetLibraries(fresh.project,fresh.inspection.libraries),{animationDocuments:fresh.inspection.records.map(r=>r.document)});assert.deepEqual(exported.unsupported,[]);
  const original=await runPxtArcade(exported.files,{fakeClock:true});
  const originalValues=Object.fromEntries(Object.entries(original).map(([k,v])=>[k.replace(/^Game_/,''),v]));
  for(const[k,v]of Object.entries({count:2,first:4,second:5}))assert.equal(originalValues[k],v,'original exported '+k);
  const again=importProjectFiles(exported.files,{target:'arcade',animationResources:true});assert.deepEqual(again.unsupported,[]);assert.doesNotMatch(again.code,/mutate array reference[^\n]*op "push"/);
  assert.equal(again.animationResources[0].frames[0].pixels[0],4);assert.equal(again.animationResources[0].frames.length,2);
 }finally{opened.vm.quit();fresh?.vm.quit();}
});
test('editable Code replay keeps complete resource factory and observes current published pixels',async()=>{
 const imported=importProjectFiles(files(),{target:'arcade',animationResources:true});assert.deepEqual(imported.unsupported,[]);
 const original=new Creator();original.parse(imported.code);assert.deepEqual(original.warnings,[]);
 const replay=new Creator();replay.parse(original.decompile());assert.deepEqual(replay.warnings,[]);assert.equal(replay.decompile(),original.decompile());
 const zip=await JSZip.loadAsync(await(await replay.generateSB3()).arrayBuffer());await installAnimationImport(zip,imported.animationResources,hash);
 const opened=await open(await zip.generateAsync({type:'uint8array'}));
 try{
  await run(opened.vm,{count:2,first:2,second:5});
  const costume=opened.vm.runtime.targets.find(getAssetLibraryRole).sprite.costumes[0],document=structuredClone(getCostumeDocument(costume));
  document.animation.frames[0].layers[0].content.value.pixels=[4];document.layers=structuredClone(document.animation.frames[0].layers);
  setCostumeDocument(costume,document);syncAnimationResources(opened.vm);await run(opened.vm,{count:2,first:4,second:5});
 }finally{opened.vm.quit();}
});
