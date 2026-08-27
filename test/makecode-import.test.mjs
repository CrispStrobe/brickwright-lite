/**
 * The MakeCode import path, from bytes to project.
 *
 * Two kinds of evidence here, deliberately:
 *
 * 1. REAL FILES. test/fixtures/makecode holds three genuine MakeCode
 *    downloads — a micro:bit blocks project, an arcade-shield build of
 *    the same game as both .hex and .uf2 — trimmed to the records that
 *    carry the embedded source (see the fixtures README). Nothing about
 *    the container is mocked; if pxt changes the envelope, these fail.
 * 2. ROUND TRIPS, for the two containers we have no committed sample of:
 *    the .png cartridge and the micro:bit V2 MicroPython filesystem. The
 *    writers live in test/helpers/makecode-fixtures.mjs.
 */

import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {dirname, join} from 'node:path';

import {lzmaDecode} from '../overlay/scratch-gui/src/lib/bw-makecode/lzma.js';
import {
    sniffFormat,
    unpackMakeCodeSource,
    describeProject,
    decodePngBlob,
    uf2ToBin
} from '../overlay/scratch-gui/src/lib/bw-makecode/embedded-source.js';
import {decodePng} from '../overlay/scratch-gui/src/lib/bw-makecode/png.js';
import {
    extractMicroPython,
    buildFlashMap,
    readAppendedScript
} from '../overlay/scratch-gui/src/lib/bw-makecode/micropython-hex.js';
import {parseShareId, fetchSharedProject} from '../overlay/scratch-gui/src/lib/bw-makecode/share.js';
import {importArtefact} from '../overlay/scratch-gui/src/lib/bw-makecode/index.js';
import {IMPORT_ACCEPT, isImportableArtefact} from '../overlay/scratch-gui/src/lib/bw-makecode/accept.js';
import {
    encodePng,
    encodePngBlob,
    makeAppendedScriptHex,
    makeFilesystemHex
} from './helpers/makecode-fixtures.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const fixture = name => new Uint8Array(readFileSync(join(HERE, 'fixtures', 'makecode', name)));

const b64 = s => Uint8Array.from(Buffer.from(s, 'base64'));
const utf8 = b => new TextDecoder().decode(b);

// An LZMA-alone stream of a two-file project, and one of plain prose.
// Both were produced by xz-utils, NOT by this repo, so they check the
// decoder against a foreign encoder rather than against itself.
const LZMA_PROJECT = 'XQAAgAD//////////wA9iImmVBLhMKm1y5KVR+nxoaHi2HvoUeHQc9O3tvLdD54278RA2F+4OTGiYNHbq4LjX8OmQeHCqC7+olKEB4YJbeVrI53uIy7//rjOQA==';
const LZMA_PROSE = 'XQAAgAD//////////wA6GgjOdsfl6dYHNMPRDr/OVeGqveDkj5gB3Y3lB1SeZSVfJzpqfrTTSQOJztR9PP+a3hnsPt////kioAA=';
const PROJECT_TEXT = '{"main.ts": "basic.showNumber(1)\\n", "pxt.json": "{\\"name\\":\\"tiny\\"}"}';

test('lzma: decodes a stream written by another implementation', () => {
    assert.equal(utf8(lzmaDecode(b64(LZMA_PROJECT))), PROJECT_TEXT);
    const prose = utf8(lzmaDecode(b64(LZMA_PROSE)));
    assert.equal(prose.length, 45 * 20);
    assert.ok(prose.startsWith('the quick brown fox jumps over the lazy dog. the'));
});

test('lzma: trailing padding is not corruption', () => {
    // Blobs arrive padded out of fixed-width hex records; a decoder that
    // treats the padding as a broken stream cannot read a single real file.
    const stream = b64(LZMA_PROJECT);
    const padded = new Uint8Array(stream.length + 64).fill(0xFF);
    padded.set(stream);
    assert.equal(utf8(lzmaDecode(padded)), PROJECT_TEXT);
});

test('lzma: refuses a stream that is not one', () => {
    assert.throws(() => lzmaDecode(new Uint8Array(64).fill(0xAA)), /LZMA/);
});

test('sniffFormat names what it was handed', () => {
    assert.equal(sniffFormat(fixture('microbit-blocks.hex')), 'hex');
    assert.equal(sniffFormat(fixture('arcade-shield.uf2')), 'uf2');
    assert.equal(sniffFormat(new Uint8Array([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A])), 'png');
    assert.equal(sniffFormat(new Uint8Array([0x7F, 0x45, 0x4C, 0x46])), 'elf');
    assert.equal(sniffFormat(new Uint8Array([1, 2, 3, 4])), 'bin');
});

test('a real micro:bit MakeCode .hex yields its TypeScript and its blocks', async () => {
    const res = await unpackMakeCodeSource(fixture('microbit-blocks.hex'));
    const project = describeProject(res.meta);
    assert.equal(res.format, 'hex');
    assert.equal(project.target, 'microbit');
    assert.equal(project.name, 'pins test 1');
    assert.ok(res.files, 'the project text is a file map');
    assert.match(res.files['main.ts'], /basic\.forever/);
    assert.match(res.files['main.ts'], /pins\.analogReadPin\(AnalogPin\.P0\)/);
    assert.ok(res.files['main.blocks'].startsWith('<xml'), 'blocks XML travels with it');
});

test('a real arcade-shield .hex yields the game source', async () => {
    const res = await unpackMakeCodeSource(fixture('arcade-shield.hex'));
    const project = describeProject(res.meta);
    assert.equal(project.target, 'arcade');
    assert.equal(project.name, 'ping-pong');
    assert.match(res.files['main.ts'], /sprites\.create/);
    assert.match(res.files['main.ts'], /img`/);
});

test('the .uf2 of a project carries exactly the same project as its .hex', async () => {
    const fromHex = await unpackMakeCodeSource(fixture('arcade-shield.hex'));
    const fromUf2 = await unpackMakeCodeSource(fixture('arcade-shield.uf2'));
    assert.equal(fromUf2.format, 'uf2');
    assert.deepEqual(Object.keys(fromUf2.files).sort(), Object.keys(fromHex.files).sort());
    assert.equal(fromUf2.files['pxt.json'], fromHex.files['pxt.json']);
});

test('uf2ToBin lays blocks out by address, not by order of appearance', () => {
    const bin = uf2ToBin(fixture('arcade-shield.uf2'));
    assert.ok(bin.buf.length >= 256);
    assert.equal(bin.baseAddr % 4, 0);
});

test('a file with no embedded source says so, and says what it is', async () => {
    const notMakeCode = new TextEncoder().encode(':10000000FFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFF00\n:00000001FF\n');
    await assert.rejects(
        () => unpackMakeCodeSource(notMakeCode),
        err => err.code === 'NO_EMBEDDED_SOURCE' && err.format === 'hex'
    );
});

test('a .png cartridge round-trips through the steganography', async () => {
    const blob = b64(LZMA_PROJECT);
    const width = 96;
    const height = 64;
    const image = {width, height, data: new Uint8Array(width * height * 4)};
    for (let i = 0; i < image.data.length; i += 4) {
        image.data[i] = (i * 7) & 0xFF;                  // some picture, any picture
        image.data[i + 1] = (i * 13) & 0xFF;
        image.data[i + 2] = (i * 29) & 0xFF;
        image.data[i + 3] = 0xFF;
    }
    encodePngBlob(image, blob);
    const png = encodePng(image);

    const decodedImage = await decodePng(png);
    assert.equal(decodedImage.width, width);
    assert.deepEqual(decodePngBlob(decodedImage), blob);

    const res = await unpackMakeCodeSource(png, {decodePng});
    assert.equal(res.format, 'png');
    assert.deepEqual(res.files, JSON.parse(PROJECT_TEXT));
});

test('a PNG with nothing hidden in it is rejected, not silently believed', async () => {
    const width = 8;
    const height = 8;
    const image = {width, height, data: new Uint8Array(width * height * 4).fill(0xFF)};
    await assert.rejects(() => unpackMakeCodeSource(encodePng(image), {decodePng}), /bad magic|bad bpp/);
});

test('micro:bit V1: the appended Python script comes back out', () => {
    const script = 'from microbit import *\ndisplay.show(Image.HEART)\n';
    const hex = makeAppendedScriptHex(script);
    assert.equal(readAppendedScript(buildFlashMap(hex)), script);
    const res = extractMicroPython(hex);
    assert.equal(res.variant, 'appended');
    assert.equal(res.files['main.py'], script);
});

test('micro:bit V2: the MicroPython filesystem is walked, links and all', () => {
    // Deliberately longer than one 128-byte chunk, so the double-linked
    // list — the part that can actually be wrong — is exercised.
    const main = `${'# a comment line that pads this file out\n'.repeat(9)}display.scroll("hi")\n`;
    const helper = 'def add(a, b):\n    return a + b\n';
    const hex = makeFilesystemHex({'main.py': main, 'helper.py': helper});
    const res = extractMicroPython(hex);
    assert.equal(res.variant, 'filesystem');
    assert.equal(res.files['main.py'], main);
    assert.equal(res.files['helper.py'], helper);
});

test('a MakeCode hex is not mistaken for a MicroPython one', () => {
    assert.equal(extractMicroPython(fixture('microbit-blocks.hex')), null);
});

test('share links: every shape MakeCode hands out', () => {
    assert.equal(parseShareId('https://arcade.makecode.com/S12345-67890-12345-67890'), 'S12345-67890-12345-67890');
    assert.equal(parseShareId('https://makecode.microbit.org/_bWfCf0hRXCXh'), '_bWfCf0hRXCXh');
    assert.equal(parseShareId('_bWfCf0hRXCXh'), '_bWfCf0hRXCXh');
    assert.equal(parseShareId('https://makecode.microbit.org/#pub:_bWfCf0hRXCXh'), '_bWfCf0hRXCXh');
    assert.equal(parseShareId('https://example.com/_bWfCf0hRXCXh'), null, 'only MakeCode hosts');
    assert.equal(parseShareId('hello'), null);
});

test('a shared project arrives as files', async () => {
    const files = {'main.ts': 'basic.showString("hi")', 'pxt.json': '{"name":"greeting"}'};
    const fakeFetch = async url => {
        assert.equal(url, 'https://makecode.com/api/_abcdef123456/text');
        return {ok: true, status: 200, text: async () => JSON.stringify(files)};
    };
    const res = await fetchSharedProject('_abcdef123456', {fetch: fakeFetch});
    assert.deepEqual(res.files, files);
    assert.equal(res.meta.name, 'greeting');
});

test('a missing share id is reported as missing, not as a parse failure', async () => {
    const fakeFetch = async () => ({ok: false, status: 404, text: async () => ''});
    await assert.rejects(() => fetchSharedProject('_abcdef123456', {fetch: fakeFetch}), /no project/i);
});

test('the router sends each artefact to the right outcome', async () => {
    const upy = await importArtefact(
        new TextEncoder().encode(makeAppendedScriptHex('display.show(Image.HAPPY)\n')),
        {name: 'smiley.hex'});
    assert.equal(upy.kind, 'micropython');
    assert.equal(upy.lang, 'micropython', 'lands in the tab whose language it is');
    assert.match(upy.code, /Image\.HAPPY/);

    const mb = await importArtefact(fixture('microbit-blocks.hex'), {name: 'microbit-blocks.hex'});
    assert.equal(mb.kind, 'makecode');
    assert.equal(mb.project.target, 'microbit');
    assert.equal(mb.lang, 'javascript');

    const arcade = await importArtefact(fixture('arcade-shield.hex'), {name: 'arcade-shield.hex'});
    assert.equal(arcade.project.target, 'arcade');
    assert.equal(arcade.note, 'arcade', 'so the UI can say what it cannot do with it');
});

test('the accept list and the extension test agree with each other', () => {
    for (const ext of IMPORT_ACCEPT.split(',')) {
        assert.ok(isImportableArtefact(`game${ext}`), `${ext} is offered, so it must be handled`);
    }
    assert.ok(isImportableArtefact('firmware.IHX'), 'case does not matter');
    assert.equal(isImportableArtefact('main.py'), false, 'source files still go to their tab');
    assert.equal(isImportableArtefact(''), false);
});
