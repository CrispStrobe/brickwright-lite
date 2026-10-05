import test from 'node:test';
import assert from 'node:assert/strict';
import {EventEmitter} from 'node:events';
import {loadExtensionClass} from './helpers/bw-extensions.mjs';
const Arcade=loadExtensionClass('arcade');
function setup(){
 const runtime=new EventEmitter(),skins=new Map(),updates=[];let next=0;
 const target={drawableID:1,currentCostume:0,size:100,setSize(n){this.size=n;},setVisible(v){this.visible=v;},setXY(x,y){this.x=x;this.y=y;},getCostumes(){return[];}};
 runtime.getSpriteTargetByName=()=>({makeClone:()=>target});runtime.addTarget=()=>{};
 runtime.renderer={createSVGSkin(svg,center){const id=++next;skins.set(id,{svg,center});updates.push(id);return id;},updateSVGSkin(id,svg,center){skins.set(id,{svg,center});updates.push(id);},updateDrawableSkinId(){},updateDrawableProperties(){},destroySkin(id){skins.delete(id);}};
 const a=new Arcade(runtime),image=a.createImage({WIDTH:2,HEIGHT:2});for(const[i,c]of [5,9,2,0].entries())a.setImagePixel({IMAGE:image,X:i%2,Y:i>>1,COLOR:c});
 const id=a.createImageSprite({IMAGE:image,TEMPLATE:'Art',KIND:'Player'});a.setSpritePosition({ID:id,X:80,Y:60});return {a,id,image,target,skins,updates};
}
function raster(a,id){const sprite=a._sprite(id),window=a._spriteRasterWindow(sprite),image=a._scaledSpriteImage(sprite,window),view=a._spriteViewPosition(sprite);return {...image,left:view.x-sprite.width/2+window.x,top:view.y-sprite.height/2+window.y};}
function place(a,id,x,y){a.setSpriteProperty({ID:id,PROPERTY:'left',VALUE:x-a._sprite(id).width/2});a.setSpriteProperty({ID:id,PROPERTY:'top',VALUE:y-a._sprite(id).height/2});}
function histogram(image){const counts=Array(16).fill(0);for(const c of image.pixels)counts[c]++;return counts;}
test('huge scales rasterize only the viewport with exact cropped sampling and source geometry',()=>{
 const {a,id,image,target,skins}=setup();a.setSpriteScale({ID:id,VALUE:16384,ANCHOR:0});place(a,id,80,60);let r=raster(a,id);
 assert.equal(r.width,160);assert.equal(r.height,120);assert.equal(r.pixels.length,19200);assert.equal(r.left,0);assert.equal(r.top,0);assert.deepEqual(histogram(r).slice(0,10),[4800,0,4800,0,0,4800,0,0,0,4800]);
 assert.equal(a.spriteProperty({ID:id,PROPERTY:'width'}),32768);assert.equal(a.spriteProperty({ID:id,PROPERTY:'height'}),32768);assert.equal(a._image(image).pixels.length,4);assert.equal(target.x,0);assert.equal(target.y,0);
 const skin=skins.get(a._inst._imageSkins.get(id).skinId);assert.match(skin.svg,/width="640"/);assert.match(skin.svg,/height="480"/);assert.deepEqual(skin.center,[320,240]);
 place(a,id,112,60);r=raster(a,id);assert.equal(histogram(r)[5],112*60);assert.equal(histogram(r)[9],48*60);place(a,id,48,60);r=raster(a,id);assert.equal(histogram(r)[5],48*60);assert.equal(histogram(r)[9],112*60);
});
test('crop refresh follows physics, camera, RelativeToCamera, image mutation and restored scenes',()=>{
 const {a,id,image,target,updates}=setup();a.setSpriteScale({ID:id,VALUE:16384,ANCHOR:0});place(a,id,80,60);const count=updates.length;a._positionSprite(id);a._positionSprite(id);assert.equal(updates.length,count);
 a.setSpriteProperty({ID:id,PROPERTY:'vx',VALUE:100});a._advance(.02);assert.equal(a._sprite(id)._fx/256+a._sprite(id).width/2,82);assert.equal(histogram(raster(a,id))[5],82*60);assert.ok(updates.length>count);
 a.setSpriteProperty({ID:id,PROPERTY:'vx',VALUE:0});place(a,id,80,60);a.centerCameraAt({X:128,Y:60});a._updateCamera();assert.equal(histogram(raster(a,id))[5],32*60);
 a.setSpriteFlag({ID:id,FLAG:'RelativeToCamera',ON:true});assert.equal(histogram(raster(a,id))[5],80*60);const fixed=updates.length;a.centerCameraAt({X:144,Y:60});a._updateCamera();assert.equal(updates.length,fixed);
 a.setSpriteFlag({ID:id,FLAG:'RelativeToCamera',ON:false});assert.equal(histogram(raster(a,id))[5],16*60);const beforeMutation=updates.length;a.setImagePixel({IMAGE:image,X:0,Y:0,COLOR:7});assert.equal(histogram(raster(a,id))[7],16*60);assert.ok(updates.length>beforeMutation);
 a.pushScene({});a.setImagePixel({IMAGE:image,X:0,Y:0,COLOR:6});a.popScene({});assert.equal(histogram(raster(a,id))[6],16*60);assert.equal(target.x,0);assert.equal(target.y,0);
});
test('fully hidden and zero-area sprites allocate no pixels and ordinary movement reuses the skin',()=>{
 const {a,id,updates}=setup();a.setSpriteScale({ID:id,VALUE:4,ANCHOR:0});const baseline=updates.length;a.setSpritePosition({ID:id,X:50,Y:40});assert.equal(updates.length,baseline);assert.equal(raster(a,id).pixels.length,64);
 a.setSpritePosition({ID:id,X:-20,Y:40});assert.equal(raster(a,id).pixels.length,0);const hidden=updates.length;a.setSpritePosition({ID:id,X:-10000,Y:40});assert.equal(updates.length,hidden);
 a.setSpritePosition({ID:id,X:0,Y:0});assert.equal(raster(a,id).pixels.length,16);assert.equal(raster(a,id).left,0);assert.equal(raster(a,id).top,0);a.setSpriteProperty({ID:id,PROPERTY:'sy',VALUE:0});assert.equal(raster(a,id).pixels.length,0);
});
