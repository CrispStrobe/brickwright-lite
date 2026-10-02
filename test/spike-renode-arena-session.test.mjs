// SPDX-License-Identifier: BSD-3-Clause
// Copyright (c) 2026 Brickwright contributors
import {test} from 'node:test';
import assert from 'node:assert/strict';
import Hub from '../overlay/scratch-gui/src/lib/virtual-hub/spike-hub-state.js';
import {ArenaHubBridge} from '../overlay/scratch-gui/src/lib/spike-arena/arena-hub-bridge.js';
import {RenodeArenaSession} from '../overlay/scratch-gui/src/lib/spike-arena/renode-arena-session.js';
import {sandboxWorld} from '../overlay/scratch-gui/src/lib/spike-arena/arena-sandbox.js';
const bridge = () => new ArenaHubBridge({hubState: new Hub(), world: sandboxWorld()});
test('cancel during startup closes only the session we started and never runs it', async () => {
    const calls = []; let release;
    const capabilities = Object.fromEntries(['session.start', 'session.close', 'run', 'state.read'].map(operation =>
        [`renode.spike.${operation}`, async () => {calls.push(operation);
            if (operation === 'session.start') await new Promise(resolve => {release = resolve;});
            return 'ready';}]));
    const session = new RenodeArenaSession({bridge: bridge(), capabilities});
    const starting = session.start(); const stopping = session.stop(); release();
    await Promise.all([starting, stopping]);
    assert.deepEqual(calls, ['session.start', 'session.close']);
    assert.equal(session.adapter.bridge.hubState.clockOwner, null);
});
test('failed startup does not close somebody else’s running debugger session', async () => {
    let closes = 0;
    const session = new RenodeArenaSession({bridge: bridge(), capabilities: {
        'renode.spike.session.start': async () => {throw new Error('already started');},
        'renode.spike.session.close': async () => {closes++;}
    }});
    await assert.rejects(session.start(), /already started/);
    assert.equal(closes, 0);
});
test('missing desktop boundary refuses before owning simulated time', async () => {
    const b = bridge(); const session = new RenodeArenaSession({bridge: b});
    await assert.rejects(session.start(), /unavailable/);
    assert.equal(b.hubState.clockOwner, null);
});
test('hub Stop cancels the externally owned guest and clears its ownership after close', async () => {
    const b = bridge(); let stops = 0;
    const frame = {schemaVersion: 1, type: 'snapshot', seq: 1, clockNs: 1000000,
        target: {board: 'spike-prime', firmware: 'brickwright-arena-demo', transport: 'none', imageSha256: 'a'.repeat(64),
            capabilities: ['arena-inputs/v1', 'arena-clock/v1', 'guest-motor-output/v1', 'state-sample/v1']}, lifecycle: {connectionGeneration: 1},
        ports: [{id: 'C', attached: true, kind: 'color'}, {id: 'D', attached: true, kind: 'distance'}, {id: 'E', attached: true, kind: 'force'}],
        motors: [{port: 'A', position: 0, speedDps: -2, demandDirection: -1, stalled: false},
            {port: 'B', position: 0, speedDps: 2, demandDirection: 1, stalled: false}]};
    const capabilities = Object.fromEntries(['session.start', 'session.close', 'run', 'state.read', 'arena.inputs.write'].map(operation =>
        [`renode.spike.${operation}`, async () => operation === 'state.read' ? JSON.stringify(frame) : 'ready']));
    const session = new RenodeArenaSession({bridge: b, capabilities, onStopped: () => {stops++;}});
    await session.start(); assert.equal(b.hubState.externalBackend, session);
    b.hubState.stopAll(); await session.completion;
    assert.equal(stops, 1); assert.equal(b.hubState.externalBackend, null); assert.equal(b.hubState.clockOwner, null);
});

const programFrame = (status = 0) => ({schemaVersion:1,type:'snapshot',seq:1,clockNs:0,
    target:{board:'spike-prime',firmware:'brickwright-arena-demo',transport:'none',imageSha256:'a'.repeat(64),
        capabilities:['arena-inputs/v1','arena-clock/v1','guest-motor-output/v1','state-sample/v1','arena-program/v1']},
    lifecycle:{connectionGeneration:1,arenaProgram:{status,pc:0,error:0}},
    ports:[{id:'C',attached:true,kind:'color'},{id:'D',attached:true,kind:'distance'},{id:'E',attached:true,kind:'force'}],
    motors:['A','B'].map(port=>({port,position:0,speedDps:0,demandDirection:0,stalled:false}))});
test('program load precedes run and legacy package refuses without demo fallback', async () => {
    for (const modern of [true,false]) {
        const calls=[];const frame=programFrame(); if(!modern) frame.target.capabilities.pop();
        const caps=Object.fromEntries(['session.start','session.close','run','state.read','arena.inputs.write','arena.program.load'].map(op=>
            [`renode.spike.${op}`,async args=>{calls.push([op,args]);return op==='state.read'?JSON.stringify(frame):'ready';}]));
        const program={version:1,instructions:[[0,0,0,0]]};
        const session=new RenodeArenaSession({bridge:bridge(),capabilities:caps,program});
        if(modern) {await session.start();await session.stop();assert.deepEqual(calls.map(c=>c[0]),['session.start','state.read','arena.program.load','arena.inputs.write','run','session.close']);assert.deepEqual(calls[2][1],program);}
        else {await assert.rejects(session.start(),/demo only/);assert.deepEqual(calls.map(c=>c[0]),['session.start','state.read','session.close']);}
    }
});
test('guest completion closes owned runtime without a poll/stop deadlock', async () => {
    let seq=0, closes=0, complete=0;
    const caps=Object.fromEntries(['session.start','session.close','run','state.read','arena.inputs.write','arena.program.load'].map(op=>
        [`renode.spike.${op}`,async()=>{if(op==='session.close') closes++; if(op!=='state.read')return 'ready';
            const frame=programFrame(seq?2:0);frame.seq=++seq;frame.clockNs=(seq-1)*1000000;return JSON.stringify(frame);}]));
    const session=new RenodeArenaSession({bridge:bridge(),capabilities:caps,program:{version:1,instructions:[[0,0,0,0]]},onCompleted:()=>complete++});
    await session.start();await session.poll();await new Promise(resolve=>setTimeout(resolve,0));await session.completion;
    assert.equal(complete,1);assert.equal(closes,1);assert.equal(session.adapter.bridge.hubState.externalBackend,null);
});
test('raw embedded Python cannot run in the small simulation guest', async () => {
    const calls=[];
    const caps=Object.fromEntries(['session.start','session.close','state.read','run'].map(op=>
        [`renode.spike.${op}`,async()=>{calls.push(op);return op==='state.read'?JSON.stringify(programFrame()):'ready';}]));
    const session=new RenodeArenaSession({bridge:bridge(),capabilities:caps,source:'print(1)\n'});
    await assert.rejects(session.start(),/full NuttX package/);
    assert.deepEqual(calls,['session.start','state.read','session.close']);
});
test('NuttX STOP failure still closes its owned runtime', async () => {
    let closed=0;
    const session=new RenodeArenaSession({bridge:bridge(),capabilities:{'renode.spike.session.close':async()=>closed++}});
    session.started=true;
    session.programClient={stop:async()=>{throw new Error('packet link failed');}};
    await assert.rejects(session.stop(),/packet link failed/);
    assert.equal(closed,1);
    assert.equal(session.adapter.bridge.hubState.clockOwner,null);
});
test('refused firmware startup preserves a running native motor', async () => {
    const b=bridge();b.hubState.setSimulationEnabled(true);
    b.hubState.backend.runAtSpeed('A',300);b.hubState.stepMotors(50);
    const before=structuredClone(b.hubState.data.motors[0]);
    const caps={'renode.spike.session.start':async()=>{},'renode.spike.session.close':async()=>{},
        'renode.spike.state.read':async()=>JSON.stringify(programFrame())};
    const session=new RenodeArenaSession({bridge:b,capabilities:caps,source:'print(1)\n'});
    await assert.rejects(session.start(),/full NuttX/);
    assert.deepEqual(b.hubState.data.motors[0],before);
});
