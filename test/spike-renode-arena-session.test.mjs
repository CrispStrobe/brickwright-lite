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

test('invalid source or rows fail before a firmware session can replace native activity', () => {
    const b = bridge(); let calls = 0;
    const capabilities = {'renode.spike.session.start': async () => {calls++;}};
    for (const source of ['', 'x'.repeat(4096), 'x\0y']) {
        assert.throws(() => new RenodeArenaSession({bridge: b, capabilities, source}));
    }
    assert.throws(() => new RenodeArenaSession({bridge: b, capabilities,
        program: {version: 1, instructions: [[1, 0, 9999, 0], [0, 0, 0, 0]]}}));
    assert.equal(calls, 0); assert.equal(b.hubState.clockOwner, null);
});

test('storage-capable NuttX retains completed program, loads READY without START, and uploads current code in place', async () => {
    let seq = 0, state = 0, completes = 0, saved = false;
    const calls = [], packets = [];
    const makeFrame = () => {
        const frame = programFrame();frame.seq = ++seq;frame.clockNs = seq * 1000000;
        frame.target.firmware = 'brickwright-nuttx';frame.target.capabilities.push('nuttx-program/v1', 'nuttx-program-storage/v1');
        frame.lifecycle.nuttxProgram = {state, error: 0};return frame;
    };
    const capabilities = Object.fromEntries(['session.start','session.close','state.read','run','arena.inputs.write','program.packet'].map(op =>
        [`renode.spike.${op}`, async args => {
            calls.push(op);
            if (op === 'state.read') return JSON.stringify(makeFrame());
            if (op !== 'program.packet') return 'ready';
            const packet = args.bytes;packets.push(packet);
            if (packet[2] === 2 || packet[2] === 9) state = 1;
            if (packet[2] === 3) state = 2;
            if (packet[2] === 4) state = 4;
            if (packet[2] === 8) saved = true;
            const frame = makeFrame(), reply = new Uint8Array(20), v = new DataView(reply.buffer);
            reply.set([0x71,1,packet[2],state]);v.setUint32(4,1,true);v.setUint16(14,1,true);
            frame.lifecycle.nuttxProgramReply = [...reply];return JSON.stringify(frame);
        }]));
    const session = new RenodeArenaSession({bridge: bridge(), capabilities, backend: 'nuttx',
        program: {version:1,instructions:[[0,0,0,0]]}, onCompleted: () => completes++});
    try {
        await session.start();clearTimeout(session.timer);
        await assert.rejects(session.storage('save'), /busy/);
        state = 3;await session.poll();clearTimeout(session.timer);
        await session.poll();clearTimeout(session.timer);
        assert.equal(completes, 1);assert.equal(session.closed, false);
        await session.storage('save');clearTimeout(session.timer);assert.equal(saved, true);
        const beforeLoad = packets.length;
        await session.storage('load');clearTimeout(session.timer);
        assert.equal(session.programState, 1);assert.equal(session.loaded, true);
        assert.deepEqual(packets.slice(beforeLoad).map(p => p[2]), [9]);
        assert.equal(packets.at(-1).length, 8);
        await session.startProgram();clearTimeout(session.timer);assert.equal(state, 2);
        await session.stopProgram();clearTimeout(session.timer);assert.equal(state, 4);assert.equal(session.closed, false);
        const beforeUpload = packets.length;
        await session.uploadProgram({version:1,instructions:[[2,10,0,0],[0,0,0,0]]});clearTimeout(session.timer);
        assert.equal(session.loaded, false);assert.equal(state, 2);
        assert.deepEqual(packets.slice(beforeUpload).map(p => p[2]), [4,0,1,1,1,1,2,3]);
        assert.equal(calls.filter(op => op === 'session.start').length, 1);
        assert.equal(calls.filter(op => op === 'run').length, 1);
        assert.equal(calls.includes('session.close'), false);
    } finally { await session.stop(); }
    assert.equal(calls.filter(op => op === 'session.close').length, 1);
});

test('old NuttX package cannot invoke storage and transport errno remains available', async () => {
    const session = new RenodeArenaSession({bridge: bridge()});let calls = 0;
    session.programClient = {save: async () => {calls++;throw Object.assign(new Error('flash busy'), {result:-16});}};
    await assert.rejects(session.storage('save'), /supported live/);assert.equal(calls, 0);
    session.storageSupported = true;session.programState = 1;
    try { await assert.rejects(session.storage('save'), error => error.result === -16);assert.equal(calls, 1);assert.equal(session.storageBusy, false); }
    finally { clearTimeout(session.timer); }
});

test('uncertain deferred storage blocks new program commands; errno completion stays reusable', async () => {
    const session = new RenodeArenaSession({bridge: bridge()});
    session.storageSupported = true;session.storageDeferred = true;session.programState = 1;
    let calls = 0;
    session.programClient = {save: async () => {calls++;throw new Error('endpoint lost');}};
    await assert.rejects(session.storage('save'), /endpoint lost/);
    assert.equal(session.storageUncertain, true);assert.equal(session.timer, undefined);
    await assert.rejects(session.storage('save'), /result is unknown/);
    await assert.rejects(session.uploadProgram({version:1,instructions:[[0,0,0,0]]}), /unavailable or busy/);
    await assert.rejects(session.startProgram(), /unavailable or busy/);
    await assert.rejects(session.stopProgram(), /unavailable/);assert.equal(calls, 1);
    session.storageUncertain = false;
    session.programClient.save = async () => {throw Object.assign(new Error('flash busy'), {result: -16, reply: {op: 8}});};
    try { await assert.rejects(session.storage('save'), e => e.result === -16);assert.equal(session.storageUncertain, false); }
    finally {clearTimeout(session.timer);}
});

test('live session selects deferred submit for storage and polls without START or direct storage packets', async () => {
    let seq = 0, state = 0, metadata, lastReply, storageReads = 0;
    const calls = [];
    const makeFrame = () => {
        const frame = programFrame();frame.seq = ++seq;frame.clockNs = seq * 1000000;
        frame.target.firmware = 'brickwright-nuttx';
        frame.target.capabilities.push('nuttx-program/v1', 'nuttx-program-storage/v1', 'nuttx-program-storage-deferred/v1');
        frame.lifecycle.phase = 'ready';frame.lifecycle.generation = 1;
        frame.lifecycle.nuttxProgram = {state, error: 0};
        if (metadata) frame.lifecycle.nuttxProgramStorage = {...metadata};
        if (lastReply) frame.lifecycle.nuttxProgramReply = lastReply;
        return frame;
    };
    const reply = op => [0x71, 1, op, state, 1, 0, 0, 0, ...Array(12).fill(0)];
    const capabilities = Object.fromEntries(['session.start','session.close','state.read','run','arena.inputs.write',
        'program.packet','program.storage.submit'].map(op => [`renode.spike.${op}`, async args => {
        calls.push([op, args]);
        if (op === 'program.packet') {
            assert.ok(args.bytes[2] < 8, 'storage must not use the synchronous path');
            if (args.bytes[2] === 2) state = 1;
            if (args.bytes[2] === 3) state = 2;
            if (args.bytes[2] === 4) state = 4;
            metadata = undefined;lastReply = reply(args.bytes[2]);return JSON.stringify(makeFrame());
        }
        if (op === 'program.storage.submit') {
            const operation = args.bytes[2];
            metadata = {requestSeq: operation === 8 ? 12 : 14, replySeq: operation === 8 ? 10 : 12,
                operation, programId: 1, pending: true};storageReads = 0;
            return JSON.stringify(makeFrame()); // lastReply remains the old START response
        }
        if (op === 'state.read') {
            if (metadata && ++storageReads === 2) {
                metadata.pending = false;metadata.replySeq = metadata.requestSeq;
                if (metadata.operation === 9) state = 1;
                lastReply = reply(metadata.operation);
            }
            return JSON.stringify(makeFrame());
        }
        return 'ready';
    }]));
    const session = new RenodeArenaSession({bridge: bridge(), capabilities, backend: 'nuttx',
        program: {version:1,instructions:[[0,0,0,0]]}});
    try {
        await session.start();clearTimeout(session.timer);
        state = 3;session.observeProgram({state});
        const before = calls.length;
        await session.storage('save');clearTimeout(session.timer);
        assert.equal(session.latestFrame.lifecycle.nuttxProgramStorage.requestSeq, 12);
        assert.equal(session.latestFrame.lifecycle.nuttxProgramStorage.pending, false);
        await session.storage('load');clearTimeout(session.timer);
        assert.equal(session.latestFrame.lifecycle.nuttxProgramStorage.requestSeq, 14);
        assert.equal(session.loaded, true);assert.equal(session.programState, 1);
        assert.deepEqual(calls.slice(before).map(c => c[0]), ['program.storage.submit', 'state.read', 'state.read',
            'program.storage.submit', 'state.read', 'state.read']);
        assert.equal(session.closed, false);
    } finally {await session.stop();}
});

test('Run loaded program requires READY; leaving READY clears loaded intent', async () => {
    const session = new RenodeArenaSession({bridge: bridge()});let starts = 0;
    session.storageSupported = true;session.programClient = {start: async () => {starts++;return {state:2};}};
    for (const state of [0, 2, 3, 4, 5]) {
        session.loaded = true;session.observeProgram({state});
        assert.equal(session.loaded, false);
        await assert.rejects(session.startProgram(), /Load the saved program to READY/);
    }
    assert.equal(starts, 0);
    session.loaded = true;session.observeProgram({state:1});
    try {await session.startProgram();assert.equal(starts, 1);assert.equal(session.loaded, false);}
    finally {clearTimeout(session.timer);}
});

const microFrame = (seq = 1, position = 0) => {
    const f = programFrame();f.seq = seq;f.clockNs = (seq - 1) * 100000000;
    f.target.firmware = 'micropython-prime';
    f.target.capabilities = f.target.capabilities.filter(cap => cap !== 'arena-program/v1');
    f.target.capabilities.push('micropython-uart/v1');
    f.lifecycle.micropythonUart = {generation: 1, state: 'ready'};
    f.motors[0].position = -position;f.motors[1].position = position;
    return f;
};
const microCaps = ({read, write, frame = microFrame(), calls = []} = {}) => ({
    ...Object.fromEntries(['session.start', 'session.close', 'run', 'arena.inputs.write'].map(op =>
        [`renode.spike.${op}`, async args => {calls.push([op, args]);return 'ready';}])),
    'renode.spike.state.read': async () => JSON.stringify(frame),
    ...(read ? {'renode.spike.micropython.uart.read': read} : {}),
    ...(write ? {'renode.spike.micropython.uart.write': write} : {})
});
const uartBytes = text => [...new TextEncoder().encode(text)];
test('explicit MicroPython validates source and startup contract before clock takeover', async () => {
    const b = bridge();let calls = 0;
    for (const args of [{source: null}, {source: 'x\0y'}, {source: 'x'.repeat(16385)},
        {source: 'print(1)', program: {version:1,instructions:[[0,0,0,0]]}}, {source: 'print(1)', topology:'six-motors'}]) {
        assert.throws(() => new RenodeArenaSession({bridge:b, backend:'micropython', ...args,
            capabilities:{'renode.spike.session.start':async()=>calls++}}));
    }
    assert.equal(calls, 0);
    for (const mutate of [f => f.target.capabilities.pop(), f => {f.lifecycle.micropythonUart.generation = 0;},
        f => {f.target.firmware = 'brickwright-nuttx';}, f => {f.target.transport = 'usb';},
        f => {f.target.imageSha256 = 'bad';}, f => {f.target.capabilities.splice(0, 1);}, f => {f.target.capabilities = 'micropython-uart/v1';}]) {
        const f = microFrame();mutate(f);const ops = [];
        const session = new RenodeArenaSession({bridge:b, backend:'micropython', source:'print(1)', capabilities:microCaps({frame:f,calls:ops})});
        await assert.rejects(session.start());assert.equal(b.hubState.clockOwner, null);
        assert.equal(ops.filter(([op]) => op === 'session.close').length, 1);
        assert.equal(ops.some(([op]) => op === 'run'), false);
    }
    // The 4 KiB NuttX limit does not constrain the explicit raw REPL backend.
    new RenodeArenaSession({bridge:b, backend:'micropython', source:'x'.repeat(4096)});
});
test('MicroPython executes asynchronously while production arena frames move the shared world', async () => {
    const b = bridge(), calls = [], output = [];let complete = 0, deliver;
    const f = microFrame();let readCount = 0;
    const caps = microCaps({frame:f,calls,
        write:async args => {assert.equal(args.generation, 1);assert.ok(args.bytes.length <= 32);return {generation:1,count:args.bytes.length};},
        read:async args => {
            assert.deepEqual(args,{generation:1,maxBytes:4096});
            if (++readCount === 1) return {generation:1,bytes:[]};
            if (readCount === 2) return {generation:1,bytes:uartBytes('raw REPL; CTRL-B to exit\r\n>')};
            return new Promise(resolve => {deliver = resolve;});
        }});
    const session = new RenodeArenaSession({bridge:b,capabilities:caps,backend:'micropython',source:'print("hello")',
        onOutput:value=>output.push(value),onCompleted:()=>complete++});
    await session.start();clearTimeout(session.timer);
    while (!deliver) await new Promise(resolve=>setTimeout(resolve,0));
    const x = b.sim.pose.x;Object.assign(f,microFrame(2,90));await session.poll();clearTimeout(session.timer);
    assert.ok(b.sim.pose.x > x);assert.equal(b.sim.timeMs,100);assert.equal(b.hubState.externalBackend,session);
    deliver({generation:1,bytes:uartBytes('OKhello\n\x04\x04>')});await session.completion;
    assert.deepEqual(output,[{sequence:1,text:'hello\n',truncated:false,stdout:'hello\n',stderr:''}]);assert.equal(complete,1);
    assert.equal(calls.filter(([op])=>op==='session.close').length,1);assert.equal(b.hubState.clockOwner,null);
});
test('MicroPython cancellation aborts a pending read and ignores late completion', async () => {
    const calls = [];let deliver, outputs = 0, completes = 0;
    const session = new RenodeArenaSession({bridge:bridge(),backend:'micropython',source:'while True: pass',
        capabilities:microCaps({calls,write:async args=>({generation:1,count:args.bytes.length}),
            read:async()=>new Promise(resolve=>{deliver=resolve;})}),
        onOutput:()=>outputs++,onCompleted:()=>completes++});
    await session.start();while (!deliver) await new Promise(resolve=>setTimeout(resolve,0));
    await session.stop();await session.execution;
    deliver({generation:1,bytes:uartBytes('OKlate\x04\x04>')});await Promise.resolve();
    assert.equal(outputs,0);assert.equal(completes,0);assert.equal(calls.filter(([op])=>op==='session.close').length,1);
    assert.equal(session.adapter.bridge.hubState.externalBackend,null);
});
test('missing native MicroPython operations fail closed only for the owned session', async () => {
    for (const write of [undefined, async args=>({generation:1,count:args.bytes.length})]) {
        const calls = [], errors = [];
        const session = new RenodeArenaSession({bridge:bridge(),backend:'micropython',source:'print(1)',
            capabilities:microCaps({calls,write}),onError:error=>errors.push(error)});
        await session.start();await session.completion;
        assert.equal(errors.length,1);assert.match(errors[0].message,/unavailable/);
        assert.equal(calls.filter(([op])=>op==='session.close').length,1);
        assert.equal(session.adapter.bridge.hubState.clockOwner,null);
    }
});
test('MicroPython rejects malformed native UART replies and reports Python failure', async () => {
    for (const bad of [{generation:2,bytes:[1]}, {generation:1,bytes:[]}, {generation:1,bytes:[256]},
        {generation:1,eof:true}, {generation:1,timeout:true,bytes:[1]}, 'monitor text']) {
        const errors = [], calls = [];
        const session = new RenodeArenaSession({bridge:bridge(),backend:'micropython',source:'print(1)',
            capabilities:microCaps({calls,write:async args=>({generation:1,count:args.bytes.length}),read:async()=>bad}),
            onError:error=>errors.push(error)});
        await session.start();await session.completion;
        assert.equal(errors.length,1);assert.equal(calls.filter(([op])=>op==='session.close').length,1);
    }
    const output = [], errors = [], reads = [uartBytes('raw REPL; CTRL-B to exit\r\n>'),uartBytes('OK\x04ValueError\n\x04>')];
    let complete = 0;
    const session = new RenodeArenaSession({bridge:bridge(),backend:'micropython',source:'raise ValueError',
        capabilities:microCaps({write:async args=>({generation:1,count:args.bytes.length}),read:async()=>({generation:1,bytes:reads.shift()})}),
        onOutput:value=>output.push(value),onError:error=>errors.push(error),onCompleted:()=>complete++});
    await session.start();await session.completion;
    assert.deepEqual(output,[{sequence:1,text:'ValueError\n',truncated:false,stdout:'',stderr:'ValueError\n'}]);assert.match(errors[0].message,/MicroPython program failed/);
    assert.equal(complete,0);assert.equal(session.closed,true);
});

test('MicroPython awaits host-paced writes, rejects malformed counts, and aborts pending writes', async () => {
    for (const reply of [{generation:2,count:4},{generation:1,count:3},{generation:1,count:4,extra:true}]) {
        const calls = [], errors = [];
        const session = new RenodeArenaSession({bridge:bridge(),backend:'micropython',source:'print(1)',
            capabilities:microCaps({calls,write:async()=>reply}),onError:error=>errors.push(error)});
        await session.start();await session.completion;
        assert.match(errors[0].message,/write reply/);assert.equal(calls.filter(([op])=>op==='session.close').length,1);
    }
    const calls = [];let finishWrite, reads = 0;
    const session = new RenodeArenaSession({bridge:bridge(),backend:'micropython',source:'print(1)',
        capabilities:microCaps({calls,write:async()=>new Promise(resolve=>{finishWrite=resolve;}),
            read:async()=>{reads++;throw new Error('premature read');}})});
    await session.start();while (!finishWrite) await new Promise(resolve=>setTimeout(resolve,0));
    assert.equal(reads,0);await session.stop();await session.execution;
    finishWrite({generation:1,count:4});await Promise.resolve();assert.equal(reads,0);
    assert.equal(calls.filter(([op])=>op==='session.close').length,1);
});

test('MicroPython common GUI output truncates text while retaining complete raw stdout and stderr', async () => {
    const stdout = 'x'.repeat(1100), output = [], reads = [
        uartBytes('raw REPL; CTRL-B to exit\r\n>'),uartBytes(`OK${stdout}\x04\x04>`)];
    const session = new RenodeArenaSession({bridge:bridge(),backend:'micropython',source:'print("x")',
        capabilities:microCaps({write:async args=>({generation:1,count:args.bytes.length}),
            read:async()=>({generation:1,bytes:reads.shift()})}),onOutput:value=>output.push(value)});
    await session.start();await session.completion;
    assert.deepEqual(output,[{sequence:1,text:'x'.repeat(1024),truncated:true,stdout,stderr:''}]);
});
test('immediate native UART timeout replies yield to timer cancellation', async () => {
    const calls = [];let reads = 0;
    const session = new RenodeArenaSession({bridge:bridge(),backend:'micropython',source:'print(1)',
        capabilities:microCaps({calls,write:async args=>({generation:1,count:args.bytes.length}),
            read:async()=>{reads++;return {generation:1,bytes:[]};}})});
    await session.start();
    await new Promise((resolve,reject)=>setTimeout(()=>session.stop().then(resolve,reject),5));
    await session.execution;assert.ok(reads > 0);
    assert.equal(calls.filter(([op])=>op==='session.close').length,1);
    assert.equal(session.adapter.bridge.hubState.clockOwner,null);
});

test('MicroPython decodes bounded desktop broker JSON results before typed validation', async () => {
    const output = [], reads = [uartBytes('raw REPL; CTRL-B to exit\r\n>'), uartBytes('OK42\r\n\x04\x04>')];
    const session = new RenodeArenaSession({bridge:bridge(),backend:'micropython',source:'print(42)',
        capabilities:microCaps({write:async args=>JSON.stringify({generation:1,count:args.bytes.length}),
            read:async()=>JSON.stringify({generation:1,bytes:reads.shift()})}),onOutput:value=>output.push(value)});
    await session.start();await session.completion;
    assert.equal(output[0].text,'42\r\n');
    for (const malformed of ['{',' '.repeat(32769)]) {
        const errors = [], calls = [];
        const bad = new RenodeArenaSession({bridge:bridge(),backend:'micropython',source:'pass',
            capabilities:microCaps({calls,write:async()=>malformed}),onError:error=>errors.push(error)});
        await bad.start();await bad.completion;
        assert.equal(errors.length,1);assert.equal(calls.filter(([op])=>op==='session.close').length,1);
    }
});

test('native UART envelope binds the admitted image and fresh UART generation', () => {
    const session = new RenodeArenaSession({bridge: bridge(), backend: 'micropython', source: 'print(42)'});
    session.latestFrame = microFrame();
    const reply = {snapshot: microFrame(), data: {generation: 1, bytes: [79, 75]}};
    assert.deepEqual(session.uartData(reply), reply.data);
    for (const mutation of [frame => {frame.target.imageSha256 = 'b'.repeat(64);},
        frame => {frame.lifecycle.micropythonUart.generation = 2;},
        frame => {frame.target.firmware = 'brickwright-nuttx';}]) {
        const snapshot = microFrame(); mutation(snapshot);
        assert.throws(() => session.uartData({snapshot, data: reply.data}), /identity changed/);
    }
});
