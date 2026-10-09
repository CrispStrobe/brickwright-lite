// SPDX-License-Identifier: BSD-3-Clause
// Copyright (c) 2026 Brickwright contributors
import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {createRequire} from 'node:module';
import {spawnSync} from 'node:child_process';
import {installProofTransport, dualUltrasonicPython} from '../scripts/lib/spike-nuttx-browser-proof.mjs';
const {createNativeRenodeCapabilities} = createRequire(import.meta.url)('../overlay/scratch-vm/src/extension-support/native-renode-capability.js');
function transport () {
    const calls = [], window = {};
    vm.runInNewContext(`(${installProofTransport.toString()})(['state.read'])`, {window,
        fetch: async (url, options) => {
            assert.equal(url, '/__arena_proof');
            calls.push(JSON.parse(options.body));
            return {json: async () => ({result: {seq: calls.length}})};
        }});
    return {invoke: window.__TAURI_INTERNALS__.invoke, calls};
}
test('actual GUI clients keep independent sequences across another client open and 512-request renewal', async () => {
    const {invoke, calls} = transport();
    const first = createNativeRenodeCapabilities({invoke}), second = createNativeRenodeCapabilities({invoke});
    const state = 'renode.spike.state.read';
    await first[state]({});
    await second[state]({});
    for (let i=0;i<513;i++) await first[state]({});
    await second[state]({});
    assert.equal(calls.length, 516);
    assert.ok(calls.every(c => c.operation === 'state.read'));
});
test('test transport refuses replay, foreign leases, unsupported operations and retired lease reuse', async () => {
    const {invoke, calls} = transport();
    const session = await invoke('native_broker_open');
    const payload = JSON.stringify({kind:'capability',operation:'renode.spike.state.read',args:{}});
    await invoke('native_broker_request',{session,requestId:0,payload});
    for (const args of [{session,requestId:0,payload},{session:'foreign',requestId:0,payload},
        {session,requestId:1,payload:JSON.stringify({kind:'capability',operation:'renode.spike.memory.read',args:{}})}]) {
        await assert.rejects(invoke('native_broker_request',args));
    }
    await invoke('native_broker_request',{session,requestId:1,payload});
    await invoke('native_broker_main_teardown',{session});
    await assert.rejects(invoke('native_broker_request',{session,requestId:2,payload}));
    await assert.rejects(invoke('native_broker_main_teardown',{session}));
    assert.equal(calls.length,2);
});
test('generated Python waits for the expected delayed sensor pair and still refuses a persistent wrong pair', () => {
    const source=dualUltrasonicPython(61,1410);
    const control=`import sys, types
b=types.ModuleType('brickwright')
b.E=4; b.F=5
waits=[]
b.sleep_ms=lambda n: waits.append(n)
b.sensor=lambda kind,port: (61 if port==4 else 1410) if waits else 1000
sys.modules['brickwright']=b
exec(${JSON.stringify(source)})
assert waits == [20]
`;
    // Host CPython executes only this synthetic user-program fixture, not firmware or packaged Runtime.
    // Missing Python fails this control; real guest qualification checks the embedded module separately.
    // gate-shapes-allow
    const ok=spawnSync('python3',['-c',control],{encoding:'utf8'});
    assert.equal(ok.status,0,ok.stderr);assert.match(ok.stdout,/BROWSER DUAL ARM 61 1410/);
    // Same explicit host-only fixture prerequisite; this negative run must report OSError 74.
    // gate-shapes-allow
    const bad=spawnSync('python3',['-c',control.replace('if waits else 1000','if False else 1000')],{encoding:'utf8'});
    assert.notEqual(bad.status,0);assert.match(bad.stderr,/OSError: 74/);
});
