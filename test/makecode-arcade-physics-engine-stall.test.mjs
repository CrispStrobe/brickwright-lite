// The physics-engine browser gate presses controller.right, which sets
// minStep 4 / maxStep 2 and asserts the sprite is still at x 20 when the
// "no progress" diagnostic shows. The scene loop's frame delta is wall clock
// (PXT cadence, capped at 100 ms), so the fixture must stall for every delta,
// not just for the deltas a slow runner happens to produce.
import test from 'node:test';
import assert from 'node:assert/strict';
import {createArcadeRuntimeMock} from './helpers/arcade-runtime-mock.mjs';
import {loadExtensionClass} from './helpers/bw-extensions.mjs';
import {PHYSICS_ENGINE_CONTROLLER_SOURCE} from './fixtures/arcade-physics-engine.mjs';
const Arcade=loadExtensionClass('arcade');

function frame(speed,dtMs){
    const runtime=createArcadeRuntimeMock(),a=new Arcade(runtime),diagnostics=[];
    runtime.on('ARCADE_RUNTIME_DIAGNOSTIC',d=>diagnostics.push(d));
    const engine=a.scenePhysicsEngine({SCENE:a.currentScene()});
    for(const [PROPERTY,VALUE] of [['maxSpeed',speed],['minStep',4],['maxStep',2]])a.setPhysicsEngineProperty({ENGINE:engine,PROPERTY,VALUE});
    const id=a.createSprite({KIND:'Player',X:20,Y:40,WIDTH:6,HEIGHT:6});
    a.setSpritePosition({ID:id,X:20,Y:40});a.setSpriteProperty({ID:id,PROPERTY:'vx',VALUE:speed});
    a._advance(dtMs/1000);
    return {x:a.spriteProperty({ID:id,PROPERTY:'x'}),stalled:diagnostics.some(d=>d.code==='physics-step-no-progress')};
}
const deltas=Array.from({length:401},(_,i)=>i/4); // 0..100 ms in 0.25 ms steps

test('the gate fixture uses the speed proven to stall on every frame delta',()=>{
    assert.match(PHYSICS_ENGINE_CONTROLLER_SOURCE,/controller\.right[\s\S]*?savedEngine\.maxSpeed=5000\s+savedEngine\.minStep=4\s+savedEngine\.maxStep=2\s+oldActor\.setPosition\(20,40\)\s+oldActor\.vx=5000/);
});

test('vx/maxSpeed 5000 never moves the sprite for any delta, and stalls with a diagnostic once displacement is nonzero',()=>{
    for(const dt of deltas){
        const r=frame(5000,dt);
        assert.equal(r.x,20,`dt ${dt} ms moved the sprite`);
        assert.equal(r.stalled,dt>=2,`dt ${dt} ms diagnostic`);
    }
});

test('the old vx 100 legitimately moves up to 2 px on frames shorter than 22 ms (why CI saw x 24)',()=>{
    for(const dt of deltas){
        const r=frame(100,dt);
        if(dt>=22){assert.equal(r.x,20,`dt ${dt}`);assert.equal(r.stalled,true,`dt ${dt}`);}
        else{assert.equal(r.stalled,false,`dt ${dt}`);assert.ok(r.x>=20 && r.x<=22,`dt ${dt} x ${r.x}`);}
    }
    assert.equal(frame(100,20).x,22);
});
