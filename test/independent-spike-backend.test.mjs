// SPDX-License-Identifier: BSD-3-Clause
// Copyright (c) 2026 Brickwright contributors
import {test} from 'node:test';
import assert from 'node:assert/strict';
import Hub from '../overlay/scratch-gui/src/lib/virtual-hub/spike-hub-state.js';
import {createSpikeBackend} from '../overlay/scratch-gui/src/lib/spike-sim/backends.js';
import {ArenaHubBridge} from '../overlay/scratch-gui/src/lib/spike-arena/arena-hub-bridge.js';
import {applyHubPython,applyScratchVerb} from '../overlay/scratch-gui/src/lib/virtual-hub/spike-hub-commands.js';
const near=(actual,want,tolerance,label)=>assert.ok(Math.abs(actual-want)<=tolerance,`${label}: ${actual}, expected ${want} ±${tolerance}`);
const checkRamp=mutation=>{
    const hub=new Hub(),backend=hub.backend;
    backend.configure('A',{acceleration:1000,deceleration:1000});
    if(mutation==='instant')backend.configure('A',{acceleration:1e9,deceleration:1e9});
    backend.runAtSpeed('A',300);
    if(mutation!=='no-motion')backend.step(100);
    near(hub.data.motors[0].degPerSec,100,0.01,'configured acceleration');
    near(hub.data.motors[0].position,5,0.1,'integrated ramp travel');
};
test('shared-hub acceleration contract detects disabled motion and instantaneous speed',()=>{
    checkRamp();
    for(const mutation of ['no-motion','instant'])assert.throws(()=>checkRamp(mutation),assert.AssertionError);
});

test('native factory uses exactly the shared hub controller and sensors',async()=>{
    const hub=new Hub();
    assert.equal(await createSpikeBackend({hubState:hub}),hub.motors);
    hub.setPort('C','distance',{distance:345});hub.setPort('D','force',{force:25,pressed:false});
    hub.setPort('E','color',{color:6,reflection:70,red:80,green:803,blue:120});
    hub.setImu({pitch:30,roll:-20,yaw:90});hub.data.buttons.left=true;
    const b=hub.backend;
    assert.equal(b.readSensor('C','distance').distance,345);
    assert.equal(b.readSensor('D','force').force/10,2.5);
    assert.equal(b.readSensor('E','color').color,6);
    assert.deepEqual([b.imu().pitch,b.imu().roll,b.imu().yaw],[30,-20,90]);
    assert.equal(b.buttons().left,true);
    b.setPixel(2,1,9);assert.equal(hub.data.display[7],9);
    assert.throws(()=>b.readSensor('F','distance'));
    assert.throws(()=>b.runAtSpeed('Z',100),RangeError);
    hub.updateSensor('C','distance',{distance:120});assert.equal(b.readSensor('C','distance').distance,120);
    const copy=b.readSensor('C','distance');copy.distance=9;assert.equal(hub.data.sensors[2].distance,120);
});

const scene={id:'independent-scene',title:{en:'Synthetic scene'},intro:{en:'Synthetic scene'},
    mat:{width:300,height:200,background:'white'},start:{x:50,y:100,heading:0},
    timeLimitMs:10000,objects:[{id:'probe',shape:{type:'circle',x:290,y:10,r:1}}],success:[{type:'touch',object:'probe'}]};
test('Scratch verbs and native statements share hub, arena and motor completion',async()=>{
    const hub=new Hub(),arena=new ArenaHubBridge({hubState:hub,world:scene});
    const r=applyHubPython(hub,"motors.move(360, 'degrees', speed=30)");
    assert.equal(r.handled,true);
    for(let i=0;i<600;i++)arena.tick(5);
    await Promise.all(r.pending);
    near(arena.sim.pose.x,50+Math.PI*5.6,0.02,'arena wheel travel');
    const done=applyScratchVerb(hub,'scratch.motor_run_for_degrees',{port:'A',degrees:90,speed:30}).done;
    for(let i=0;i<300;i++)arena.tick(5);
    assert.equal(await done,'completed');
    assert.equal(hub.data.motors[0].position,-270);
    assert.equal(hub.backend.readSensor('C','color').kind,'color');
});

test('supported stop defaults and sound commands use the same simulated scheduler',async()=>{
    const hub=new Hub();
    const setup=applyHubPython(hub,"hub.port.A.motor.set_stop_action('hold');hub.port.A.motor.run_for_degrees(90,30);hub.sound.beep(440,100,hub.sound.SOUND_SQUARE)");
    assert.equal(setup.handled,true);
    assert.equal(hub.data.speaker.frequency,440);
    hub.stepMotors(1000);
    assert.deepEqual(await Promise.all(setup.pending),['completed','completed']);
    assert.equal(hub.data.speaker.frequency,0);
    hub.data.motors[0].position+=5;hub.stepMotors(1000);
    assert.equal(hub.data.motors[0].position,90,'configured hold survives a shaft disturbance');
    const sound=applyScratchVerb(hub,'scratch.sound_beep',{frequency:300,duration:500}).done;
    applyHubPython(hub,'hub.sound.stop()');assert.equal(await sound,'interrupted');
    const motion=hub.backend.runForTime('A',2000,300),wait=hub.backend.wait(2000),beep=hub.backend.beep(440,2000);
    hub.stopAll();assert.deepEqual(await Promise.all([motion,wait,beep]),['interrupted','interrupted','interrupted']);
});

// Retirement keeps one hub-owned backend and rejects unsupported runtime choices.
test('backend factory reuses the hub controller and rejects unknown runtimes without mutation', async () => {
    const hub = new Hub();
    assert.equal(await createSpikeBackend({hubState: hub}), hub.backend);
    const before = structuredClone(hub.data);
    await assert.rejects(createSpikeBackend({kind: 'unknown-firmware', hubState: hub}), RangeError);
    assert.deepEqual(hub.data, before);
    await assert.rejects(createSpikeBackend(), TypeError);
});
