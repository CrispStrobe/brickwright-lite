// Actual pinned Sprite.__drawCore screen pixels, including scatter beyond its
// independently rounded collision box. Never use a bbox-sized oracle image.
import test from 'node:test';
import assert from 'node:assert/strict';
import {EventEmitter} from 'node:events';
import {loadExtensionClass} from './helpers/bw-extensions.mjs';
import {runPxtArcade} from './helpers/pxt-arcade-runtime.mjs';
const Arcade=loadExtensionClass('arcade');
const cases=[
    {angle:0},{angle:90},{angle:180},{angle:270},{angle:45},
    {angle:0,left:-23.75,top:-15.5},
    {angle:0,left:-23.75,top:-15},
    {angle:90,left:155.5,top:113.25,cameraX:2,cameraY:3},
    {angle:180,left:155.5,top:113.25,cameraX:2,cameraY:3,relative:true},
    {angle:35,sx:1.5,sy:.75,left:78.25,top:59.75},
    {angle:0,sx:.75,sy:.75,left:80,top:-1}
];
const source=`let actor=sprites.create(img\`259\n78a\`,SpriteKind.Player)
function capture():string {
 screen.fill(1)
 actor.__drawCore(game.currentScene().camera)
 let rows:string[]=[]
 for(let y=0;y<120;y++){
  let row=""
  for(let x=0;x<160;x++)row+="0123456789abcdef".charAt(screen.getPixel(x,y))
  rows.push(row)
 }
 return rows.join("")
}
`+cases.map((c,i)=>`actor.sx=${c.sx || 8};actor.sy=${c.sy || 8};actor.rotationDegrees=${c.angle};actor.setPosition(80,60);
${c.left!==undefined?`actor.left=${c.left};actor.top=${c.top};`:''}
actor.setFlag(SpriteFlag.RelativeToCamera,${!!c.relative});
game.currentScene().camera.drawOffsetX=${c.cameraX || 0};game.currentScene().camera.drawOffsetY=${c.cameraY || 0};
let width${i}=actor.width;let height${i}=actor.height;let left${i}=actor.left;let top${i}=actor.top;
let frame${i}=capture();`).join('\n');

test('rotation raster footprints match full original stage while collision geometry stays unchanged',async()=>{
    const original=await runPxtArcade(source);
    assert.equal(original.width0,24);
    assert.equal(original.height0,15,'preserve the original floating bounding-box truncation');
    assert.equal([...original.frame0].filter(c=>c!=='1').length,384,'draw all 24×16 source pixels');
    const arcade=new Arcade(new EventEmitter());
    const image=arcade.createImage({WIDTH:3,HEIGHT:2});
    [2,5,9,7,8,10].forEach((color,i)=>arcade.setImagePixel({IMAGE:image,X:i%3,Y:Math.floor(i/3),COLOR:color}));
    const id=arcade.createImageSprite({IMAGE:image,KIND:'Player'});
    for(const [i,c] of cases.entries()){
        arcade.setSpriteProperty({ID:id,PROPERTY:'sx',VALUE:c.sx || 8});
        arcade.setSpriteProperty({ID:id,PROPERTY:'sy',VALUE:c.sy || 8});
        arcade.setSpriteProperty({ID:id,PROPERTY:'rotationDegrees',VALUE:c.angle});
        arcade.setSpritePosition({ID:id,X:80,Y:60});
        if(c.left!==undefined){arcade.setSpriteProperty({ID:id,PROPERTY:'left',VALUE:c.left});arcade.setSpriteProperty({ID:id,PROPERTY:'top',VALUE:c.top});}
        arcade.setSpriteFlag({ID:id,FLAG:'RelativeToCamera',ON:!!c.relative});
        Object.assign(arcade._camera(),{drawOffsetX:c.cameraX || 0,drawOffsetY:c.cameraY || 0});
        for(const name of ['width','height','left','top'])assert.equal(arcade.spriteProperty({ID:id,PROPERTY:name}),original[name+i],`${i} ${name}`);
        const sprite=arcade._sprite(id),window=arcade._spriteRasterWindow(sprite),raster=arcade._scaledSpriteImage(sprite,window);
        assert.ok(raster.width<=160 && raster.height<=120 && raster.pixels.length<=19200);
        const view=arcade._spriteViewPosition(sprite),left=view.x-sprite.width/2+window.x,top=view.y-sprite.height/2+window.y;
        const screen=new Uint8Array(19200).fill(1);
        for(let y=0;y<raster.height;y++)for(let x=0;x<raster.width;x++){
            const color=raster.pixels[y*raster.width+x];
            if(color)screen[(top+y)*160+left+x]=color;
        }
        const actual=Array.from(screen,c=>c.toString(16)).join('');
        assert.equal(actual,original['frame'+i],`entire 160×120 stage, case${i}: ${JSON.stringify(c)}`);
    }
});
