/**
 * Writing a MicroPython hex needs no compiler and no server.
 *
 * This is the point that is easy to miss when the answer to "how do we
 * build a binary" has been "ask stc-compiler" for every other target.
 * MicroPython is INTERPRETED: putting a program on a micro:bit means
 * appending it to a firmware image, at a fixed address, behind a four-byte
 * header. No toolchain is involved, so no GPL question arises and nothing
 * has to be online.
 *
 * The reader for that format was already here — it is how a `.hex` from
 * python.microbit.org gets imported. This is the same format written
 * instead of read, which is why the strongest test available is that our
 * own reader accepts our own writer's output byte for byte.
 */

import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

import {
    appendScript, scriptOnlyHex, extractMicroPython
} from '../overlay/scratch-gui/src/lib/bw-makecode/micropython-hex.js';

const bytes = text => new TextEncoder().encode(text);

test('a script we write is a script we can read', () => {
    const program = 'from microbit import *\ndisplay.scroll("hi")\n';
    const recovered = extractMicroPython(bytes(scriptOnlyHex(program)));
    assert.ok(recovered, 'our own reader did not recognise our own hex');
    assert.equal(recovered.files['main.py'], program);
    assert.equal(recovered.variant, 'appended');
});

test('every record is well formed, checksum included', () => {
    // A hex with a bad checksum is rejected by the flashing tool rather
    // than by us, so the failure would arrive as "your micro:bit did not
    // take it" with nothing here to look at.
    for (const line of scriptOnlyHex('x = 1\n').trim().split('\n')) {
        assert.match(line, /^:[0-9A-F]+$/, line);
        const raw = line.slice(1).match(/../g).map(b => parseInt(b, 16));
        const sum = raw.reduce((a, b) => a + b, 0) & 0xFF;
        assert.equal(sum, 0, `checksum does not close on ${line}`);
        assert.equal(raw[0], raw.length - 5, `byte count wrong on ${line}`);
    }
});

test('the script goes to 0x3E000, which needs an extended-address record', () => {
    // Intel HEX addresses are 16-bit. Everything above 64K is reached
    // through a type-04 record, and omitting it would write the script
    // over the runtime at 0xE000 instead — a hex that flashes and bricks
    // the program rather than one that fails.
    const lines = scriptOnlyHex('x = 1\n').trim().split('\n');
    const extended = lines.find(l => l.slice(7, 9) === '04');
    assert.ok(extended, 'no extended-linear-address record');
    assert.equal(extended, ':020000040003F7', 'not the record for 0x3xxxx');
});

test('an existing firmware keeps its records and loses its EOF', () => {
    // Appending after the end-of-file record would produce a hex whose
    // tail every reader ignores — the script would simply not be there.
    const firmware = ':10000000000102030405060708090A0B0C0D0E0F78\n:00000001FF\n';
    const out = appendScript(firmware, 'y = 2\n');
    const lines = out.trim().split('\n');
    assert.equal(lines[0], ':10000000000102030405060708090A0B0C0D0E0F78',
        'the firmware record was lost');
    assert.equal(lines.filter(l => /^:00000001FF$/.test(l)).length, 1,
        'expected exactly one EOF record, at the end');
    assert.equal(lines[lines.length - 1], ':00000001FF');
    assert.equal(extractMicroPython(bytes(out)).files['main.py'], 'y = 2\n');
});

test('a script too big for the header is refused, and says whose limit it is', () => {
    // 16-bit length: the ceiling belongs to the format, not to us, and a
    // message that does not say so reads as an arbitrary restriction.
    let message = '';
    try {
        scriptOnlyHex('#'.repeat(0x10000));
    } catch (e) {
        message = e.message;
    }
    assert.match(message, /16-bit length/);
    assert.match(message, /65535/);
});

test('non-ASCII survives, because the length is in BYTES', () => {
    // The header counts bytes and JavaScript counts UTF-16 code units.
    // Taking the string's length would truncate every umlaut — the same
    // class of bug the MakeCode importer hit from the other direction.
    const program = 'display.scroll("Grüße, Welt — ✓")\n';
    const recovered = extractMicroPython(bytes(scriptOnlyHex(program)));
    assert.equal(recovered.files['main.py'], program);
});

// ── the button that uses it ─────────────────────────────────────────────

test('the flash button exists, is disabled when there is nothing to flash, and asks for firmware once', async () => {
    // A UI contract rather than a render test: this button is the only
    // path from "my program runs in the simulator" to "my program runs on
    // the board", and each piece of it is in a different place.
    const {readFileSync} = await import('node:fs');
    const {join} = await import('node:path');
    const {REPO} = await import('./helpers/bw-integrated.mjs');
    const src = readFileSync(
        join(REPO, 'overlay/scratch-gui/src/components/tw-pseudocode/pseudocode-importer.jsx'),
        'utf8');

    assert.match(src, /data-testid="bw-microbit-download-hex"/, 'no flash button');
    assert.match(src, /onClick=\{\(\) => this\.downloadMicrobitHex\(\)\}/);
    // Same disabled rule as the simulator buttons beside it: an empty or
    // placeholder buffer must not produce a hex that flashes nothing.
    const button = src.slice(src.indexOf('bw-microbit-download-hex') - 700,
        src.indexOf('bw-microbit-download-hex'));
    assert.match(button, /disabled=\{this\.state\.busy \|\| !this\.state\.buffers\.micropython\.trim\(\)/);

    // The runtime is 1.8 MB, so it is asked for rather than bundled — but
    // importing a MicroPython hex supplies it for free, and that path has
    // to be wired or the button nags on every use.
    assert.match(src, /res\.kind === 'micropython'/);
    assert.match(src, /_microbitFirmwareHex = new TextDecoder\(\)/,
        'an imported hex does not become the firmware, so the button will always ask');
    assert.match(src, /appendScript/, 'the button does not use the writer');
});

test('both locales carry the flash strings', () => {
    // A missing string renders as `undefined` in the UI, which is how
    // "Press undefined to build" once reached a green build.
    const src = readFileSync(new URL(
        '../overlay/scratch-gui/src/components/tw-pseudocode/pseudocode-importer.jsx',
        import.meta.url), 'utf8');
    for (const key of ['downloadHex', 'microbitNeedFirmware', 'microbitFirmwareBad',
        'microbitHexReady']) {
        const hits = src.split(`${key}:`).length - 1;
        assert.equal(hits, 2, `${key} appears ${hits} times; expected en and de`);
    }
});
