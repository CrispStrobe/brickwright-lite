import test from 'node:test';
import assert from 'node:assert/strict';
import {EventEmitter} from 'node:events';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';
import {loadExtensionClass,probeExtension} from './helpers/bw-extensions.mjs';
import {runProgram,SB3Creator,stepFrames} from './helpers/bw-vm.mjs';
import {arcadeToPseudocode} from '../overlay/scratch-gui/src/lib/bw-makecode/arcade-translate.js';
import {projectToArcade} from '../overlay/scratch-gui/src/lib/bw-makecode/export-arcade.js';
import {compile} from '../scripts/lib/pxt-node.mjs';
const Arcade=loadExtensionClass('arcade');
const out=creator=>projectToArcade(creator.project,{costumeSvg:(t,c)=>creator.assets.get(c.assetId)?.data});
const sprites=run=>Object.values(run.vm.runtime.bwArcadeDeviceState.sprites);
async function execute(source){
    const imported=arcadeToPseudocode(source);assert.deepEqual(imported.unsupported,[],JSON.stringify(imported));
    const run=await runProgram(imported.code,{frames:12,uploads:imported.costumes,storage:true});
    assert.deepEqual(run.errors,[]);assert.deepEqual(run.creator.warnings,[]);return run;
}

test('image.create follows pinned PXT bounds and integer conversion; clones copy pixels independently',()=>{
    const source=readFileSync(new URL('../packages/scratch-gui/static/makecode/arcade/sim/common-sim.js',import.meta.url),'utf8');
    const context={pxsim:{RefObject:class{},getScreenState:()=>({bpp:()=>4})},image:{}};
    const end=source.indexOf('pxsim.RefImage = RefImage;');
    runInNewContext(source.slice(source.indexOf('class RefImage extends'),end+'pxsim.RefImage = RefImage;'.length),context);
    const start=source.indexOf('function create(w, h)');
    const finish=source.indexOf('image.create = create;',start);
    runInNewContext(source.slice(start,finish+'image.create = create;'.length),context);
    const rt=new EventEmitter();const ext=new Arcade(rt);
    for(const [w,h] of [[3,2],[0,2],[2,0],[-1,2],[2001,1],[1.9,2.9]]){
        const reference=context.image.create(w,h),id=ext.createImage({WIDTH:String(w),HEIGHT:String(h)});
        assert.equal(!!id,!!reference);
        if(reference){assert.equal(ext.imageProperty({IMAGE:id,PROPERTY:'width'}),reference._width);assert.equal(ext.imageProperty({IMAGE:id,PROPERTY:'height'}),reference._height);}
    }
    const id=ext.createImage({WIDTH:2,HEIGHT:1});ext.mutateImage({IMAGE:id,OP:'fill',COLOR:7});
    const copy=ext.cloneImage({IMAGE:id});assert.notEqual(copy,id);
    ext.setImagePixel({IMAGE:copy,X:0,Y:0,COLOR:2});assert.equal(ext.imagePixel({IMAGE:id,X:0,Y:0}),7);assert.equal(ext.imagePixel({IMAGE:copy,X:0,Y:0}),2);
    rt.emit('PROJECT_START');assert.equal(ext.cloneImage({IMAGE:id}),'');assert.notEqual(ext.createImage({WIDTH:2,HEIGHT:1}),id);
    for(const opcode of ['createImage','cloneImage','imageProperty','mutateImage','imagePixel','setImagePixel','drawImage','spawnImageSprite'])assert.ok(probeExtension(Arcade).opcodes.has(opcode));
});

test('generated images share through aliases, clone independently and attach before creation callbacks',async()=>{
    const source=`let width=4
let height=3
let picture=image.create(width,height)
picture.fill(0)
picture.fillRect(1,0,2,2,5)
picture.drawLine(3,2,0,2,7)
picture.setPixel(0,0,2)
let copied=picture.clone()
let alias=picture
copied.flipX()
copied.replace(7,8)
let callbackWidth=0
sprites.onCreated(SpriteKind.Player,function(sprite){callbackWidth=sprite.width})
let hero=sprites.create(picture,SpriteKind.Player)
let foe=sprites.create(alias,SpriteKind.Enemy)
let third=sprites.create(copied,SpriteKind.Food)
alias.setPixel(0,0,3)
let sampled=picture.getPixel(2,1)+1
let actualWidth=picture.width
let actualHeight=copied.height`;
    const run=await execute(source);const state=sprites(run);
    assert.equal(state[0].image,state[1].image);assert.notEqual(state[0].image,state[2].image);
    assert.deepEqual([...state[0].image.pixels],[3,5,5,0,0,5,5,0,7,7,7,7]);
    assert.deepEqual([...state[2].image.pixels],[0,5,5,2,0,5,5,0,8,8,8,8]);
    const vars=Object.fromEntries(run.vm.runtime.targets.flatMap(t=>Object.values(t.variables)).map(v=>[v.name,v.value]));
    assert.equal(vars.callbackWidth,4);assert.equal(vars.sampled,6);assert.equal(vars.actualWidth,4);assert.equal(vars.actualHeight,3);
    const recreated=new SB3Creator();recreated.parse(run.creator.decompile());assert.deepEqual(recreated.warnings,[]);
    const fromCode=await runProgram(run.creator.decompile(),{frames:12,storage:true});
    assert.deepEqual(fromCode.errors,[]);assert.equal(sprites(fromCode)[0].image,sprites(fromCode)[1].image);
    assert.deepEqual([...sprites(fromCode)[2].image.pixels],[0,5,5,2,0,5,5,0,8,8,8,8]);
    const exported=out(run.creator);assert.deepEqual(exported.unsupported,[]);
    const built=await compile('arcade',exported.files);assert.equal(built.success,true,JSON.stringify(built.diagnostics));
    const again=await execute(exported.ts);assert.equal(sprites(again)[0].image,sprites(again)[1].image);assert.deepEqual([...sprites(again)[2].image.pixels],[0,5,5,2,0,5,5,0,8,8,8,8]);
    const saved=await run.vm.saveProjectSb3();await run.vm.loadProject(Buffer.from(await saved.arrayBuffer()));run.vm.greenFlag();await stepFrames(run.vm,12);
    assert.equal(sprites(run)[0].image,sprites(run)[1].image);
});

test('procedure-local generated images keep fresh resources per invocation',async()=>{
    const run=await execute(`let hero=sprites.create(img\`1\`,SpriteKind.Player)
function draw(){let local=image.create(2,1);local.fill(7);hero.setImage(local)}
draw()
let saved=hero.image
draw()
hero.image.fill(2)`);
    const values=run.vm.runtime.targets.flatMap(t=>Object.values(t.variables));const saved=values.find(v=>v.name==='saved').value;
    const ext=run.vm.runtime._primitives.arcade_imagePixel;
    assert.equal(ext({IMAGE:saved,X:0,Y:0},{}),7);assert.deepEqual([...sprites(run)[0].image.pixels],[2,2]);
    const exported=out(run.creator);assert.deepEqual(exported.unsupported,[]);
    const built=await compile('arcade',exported.files);assert.equal(built.success,true,JSON.stringify(built.diagnostics));
    await execute(exported.ts);
});

test('standalone images without sprites can be created and queried',async()=>{
    const run=await execute('let picture=image.create(2,1)\npicture.fill(7)\nlet sampled=picture.getPixel(0,0)');
    assert.equal(run.vm.runtime.targets.flatMap(t=>Object.values(t.variables)).find(v=>v.name==='sampled').value,7);
});

test('generated-image projectiles share live artwork and preserve all four creation modes',async()=>{
    const source=`let picture=image.create(4,2)
picture.fill(7)
let owner=sprites.create(img\`1\`,SpriteKind.Player)
owner.setPosition(40,30)
let callbackWidth=0
let callbackColor=0
sprites.onCreated(SpriteKind.Projectile,function(sprite){callbackWidth=sprite.width;callbackColor=sprite.image.getPixel(0,0)})
let side=sprites.createProjectileFromSide(picture,50,0)
let from=sprites.createProjectileFromSprite(picture,owner,0,-20)
let kind=sprites.createProjectile(picture,-10,0,SpriteKind.Enemy)
let sourced=sprites.createProjectile(picture,0,10,SpriteKind.Food,owner)
let sideX=side.x
let fromX=from.x
let fromY=from.y
let kindX=kind.x
let sourcedX=sourced.x
picture.setPixel(0,0,2)`;
    const verify=run=>{
        const state=sprites(run), projectiles=state.slice(1);
        assert.equal(state.length,5);assert.deepEqual(projectiles.map(s=>s.kind),['Projectile','Projectile','Enemy','Food']);
        for(const sprite of projectiles){assert.equal(sprite.width,4);assert.equal(sprite.height,2);assert.equal(sprite.image,projectiles[0].image);assert.equal(sprite.image.pixels[0],2);}
        assert.deepEqual(projectiles.map(s=>[s.vx,s.vy]),[[50,0],[0,-20],[-10,0],[0,10]]);
        const vars=Object.fromEntries(run.vm.runtime.targets.flatMap(t=>Object.values(t.variables)).map(v=>[v.name,v.value]));
        assert.equal(vars.callbackWidth,4);assert.equal(vars.callbackColor,7);
        assert.equal(vars.sideX,-1);assert.equal(vars.kindX,161);assert.equal(vars.fromX,40);assert.equal(vars.fromY,30);assert.equal(vars.sourcedX,40);
    };
    const run=await execute(source);verify(run);
    const code=run.creator.decompile();const recreated=await runProgram(code,{frames:12,uploads:arcadeToPseudocode(source).costumes,storage:true});
    assert.deepEqual(recreated.errors,[]);assert.deepEqual(recreated.creator.warnings,[]);verify(recreated);
    const exported=out(run.creator);assert.deepEqual(exported.unsupported,[]);
    const built=await compile('arcade',exported.files);assert.equal(built.success,true,JSON.stringify(built.diagnostics));
    verify(await execute(exported.ts));
    const saved=await run.vm.saveProjectSb3();await run.vm.loadProject(Buffer.from(await saved.arrayBuffer()));run.vm.greenFlag();await stepFrames(run.vm,12);verify(run);
    assert.ok(probeExtension(Arcade).opcodes.has('spawnImageProjectile'));
});

test('procedure image arguments and sprite image references can launch projectiles without creation handlers',async()=>{
    const source=`let owner=sprites.create(img\`2 7\`,SpriteKind.Player)
function fire(picture:Image){let shot=sprites.createProjectileFromSprite(picture,owner,10,0);shot.y=45}
fire(owner.image)
fire(owner.image.clone())
owner.image.setPixel(0,0,5)`;
    const verify=run=>{
        const state=sprites(run);assert.equal(state.length,3);
        assert.equal(state[0].image,state[1].image);assert.notEqual(state[0].image,state[2].image);
        assert.deepEqual([...state[1].image.pixels],[5,7]);assert.deepEqual([...state[2].image.pixels],[2,7]);
        assert.equal(state[1].y,45);assert.equal(state[2].y,45);
    };
    const run=await execute(source);verify(run);
    const exported=out(run.creator);assert.deepEqual(exported.unsupported,[]);
    const built=await compile('arcade',exported.files);assert.equal(built.success,true,JSON.stringify(built.diagnostics));
    verify(await execute(exported.ts));
});
