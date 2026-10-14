import test from 'node:test';
import assert from 'node:assert/strict';
import {EventEmitter} from 'node:events';
import {loadExtensionClass} from './helpers/bw-extensions.mjs';
import {runPxtArcade} from './helpers/pxt-arcade-runtime.mjs';
const Arcade=loadExtensionClass('arcade');
const pixels=frame=>Array.from(frame.pixels,c=>{const hex=['000000','ffffff','ff2121','ff93c4','ff8135','fff609','249ca3','78dc52','003fad','87f2ff','8e2ec4','a4839f','5c406c','e5cdc4','91463d','000000'][c];return(parseInt(hex.slice(0,2),16)+(parseInt(hex.slice(2,4),16)<<8)+(parseInt(hex.slice(4,6),16)<<16)+0xff000000)>>>0;});
function native(c) {
 const a=new Arcade(new EventEmitter());a.setBackgroundColor({COLOR:15});
 const image=a.createImage({WIDTH:4,HEIGHT:4});a.mutateImage({IMAGE:image,OP:'fill',COLOR:2});const id=a.createImageSprite({IMAGE:image,KIND:'Player'});
 a.setSpritePosition({ID:id,X:c.x??40.75,Y:c.y??50.25});
 for(const key of ['vx','vy','ax','ay'])a.setSpriteProperty({ID:id,PROPERTY:key,VALUE:c[key]??0});
 a.setSpriteFlag({ID:id,FLAG:'ShowPhysics',ON:true});
 if(c.camera)a.centerCameraAt({X:120,Y:90});a._updateCamera();
 if(c.relative)a.setSpriteFlag({ID:id,FLAG:'RelativeToCamera',ON:true});
 if(c.invisible)a.setSpriteFlag({ID:id,FLAG:'Invisible',ON:true});
 if(c.cover){const cover=a.createImage({WIDTH:50,HEIGHT:35});a.mutateImage({IMAGE:cover,OP:'fill',COLOR:8});const other=a.createImageSprite({IMAGE:cover,KIND:'Food'});a.setSpritePosition({ID:other,X:55,Y:72});}
 return{a,id};
}
function source(c){return `scene.setBackgroundColor(15);let actor=sprites.create(img\`2222\n2222\n2222\n2222\`,SpriteKind.Player);actor.setFlag(SpriteFlag.ShowPhysics,true);${c.camera?'scene.centerCameraAt(120,90);':''}${c.relative?'actor.setFlag(SpriteFlag.RelativeToCamera,true);':''}${c.invisible?'actor.setFlag(SpriteFlag.Invisible,true);':''}${c.cover?'let cover=sprites.create(image.create(50,35),SpriteKind.Food);cover.image.fill(8);cover.setPosition(55,72);':''}function sample(){actor.setPosition(${c.x??40.75},${c.y??50.25});actor.vx=${c.vx??0};actor.vy=${c.vy??0};actor.ax=${c.ax??0};actor.ay=${c.ay??0};}sample();game.onUpdate(sample);let ready=1;ready+=0;`;}
test('all original19200 pixels match native ShowPhysics coordinates, optional rows, camera and sprite order',async()=>{
 for(const c of [{name:'stationary'},{name:'velocity-acceleration',vx:83.5,vy:-9.75,ax:-5.25,ay:7.5},{name:'acceleration-only',ax:4},{name:'camera',camera:true},{name:'camera-relative',camera:true,relative:true,vx:8,ay:9},{name:'invisible',invisible:true,vx:8},{name:'same-z-later-sprite',cover:true},{name:'offscreen',x:-20,y:40}]){
  const original=await runPxtArcade(source(c),{waitForGlobals:{ready:1},inspectDisplay:true,waitForDisplay:true});
  const {a}=native(c);assert.deepEqual(pixels(a._composeSceneFrame()),original.$display.screen,c.name);
 }
});
test('ShowPhysics reuses its own raster without image handles and removes the overlay when hidden or disabled',()=>{
 const {a,id}=native({vx:2,ax:3}),sprite=a._sprite(id),handles=a._inst._images.size;
 const first=a._sceneLayers().layers.find(l=>l.source),raster=first.image;
 for(let i=0;i<8;i++){const layer=a._sceneLayers().layers.find(l=>l.source);assert.equal(layer,first);assert.equal(layer.image,raster);}
 assert.equal(a._inst._images.size,handles);assert.ok(a.getInfo().menus.spriteFlags.items.includes('ShowPhysics'));
 a.setSpriteFlag({ID:id,FLAG:'ShowPhysics',ON:false});assert.equal(a._sceneLayers().layers.filter(l=>l.source).length,0);
 a.setSpriteFlag({ID:id,FLAG:'ShowPhysics',ON:true});a.setSpriteFlag({ID:id,FLAG:'Invisible',ON:true});assert.equal(a._sceneLayers().layers.filter(l=>l.source).length,0);
});
test('actual renderer overlays reuse one drawable, follow z order, and clean up after disable and destruction',()=>{
 const runtime=new EventEmitter(),calls={skin:0,drawable:0,destroySkin:0,destroyDrawable:0,orders:[]};
 runtime.renderer={createSVGSkin(){return ++calls.skin;},createDrawable(){return ++calls.drawable;},updateDrawableSkinId(){},updateDrawablePosition(){},updateDrawableScale(){},updateDrawableProperties(){},updateDrawableVisible(){},updateSVGSkin(){},setDrawableOrder(id){calls.orders.push(id);},destroySkin(){calls.destroySkin++;},destroyDrawable(){calls.destroyDrawable++;}};
 const a=new Arcade(runtime),image=a.createImage({WIDTH:4,HEIGHT:4});a.mutateImage({IMAGE:image,OP:'fill',COLOR:2});const id=a.createImageSprite({IMAGE:image,KIND:'Player'});a.setSpritePosition({ID:id,X:40,Y:50});a.setSpriteFlag({ID:id,FLAG:'ShowPhysics',ON:true});
 a._composeSceneFrame();assert.equal(a._inst._particleOverlays.size,1);const entry=[...a._inst._particleOverlays.values()][0],skinCount=calls.skin,drawableCount=calls.drawable;
 for(let i=0;i<6;i++)a._composeSceneFrame();assert.equal(calls.skin,skinCount);assert.equal(calls.drawable,drawableCount);assert.equal([...a._inst._particleOverlays.values()][0],entry);
 a.setSpriteProperty({ID:id,PROPERTY:'z',VALUE:9});a._composeSceneFrame();assert.equal(a._sprite(id)._physicsLayer.source.z,9);assert.equal(calls.orders.at(-1),entry.drawableId);
 a.setSpriteFlag({ID:id,FLAG:'ShowPhysics',ON:false});a._composeSceneFrame();assert.equal(a._inst._particleOverlays.size,0);assert.ok(calls.destroySkin>=1);assert.ok(calls.destroyDrawable>=1);
 a.setSpriteFlag({ID:id,FLAG:'ShowPhysics',ON:true});a._composeSceneFrame();assert.equal(a._inst._particleOverlays.size,1);
 a.setSpriteProperty({ID:id,PROPERTY:'flags',VALUE:64|128});a._composeSceneFrame();assert.equal(a._inst._particleOverlays.size,0,'direct Invisible mask hides physics overlay');
 a.setSpriteProperty({ID:id,PROPERTY:'flags',VALUE:64});a._composeSceneFrame();assert.equal(a._inst._particleOverlays.size,1,'direct clear restores physics overlay');
 a.destroySprite({ID:id});a._composeSceneFrame();assert.equal(a._inst._particleOverlays.size,0);
});

test('supported ShowPhysics source survives native Code, fresh SB3, original export and reimport with its exact mask',async()=>{
 const {arcadeToPseudocode}=await import('../overlay/scratch-gui/src/lib/bw-makecode/arcade-translate.js');
 const {projectToArcade}=await import('../overlay/scratch-gui/src/lib/bw-makecode/export-arcade.js');
 const {runProgram,stepFrames,clearStrayTimers}=await import('./helpers/bw-vm.mjs');
 const files={'main.ts':'let actor=sprites.create(img`2222\n2222\n2222\n2222`,SpriteKind.Player);actor.setPosition(40,50);actor.setFlag(SpriteFlag.ShowPhysics,true);let flags=actor.flags;let ready=1;ready+=0;','pxt.json':JSON.stringify({name:'owned-show-physics-roundtrip',dependencies:{device:'*'},files:['main.ts']})};
 const original=await runPxtArcade(files);assert.equal(original.flags,64);assert.equal(original.ready,1);
 const imported=arcadeToPseudocode(files);assert.deepEqual(imported.unsupported,[]);assert.match(imported.code,/arcade set flag ShowPhysics/);
 const values=run=>Object.fromEntries(run.vm.runtime.targets.flatMap(t=>Object.values(t.variables)).map(v=>[v.name.replace(/^(?:Game_)+/,''),v.value]));
 const check=run=>{assert.deepEqual(run.errors,[]);assert.deepEqual(run.creator.warnings,[]);assert.equal(values(run).flags,64);assert.equal(values(run).ready,1);};
 const runs=[];
 try{
  const native=await runProgram(imported.code,{frames:50,storage:true,uploads:imported.costumes});runs.push(native);check(native);
  const code=await runProgram(native.creator.decompile(),{frames:50,storage:true,uploads:imported.costumes});runs.push(code);check(code);
  const archive=Buffer.from(await(await native.vm.saveProjectSb3()).arrayBuffer());await native.vm.loadProject(archive);native.vm.greenFlag();await stepFrames(native.vm,50);check(native);
  const fresh=await runProgram('SPRITE Placeholder:\nWHEN flag clicked:\n  hide',{frames:0,storage:true});runs.push(fresh);fresh.vm.stopAll();await fresh.vm.loadProject(archive);fresh.vm.greenFlag();await stepFrames(fresh.vm,50);assert.deepEqual(fresh.errors,[]);assert.equal(values(fresh).flags,64);assert.equal(values(fresh).ready,1);
  const exported=projectToArcade(native.creator.project,{costumeSvg:(t,c)=>native.creator.assets.get(c.assetId)?.data});assert.deepEqual(exported.unsupported,[]);assert.match(exported.ts,/setFlag\(SpriteFlag\.ShowPhysics,/);
  const out=await runPxtArcade(exported.files);assert.equal(out.flags??out.Game_flags,64);assert.equal(out.ready??out.Game_ready,1);
  const again=arcadeToPseudocode(exported.files);assert.deepEqual(again.unsupported,[]);const reimport=await runProgram(again.code,{frames:50,storage:true,uploads:again.costumes});runs.push(reimport);check(reimport);
 }finally{for(const run of runs)run.vm.quit();clearStrayTimers();}
});


test('physics overlays share their sprite order only at the real render boundary',()=>{
 const runtime=new EventEmitter(),drawables=[],calls={next:0,skin:0};
 runtime.renderer={createSVGSkin(){return ++calls.skin;},createDrawable(){const id=++calls.next;drawables.push(id);return id;},updateDrawableSkinId(){},updateDrawablePosition(){},updateDrawableScale(){},updateDrawableProperties(){},updateDrawableVisible(){},updateSVGSkin(){},setDrawableOrder(id){const at=drawables.indexOf(id);if(at>=0)drawables.splice(at,1);drawables.push(id);},destroySkin(){},destroyDrawable(id){const at=drawables.indexOf(id);if(at>=0)drawables.splice(at,1);}};
 const a=new Arcade(runtime),image=a.createImage({WIDTH:4,HEIGHT:4});a.mutateImage({IMAGE:image,OP:'fill',COLOR:2});
 const actor=a.createImageSprite({IMAGE:image,KIND:'Player'});a.setSpriteProperty({ID:actor,PROPERTY:'z',VALUE:9});a.setSpriteFlag({ID:actor,FLAG:'ShowPhysics',ON:true});
 a._composeSceneFrame();const actorDrawable=a._inst._imageSkins.get(actor).drawableId,debug=[...a._inst._particleOverlays.values()][0];
 assert.deepEqual(drawables,[actorDrawable,debug.drawableId]);
 const cover=a.createImageSprite({IMAGE:image,KIND:'Player'}),coverDrawable=a._inst._imageSkins.get(cover).drawableId;
 a.setSpriteProperty({ID:cover,PROPERTY:'z',VALUE:8});a._composeSceneFrame();assert.deepEqual(drawables,[coverDrawable,actorDrawable,debug.drawableId]);
 const prior=drawables.slice();a.setSpriteProperty({ID:cover,PROPERTY:'z',VALUE:10});assert.deepEqual(drawables,prior,'Changing z waits for the next render');
 a._composeSceneFrame();assert.deepEqual(drawables,[actorDrawable,debug.drawableId,coverDrawable]);assert.equal([...a._inst._particleOverlays.values()][0],debug,'Sorting retains the drawable and skin');
 a.setSpriteProperty({ID:actor,PROPERTY:'flags',VALUE:64|128});assert.ok(drawables.includes(debug.drawableId));a._composeSceneFrame();assert.ok(!drawables.includes(debug.drawableId));
 a.setSpriteProperty({ID:actor,PROPERTY:'flags',VALUE:64});a._composeSceneFrame();const restored=[...a._inst._particleOverlays.values()][0];assert.deepEqual(drawables,[actorDrawable,restored.drawableId,coverDrawable]);
 a.destroySprite({ID:actor});a._composeSceneFrame();assert.deepEqual(drawables,[coverDrawable]);assert.equal(a._inst._particleOverlays.size,0);
});
