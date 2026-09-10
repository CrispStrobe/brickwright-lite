/**
 * A RECORDED SESSION MUST SURVIVE ITS OWN EXPORT.
 *
 * A tick count has three spellings here: a Number, a BigInt, and — because
 * `session-bundle.js`'s `canonical()` writes a bigint as `0x…` and `JSON.parse`
 * has no reviver — a hex STRING. The third is not a design choice; it is what
 * JSON does to the second.
 *
 * MEASURED BEFORE THE REPAIR, on the real 8051 target: a session whose recorded
 * inputs carried BigInt ticks exported cleanly and then REFUSED TO IMPORT, with
 *
 *     TypeError INVALID_INPUT_ORDER
 *     "input cursor must increase per branch with deterministic time"
 *
 * The cursors were fine. `session-bundle.js` gated the tick with
 * `Number.isSafeInteger`, one line above a `BigInt()` that would have accepted
 * it, and reported a SPELLING problem as an ORDERING one. A diagnostic that
 * points away from the defect costs more than a missing one.
 *
 * It was live rather than theoretical: `emu8051-debug.js` computes ticks with
 * BigInt arithmetic and `debug-runner.js` stamps every recorded input with
 * `target.debugTime()`. Record on an 8051 board, export, and the session did
 * not come back.
 *
 * THE CONTROLS ARE PART OF THE TEST, NOT PART OF THE MEASUREMENT. Number and
 * BigInt must round-trip green beside the hex case, permanently — otherwise a
 * future repair can restore the refusal for two of the three and this file will
 * not notice. Two of my own probes for this defect refused all three spellings
 * because the harness was wrong, and each read like a clean result about the
 * subject until a control contradicted it.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import {existsSync} from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(import.meta.dirname, '..');
const LIB = path.join(ROOT, 'overlay/scratch-gui/src/lib');
const WASM_JS = path.join(LIB, 'emu8051/emu8051.js');
const skip = existsSync(WASM_JS) ? false : `no emu8051 build at ${WASM_JS}`;

const codecs = {test: {encode: s => new TextEncoder().encode(JSON.stringify(s)),
                       decode: b => JSON.parse(new TextDecoder().decode(b))}};

const bundleFor = async ticks => {
    const {createDebuggerSessionBundle} = await import(path.join(LIB, 'bw-debug/session-bundle.js'));
    return createDebuggerSessionBundle({
        firmware: new Uint8Array([1, 2, 3]), source: 'x', codecs,
        trace: [{seq: 0, fidelity: 'recorded'}],
        inputs: [{cursor: 0, time: {ticks, domain: 'cpu'}, producer: 'key'}],
        branches: [{id: 'main', parentId: null, eventCursor: 0}],
        checkpoints: [{id: 4, eventCursor: 0, inputCursor: 0, time: {ticks: 0, domain: 'cpu'},
            codec: 'test', snapshot: {s: 'x'}}],
        bookmarks: [], annotations: []});
};

const roundTrip = async ticks => {
    const {importDebuggerSessionBundle} = await import(path.join(LIB, 'bw-debug/session-bundle.js'));
    const bundle = await bundleFor(ticks);
    let committed = null;
    await importDebuggerSessionBundle({bundle: JSON.parse(JSON.stringify(bundle)), codecs,
        commit: value => { committed = value; }});
    return committed.recordings[0].inputs[0];
};

test('a real 8051 target stamps a tick this system must be able to round-trip', {skip}, async () => {
    // NOT a hand-built fixture: the point is that the producer really does emit
    // the spelling the bundle then has to carry.
    const {default: createEmu8051} = await import(WASM_JS);
    const {createEmu8051Adapter} = await import(path.join(LIB, 'bw-board/emu8051-adapter.js'));
    const {createEmu8051DebugTarget} = await import(path.join(LIB, 'bw-board/emu8051-debug.js'));

    const wasm = await createEmu8051();
    createEmu8051Adapter(wasm, {mode: 'poll', ports: [1]});
    const target = createEmu8051DebugTarget(wasm, {clockHz: 11_059_200});

    // THE TICK IS READ OFF A REAL EMITTED FACT, not off a clock accessor: this
    // target has no public `debugTime()`, and a fact is the path a recorded
    // input actually takes — `debug-runner.js` stamps each one from the same
    // source.
    const facts = [];
    target.onDebugEvent(event => facts.push(event));
    target.step('insn', 1);
    target.runFor(1000);
    // This assertion caught its own first draft: with only step() the target
    // published nothing, and every check below would have run on an empty list.
    assert.ok(facts.length > 0, 'the target published nothing, so this proves nothing');

    const ticks = facts[0].time.ticks;
    assert.equal(typeof ticks, 'bigint',
        'this test exists because the 8051 stamps a bigint; if that changed, re-read the file');

    const input = await roundTrip(ticks);
    assert.ok(input, 'the session did not survive its own export');
    assert.equal(BigInt(input.time.ticks), ticks, 'the tick came back as a different value');
});

test('all three spellings survive export and import', async () => {
    for (const [name, ticks] of [['Number', 4242], ['BigInt', 4242n], ['hex string', '0x1092']]) {
        const input = await roundTrip(ticks);
        assert.ok(input, `${name} did not survive the round trip`);
        assert.equal(String(BigInt(input.time.ticks)), '4242', `${name} came back as a different value`);
    }
});

test('and the replay half accepts what the import half produced', async () => {
    // The two halves are separate refusals in separate files, and fixing only
    // the import leaves a session that loads and will not replay — which is
    // exactly what the first repair did before this case caught it.
    const {createDebugRecorder} = await import(path.join(LIB, 'bw-debug/recorder.js'));
    for (const [name, ticks] of [['Number', 4242], ['BigInt', 4242n], ['hex string', '0x1092']]) {
        const back = await roundTrip(ticks);
        const recorder = createDebugRecorder();
        assert.doesNotThrow(() => recorder.appendInput(
            {schema: 1, cursor: 0, time: back.time, producer: 'key', payload: {k: 'A'}}),
        `${name} imported and then could not be replayed`);
    }
});

test('an unreadable tick refuses as a SPELLING problem and names what it found', async () => {
    // The half of this defect that cost the most: the refusal used to blame
    // cursor ordering. Asserting the CODE and the message together is what
    // stops it drifting back to a message about something else.
    for (const bad of ['12', 'abc', -1, 1.5, null, {}]) {
        await assert.rejects(() => bundleFor(bad).then(b => import(path.join(LIB, 'bw-debug/session-bundle.js'))
            .then(m => m.importDebuggerSessionBundle({bundle: JSON.parse(JSON.stringify(b)), codecs,
                commit: () => {}}))),
        error => {
            assert.equal(error.code, 'INVALID_INPUT_TICKS', `${String(bad)} refused as ${error.code}`);
            assert.match(error.message, /time\.ticks/);
            assert.match(error.message, /expected a non-negative safe integer, a bigint, or a canonical/);
            return true;
        }, `${String(bad)} was not refused by spelling`);
    }
});
