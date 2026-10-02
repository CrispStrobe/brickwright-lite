// SPDX-License-Identifier: BSD-3-Clause
// Copyright (c) 2026 Brickwright contributors
import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {firmwareMotorPorts} from '../scripts/lib/spike-nuttx-topology.mjs';
import {requireSixMotorFrame, prepareSixMotorHub} from '../overlay/scratch-gui/src/lib/spike-nuttx/motor-topology.js';
import Hub from '../overlay/scratch-gui/src/lib/virtual-hub/spike-hub-state.js';
import {RenodeArenaBridge} from '../overlay/scratch-gui/src/lib/spike-arena/renode-arena-bridge.js';
import {RenodeArenaSession} from '../overlay/scratch-gui/src/lib/spike-arena/renode-arena-session.js';
import {ArenaHubBridge} from '../overlay/scratch-gui/src/lib/spike-arena/arena-hub-bridge.js';
import {sandboxWorld} from '../overlay/scratch-gui/src/lib/spike-arena/arena-sandbox.js';
import {applyVirtualPortInput, canConfigureVirtualHub, loadSpikeTestRig} from '../overlay/scratch-gui/src/lib/virtual-hub/spike-panel.js';
const {OPERATIONS} = createRequire(import.meta.url)('../overlay/scratch-vm/src/extension-support/capability-broker.js');
const frame = (seq = 1) => ({schemaVersion: 1, type: 'snapshot', seq, clockNs: seq * 1000000,
    target: {board: 'spike-prime', firmware: 'brickwright-nuttx', transport: 'none', imageSha256: 'a'.repeat(64),
        capabilities: ['arena-inputs/v1','arena-clock/v1','guest-motor-output/v1','state-sample/v1','nuttx-program/v1','nuttx-six-motors/v1']},
    lifecycle: {phase:'ready',generation:1,connectionGeneration:1,nuttxProgram:{state:1}},
    ports: [...'ABCDEF'].map(id => ({id, attached:true,kind:'motor'})),
    motors: [...'ABCDEF'].map(port => ({port,position:seq-1,speedDps:0,demandDirection:0,stalled:false}))});
const bridge = () => new ArenaHubBridge({hubState: new Hub(), world:sandboxWorld(), robot:{sensors:[]}});
test('package feature requires explicit curated six-port declaration, never a storage marker', async () => {
    const read = policy => async path => {
        assert.equal(path, '/trusted/policy/simulation-firmware-inputs.json');
        return Buffer.from(JSON.stringify(policy));
    };
    assert.equal(await firmwareMotorPorts('/trusted', read({schema:1, capabilities:{motorPorts:6}})), 6);
    assert.equal(await firmwareMotorPorts('/trusted', read({schema:1})), null);
    assert.equal(await firmwareMotorPorts('/trusted', read({schema:1, capabilities:{programStorageAbi:1}})), null);
    assert.equal(await firmwareMotorPorts('/trusted', async () => {throw Object.assign(new Error('missing'),{code:'ENOENT'});}), null);
    for (const capabilities of [null, [], {motorPorts:true}, {motorPorts:'6'}, {motorPorts:2}, {motorPorts:7}]) {
        await assert.rejects(firmwareMotorPorts('/trusted', read({schema:1, capabilities})));
    }
});
test('closed start arguments preserve older defaults and refuse guest/arbitrary topology or paths', () => {
    const valid = OPERATIONS['renode.spike.session.start'].validate;
    for (const args of [{},{backend:'guest'},{backend:'nuttx'},{backend:'nuttx',topology:'default'},{backend:'nuttx',topology:'six-motors'}]) assert.equal(valid(args),true);
    for (const args of [{topology:'six-motors'},{backend:'guest',topology:'six-motors'},
        {backend:'nuttx',topology:'six-motors;quit'},{backend:'nuttx',topology:6},
        {backend:'nuttx',topology:'six-motors',path:'/tmp/model'}]) assert.equal(valid(args),false);
});
test('first snapshot needs six unique attached motors and own-package capability', () => {
    requireSixMotorFrame(frame());
    for (const mutate of [f=>f.target.capabilities.pop(), f=>{f.target.firmware='brickwright-arena-demo';},
        f=>f.motors.pop(), f=>{f.motors[5].port='A';}, f=>{f.ports[5].attached=false;},f=>{f.ports[3].kind='distance';}]) {
        const f=frame();mutate(f);assert.throws(()=>requireSixMotorFrame(f),/six attached motors/);
    }
});
test('all six observations enter the one hub; extra motors do not create arena sensors', () => {
    const b=bridge(), hub=b.hubState;prepareSixMotorHub(hub);
    const adapter=new RenodeArenaBridge(b,{allMotors:true});
    adapter.accept(frame());const next=frame(2);adapter.accept(next);
    assert.deepEqual(hub.data.motors.map(m=>m.position),Array(6).fill(1));
    assert.ok(hub.data.classicPorts.every(p=>p[0]===48 && p[1][1]===1));
    assert.equal(b.robot.sensors.length,0);assert.deepEqual(adapter.inputs().sensors,[]);
    const bad=frame(3);bad.motors[5].position=100;
    assert.throws(()=>adapter.accept(bad),/stale, discontinuous/);
    assert.equal(hub.data.motors[5].position,1);adapter.close();
});
test('six profile refuses non-Python/guest/sensorful setup before invoking transport', () => {
    for (const options of [{backend:'guest',source:'pass'},{backend:'nuttx',program:{version:1,instructions:[[0,0,0,0]]}},
        {backend:'nuttx',source:'pass',bridge:new ArenaHubBridge({hubState:new Hub(),world:sandboxWorld()})}]) {
        assert.throws(()=>new RenodeArenaSession({bridge:bridge(),topology:'six-motors',...options}),/NuttX Python/);
    }
});
test('bad first snapshot closes only acquired session and sends no program upload', async () => {
    const b=bridge(), calls=[];const invalid=frame();invalid.ports[5].kind='none';
    const capabilities=Object.fromEntries(['session.start','session.close','state.read','program.packet','run','arena.inputs.write']
        .map(op=>[`renode.spike.${op}`,async args=>{calls.push([op,args]);return op==='state.read'?JSON.stringify(invalid):'ready';}]));
    const s=new RenodeArenaSession({bridge:b,capabilities,backend:'nuttx',topology:'six-motors',source:'pass'});
    await assert.rejects(s.start(),/six attached motors/);
    assert.deepEqual(calls.map(c=>c[0]),['session.start','state.read','session.close']);
    assert.deepEqual(calls[0][1],{backend:'nuttx',topology:'six-motors'});
    assert.equal(b.hubState.configurationOwner,null);
});
test('manual browser device/value mutations are refused under firmware ownership', () => {
    const hub=new Hub();hub.setPort('F','motor',{deviceId:48,speed:0,position:17});
    for (const field of ['configurationOwner','externalBackend','clockOwner']) {
        hub[field]=field==='clockOwner'?'renode':{};
        assert.equal(canConfigureVirtualHub(hub),false);
        assert.equal(applyVirtualPortInput(hub,'F','none',0),false);assert.equal(loadSpikeTestRig(hub),false);
        assert.equal(hub.data.sensors[5].kind,'motor');assert.equal(hub.data.motors[5].position,17);
        hub[field]=null;
    }
    assert.equal(canConfigureVirtualHub(hub),true);applyVirtualPortInput(hub,'F','none',0);assert.equal(hub.data.sensors[5],null);
});

test('own Python upload starts only after six-motor verification and retains one shared hub', async () => {
    const b=bridge(), hub=b.hubState, calls=[];let seq=0,state=0;
    const snapshot=()=>{const f=frame(++seq);f.lifecycle.nuttxProgram.state=state;return f;};
    const capabilities=Object.fromEntries(['session.start','session.close','state.read','program.packet','run','arena.inputs.write']
        .map(op=>[`renode.spike.${op}`,async args=>{
            calls.push([op,args]);
            if(op==='state.read') return JSON.stringify(snapshot());
            if(op!=='program.packet') return 'ready';
            assert.ok(hub.data.sensors.every(p=>p?.kind==='motor'),'upload must follow verified shared topology');
            const packet=args.bytes;
            if(packet[2]===2)state=1;if(packet[2]===3)state=2;if(packet[2]===4)state=4;
            const f=snapshot(),reply=new Uint8Array(20);reply.set([113,1,packet[2],state,1,0,0,0]);
            f.lifecycle.nuttxProgramReply=[...reply];return JSON.stringify(f);
        }]));
    const s=new RenodeArenaSession({bridge:b,capabilities,backend:'nuttx',topology:'six-motors',source:'pass'});
    try {
        await s.start();clearTimeout(s.timer);
        assert.equal(s.adapter.bridge.hubState,hub);assert.equal(hub.configurationOwner,s);
        assert.deepEqual(calls[0],['session.start',{backend:'nuttx',topology:'six-motors'}]);
        assert.ok(calls.filter(c=>c[0]==='arena.inputs.write').every(c=>c[1].sensors.length===0));
        assert.deepEqual(calls.filter(c=>c[0]==='program.packet').map(c=>c[1].bytes[2]),[7,1,2,3]);
        assert.ok(hub.data.motors.every(m=>m.position===hub.data.motors[0].position));
    } finally {await s.stop();}
    assert.equal(hub.configurationOwner,null);assert.equal(hub.externalBackend,null);
});
