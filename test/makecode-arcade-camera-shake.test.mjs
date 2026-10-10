import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createRequire} from 'node:module';
import {runInNewContext} from 'node:vm';
import {EventEmitter} from 'node:events';
import {STATIC} from '../scripts/lib/pxt-node.mjs';
import {loadExtensionClass} from './helpers/bw-extensions.mjs';
import {arcadeToPseudocode} from '../overlay/scratch-gui/src/lib/bw-makecode/arcade-translate.js';
import {projectToArcade} from '../overlay/scratch-gui/src/lib/bw-makecode/export-arcade.js';
import {runProgram,stepFrames} from './helpers/bw-vm.mjs';
import {runPxtArcade} from './helpers/pxt-arcade-runtime.mjs';
const Arcade=loadExtensionClass('arcade');

// Execute the original freely licensed pinned camera class, with controlled
// time/randomness. This compares the actual SDK rather than a copied formula.
test('native shake matches original PXT damping, replacement, cancellation and draw-only offsets',()=>{
    const target=JSON.parse(fs.readFileSync(`${STATIC}/arcade/target.json`,'utf8'));
    const require=createRequire(new URL('../packages/scratch-gui/package.json',import.meta.url));
    const ts=require('typescript');
    const js=ts.transpileModule(target.bundledpkgs.game['camera.ts'],{compilerOptions:{target:ts.ScriptTarget.ES2017}}).outputText;
    let now=0,random=.9;
    const math=Object.create(Math);math.random=()=>random;
    const context={screen:{width:160,height:120},game:{currentScene:()=>({})},control:{millis:()=>now},Math:math};
    runInNewContext(js,context);
    const original=new context.scene.Camera();
    const runtime=new EventEmitter(),native=new Arcade(runtime);
    original.offsetX=120;original.offsetY=40;
    native.centerCameraAt({X:200,Y:100});
    const oldRandom=Math.random;
    Math.random=()=>random;
    try {
        const check=()=>{
            native._inst._globalElapsedMs=now;original.update();native._updateCamera();
            assert.equal(native._camera().drawOffsetX,original.drawOffsetX,`X at ${now}`);
            assert.equal(native._camera().drawOffsetY,original.drawOffsetY,`Y at ${now}`);
            assert.equal(native.cameraProperty({PROPERTY:0}),200,'shake preserves logical camera');
        };
        original.shake(8,1000);native.cameraShake({AMPLITUDE:8,DURATION:1000});
        for(const ms of [0,100,749,750,800,999,1000,1100]){now=ms;check();}
        now=1200;native._inst._globalElapsedMs=now;original.shake(12,500);native.cameraShake({AMPLITUDE:12,DURATION:500});check();
        now=1300;native._inst._globalElapsedMs=now;original.shake(4,100);native.cameraShake({AMPLITUDE:4,DURATION:100});check();
        now=1399;check();now=1400;check();
        for(const [amplitude,duration] of [[0,500],[-4,500],[8,0],[8,-1],[NaN,100],[Infinity,100]]){
            original.shake(amplitude,duration);native.cameraShake({AMPLITUDE:amplitude,DURATION:duration});check();
        }
        original.shake(4,500);native.cameraShake({AMPLITUDE:4,DURATION:500});check();
        runtime.emit('PROJECT_START');assert.equal(native._camera().shakeStartTime,undefined);assert.equal(native._camera().drawOffsetX,0);
    } finally {Math.random=oldRandom;}
});

test('frame shake moves world drawables while camera-relative HUD and world coordinates stay fixed',()=>{
    const native=new Arcade(new EventEmitter());
    const image=native.createImage({WIDTH:2,HEIGHT:2});
    const hero=native.createImageSprite({IMAGE:image,TEMPLATE:'',KIND:'Player'});
    const hud=native.createImageSprite({IMAGE:image,TEMPLATE:'',KIND:'Food'});
    native.setSpritePosition({ID:hero,X:80,Y:60});native.setSpritePosition({ID:hud,X:10,Y:10});
    native.setSpriteFlag({ID:hud,FLAG:'RelativeToCamera',ON:true});
    const draws=[];native._state().spriteTargets[hero]={setXY:(...position)=>draws.push(position)};
    const oldRandom=Math.random;Math.random=()=>.9;
    try {
        native.cameraShake({AMPLITUDE:4,DURATION:100});native._advance(.01);
        assert.deepEqual(native._spriteViewPosition(native._sprite(hero)),{x:77,y:57});
        assert.deepEqual(native._spriteViewPosition(native._sprite(hud)),{x:10,y:10});
        assert.deepEqual(draws.at(-1),[-9,9]);
        assert.equal(native.spriteProperty({ID:hero,PROPERTY:'x'}),80);
        native._advance(.1);assert.deepEqual(draws.at(-1),[0,0]);
    } finally {Math.random=oldRandom;}
});

test('camera shake is editable through Code and Blocks, saved SB3 and original MakeCode export',async()=>{
    const source='let calls=0;function strength(){calls++;return 4}scene.cameraShake(strength(),500);scene.cameraShake();scene.cameraShake(2);let shakeDone=calls===1';
    const imported=arcadeToPseudocode(source);assert.deepEqual(imported.unsupported,[]);
    assert.match(imported.code,/arcade shake camera by \(4\) pixels for \(500\) ms/);
    const run=await runProgram(imported.code,{frames:10,storage:true});
    assert.deepEqual(run.errors,[]);assert.deepEqual(run.creator.warnings,[]);
    assert.equal(run.creator.project.targets.flatMap(t=>Object.values(t.blocks)).filter(b=>b.opcode==='arcade_cameraShake').length,3);
    const decompiled=run.creator.decompile();assert.match(decompiled,/arcade shake camera/);
    const again=await runProgram(decompiled,{frames:10,storage:true});assert.deepEqual(again.errors,[]);assert.deepEqual(again.creator.warnings,[]);
    const exported=projectToArcade(run.creator.project);assert.deepEqual(exported.unsupported,[]);assert.match(exported.ts,/scene.cameraShake/);
    const original=await runPxtArcade(exported.ts,{waitForGlobals:{shakeDone:true}});assert.equal(original.calls,1);
    assert.deepEqual(arcadeToPseudocode(exported.files).unsupported,[]);
    await run.vm.loadProject(Buffer.from(await(await run.vm.saveProjectSb3()).arrayBuffer()));run.vm.greenFlag();await stepFrames(run.vm,10);assert.deepEqual(run.errors,[]);
});

test('extra operands and shadowed scene functions remain explicit diagnostics',()=>{
    for(const source of ['scene.cameraShake(4,500,1)','let scene={cameraShake:4};scene.cameraShake(4,500)'])assert.ok(arcadeToPseudocode(source).unsupported.length,source);
});
