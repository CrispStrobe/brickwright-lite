// The physics-engine browser gate's cap/replace/restore phases wait for the
// moving sprite's position. Each test file runs in its own process; this one is
// separate from the stall test because many Arcade instances accumulate memory.
import test from 'node:test';
import assert from 'node:assert/strict';
import {createArcadeRuntimeMock} from './helpers/arcade-runtime-mock.mjs';
import {loadExtensionClass} from './helpers/bw-extensions.mjs';
import {PHYSICS_ENGINE_CONTROLLER_SOURCE} from './fixtures/arcade-physics-engine.mjs';
const Arcade=loadExtensionClass('arcade');

// The cap/replace/restore phases need the moving sprite to advance on every
// frame. Original pxt-arcade physics.ts rounds MAX_STEP_COUNT =
// toInt(maxSpeed/minStep * dtMs / 1000): with maxSpeed 40 / minStep 2 that is
// 0 steps for every frame shorter than 25 ms, so on a fast runner the sprite
// never moved and the gate's position waits timed out. minStep 0.125 gives at
// least one step for every delta that has any displacement (>= 2 ms).
const stepDeltas=Array.from({length:50},(_,i)=>2+2*i); // 2..100 ms in 2 ms steps
function moved(speed,minStep,maxStep,dtMs){
    const runtime=createArcadeRuntimeMock(),a=new Arcade(runtime);
    const engine=a.scenePhysicsEngine({SCENE:a.currentScene()});
    for(const [PROPERTY,VALUE] of [['maxSpeed',speed],['minStep',minStep],['maxStep',maxStep]])a.setPhysicsEngineProperty({ENGINE:engine,PROPERTY,VALUE});
    const id=a.createSprite({KIND:'Player',X:20,Y:40,WIDTH:6,HEIGHT:6});
    a.setSpritePosition({ID:id,X:20,Y:40});a.setSpriteProperty({ID:id,PROPERTY:'vx',VALUE:speed});
    a._advance(dtMs/1000);
    return a.spriteProperty({ID:id,PROPERTY:'x'})-20;
}

test('the gate fixture configures engines that move the sprite on every frame delta',()=>{
    const controller=PHYSICS_ENGINE_CONTROLLER_SOURCE;
    assert.match(controller,/new ArcadePhysicsEngine\(120,0\.125,4\)/);
    assert.match(controller,/controller\.A[\s\S]*?savedEngine\.maxSpeed=40\s+savedEngine\.minStep=0\.125/);
    assert.match(controller,/controller\.down[\s\S]*?savedEngine\.minStep=0\.125\s+savedEngine\.maxStep=4/);
    for(const dt of stepDeltas){
        assert.ok(moved(40,0.125,4,dt)>0,`saved engine dt ${dt}`);
        assert.ok(moved(120,0.125,4,dt)>0,`replacement engine dt ${dt}`);
    }
});

test('the old minStep 2 legitimately takes zero steps on frames shorter than 25 ms',()=>{
    for(const dt of stepDeltas){
        if(dt<24.5)assert.equal(moved(40,2,4,dt),0,`dt ${dt}`);
        else if(dt>=25.5)assert.ok(moved(40,2,4,dt)>0,`dt ${dt}`);
    }
});
