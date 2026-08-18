import { test } from 'node:test';
import assert from 'node:assert/strict';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const mod = await import(resolve(here,
    '../overlay/scratch-gui/src/lib/bw-debug/microbit-debug.js'));
const { createMarkerSplitter, createMicrobitDebugController } = mod;

const RS = '\x1e';

test('splitter: a clean stream of markers + real output', () => {
    const s = createMarkerSplitter();
    const r = s.feed(`${RS}0\nhello\n${RS}1\nworld\n${RS}!2\n`);
    assert.equal(r.text, 'hello\nworld\n');
    assert.deepEqual(r.events, [
        {type: 'pos', n: 0},
        {type: 'pos', n: 1},
        {type: 'halt', n: 2}
    ]);
});

test('splitter: a chunked stream — RS, digits, newline split across chunks', () => {
    const s = createMarkerSplitter();
    const out = [];
    const ev = [];
    // Feed the SAME logical stream byte-by-byte to prove partial tokens buffer.
    const stream = `pre${RS}12\nmid${RS}!34\npost`;
    for (const ch of stream) {
        const r = s.feed(ch);
        out.push(r.text);
        ev.push(...r.events);
    }
    assert.equal(out.join(''), 'premidpost');
    assert.deepEqual(ev, [
        {type: 'pos', n: 12},
        {type: 'halt', n: 34}
    ]);
});

test('splitter: real output containing no markers passes straight through', () => {
    const s = createMarkerSplitter();
    const r = s.feed('just some print output\nwith newlines\n');
    assert.equal(r.text, 'just some print output\nwith newlines\n');
    assert.deepEqual(r.events, []);
});

test('splitter: an RS with no newline yet yields no event (retained)', () => {
    const s = createMarkerSplitter();
    let r = s.feed(`abc${RS}7`);       // marker started, not terminated
    assert.equal(r.text, 'abc');
    assert.deepEqual(r.events, []);
    r = s.feed('\n');                   // newline arrives in the next chunk
    assert.equal(r.text, '');
    assert.deepEqual(r.events, [{type: 'pos', n: 7}]);
});

test('splitter: real output and a marker in one chunk, marker last & partial', () => {
    const s = createMarkerSplitter();
    let r = s.feed(`output${RS}!9`);
    assert.equal(r.text, 'output');
    assert.deepEqual(r.events, []);
    r = s.feed('\nmore');
    assert.equal(r.text, 'more');
    assert.deepEqual(r.events, [{type: 'halt', n: 9}]);
});

test('controller: positions map → block highlight + halt state', () => {
    const glows = [];
    const sent = [];
    const states = [];
    const c = createMicrobitDebugController({
        glow: (id, on) => glows.push([id, on]),
        sendSerialIn: (t) => sent.push(t),
        onChange: (st) => states.push(st)
    });
    c.begin([{block: 'blkA'}, {block: 'blkB'}, {block: 'blkC'}]);
    assert.equal(c.active, true);

    // Position 0 → highlight blkA
    let real = c.feedSerial(`${RS}0\n`);
    assert.equal(real, '');
    assert.deepEqual(glows.at(-1), ['blkA', true]);
    assert.equal(c.state().block, 'blkA');
    assert.equal(c.halted, false);

    // Real output interleaved, then halt at position 2 → blkC lit, paused
    real = c.feedSerial(`printed line\n${RS}!2\n`);
    assert.equal(real, 'printed line\n');
    assert.equal(c.halted, true);
    assert.equal(c.state().block, 'blkC');
    // moving off blkA turned it off before lighting blkC
    assert.ok(glows.some(g => g[0] === 'blkA' && g[1] === false));
    assert.deepEqual(glows.at(-1), ['blkC', true]);
});

test('controller: step & continue write the RS-prefixed resume bytes (line-terminated)', () => {
    const sent = [];
    const c = createMicrobitDebugController({sendSerialIn: (t) => sent.push(t)});
    c.begin([{block: 'x'}]);
    c.feedSerial(`${RS}!0\n`);
    assert.equal(c.halted, true);
    c.step();
    // CR-terminated (not LF): the shipped sim's input() only completes on \r.
    assert.equal(sent.at(-1), `${RS}s\r`);
    assert.equal(c.halted, false);
    c.feedSerial(`${RS}!0\n`);            // re-halted at the next block
    c.cont();
    assert.equal(sent.at(-1), `${RS}c\r`);
    assert.equal(c.halted, false);
});

test('controller: capabilities() is block-only and refuses insn/line honestly', () => {
    const c = createMicrobitDebugController();
    const caps = c.capabilities();
    assert.deepEqual(caps.steps, ['block']);
    assert.deepEqual(caps.breakpoints, ['block']);
    assert.equal(caps.insn, false);
    assert.equal(caps.line, false);
    assert.equal(caps.over, false);
    assert.equal(caps.out, false);
});

test('controller: stop clears the highlight and deactivates', () => {
    const glows = [];
    const c = createMicrobitDebugController({glow: (id, on) => glows.push([id, on])});
    c.begin([{block: 'only'}]);
    c.feedSerial(`${RS}0\n`);
    assert.deepEqual(glows.at(-1), ['only', true]);
    c.stop();
    assert.deepEqual(glows.at(-1), ['only', false]);
    assert.equal(c.active, false);
    // passthrough once inactive
    assert.equal(c.feedSerial('plain'), 'plain');
});
