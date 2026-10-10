import test from 'node:test';
import assert from 'node:assert/strict';
import {arcadeToPseudocode} from '../overlay/scratch-gui/src/lib/bw-makecode/arcade-translate.js';
import {projectToArcade} from '../overlay/scratch-gui/src/lib/bw-makecode/export-arcade.js';
import {runProgram,stepFrames} from './helpers/bw-vm.mjs';
import {runPxtArcade} from './helpers/pxt-arcade-runtime.mjs';
import {loadExtensionClass,stubRuntime} from './helpers/bw-extensions.mjs';
const value=(run,name)=>run.vm.runtime.targets.flatMap(t=>Object.values(t.variables)).find(v=>v.name===name)?.value;
async function execute(source){
 const imported=arcadeToPseudocode(source);assert.deepEqual(imported.unsupported,[],JSON.stringify(imported.unsupported));
 const run=await runProgram(imported.code,{frames:40,uploads:imported.costumes,storage:true});
 assert.deepEqual(run.errors,[]);assert.deepEqual(run.creator.warnings,[]);return {...run,imported};
}
const capture=`
pause(60)
let raster=""
let digits="0123456789abcdef"
for(let y=0;y<120;y++)for(let x=0;x<160;x++)raster+=digits.charAt(screen.getPixel(x,y))
`;
const lifecycle=`let created=0
let destroyed=0
let firstPixel=-1
sprites.onCreated(-1,function(sprite){
 firstPixel=sprite.image.getPixel(0,0)
 pause(50)
 created+=1
 sprite.image.fill(7)
})
sprites.onDestroyed(-1,function(sprite){pause(50);destroyed+=1})
let isolated=sprites.create(img\`2\`,-1)
let afterCreation=created
let pixelAfter=isolated.image.getPixel(0,0)
let negativeCount=sprites.allOfKind(-1).length
isolated.setKind(SpriteKind.Enemy)
let namedCount=sprites.allOfKind(SpriteKind.Enemy).length
isolated.setKind(-1)
let namedAfter=sprites.allOfKind(SpriteKind.Enemy).length
sprites.destroyAllSpritesOfKind(-1)
let retainedPixel=isolated.image.getPixel(0,0)
isolated.destroy()
let afterDestruction=destroyed
`;
const lifecycleValues={created:1,destroyed:1,firstPixel:2,afterCreation:1,pixelAfter:7,negativeCount:0,namedCount:1,namedAfter:0,retainedPixel:7,afterDestruction:1};
function check(run,expected){for(const [name,n] of Object.entries(expected))assert.equal(value(run,name),n,name);}
function exported(run){
 const out=projectToArcade(run.creator.project,{costumeSvg:(t,c)=>run.creator.assets.get(c.assetId)?.data});
 assert.deepEqual(out.unsupported,[],JSON.stringify(out.unsupported));
 assert.doesNotMatch(out.ts,/SpriteKind\.-/);return out;
}
for(const kind of [-1,-7,-1.5])test('fixed negative kind preserves creation callback identity and empty collection: '+kind,async()=>{
 const source=`let created=0
sprites.onCreated(${kind},function(sprite){created+=1;sprite.image.fill(6)})
let actor=sprites.create(img\`2\`,${kind})
let count=sprites.allOfKind(${kind}).length
let sampled=actor.image.getPixel(0,0)
`;
 const original=await runPxtArcade(source+capture);assert.deepEqual([original.created,original.count,original.sampled],[1,0,6]);
 const run=await execute(source);check(run,{created:1,count:0,sampled:6});
 const actor=Object.values(run.vm.runtime.bwArcadeDeviceState.sprites)[0];
 assert.equal(actor.kind,String(kind));assert.ok(run.vm.runtime.bwArcadeDeviceState.physicsEngine.members.includes(actor));
 assert.equal(original.raster.length,19200);
 assert.deepEqual([...run.vm.runtime.bwArcadeDeviceState.sceneFrame.pixels],Array.from(original.raster,ch=>parseInt(ch,16)));
 const out=exported(run);const originalExport=await runPxtArcade({...out.files,'main.ts':out.files['main.ts']+capture});
 assert.deepEqual([originalExport.created,originalExport.count,originalExport.sampled],[1,0,6]);
 assert.equal(originalExport.raster,original.raster);
 const again=await execute(out.files);check(again,{created:1,count:0,sampled:6});
});
test('negative lifecycle preserves yielding callbacks and setKind membership through all project paths',async()=>{
 const original=await runPxtArcade(lifecycle);for(const [name,n] of Object.entries(lifecycleValues))assert.equal(original[name],n,name);
 const run=await execute(lifecycle);check(run,lifecycleValues);assert.deepEqual(run.vm.runtime.bwArcadeDeviceState.sprites,{});
 const out=exported(run);const originalExport=await runPxtArcade(out.files);
 for(const [name,n] of Object.entries(lifecycleValues))assert.equal(originalExport[name],n,'export '+name);
 check(await execute(out.files),lifecycleValues);
 const code=await runProgram(run.creator.decompile(),{frames:40,uploads:run.imported.costumes,storage:true});assert.deepEqual(code.errors,[]);check(code,lifecycleValues);
 const saved=await run.vm.saveProjectSb3();await run.vm.loadProject(Buffer.from(await saved.arrayBuffer()));
 run.vm.greenFlag();await stepFrames(run.vm,40);assert.deepEqual(run.errors,[]);check(run,lifecycleValues);
});
test('negative creation registrations preserve independent captured closures',async()=>{
 const source=`function install(start:number){
 let position=start
 sprites.onCreated(-1,function(sprite){pause(20);sprite.x=position;position+=1})
 position+=10
}
install(10)
install(20)
let first=sprites.create(img\`2\`,-1)
let firstX=first.x
let second=sprites.create(img\`2\`,-1)
let secondX=second.x
let hidden=sprites.allOfKind(-1).length
`;
 const original=await runPxtArcade(source);assert.deepEqual([original.firstX,original.secondX,original.hidden],[30,31,0]);
 const run=await execute(source);check(run,{firstX:30,secondX:31,hidden:0});
 const out=exported(run);check(await execute(out.files),{firstX:30,secondX:31,hidden:0});
 const again=await runPxtArcade(out.files);assert.deepEqual([again.firstX,again.secondX,again.hidden],[30,31,0]);
});
test('native negative kinds remain scene owned and retain physics membership',()=>{
 const Arcade=loadExtensionClass('arcade');const ext=new Arcade(stubRuntime());
 const actor=ext.spawnSprite({KIND:'-1',X:80,Y:60,WIDTH:2,HEIGHT:2});
 assert.equal(ext.spriteCount({KIND:'-1'}),0);assert.deepEqual(ext._spritesOfKind('-1'),[]);
 assert.equal(ext._state().sprites[actor].pxtId,0);assert.equal(ext._state().physicsEngine.members.length,1);
 ext.pushScene({});assert.equal(Object.values(ext._state().sprites).length,0);
 ext.popScene({});assert.ok(ext._state().sprites[actor]);
 ext.setSpriteKind({ID:actor,KIND:'Enemy'});assert.equal(ext.spriteCount({KIND:'Enemy'}),1);
 ext.setSpriteKind({ID:actor,KIND:'-7'});assert.equal(ext.spriteCount({KIND:'Enemy'}),0);assert.equal(ext.spriteCount({KIND:'-7'}),0);
});
test('dynamic and unsupported positive numeric kinds retain explicit diagnostics',()=>{
 for(const source of [
 'let kind=SpriteKind.Player\nsprites.onCreated(kind,function(sprite){sprite.x=10})\nlet hero=sprites.create(img`1`,SpriteKind.Player)',
 'let hero=sprites.create(img`1`,12345)',
 ])assert.ok(arcadeToPseudocode(source).unsupported.length,source);
});
test('negative kinds can receive overlap callbacks despite empty collections',async()=>{
 const source=`let hits=0
sprites.onOverlap(-1,SpriteKind.Enemy,function(first,second){hits+=1;second.destroy()})
let actor=sprites.create(img\`2 2\n2 2\`,-1)
let enemy=sprites.create(img\`3 3\n3 3\`,SpriteKind.Enemy)
pause(120)
let sampled=hits
let negativeCount=sprites.allOfKind(-1).length
let namedCount=sprites.allOfKind(SpriteKind.Enemy).length
`;
 const original=await runPxtArcade(source);assert.deepEqual([original.sampled,original.negativeCount,original.namedCount],[1,0,0]);
 const run=await execute(source);check(run,{sampled:1,negativeCount:0,namedCount:0});
 const out=exported(run);check(await execute(out.files),{sampled:1,negativeCount:0,namedCount:0});
 const again=await runPxtArcade(out.files);assert.deepEqual([again.sampled,again.negativeCount,again.namedCount],[1,0,0]);
});
test('function-local projectiles preserve fixed negative callback kinds',async()=>{
 const source=`let created=0
sprites.onCreated(-7,function(sprite){created+=1;sprite.image.fill(6)})
function launch():Sprite{
 let shot=sprites.createProjectile(img\`2\`,30,0,-7)
 return shot
}
let actor=launch()
let count=sprites.allOfKind(-7).length
let sampled=actor.image.getPixel(0,0)
`;
 const original=await runPxtArcade(source);assert.deepEqual([original.created,original.count,original.sampled],[1,0,6]);
 const run=await execute(source);check(run,{created:1,count:0,sampled:6});
 const out=exported(run);check(await execute(out.files),{created:1,count:0,sampled:6});
 const again=await runPxtArcade(out.files);assert.deepEqual([again.created,again.count,again.sampled],[1,0,6]);
});
