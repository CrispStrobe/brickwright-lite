import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import JSZip from 'jszip';
import Creator from '../overlay/scratch-gui/src/lib/sb3-creator.js';
import {makeCodeProjectFile, readMakeCodeProjectText} from '../overlay/scratch-gui/src/lib/bw-makecode/project-file.js';
import {sniffFormat, unpackMakeCodeSource} from '../overlay/scratch-gui/src/lib/bw-makecode/embedded-source.js';
import {decodePng} from '../overlay/scratch-gui/src/lib/bw-makecode/png.js';
import {importArtefact} from '../overlay/scratch-gui/src/lib/bw-makecode/index.js';
import {encodePng, encodePngBlob} from './helpers/makecode-fixtures.mjs';
// Independent Python stdlib LZMA encoder; native {meta,source} envelope.
const compressed = Uint8Array.from(Buffer.from('XQAAgAD//////////wA9iImmlGSt1R7pQNafw3EPEntI9zA+r7Fyso+2k3I6NpNDKFZdPz47YGsSAdznm/t7TkVu5SPYab/j5DhU2ZC50fM1XKm35n7SHiCVXWuVhdjxLUq3DiDJsr0yvAHg6fGopCddSKfvJZuxYt23kzx02RVfgW55V/kesewdlvGw81MVE1EFJ73253bBdozsR18CfE27d7j9fAZTPG/6NuKUVzFHlMfRyq06qgbTrovxKOGf+9m0PQjMciLS8fV9CDNDEqklzxDNyBTGPS3hyagGZGXysJOpZVmvR5w/JMX98Mx9cgbTlFA+h/9heZEA', 'base64'));
const bytes = text => new TextEncoder().encode(text);
const files = {'main.ts': 'let actor = sprites.create(img`2`, SpriteKind.Player)',
    'pxt.json': '{"name": "Envelope fixture", "dependencies": {"device": "*"}, "files": ["main.ts"]}'};

test('native project envelope preserves every file, Unicode and target identity', async () => {
    const source = {...files, 'notes.json': '{"text":"Grüße 🧱"}'};
    const snapshot = structuredClone(source);
    for (const target of ['arcade', 'microbit']) {
        const text = makeCodeProjectFile(source, {name: 'A project', target});
        const parsed = await unpackMakeCodeSource(bytes(text));
        assert.equal(parsed.format, 'mkcd');
        assert.deepEqual(parsed.files, snapshot);
        assert.equal(parsed.meta.cloudId, `pxt/${target}`);
        assert.deepEqual(source, snapshot);
    }
    for (const prefix of ['\t\n', '\ufeff']) {
        assert.deepEqual((await unpackMakeCodeSource(bytes(prefix + makeCodeProjectFile(source)), {name: 'owned.pxt'})).files, snapshot);
    }
});
test('compressed .mkcd and current PNG project envelopes retain original metadata and import as Arcade', async () => {
    const mkcd = await unpackMakeCodeSource(compressed, {name: 'project.mkcd'});
    assert.equal(mkcd.meta.cloudId, 'pxt/arcade');
    assert.equal(sniffFormat(compressed, {name: 'project.mkcd'}), 'mkcd');
    assert.deepEqual(mkcd.files, files);
    const image = {width: 96, height: 64, data: new Uint8Array(96 * 64 * 4).fill(255)};
    encodePngBlob(image, compressed);
    const png = encodePng(image);
    assert.deepEqual((await unpackMakeCodeSource(png, {decodePng})).files, files);
    for (const [content, name] of [[png, 'editor.png'], [compressed, 'editor.mkcd']]) {
        const imported = await importArtefact(content, {name});
        assert.equal(imported.project.target, 'arcade');
        assert.equal(imported.project.name, 'Envelope fixture');
        assert.equal(imported.project.version, '4.1.25');
        assert.deepEqual(imported.unsupported, []);
    }
});
test('malformed native envelope source and metadata fail explicitly', async () => {
    for (const value of [{meta: [], source: '{}'}, {meta: {}, source: 'broken'},
        {meta: {}, source: '{"main.ts":1}'}, {meta: {}, source: '{}'}]) {
        assert.throws(() => readMakeCodeProjectText(JSON.stringify(value), 'mkcd'));
    }
    for (const value of [null, [], {}, {'main.ts': 42}]) assert.throws(() => makeCodeProjectFile(value));
    assert.throws(() => makeCodeProjectFile(files, {target: '../arcade'}), /target/);
});
test('CLI to-project and to-sb3 reopen a real generated project', async () => {
    const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'bw-native-project-'));
    try {
        const input = path.join(directory, 'game.sb3'), output = path.join(directory, 'game.mkcd'), returned = path.join(directory, 'returned.sb3');
        const creator = new Creator();creator.parse('DEVICE ARCADE\nSPRITE Game:\nWHEN flag clicked:\n  arcade set background color to 7');
        await fs.writeFile(input, new Uint8Array(await (await creator.generateSB3()).arrayBuffer()));
        const execute = promisify(execFile);
        await execute(process.execPath, ['scripts/makecode.mjs', 'to-project', input, '--target', 'arcade', '-o', output]);
        const envelope = await unpackMakeCodeSource(await fs.readFile(output));
        assert.equal(envelope.meta.cloudId, 'pxt/arcade');
        await execute(process.execPath, ['scripts/makecode.mjs', 'to-sb3', output, '-o', returned]);
        const project = JSON.parse(await (await JSZip.loadAsync(await fs.readFile(returned))).file('project.json').async('text'));
        assert.ok(project.targets.some(target => Object.values(target.blocks).some(block => block.opcode === 'arcade_setBackgroundColor')));
    } finally {await fs.rm(directory, {recursive: true, force: true});}
});
