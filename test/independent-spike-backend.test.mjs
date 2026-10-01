// SPDX-License-Identifier: BSD-3-Clause
// Copyright (c) 2026 Brickwright contributors
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {privateEvidenceSkip,readPrivateSpikeEvidence} from './helpers/private-spike-evidence.mjs';
import Hub from '../overlay/scratch-gui/src/lib/virtual-hub/spike-hub-state.js';
import {createSpikeBackend} from '../overlay/scratch-gui/src/lib/spike-sim/backends.js';
import {ArenaHubBridge} from '../overlay/scratch-gui/src/lib/spike-arena/arena-hub-bridge.js';
import {applyHubPython,applyScratchVerb} from '../overlay/scratch-gui/src/lib/virtual-hub/spike-hub-commands.js';
const fixture=readPrivateSpikeEvidence('oracle-motors.json');
if(!fixture)test('private motor oracle comparisons',{skip:privateEvidenceSkip},()=>{});
const near=(actual,want,tolerance,label)=>assert.ok(Math.abs(actual-want)<=tolerance,`${label}: ${actual}, expected ${want} ±${tolerance}`);
const start=(backend,id)=>{
    switch(id){
    case 'speed-positive':backend.runAtSpeed('A',300);break;
    case 'speed-negative':backend.runAtSpeed('A',-300);break;
    case 'speed-limit-positive':backend.runAtSpeed('A',5000);break;
    case 'speed-limit-negative':backend.runAtSpeed('A',-5000);break;
    case 'target-positive':backend.runToPosition('A',180,300);break;
    case 'target-negative':backend.runToPosition('A',-90,300);break;
    case 'timed':backend.runForTime('A',500,300);break;
    case 'concurrent':backend.runToPosition('A',180,300);backend.runToPosition('B',-90,200);break;
    case 'replace-target':backend.runToPosition('A',180,300);backend.step(100);backend.runToPosition('A',-90,300);break;
    case 'reverse':backend.runAtSpeed('A',300);backend.step(500);backend.runAtSpeed('A',-300);break;
    case 'zero-target':backend.runToPosition('A',0,300);break;
    case 'zero-speed':backend.runForTime('A',100,0);break;
    default:backend.runAtSpeed('A',300);backend.step(500);backend.stop('A',id);
    }
};
const trace=(record,mutation)=>{
    const hub=new Hub(),backend=hub.backend;
    if(mutation==='instant')backend.configure('A',{acceleration:1e9,deceleration:1e9});
    start(backend,record.id);
    let elapsed=0;
    return record.samples.map(sample=>{
        if(mutation!=='no-motion')backend.step(sample.ms-elapsed);
        elapsed=sample.ms;
        return {a:{...hub.data.motors[0]},b:{...hub.data.motors[1]},done:backend.done('A'),bDone:backend.done('B')};
    });
};
const compare=(record,actual)=>{
    record.samples.forEach((want,i)=>{
        const got=actual[i],id=record.id;
        if(['coast','brake','hold'].includes(id)){
            if(want.ms>=500)near(got.a.degPerSec,0,5,`${id} stopped`);
            return;
        }
        near(got.a.position,want.angle,id==='reverse'?15:12,`${id}@${want.ms} angle`);
        near(got.a.degPerSec,want.speed,110,`${id}@${want.ms} speed`);
        near(got.b.position,want.bAngle,12,`${id}@${want.ms} B angle`);
        near(got.b.degPerSec,want.bSpeed,110,`${id}@${want.ms} B speed`);
        if(want.ms>=1000 && ['target-positive','target-negative','concurrent','timed','replace-target'].includes(id)){
            near(got.a.position,want.angle,2,`${id} settled angle`);
            near(got.a.degPerSec,want.speed,5,`${id} settled speed`);
            assert.equal(got.done,true);
            if(id==='concurrent'){near(got.b.position,want.bAngle,2,'B settled');assert.equal(got.bDone,true);}
        }
    });
};
for(const record of fixture?.records||[]) {
    if(record.id.startsWith('speed-limit')) {
        test(`characterized oracle difference: ${record.id}`,t=>{
            const actual=trace(record),last=actual.at(-1),oracle=record.samples.at(-1);
            assert.throws(()=>compare(record,actual),/speed-limit-.*angle/,'strict contract comparison must expose the known gap');
            near(Math.abs(last.a.degPerSec),1110,5,'native documented request clamp');
            near(Math.abs(oracle.speed),942,5,'observed oracle steady saturation');
            assert.ok(Math.abs(last.a.position-oracle.angle)>100,'high-speed trajectory gap remains visible');
            t.diagnostic(`Known difference: native ${last.a.degPerSec} deg/s, oracle ${oracle.speed} deg/s at 1500ms; angle difference ${last.a.position-oracle.angle} degrees`);
        });
    } else test(`independent vs audited WASM: ${record.id}`,()=>compare(record,trace(record)));
}

test('oracle comparisons detect disabled motion and removed acceleration',{skip:privateEvidenceSkip},t=>{
    for(const mutation of ['no-motion','instant']){
        let caught;
        try{for(const record of fixture.records)compare(record,trace(record,mutation));}catch(error){caught=error;}
        assert.ok(caught instanceof assert.AssertionError,mutation);
        t.diagnostic(`${mutation}: detected ${caught.message}`);
    }
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

test('normalized sensor/output observations match the oracle and detect a sensor mutation',{skip:privateEvidenceSkip},async()=>{
    const oracle=readPrivateSpikeEvidence('oracle-sensors.json');
    const events=[];const hub=new Hub({onBeep:frequency=>events.push(frequency)}),b=hub.backend;
    hub.setPort('C','distance',{distance:oracle.inputs.distance});
    hub.setPort('D','force',{force:oracle.inputs.forceNewtons*10,pressed:false});
    hub.setPort('E','color',{color:6});hub.setImu(oracle.inputs.imu);hub.data.buttons.left=oracle.inputs.left;
    const observe=()=>({distance:b.readSensor('C','distance').distance,force:b.readSensor('D','force').force/10,
        color:b.readSensor('E','color').color,imu:b.imu(),left:b.buttons().left});
    const compareSensors=got=>{
        assert.equal(got.distance,Number(oracle.lines.find(l=>l.startsWith('distance ')).split(' ')[1]));
        assert.equal(got.force,Number(oracle.lines.find(l=>l.startsWith('force ')).split(' ')[1]));
        assert.equal(got.color,6);assert.equal(got.left,true);
        const imu=oracle.lines.find(l=>l.startsWith('imu ')).split(' ').slice(1).map(Number);
        [got.imu.pitch,got.imu.roll,got.imu.yaw].forEach((v,i)=>near(v,imu[i],1,'orientation'));
    };
    compareSensors(observe());
    const read=b.readSensor.bind(b);b.readSensor=(...args)=>({...read(...args),distance:0});
    assert.throws(()=>compareSensors(observe()),assert.AssertionError);
    b.setPixel(2,1,9);assert.deepEqual(hub.data.display,oracle.pixels.map(v=>Math.round(v*9/100)));
    const beep=b.beep(440,100);b.step(100);assert.equal(await beep,'completed');
    assert.equal(hub.data.speaker.frequency,oracle.speaker.frequency);assert.equal(hub.data.speaker.beeps,oracle.speaker.beeps);
    assert.deepEqual(events.filter(f=>f>0),oracle.beepEvents.filter(f=>f>0));
    const start=b.simulatedMs,pending=b.wait(10000);b.step(300);b.cancel();
    assert.equal(({interrupted:'stopped'})[await pending],oracle.cancellation.result);
    near(b.simulatedMs-start,oracle.cancellation.simulatedMs,10,'cancellation latency');
});
