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
 a.setSpriteFlag({ID:id,FLAG:'ShowPhysics',ON:true});a._composeSceneFrame();assert.equal(a._inst._particleOverlays.size,1);a.destroySprite({ID:id});a._composeSceneFrame();assert.equal(a._inst._particleOverlays.size,0);
});
