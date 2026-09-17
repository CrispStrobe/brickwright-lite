/**
 * TN6a: the decisions that happen BEFORE 78 MB moves, and what happens after.
 *
 * The order is the design — capability, then consent, then downloaded-ness — and
 * each step is a named refusal rather than a false, so a user is told what to do
 * next instead of "unavailable". These tests are mostly about the refusals,
 * because the refusal paths are what the audience this tier exists for actually
 * sees: §8e measured that Node 20 cannot load @yowasp/yosys at all, and school
 * Chromebooks are exactly the population most likely to be on a browser that
 * cannot either.
 *
 * THE ENGINE IS A STUB, and that is not a compromise. This box CANNOT run the
 * real Yosys (`invalid value type 'noexternref'`), so a module that imported it
 * would have its refusal paths exercised by nobody. The real engine is proven
 * separately and end to end by scripts/probe-browser-fpga-chain.mjs, which is
 * where "does Yosys work" belongs; what belongs here is "does this module ask
 * the right questions in the right order".
 */
import {test} from 'node:test';
import assert from 'node:assert/strict';

import {createLocalToolchain, bitstreamRefusal, YOSYS_DOWNLOAD_BYTES}
    from '../overlay/scratch-gui/src/lib/bw-fpga/local-toolchain.js';

const CAPABLE = {wasm: true, controlPassed: true, wasmGC: true, exceptions: true,
    canRunLocalToolchain: true, missing: []};
const NO_GC = {wasm: true, controlPassed: true, wasmGC: false, exceptions: true,
    canRunLocalToolchain: false, missing: ['WasmGC']};

/** A Yosys that records what it was asked and answers with a netlist. */
const stubYosys = ({netlist = {modules: {blink: {ports: {}, cells: {}}}},
    fail = null, chunks = 0} = {}) => {
    const calls = [];
    const run = async (args, files, options) => {
        calls.push({args, files});
        // Exact quarters, because flooring a byte count is how 25% renders as
        // 24% — that is the stub's arithmetic, and it took a red test to see it
        // was the stub's and not the module's.
        for (let i = 1; i <= chunks; i++) {
            options?.fetchProgress?.(
                {totalLength: chunks, doneLength: i});
        }
        if (fail) throw new Error(fail);
        return {'design.json': JSON.stringify(netlist)};
    };
    run.calls = calls;
    return run;
};

// ── capability comes first, before anything is fetched ──────────

test('an incapable browser is refused BY FEATURE, and nothing is fetched', async () => {
    const runYosys = stubYosys();
    const tc = createLocalToolchain({runYosys, capabilities: NO_GC});
    assert.equal(tc.state, 'unsupported');

    const d = await tc.download({consent: true});
    assert.equal(d.ok, false);
    assert.equal(d.code, 'wasm-features-missing');
    assert.match(d.reason, /WasmGC/, 'naming the feature is the point; "unsupported" is not');
    assert.equal(runYosys.calls.length, 0,
        'consent must not override capability — 78 MB that cannot start is the worst outcome');
});

test('describe() on an incapable browser carries the refusal, not an empty state', () => {
    const tc = createLocalToolchain({runYosys: stubYosys(), capabilities: NO_GC});
    const d = tc.describe();
    assert.equal(d.available, false);
    assert.equal(d.code, 'wasm-features-missing');
});

// ── then consent ────────────────────────────────────────────────

test('without consent nothing is downloaded, and the refusal says how big it is', async () => {
    const runYosys = stubYosys();
    const tc = createLocalToolchain({runYosys, capabilities: CAPABLE});
    const d = await tc.download();
    assert.equal(d.code, 'download-not-consented');
    assert.equal(d.bytes, YOSYS_DOWNLOAD_BYTES);
    assert.match(d.reason, /77 MB/);
    assert.equal(runYosys.calls.length, 0, 'a default-true consent is a default nobody chose');
    assert.equal(tc.state, 'not-downloaded');
});

test('two clicks do not mean two downloads', async () => {
    const runYosys = stubYosys({chunks: 2});
    const tc = createLocalToolchain({runYosys, capabilities: CAPABLE});
    const [a, b] = await Promise.all([
        tc.download({consent: true}), tc.download({consent: true})]);
    assert.equal(a.ok, true);
    assert.equal(b.ok, true);
    assert.equal(runYosys.calls.length, 1, 'concurrent callers must share the one fetch');
});

test('progress is reported as it arrives, not only at the end', async () => {
    const seen = [];
    const tc = createLocalToolchain({
        runYosys: stubYosys({chunks: 4}), capabilities: CAPABLE,
        onState: s => seen.push(`${s.state}:${s.progress}`)});
    await tc.download({consent: true});
    assert.deepEqual(seen, [
        'downloading:null', 'downloading:25', 'downloading:50',
        'downloading:75', 'downloading:100', 'ready:100']);
});

test('a failed download is named, leaves no false ready, and can be retried', async () => {
    let attempt = 0;
    const runYosys = async (...a) => {
        attempt += 1;
        if (attempt === 1) throw new Error('network went away');
        return {'design.json': '{"modules":{}}'};
    };
    const tc = createLocalToolchain({runYosys, capabilities: CAPABLE});
    const first = await tc.download({consent: true});
    assert.equal(first.code, 'download-failed');
    assert.match(first.reason, /network went away/);
    assert.equal(tc.state, 'failed');
    assert.equal(tc.describe().available, false);

    const second = await tc.download({consent: true});
    assert.equal(second.ok, true, 'a failure must not be a permanent state');
    assert.equal(tc.state, 'ready');
});

// ── then downloaded-ness ────────────────────────────────────────

test('synthesise before the download REFUSES rather than fetching 78 MB quietly', async () => {
    const runYosys = stubYosys();
    const tc = createLocalToolchain({runYosys, capabilities: CAPABLE});
    const r = await tc.synthesise({files: [{name: 'a.v', source: 'module a; endmodule'}]});
    assert.equal(r.code, 'not-downloaded');
    assert.match(r.reason, /Nothing was fetched/);
    assert.equal(runYosys.calls.length, 0,
        'moving the surprise download one function over does not make it less of one');
});

test('it synthesises to a netlist and asks Yosys for the Gowin flow by name', async () => {
    const runYosys = stubYosys();
    const tc = createLocalToolchain({runYosys, capabilities: CAPABLE});
    await tc.download({consent: true});
    const r = await tc.synthesise({
        files: [{name: 'blink.v', source: 'module blink(output led); assign led = 1; endmodule'}],
        top: 'blink'});
    assert.equal(r.ok, true);
    assert.deepEqual(Object.keys(r.netlist.modules), ['blink']);

    const script = runYosys.calls[1].args.join(' ');
    assert.match(script, /synth_gowin/, 'synth_ice40 would run and produce a wrong netlist');
    assert.match(script, /-top blink/);
    assert.equal(runYosys.calls[1].files['blink.v'].includes('module blink'), true);
});

test('with no top given, it lets synth_gowin auto-select — never `-top top`', async () => {
    // The tab passes no top. Defaulting to `-top top` made synth_gowin look for a
    // module named "top" and produce nothing for a design named `blink` — the local
    // tier failed for every real design (found by the staging drive). No -top lets
    // yosys auto-select the hierarchy top, as the hosted route does.
    const runYosys = stubYosys();
    const tc = createLocalToolchain({runYosys, capabilities: CAPABLE});
    await tc.download({consent: true});
    await tc.synthesise({files: [{name: 'blink.v', source: 'module blink(output led); assign led=1; endmodule'}]});
    const script = runYosys.calls[1].args.join(' ');
    assert.doesNotMatch(script, /-top top\b/,
        'defaulting -top to "top" is the bug that made the local tier produce no netlist');
    assert.match(script, /synth_gowin -json/,
        'with no top named, synth_gowin must run without -top so it auto-selects');
});

test('a design that does not compile is an ANSWER, not an outage', async () => {
    const tc = createLocalToolchain({
        runYosys: stubYosys({fail: 'syntax error in blink.v line 3'}), capabilities: CAPABLE});
    // The download runs the same stub, so make it succeed first and fail after.
    const ok = createLocalToolchain({runYosys: stubYosys(), capabilities: CAPABLE});
    await ok.download({consent: true});

    let phase = 'download';
    const tc2 = createLocalToolchain({
        capabilities: CAPABLE,
        runYosys: async () => {
            if (phase === 'download') return {};
            throw new Error('syntax error in blink.v line 3');
        }});
    await tc2.download({consent: true});
    phase = 'synth';
    const r = await tc2.synthesise({files: [{name: 'blink.v', source: 'bad'}]});
    assert.equal(r.code, 'synthesis-failed');
    assert.match(r.reason, /line 3/, 'the user must see their own error, not "try again later"');
    assert.equal(tc2.state, 'ready', 'a bad design does not break the toolchain');
    assert.ok(tc);
});

test('an empty source list is refused before anything else', async () => {
    const tc = createLocalToolchain({runYosys: stubYosys(), capabilities: CAPABLE});
    await tc.download({consent: true});
    assert.equal((await tc.synthesise({files: []})).code, 'no-sources');
});

// ── and the thing it must never claim ───────────────────────────

test('it never offers a bitstream, and says so as a REFUSAL not an absence', async () => {
    const tc = createLocalToolchain({runYosys: stubYosys(), capabilities: CAPABLE});
    await tc.download({consent: true});
    const r = await tc.synthesise({files: [{name: 'a.v', source: 'module a; endmodule'}]});
    assert.equal(r.ok, true);
    assert.equal('bitstream' in r, false);

    // A field that is SOMETIMES present invites a caller to check and hope. The
    // answer is a named refusal that can be shown to a user (§8c's UI rule).
    const b = tc.bitstream();
    assert.equal(b.ok, false);
    assert.equal(b.code, 'local-bitstream-unavailable');
    assert.equal(b.alternative, 'hosted');
    assert.match(b.reason, /place and route/);
    assert.deepEqual(b, bitstreamRefusal());
});

// ── the worker protocol, without a Worker ───────────────────────
//
// Nothing compiles yosys-worker.js: it is behind BW_ENABLE_FPGA and
// check-flagged-jsx parses without executing. So the decisions live in
// worker-protocol.js and are tested here, which is the same split bw-synth made
// between handle_synth() and its transport.

import {handleMessage, PROTOCOL_VERSION}
    from '../overlay/scratch-gui/src/lib/bw-fpga/worker-protocol.js';

const session = () => ({toolchain: null});

test('a message with no id gets NO reply, because there is nobody to answer', async () => {
    const s = session();
    assert.equal(await handleMessage({type: 'describe'}, s, {runYosys: stubYosys()}), null);
    assert.equal(await handleMessage(null, s, {runYosys: stubYosys()}), null);
    // Replying with an invented id is worse than silence: the page would
    // resolve the wrong promise.
});

test('work before init is refused as a CALLER bug, not a user-fixable condition', async () => {
    const r = await handleMessage({id: 1, type: 'synthesise', files: []}, session(),
        {runYosys: stubYosys()});
    assert.equal(r.code, 'not-initialised');
    assert.equal(r.id, 1);
});

test('an unknown message is ANSWERED, because silence hangs the page', async () => {
    const s = session();
    await handleMessage({id: 1, type: 'init'}, s, {runYosys: stubYosys(), capabilities: CAPABLE});
    const r = await handleMessage({id: 7, type: 'flash-the-board'}, s, {runYosys: stubYosys()});
    assert.equal(r.code, 'unknown-message');
    assert.equal(r.id, 7, 'the id must come back or the caller cannot clear its promise');
    assert.match(r.reason, /flash-the-board/);
});

test('every reply carries the protocol version and the id it answers', async () => {
    const s = session();
    const runYosys = stubYosys();
    const ids = [];
    for (const [i, msg] of [[1, {type: 'init'}], [2, {type: 'describe'}],
        [3, {type: 'download', consent: true}],
        [4, {type: 'synthesise', files: [{name: 'a.v', source: 'module a; endmodule'}]}]]) {
        const r = await handleMessage({id: i, ...msg}, s, {runYosys, capabilities: CAPABLE});
        assert.equal(r.protocol, PROTOCOL_VERSION);
        assert.equal(r.id, i);
        ids.push(r.type);
    }
    assert.deepEqual(ids, ['ready', 'state', 'download', 'synthesise']);
});

test('consent must be sent EXPLICITLY through the protocol, not defaulted in it', async () => {
    const s = session();
    const runYosys = stubYosys();
    await handleMessage({id: 1, type: 'init'}, s, {runYosys, capabilities: CAPABLE});
    // A missing flag, and a truthy-but-not-true one: a worker boundary is
    // exactly where `consent: "yes"` sneaks in from a hand-built message.
    for (const msg of [{id: 2, type: 'download'}, {id: 3, type: 'download', consent: 'yes'}]) {
        const r = await handleMessage(msg, s, {runYosys, capabilities: CAPABLE});
        assert.equal(r.result.code, 'download-not-consented');
    }
    assert.equal(runYosys.calls.length, 0);
});

test('progress crosses the boundary as it happens, tagged with its request id', async () => {
    const posted = [];
    const s = session();
    const runYosys = stubYosys({chunks: 2});
    await handleMessage({id: 'init-1', type: 'init'}, s,
        {runYosys, capabilities: CAPABLE, postProgress: m => posted.push(m)});
    await handleMessage({id: 9, type: 'download', consent: true}, s,
        {runYosys, capabilities: CAPABLE});
    assert.deepEqual(posted.map(p => `${p.type}:${p.state.state}:${p.state.progress}`),
        ['progress:downloading:null', 'progress:downloading:50',
            'progress:downloading:100', 'progress:ready:undefined'],
        'unsolicited progress must NOT share a type with the reply to describe — '
        + 'while it did, the client swallowed that reply and hung');
    assert.ok(posted.every(p => typeof p.state === 'object' && 'available' in p.state),
        'a push must carry the SAME shape describe() returns, or a caller renders two');
    assert.ok(posted.every(p => p.protocol === PROTOCOL_VERSION));
});

test('two sessions do not share a toolchain', async () => {
    const a = session(), b = session();
    const runYosys = stubYosys();
    await handleMessage({id: 1, type: 'init'}, a, {runYosys, capabilities: CAPABLE});
    await handleMessage({id: 1, type: 'download', consent: true}, a,
        {runYosys, capabilities: CAPABLE});
    await handleMessage({id: 1, type: 'init'}, b, {runYosys, capabilities: CAPABLE});
    const r = await handleMessage({id: 2, type: 'describe'}, b, {runYosys, capabilities: CAPABLE});
    assert.equal(r.state.state, 'not-downloaded',
        'state held in a module variable is state two callers silently share');
});
