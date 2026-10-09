// SPDX-License-Identifier: BSD-3-Clause
// Copyright (c) 2026 Brickwright contributors
import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {readFileSync} from 'node:fs';
import {requireDualUltrasonicFrame, dualUltrasonicRobot} from '../overlay/scratch-gui/src/lib/spike-nuttx/motor-topology.js';
import {encodeInstructions} from '../overlay/scratch-gui/src/lib/spike-nuttx/upload-protocol.js';
import {compileFirmwareProgram} from '../overlay/scratch-gui/src/lib/spike-arena/firmware-program.js';
import Hub from '../overlay/scratch-gui/src/lib/virtual-hub/spike-hub-state.js';
import {RenodeArenaSession} from '../overlay/scratch-gui/src/lib/spike-arena/renode-arena-session.js';
import {ArenaHubBridge} from '../overlay/scratch-gui/src/lib/spike-arena/arena-hub-bridge.js';
import {sandboxWorld} from '../overlay/scratch-gui/src/lib/spike-arena/arena-sandbox.js';
const {OPERATIONS} = createRequire(import.meta.url)('../overlay/scratch-vm/src/extension-support/capability-broker.js');
const profile={topology:'dual-ultrasonic'};
const frame=(seq=1)=>({schemaVersion:1,type:'snapshot',seq,clockNs:seq*1000000,
    target:{board:'spike-prime',firmware:'brickwright-nuttx',transport:'none',imageSha256:'a'.repeat(64),
        capabilities:['arena-inputs/v1','arena-clock/v1','guest-motor-output/v1','state-sample/v1','nuttx-program/v1','nuttx-addressed-distance/v1','nuttx-program-storage/v1']},
    lifecycle:{phase:'ready',generation:1,connectionGeneration:1,nuttxProgram:{state:1}},
    ports:Object.entries({A:'motor',B:'motor',C:'color',D:'none',E:'distance',F:'distance'}).map(([id,kind])=>({id,kind,attached:kind!=='none'})),
    motors:[...'AB'].map(port=>({port,position:0,speedDps:0,demandDirection:0,stalled:false}))});
const bridge=()=>{const hubState=new Hub();hubState.setPort('D','none');return new ArenaHubBridge({hubState,world:sandboxWorld(),robot:dualUltrasonicRobot()});};
function comparison(port,opcode='operator_lt',unit='cm',threshold='12.3') {
    const blocks={hat:{opcode:'event_whenflagclicked',next:'wait'},wait:{opcode:'control_wait_until',inputs:{CONDITION:{block:'compare'}}},
        compare:{opcode,inputs:{OPERAND1:{block:'sensor'},OPERAND2:{block:'n'}}},
        sensor:{opcode:'spikeprime_getDistanceIn',fields:{PORT:{value:port},UNIT:{value:unit}}},n:{opcode:'text',shadow:true,fields:{TEXT:{value:threshold}}}};
    return {runtime:{targets:[{blocks:{_blocks:blocks,getScripts:()=>['hat']}}]}};
}
test('explicit E/F selectors preserve units and comparison direction without widening defaults',()=>{
    for(const [port,base] of [['E',0x120],['F',0x128]]) for(const [op,predicate] of [['operator_lt',1],['operator_gt',2]]) {
        for(const [unit,n,expected] of [['mm','123',123],['cm','12.3',123],['in','2',51]]) {
            const vm=comparison(port,op,unit,n),program=compileFirmwareProgram(vm,profile);
            assert.deepEqual(program.instructions,[[3,base+predicate,expected,0],[0,0,0,0]]);
            assert.equal(encodeInstructions(program,profile).length,32);
            assert.throws(()=>compileFirmwareProgram(vm),/sensor is D/);
            assert.throws(()=>encodeInstructions(program),/ABI bounds/);
        }
    }
    assert.throws(()=>compileFirmwareProgram(comparison('D'),profile),/ports are E and F/);
    assert.throws(()=>compileFirmwareProgram(comparison('E','operator_equals'),profile),/does not support/);
    assert.deepEqual(compileFirmwareProgram(comparison('D')).instructions,[[3,1,123,0],[0,0,0,0]]);
});
test('wire encoding keeps signed word order and refuses legacy/wrong-type/unknown selectors and bounds',()=>{
    const program=a=>({version:1,instructions:[[5,a,65535,1],[0,0,0,0]]});
    for(const a of [0x121,0x122,0x129,0x12a]) {
        const data=encodeInstructions(program(a),profile),v=new DataView(data.buffer);
        assert.deepEqual([0,4,8,12].map(i=>v.getInt32(i,true)),[5,a,65535,1]);
    }
    for(const a of [0,1,2,3,0x119,0x123,0x12b,0x131,0x100000121]) assert.throws(()=>encodeInstructions(program(a),profile));
    for(const b of [-1,65536,0.5]) assert.throws(()=>encodeInstructions({version:1,instructions:[[3,0x121,b,0],[0,0,0,0]]},profile));
    assert.throws(()=>encodeInstructions({version:1,instructions:[[1,4,100,0],[0,0,0,0]]},profile));
    for(const a of [4,5,6]) encodeInstructions({version:1,instructions:[[3,a,10,0],[0,0,0,0]]},profile);
});
test('closed desktop DTO accepts only own NuttX dual profile and no paths or monitor text',()=>{
    const valid=OPERATIONS['renode.spike.session.start'].validate;
    assert.equal(valid({backend:'nuttx',topology:'dual-ultrasonic'}),true);
    for(const args of [{topology:'dual-ultrasonic'},{backend:'guest',topology:'dual-ultrasonic'},
        {backend:'micropython',topology:'dual-ultrasonic'},{backend:'nuttx',topology:'dual-ultrasonic;quit'},
        {backend:'nuttx',topology:'dual-ultrasonic',path:'image.bin'}]) assert.equal(valid(args),false);
});
const badFrames=[f=>{f.target.capabilities=f.target.capabilities.filter(c=>c!=='nuttx-addressed-distance/v1');},
    f=>{f.target.firmware='micropython-prime';},f=>{f.target.transport='ble';},f=>{f.ports[4].kind='force';},
    f=>{f.ports[5].attached=false;},f=>{f.ports[3]={id:'D',kind:'distance',attached:true};},
    f=>f.ports.push(f.ports[5]),f=>{f.motors[1].port='A';},f=>{f.ports[5].id='E';}];
test('wrong first frames close the acquired session before inputs, run or native/Python upload',async()=>{
    requireDualUltrasonicFrame(frame());
    for(const mutate of badFrames) for(const code of [{source:'pass'},{program:{version:1,instructions:[[0,0,0,0]]}}]) {
        const f=frame();mutate(f);const calls=[],b=bridge();
        const caps=Object.fromEntries(['session.start','state.read','session.close','arena.inputs.write','program.packet','run']
            .map(op=>[`renode.spike.${op}`,async args=>{calls.push([op,args]);return op==='state.read'?JSON.stringify(f):'ready';}]));
        const s=new RenodeArenaSession({bridge:b,capabilities:caps,backend:'nuttx',...profile,...code});
        await assert.rejects(s.start(),/Dual ultrasonic requires|MicroPython requires/);
        assert.deepEqual(calls.map(c=>c[0]),['session.start','state.read','session.close']);
        assert.deepEqual(calls[0][1],{backend:'nuttx',topology:'dual-ultrasonic'});
        assert.equal(b.hubState.configurationOwner,null);assert.equal(b.hubState.clockOwner,null);
    }
});
test('sensor geometry delivers distinct E/F ranges through the existing arena and shared hub',()=>{
    const world=sandboxWorld();world.walls=[{shape:{type:'rect',x:46,y:35,w:2,h:2}}];
    const hubState=new Hub();hubState.setPort('D','none');
    const b=new ArenaHubBridge({hubState,world,robot:dualUltrasonicRobot()});
    const ranges=b.sim.readSensors();assert.notEqual(ranges.E.distance,ranges.F.distance);
    const s=new RenodeArenaSession({bridge:b,backend:'nuttx',...profile,source:'pass'});
    const inputs=s.acceptFrame(frame());
    assert.deepEqual(inputs.sensors.map(v=>[v.port,v.kind]),[['C','color'],['E','distance'],['F','distance']]);
    for(const port of ['E','F']) assert.equal(inputs.sensors.find(v=>v.port===port).values.distanceMillimeters,Math.round(ranges[port].distance));
    assert.equal(b.hubState.data.sensors[3],null);
    s.adapter.close();
});
test('live upload, capability loss, replacement and retained restart preserve one hub and gate before packets',async()=>{
    const b=bridge(),hub=b.hubState,calls=[];let seq=0,state=1,bad=false;
    const snapshot=()=>{const f=frame(++seq);f.lifecycle.nuttxProgram.state=state;if(bad)badFrames[0](f);return f;};
    const caps=Object.fromEntries(['session.start','session.close','state.read','arena.inputs.write','run','program.packet']
        .map(op=>[`renode.spike.${op}`,async args=>{calls.push([op,args]);if(op==='state.read')return JSON.stringify(snapshot());
            if(op!=='program.packet')return 'ready';
            assert.equal(hub.configurationOwner,s);assert.equal(hub.data.sensors[4].kind,'distance');
            const p=args.bytes;if(p[2]===2)state=1;if(p[2]===3)state=2;if(p[2]===4)state=4;
            const f=snapshot(),reply=new Uint8Array(20);reply.set([113,1,p[2],state,1,0,0,0]);
            f.lifecycle.nuttxProgramReply=[...reply];return JSON.stringify(f);
        }]));
    const s=new RenodeArenaSession({bridge:b,capabilities:caps,backend:'nuttx',...profile,source:'pass'});
    try {
        await s.start();clearTimeout(s.timer);
        assert.equal(s.adapter.bridge.hubState,hub);
        assert.deepEqual(calls.filter(c=>c[0]==='program.packet').map(c=>c[1].bytes[2]),[7,1,2,3]);
        await s.stopProgram();clearTimeout(s.timer);
        const count=()=>calls.filter(c=>c[0]==='program.packet').length,previous=count();bad=true;
        await assert.rejects(s.uploadProgram(null,'pass'),/Dual ultrasonic requires/);clearTimeout(s.timer);assert.equal(count(),previous);
        await assert.rejects(s.restartProgram(),/Dual ultrasonic requires/);clearTimeout(s.timer);assert.equal(count(),previous);
        assert.throws(()=>s.acceptFrame(snapshot()),/Dual ultrasonic requires/);
        bad=false;await s.uploadProgram({version:1,instructions:[[3,0x121,200,0],[0,0,0,0]]});clearTimeout(s.timer);
        assert.ok(count()>previous);assert.equal(s.topology,'dual-ultrasonic');
    } finally {bad=false;await s.stop();}
    assert.equal(hub.configurationOwner,null);assert.equal(hub.clockOwner,null);
});
test('a pending first read can be cancelled without any upload or shared clock takeover',async()=>{
    let release;const pending=new Promise(resolve=>{release=resolve;}),calls=[],b=bridge();
    const caps=Object.fromEntries(['session.start','state.read','session.close','program.packet']
        .map(op=>[`renode.spike.${op}`,async()=>{calls.push(op);return op==='state.read'?pending:'ready';}]));
    const s=new RenodeArenaSession({bridge:b,capabilities:caps,backend:'nuttx',...profile,source:'pass'});
    const started=s.start();while(!calls.includes('state.read'))await new Promise(resolve=>setTimeout(resolve,0));
    const stopped=s.stop();release(JSON.stringify(frame()));await Promise.all([started,stopped]);
    assert.deepEqual(calls,['session.start','state.read','session.close']);assert.equal(b.hubState.clockOwner,null);
});
test('capability and attachment gate mutation controls detect broken admission',async()=>{
    const source=readFileSync(new URL('../overlay/scratch-gui/src/lib/spike-nuttx/motor-topology.js',import.meta.url),'utf8');
    const controls=[source.replace("'nuttx-addressed-distance/v1'","'state-sample/v1'"),
        source.replace("p.kind === kind &&",''),source.replace("p.attached === (kind !== 'none')",'true')];
    for(const [i,mutant] of controls.entries()) {
        assert.notEqual(mutant,source);const module=await import(`data:text/javascript;base64,${Buffer.from(mutant).toString('base64')}`);
        const f=frame();[badFrames[0],badFrames[3],badFrames[4]][i](f);
        assert.throws(()=>assert.throws(()=>module.requireDualUltrasonicFrame(f),/Dual ultrasonic requires/),assert.AssertionError,
            'the same negative admission assertion must fail on the changed actual gate');
    }
});

test('actual pane methods build the dual arena, refuse lessons/MicroPython and restore default devices on close',async()=>{
    const paneSource=readFileSync(new URL('../overlay/scratch-gui/src/components/tw-pseudocode/spike-arena-pane.jsx',import.meta.url),'utf8');
    const startup=paneSource.slice(paneSource.indexOf('    firmwareProgramObserver ('),paneSource.indexOf('    async programStorage ('));
    const stop=paneSource.slice(paneSource.indexOf('    async stopProgram ('),paneSource.indexOf('    async pause ()'));
    const Pane=new Function('encodePython','encodeInstructions','compileFirmwareProgram','dualUltrasonicRobot','ArenaHubBridge','RenodeArenaSession',
        `return class {${startup} ${stop}};`)(()=>{},encodeInstructions,compileFirmwareProgram,dualUltrasonicRobot,ArenaHubBridge,RenodeArenaSession);
    const pane=new Pane(),hubState=new Hub(),world=sandboxWorld(),calls=[];
    Object.assign(pane,{hubState,world,bridge:new ArenaHubBridge({hubState,world}),clock:{uninstall(){}},
        state:{execution:'nuttx',topology:'dual-ultrasonic',sandbox:world},setState(next){Object.assign(this.state,next);},draw(){}});
    pane.nativeCapabilities=()=>Object.fromEntries(['session.start','state.read','session.close','arena.inputs.write','run','program.packet']
        .map(op=>[`renode.spike.${op}`,async()=>{calls.push(op);return op==='state.read'?JSON.stringify(frame()):'ready';}]));
    for(const state of [{execution:'nuttx',sandbox:null},{execution:'micropython',sandbox:world}]) {
        Object.assign(pane.state,state);await assert.rejects(pane.startFirmware(null,{source:'pass'}),/Dual ultrasonic requires/);
        assert.equal(calls.length,0);
    }
    Object.assign(pane.state,{execution:'nuttx',sandbox:world});
    // An unsupported package fails before upload, while the pane still owns the selected geometry.
    const invalid=frame();badFrames[0](invalid);
    pane.nativeCapabilities=()=>Object.fromEntries(['session.start','state.read','session.close','program.packet']
        .map(op=>[`renode.spike.${op}`,async()=>{calls.push(op);return op==='state.read'?JSON.stringify(invalid):'ready';}]));
    await pane.startFirmware(null,{source:'pass'});
    assert.equal(pane.state.status,'failed');assert.deepEqual(calls,['session.start','state.read','session.close']);
    assert.deepEqual(pane.bridge.robot.sensors.map(s=>s.port),['C','E','F']);assert.equal(hubState.data.sensors[3],null);
    await pane.stopProgram();assert.equal(pane.bridge.hubState,hubState);
    assert.deepEqual(pane.bridge.robot.sensors.map(s=>[s.port,s.kind]),[['C','color'],['D','distance'],['E','force']]);
    assert.equal(hubState.data.sensors[5],null);assert.equal(hubState.data.sensors[3].kind,'distance');
    assert.equal(hubState.data.sensors[4].kind,'force');
});
