/**
 * The page's half of the worker, tested against the worker's REAL protocol.
 *
 * The fake worker here is a transport, not a stand-in for the logic: it routes
 * postMessage straight into worker-protocol.js's handleMessage and posts what
 * comes back. So these exercise both halves together — ids, promises, progress
 * and refusals — on a runtime that has neither a Worker nor a Yosys that can
 * load (§8e: Node 20 fails at `noexternref`).
 *
 * What is NOT claimed: that a real Worker behaves like this fake one. That is
 * yosys-worker.js, fifteen lines of glue, which no build compiles and this
 * cannot reach. The split is deliberate and is the same one bw-synth made.
 */
import {test} from 'node:test';
import assert from 'node:assert/strict';

import {createLocalClient} from '../overlay/scratch-gui/src/lib/bw-fpga/local-client.js';
import {handleMessage} from '../overlay/scratch-gui/src/lib/bw-fpga/worker-protocol.js';

const CAPABLE = {wasm: true, controlPassed: true, wasmGC: true, exceptions: true,
    canRunLocalToolchain: true, missing: []};
const NO_GC = {wasm: true, controlPassed: true, wasmGC: false, exceptions: true,
    canRunLocalToolchain: false, missing: ['WasmGC']};

/** A worker-shaped object that runs the real protocol in this thread. */
const fakeWorker = ({capabilities = CAPABLE, chunks = 0, yosys = null} = {}) => {
    const calls = [];
    const runYosys = yosys || (async (args, files, options) => {
        calls.push({args, files});
        for (let i = 1; i <= chunks; i++) {
            options?.fetchProgress?.({totalLength: chunks, doneLength: i});
        }
        return {'design.json': '{"modules":{"blink":{}}}'};
    });
    const session = {toolchain: null};
    const w = {
        terminated: false,
        onmessage: null,
        onerror: null,
        postMessage (msg) {
            // Asynchronous on purpose: a synchronous reply would hide an
            // ordering bug that a real Worker would expose.
            Promise.resolve().then(async () => {
                const out = await handleMessage(msg, session, {
                    runYosys, capabilities,
                    postProgress: m => w.onmessage && w.onmessage({data: m})
                });
                if (out && w.onmessage) w.onmessage({data: out});
            });
        },
        terminate () { w.terminated = true; }
    };
    w.calls = calls;
    return w;
};

test('a reply settles its OWN request, and state messages settle nothing', async () => {
    const seen = [];
    let w;
    const client = createLocalClient({
        spawn: () => (w = fakeWorker({chunks: 3})),
        onState: m => seen.push(`${m.state.state}:${m.state.progress}`)});
    await client.init();
    const r = await client.download({consent: true});
    assert.equal(r.type, 'download');
    assert.equal(r.result.ok, true, 'the promise resolved with the REPLY, not with progress');
    assert.deepEqual(seen, ['downloading:null', 'downloading:33',
        'downloading:66', 'downloading:100', 'ready:undefined']);
    assert.equal(client.outstanding, 0, 'a settled request must not stay in the map');
});

test('concurrent requests resolve to their own answers, never each other', async () => {
    const client = createLocalClient({spawn: () => fakeWorker()});
    await client.init();
    await client.download({consent: true});
    const [a, b] = await Promise.all([
        client.synthesise({files: [{name: 'a.v', source: 'module a; endmodule'}], top: 'a'}),
        client.describe()]);
    assert.equal(a.type, 'synthesise');
    assert.equal(a.result.top, 'a');
    assert.equal(b.type, 'state');
    assert.equal(b.state.state, 'ready');
});

test('a worker that dies settles EVERY outstanding promise by name', async () => {
    let w;
    const client = createLocalClient({spawn: () => (w = fakeWorker())});
    const never = {postMessage () {}, terminate () {}};
    // A worker that accepts messages and answers nothing is the shape that
    // hangs a UI forever; onerror has to be the way out.
    const hung = createLocalClient({spawn: () => never});
    const p1 = hung.describe();
    const p2 = hung.describe();
    assert.equal(hung.outstanding, 2);
    never.onerror({message: 'out of memory'});
    for (const p of [p1, p2]) {
        const r = await p;
        assert.equal(r.code, 'worker-gone');
        assert.match(r.reason, /out of memory/);
    }
    assert.equal(hung.outstanding, 0);
    assert.ok(client && w === undefined);
});

test('terminate() refuses what is outstanding instead of abandoning it', async () => {
    const never = {postMessage () {}, terminate () { never.stopped = true; }};
    const client = createLocalClient({spawn: () => never});
    const p = client.describe();
    client.terminate();
    const r = await p;
    assert.equal(r.code, 'worker-gone');
    assert.equal(never.stopped, true);
});

test('consent crosses the boundary as a real boolean, never as truthiness', async () => {
    let w;
    const client = createLocalClient({spawn: () => (w = fakeWorker())});
    await client.init();
    const r = await client.download({consent: 'yes'});
    assert.equal(r.result.code, 'download-not-consented',
        'a string that looks like agreement is not agreement');
    assert.equal(w.calls.length, 0, 'and nothing was fetched');
});

test('an incapable browser is refused through the worker too, with the feature named',
    async () => {
        let w;
        const client = createLocalClient({spawn: () => (w = fakeWorker({capabilities: NO_GC}))});
        const ready = await client.init();
        assert.equal(ready.state.available, false);
        assert.equal(ready.state.code, 'wasm-features-missing');
        const d = await client.download({consent: true});
        assert.equal(d.result.code, 'wasm-features-missing');
        assert.equal(w.calls.length, 0);
    });

test('ids are never reused, so a late reply cannot settle a newer promise', async () => {
    const sent = [];
    const spy = {
        postMessage (m) { sent.push(m.id); },
        terminate () {}
    };
    const client = createLocalClient({spawn: () => spy});
    client.describe(); client.describe(); client.describe();
    assert.deepEqual(sent, [1, 2, 3]);
    assert.equal(new Set(sent).size, sent.length);
});

test('a reply and an unsolicited update never share a type', async () => {
    // The defect this file found: `describe` replied with type 'state', which is
    // exactly what progress used, so the client's ignore-unsolicited branch ate
    // the reply and the promise never settled. Asserted as a PROPERTY rather
    // than as "progress is called progress", because the next person to add a
    // push message will reach for a name, not for this story.
    const replies = new Set();
    const pushes = new Set();
    const w = fakeWorker({chunks: 1});
    const client = createLocalClient({spawn: () => w, onState: m => pushes.add(m.type)});
    await client.init();
    for (const r of [await client.describe(), await client.download({consent: true}),
        await client.synthesise({files: [{name: 'a.v', source: 'module a; endmodule'}]})]) {
        replies.add(r.type);
    }
    assert.ok(pushes.size > 0, 'nothing was pushed, so this proves nothing');
    for (const t of pushes) {
        assert.equal(replies.has(t), false,
            `"${t}" is used for both an answer and an unsolicited update; a client that `
            + 'ignores unsolicited messages by type will swallow the answer');
    }
});
