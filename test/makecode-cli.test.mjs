/**
 * The MakeCode CLI (scripts/makecode.mjs): Scratch <-> MakeCode firmware, run
 * as a user runs it — a child process, its exit code, the files it writes.
 *
 *   - a MakeCode file becomes an .sb3 (no compiler needed): a zip whose
 *     project.json carries the program's sprites;
 *   - a project becomes the project file MakeCode opens (--source), and our own
 *     importer reads the same files back;
 *   - the full circle with MakeCode's compiler: .bw -> firmware -> .sb3 ->
 *     firmware, and the program survives it (needs the synced runtime);
 *   - refusals and bad usage are exit codes, not stack traces.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import JSZip from 'jszip';
import {importArtefact} from '../overlay/scratch-gui/src/lib/bw-makecode/index.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const CLI = path.join(ROOT, 'scripts/makecode.mjs');
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'bw-makecode-cli-'));
const run = (...args) => spawnSync(process.execPath, ['--disable-warning=MODULE_TYPELESS_PACKAGE_JSON', CLI, ...args],
    {cwd: ROOT, encoding: 'utf8', timeout: 600000});
const synced = fs.existsSync(path.join(ROOT, 'packages/scratch-gui/static/makecode/microbit/pxtworker.js'));
const arcadeBase = fs.existsSync(path.join(ROOT, 'packages/scratch-gui/static/makecode/arcade/hexcache'));

test('a MakeCode game becomes an .sb3 with its sprites', async () => {
    const out = path.join(tmp, 'game.sb3');
    const r = run('to-sb3', path.join(ROOT, 'test/fixtures/makecode/arcade-assets.hex'), '-o', out);
    assert.equal(r.status, 0, r.stderr);
    const zip = await JSZip.loadAsync(fs.readFileSync(out));
    const project = JSON.parse(await zip.file('project.json').async('string'));
    const sprites = project.targets.filter(t => !t.isStage);
    assert.ok(sprites.length >= 2, `${sprites.length} sprites`);
    assert.ok(Object.keys(zip.files).some(f => /\.svg$/.test(f)), 'no costume artwork in the .sb3');
});

test('a MakeCode TypeScript file converts directly for its selected target', async () => {
    const source = path.join(tmp, 'direct.ts');
    const out = path.join(tmp, 'direct.sb3');
    fs.writeFileSync(source, 'let hero = sprites.create(img`1`, SpriteKind.Player)\nhero.x = 80\n');
    const r = run('to-sb3', source, '--target', 'arcade', '-o', out);
    assert.equal(r.status, 0, r.stderr);
    const zip = await JSZip.loadAsync(fs.readFileSync(out));
    const project = JSON.parse(await zip.file('project.json').async('string'));
    assert.ok(project.targets.some(t => t.name === 'hero'));
});

test('--source writes the project file MakeCode opens, and it reads back', async () => {
    const out = path.join(tmp, 'mb-project.hex');
    const r = run('to-hex', path.join(ROOT, 'overlay/scratch-gui/examples/mb01-display/program.bw'), '--source', '-o', out);
    assert.equal(r.status, 0, r.stderr);
    const back = await importArtefact(new Uint8Array(fs.readFileSync(out)), {name: 'mb-project.hex'});
    assert.equal(back.project.target, 'microbit');
    assert.match(back.files['main.ts'], /basic\.showString\("Hello"\)/);
});

test('bad usage is an exit code, not a crash', () => {
    assert.equal(run('to-hex').status, 2);
    assert.equal(run('frobnicate', 'x').status, 2);
});

// Gated with skip, not an early return: an early return is a PASS, and would
// hide that the Arcade half never ran on a box without the synced runtime.
test('a board-less Arcade firmware request asks for a board by name',
    {skip: !synced && 'MakeCode runtime not synced (npm run sync:makecode)'}, () => {
    const sb3 = path.join(tmp, 'game.sb3');
    if (!fs.existsSync(sb3)) run('to-sb3', path.join(ROOT, 'test/fixtures/makecode/arcade-assets.hex'), '-o', sb3);
    const r = run('to-hex', sb3, '--target', 'arcade', '-o', path.join(tmp, 'game.hex'));
    assert.equal(r.status, 2);
    assert.match(r.stderr, /Arcade firmware needs --board/);
});

test('the CLI builds a flashable Arcade UF2 for a named board',
    {skip: !arcadeBase && 'Arcade firmware bases not synced', timeout: 900000}, async () => {
        const source = path.join(tmp, 'arcade-cli.bw');
        const firmware = path.join(tmp, 'arcade-cli.uf2');
        fs.writeFileSync(source, 'DEVICE ARCADE\nSPRITE hero:\nWHEN flag clicked:\n  FOREVER:\n    change x by 1\n');
        const r = run('to-hex', source, '--target', 'arcade', '--board', 'rp2040', '-o', firmware);
        assert.equal(r.status, 0, r.stderr);
        const bytes = new Uint8Array(fs.readFileSync(firmware));
        assert.ok(bytes.length > 100000 && bytes.length % 512 === 0);
        const project = await importArtefact(bytes, {name: 'arcade-cli.uf2'});
        assert.equal(project.project.target, 'arcade');
        assert.match(project.files['main.ts'], /let hero = sprites\.create/);
    });

test('the full circle: .bw -> micro:bit firmware -> .sb3 -> firmware, and the program survives',
    {skip: synced ? false : 'MakeCode runtime not synced (npm run sync:makecode) — pxt compiler absent', timeout: 900000}, async () => {
        const hex1 = path.join(tmp, 'hello.hex');
        const sb3 = path.join(tmp, 'hello.sb3');
        const hex2 = path.join(tmp, 'hello2.hex');
        let r = run('to-hex', path.join(ROOT, 'overlay/scratch-gui/examples/microbit01-hello/program.bw'), '-o', hex1);
        assert.equal(r.status, 0, r.stderr);
        assert.ok(fs.statSync(hex1).size > 600000, 'not a firmware-sized .hex');
        r = run('to-sb3', hex1, '-o', sb3);
        assert.equal(r.status, 0, r.stderr);
        r = run('to-hex', sb3, '-o', hex2);
        assert.equal(r.status, 0, r.stderr);
        const a = await importArtefact(new Uint8Array(fs.readFileSync(hex1)), {name: 'a.hex'});
        const b = await importArtefact(new Uint8Array(fs.readFileSync(hex2)), {name: 'b.hex'});
        assert.equal(b.files['main.ts'], a.files['main.ts'], 'the program changed on the way round');
    });
