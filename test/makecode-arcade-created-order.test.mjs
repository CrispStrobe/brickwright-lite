import test from 'node:test';
import assert from 'node:assert/strict';
import {EventEmitter} from 'node:events';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';
import {createRequire} from 'node:module';
import {arcadeToPseudocode} from '../overlay/scratch-gui/src/lib/bw-makecode/arcade-translate.js';
import {runProgram, stepFrames} from './helpers/bw-vm.mjs';
import {loadExtensionClass} from './helpers/bw-extensions.mjs';
// Task E1 keeps the import half of these round trips; the export half (projectToArcade, then compiling or running the exported TypeScript in PXT, then re-importing it) returns with task E2 (docs/OPEN-TASKS-2026-09-29.md).
const value = (run,name) => run.vm.runtime.targets.flatMap(t=>Object.values(t.variables)).find(v=>v.name===name)?.value;
async function execute(source,frames=30) {
    const imported=arcadeToPseudocode(source);assert.deepEqual(imported.unsupported,[]);
    const run=await runProgram(imported.code,{frames,uploads:imported.costumes,storage:true});
    assert.deepEqual(run.errors,[]);assert.deepEqual(run.creator.warnings,[]);return run;
}

test('creation waits for nested procedures and preserves multiple-handler order before returning',async()=>{
    // Exercise the actual pinned PXT create implementation as the ordering reference.
    const target=JSON.parse(readFileSync(new URL('../packages/scratch-gui/static/makecode/arcade/target.json',import.meta.url)));
    const source=target.bundledpkgs.game['sprites.ts'];
    const start=source.indexOf('export function create(img: Image');
    const end=source.indexOf('return sprite',start)+'return sprite'.length;
    const require=createRequire(new URL('../packages/scratch-gui/package.json',import.meta.url));
    const js=require('typescript').transpileModule(source.slice(start,end)+'\n}',{compilerOptions:{module:require('typescript').ModuleKind.CommonJS}}).outputText;
    let reference=0;
    const scene={physicsEngine:{addSprite(){}},createdHandlers:[
        {kind:1,handler:s=>{reference=reference*10+1;s.pixel=7;}},
        {kind:1,handler:s=>{reference=reference*10+2;s.pixel=2;}}
    ]};
    const context={exports:{},game:{currentScene:()=>scene},Sprite:class{setKind(){}}};runInNewContext(js,context);
    assert.equal(context.exports.create({},1).pixel,2);assert.equal(reference,12);
    const run=await execute(`let order=0
function paint(surface: Image,color: number){surface.fill(color)}
function first(surface: Image){paint(surface,7);order=order*10+1}
sprites.onCreated(SpriteKind.Player,function(sprite){first(sprite.image)})
sprites.onCreated(SpriteKind.Player,function(sprite){paint(sprite.image,2);order=order*10+2})
let hero=sprites.create(img\`1\`,SpriteKind.Player)
let sampled=hero.image.getPixel(0,0)
let observed=order`);
    assert.equal(value(run,'sampled'),2);assert.equal(value(run,'observed'),reference);
    const saved=await run.vm.saveProjectSb3();await run.vm.loadProject(Buffer.from(await saved.arrayBuffer()));run.vm.greenFlag();await stepFrames(run.vm,30);
    assert.equal(value(run,'sampled'),2);assert.equal(value(run,'observed'),12);
});

test('nested creation completes each callback and keeps its event snapshot',async()=>{
    const run=await execute(`let seen=0
sprites.onCreated(SpriteKind.Enemy,function(sprite){sprite.image.fill(7);seen=seen+1})
sprites.onCreated(SpriteKind.Player,function(sprite){
    let child=sprites.create(img\`1\`,SpriteKind.Enemy)
    sprite.image.fill(child.image.getPixel(0,0))
    seen=seen+1
})
let hero=sprites.create(img\`2\`,SpriteKind.Player)
let sampled=hero.image.getPixel(0,0)
let observed=seen`);
    assert.equal(value(run,'sampled'),7);assert.equal(value(run,'observed'),2);
    assert.equal(Object.values(run.vm.runtime.bwArcadeDeviceState.sprites).length,2);
});

test('projectile creation handlers see initial velocity and their image size controls placement',async()=>{
    const run=await execute(`let seenVelocity=9
sprites.onCreated(SpriteKind.Projectile,function(sprite){seenVelocity=sprite.vx;sprite.setImage(image.create(8,4));sprite.vx=99})
let shot=sprites.createProjectileFromSide(img\`1\`,30,0)
let actualVelocity=shot.vx
let width=shot.width`,12);
    assert.equal(value(run,'seenVelocity'),0);assert.equal(value(run,'actualVelocity'),30);assert.equal(value(run,'width'),8);
    const shot=Object.values(run.vm.runtime.bwArcadeDeviceState.sprites)[0];assert.equal(shot.autoDestroy,true);
});

test('stopping and restarting cancels pending creation callbacks without starting later handlers',async()=>{
    const Arcade=loadExtensionClass('arcade');const rt=new EventEmitter();rt.threads=[];rt.startHats=()=>[];
    const target={blocks:{getBlock:id=>id==='hat'?{inputs:{KIND:{block:'kind'}}}:{opcode:'text',fields:{TEXT:{value:'Player'}}}}};
    rt.allScriptsByOpcodeDo=(opcode,visit)=>{visit({blockId:'hat'},target);visit({blockId:'hat'},target);};
    rt._pushThread=()=>{const thread={status:0};rt.threads.push(thread);return thread;};
    const ext=new Arcade(rt);const pending=ext.spawnSprite({KIND:'Player',WIDTH:1,HEIGHT:1,X:80,Y:60});
    assert.equal(typeof pending.then,'function');assert.equal(rt.threads.length,1);
    rt.emit('PROJECT_STOP_ALL');assert.equal(await pending,'');rt.emit('ARCADE_FRAME');assert.equal(rt.threads.length,1);
    rt.threads=[];const next=ext.spawnSprite({KIND:'Player',WIDTH:1,HEIGHT:1,X:80,Y:60});
    rt.emit('PROJECT_START');assert.equal(await next,'');assert.deepEqual(ext._state().sprites,{});
});

test('a yielding creation callback suspends its caller while controller events remain active',async()=>{
    const run=await execute(`let released=false
let sampled=0
controller.A.onEvent(ControllerButtonEvent.Pressed,function(){released=true})
sprites.onCreated(SpriteKind.Player,function(sprite){while(!released){pause(0)};sprite.image.fill(7)})
let hero=sprites.create(img\`1\`,SpriteKind.Player)
sampled=hero.image.getPixel(0,0)`,4);
    assert.equal(Number(value(run,'sampled')),0);assert.equal(Number(value(run,'hero')),0);
    run.vm.postIOData('keyboard',{key:' ',isDown:true});await stepFrames(run.vm,12);
    assert.equal(value(run,'sampled'),7);assert.match(value(run,'hero'),/^arcade:/);
    assert.equal(run.vm.runtime.threads.length,0);
});
