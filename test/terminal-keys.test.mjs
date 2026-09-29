// The Linux terminal's keyboard → bytes table (lib/bw-debug/terminal-keys.js),
// key by key, against what a VT100/xterm sends — plus the host-side halves of
// the console that need no guest: paste encoding, the FIFO-paced input queue,
// and the per-frame output batching. The same table driven into a real booted
// Linux, with the guest reporting the bytes it received, is
// test/linux-terminal.test.mjs.

import {test} from 'node:test';
import assert from 'node:assert/strict';

import {keyToBytes, pasteToBytes, textToBytes}
    from '../overlay/scratch-gui/src/lib/bw-debug/terminal-keys.js';
import {createReadyGatedInput, UART_FIFO_DEPTH}
    from '../overlay/scratch-gui/src/lib/bw-debug/ready-gated-input.js';
import {createTerminalOutput} from '../overlay/scratch-gui/src/lib/bw-debug/terminal-output.js';

const k = (key, mods = {}, mode) => keyToBytes({key, code: mods.code, ...mods}, mode);
const hex = bytes => (bytes === null ? null : Buffer.from(bytes).toString('hex'));
const E = s => Buffer.from(s, 'latin1').toString('hex');   // expected, as hex

test('Enter is CR, Backspace is DEL, Tab is HT, Escape is ESC', () => {
    assert.equal(hex(k('Enter')), '0d', 'Enter → CR (the guest tty has ICRNL; raw programs want CR)');
    assert.equal(hex(k('Enter', {shiftKey: true})), '0d');
    assert.equal(hex(k('Backspace')), '7f', 'Backspace → DEL, the guest\'s erase = ^?');
    assert.equal(hex(k('Backspace', {ctrlKey: true})), '08');
    assert.equal(hex(k('Tab')), '09');
    assert.equal(hex(k('Tab', {shiftKey: true})), E('\x1b[Z'));
    assert.equal(hex(k('Escape')), '1b');
});

test('Ctrl-A … Ctrl-Z are 0x01 … 0x1a (Ctrl-C = intr 0x03, Ctrl-D = eof 0x04)', () => {
    for (let i = 0; i < 26; i++) {
        const lower = String.fromCharCode(0x61 + i);
        assert.deepEqual(k(lower, {ctrlKey: true}), [i + 1], `Ctrl-${lower.toUpperCase()}`);
        assert.deepEqual(k(lower.toUpperCase(), {ctrlKey: true}), [i + 1], `Ctrl-${lower.toUpperCase()} with Caps Lock`);
    }
    assert.deepEqual(k('c', {ctrlKey: true}), [0x03]);
    assert.deepEqual(k('d', {ctrlKey: true}), [0x04]);
    // A non-Latin layout reports its own letter; the physical key decides.
    assert.deepEqual(k('с', {ctrlKey: true, code: 'KeyC'}), [0x03], 'Cyrillic с on the C key');
    for (const [key, byte] of [['@', 0], [' ', 0], ['[', 0x1b], ['\\', 0x1c], [']', 0x1d], ['^', 0x1e], ['_', 0x1f]]) {
        assert.deepEqual(k(key, {ctrlKey: true}), [byte], `Ctrl-${key}`);
    }
});

test('arrows, Home and End are CSI sequences, SS3 once the guest sets DECCKM', () => {
    const table = {ArrowUp: 'A', ArrowDown: 'B', ArrowRight: 'C', ArrowLeft: 'D', Home: 'H', End: 'F'};
    for (const [key, fin] of Object.entries(table)) {
        assert.equal(hex(k(key)), E(`\x1b[${fin}`), `${key} (normal)`);
        assert.equal(hex(k(key, {}, {applicationCursor: true})), E(`\x1bO${fin}`), `${key} (DECCKM)`);
        assert.equal(hex(k(key, {ctrlKey: true})), E(`\x1b[1;5${fin}`), `Ctrl-${key}`);
        assert.equal(hex(k(key, {shiftKey: true})), E(`\x1b[1;2${fin}`), `Shift-${key}`);
    }
});

test('Insert, Delete, PgUp, PgDn and the function keys are xterm\'s', () => {
    assert.equal(hex(k('Insert')), E('\x1b[2~'));
    assert.equal(hex(k('Delete')), E('\x1b[3~'));
    assert.equal(hex(k('PageUp')), E('\x1b[5~'));
    assert.equal(hex(k('PageDown')), E('\x1b[6~'));
    assert.equal(hex(k('Delete', {ctrlKey: true})), E('\x1b[3;5~'));
    assert.equal(hex(k('F1')), E('\x1bOP'));
    assert.equal(hex(k('F4')), E('\x1bOS'));
    assert.equal(hex(k('F5')), E('\x1b[15~'));
    assert.equal(hex(k('F12')), E('\x1b[24~'));
});

test('printable keys are their UTF-8 bytes; Alt prefixes ESC', () => {
    assert.deepEqual(k('a'), [0x61]);
    assert.deepEqual(k('A', {shiftKey: true}), [0x41]);
    assert.deepEqual(k(' '), [0x20]);
    assert.equal(hex(k('é')), 'c3a9');
    assert.equal(hex(k('€')), 'e282ac');
    assert.equal(hex(k('😀')), 'f09f9880', 'an astral character is one key, four bytes');
    assert.equal(hex(k('b', {altKey: true})), E('\x1bb'));
    assert.equal(hex(k('@', {ctrlKey: true, altKey: true})), '40', 'AltGr (Ctrl+Alt) + Q on a German layout is text');
});

test('keys that are not the terminal\'s are left to the browser', () => {
    for (const key of ['Shift', 'Control', 'Alt', 'Meta', 'CapsLock', 'Dead', 'Process', 'Unidentified']) {
        assert.equal(k(key), null, key);
    }
    assert.equal(k('v', {metaKey: true}), null, 'Cmd-V pastes');
    assert.equal(k('c', {ctrlKey: true, shiftKey: true}), null, 'Ctrl-Shift-C copies');
    assert.equal(k('V', {ctrlKey: true, shiftKey: true}), null, 'Ctrl-Shift-V pastes');
    assert.equal(keyToBytes(null), null);
});

test('a paste sends line ends as CR, bracketed when the guest asked', () => {
    assert.equal(hex(pasteToBytes('a\nb\r\nc')), E('a\rb\rc'));
    assert.equal(hex(pasteToBytes('x\n', {bracketed: true})), E('\x1b[200~x\r\x1b[201~'));
    assert.equal(hex(textToBytes('Grüße')), '4772c3bcc39f65');
});

test('the input queue hands a paste to the UART one FIFO at a time, only once it is drained', () => {
    let fifo = 0;                                  // bytes the "guest" has not read yet
    const sent = [];
    const q = createReadyGatedInput({
        isReady: () => true,
        send: b => { sent.push(b); fifo++; return true; },
        canAccept: () => fifo === 0
    });
    const paste = Array.from({length: 100}, (_, i) => i);
    assert.equal(q.write(paste), true);
    assert.equal(sent.length, UART_FIFO_DEPTH, 'one FIFO\'s worth, not the whole paste');
    assert.equal(q.flush(), 0, 'nothing more while the guest has not drained');
    let maxFifo = 0;
    while (q.pending()) {
        fifo = 0;                                  // the guest's driver read the FIFO
        q.flush();
        maxFifo = Math.max(maxFifo, fifo);
    }
    assert.deepEqual(sent, paste, 'every byte, in order');
    assert.ok(maxFifo <= UART_FIFO_DEPTH);
    // Keys typed behind a paste wait their turn.
    fifo = 1;
    q.write([0x41]);
    q.write([0x42]);
    assert.equal(q.pending(), 2);
    fifo = 0;
    q.flush();
    assert.deepEqual(sent.slice(-2), [0x41, 0x42]);
});

test('an escape sequence typed into an empty FIFO goes over in one piece', () => {
    let fifo = 0;
    const sent = [];
    const q = createReadyGatedInput({isReady: () => true, send: b => { sent.push(b); fifo++; }, canAccept: () => fifo === 0});
    q.write(k('ArrowUp'));
    assert.equal(hex(sent), E('\x1b[A'), 'ESC [ A together — never ESC now and [A a frame later');
});

test('a write that does not fit is refused whole', () => {
    const q = createReadyGatedInput({isReady: () => false, send: () => true, limit: 8});
    assert.equal(q.write([1, 2, 3, 4, 5]), true);
    assert.equal(q.write([6, 7, 8, 9]), false, 'refused, visibly');
    assert.equal(q.pending(), 5, 'and nothing of it was queued');
});

test('output is batched per frame, and a late subscriber gets the replay', () => {
    const out = createTerminalOutput({replayLimit: 8});
    const seen = [];
    const off = out.subscribe(b => seen.push(hex(b)));
    for (const b of Buffer.from('\x1b[2Jab')) out.push(b);
    assert.deepEqual(seen, [], 'nothing until the frame delivers');
    assert.equal(out.deliver(), 6);
    assert.deepEqual(seen, [E('\x1b[2Jab')], 'one chunk per frame, escape sequence intact');
    off();
    for (const b of Buffer.from('cdefghij')) out.push(b);
    out.deliver();
    assert.equal(seen.length, 1, 'unsubscribed');
    const late = [];
    out.subscribe(b => late.push(Buffer.from(b).toString('latin1')));
    assert.deepEqual(late, ['cdefghij'], 'bounded replay of whole recent chunks');
});
