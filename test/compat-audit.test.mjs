import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import JSZip from 'jszip';

const ROOT = path.resolve(import.meta.dirname, '..');
const CLI = path.join(ROOT, 'scripts/compat-audit.mjs');

test('CLI reports both a real MakeCode import and a missing TurboWarp opcode', async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'bw-compat-'));
    try {
        const zip = new JSZip();
        zip.file('project.json', JSON.stringify({targets: [{isStage: true, name: 'Stage',
            blocks: {x: {opcode: 'unknownwidget_doThing', next: null, parent: null, inputs: {}, fields: {}}},
            costumes: [], sounds: []}], extensions: ['unknownwidget'], extensionURLs: {}}));
        fs.writeFileSync(path.join(dir, 'unknown.sb3'), await zip.generateAsync({type: 'nodebuffer'}));
        fs.copyFileSync(path.join(ROOT, 'test/fixtures/makecode/microbit-blocks.hex'),
            path.join(dir, 'microbit.hex'));
        const json = path.join(dir, 'audit.json');
        const md = path.join(dir, 'audit.md');
        const run = spawnSync(process.execPath, ['--disable-warning=MODULE_TYPELESS_PACKAGE_JSON', CLI,
            '--out', json, '--markdown', md, dir], {cwd: ROOT, encoding: 'utf8'});
        assert.equal(run.status, 1, run.stderr);
        const report = JSON.parse(fs.readFileSync(json, 'utf8'));
        assert.equal(report.count, 2);
        assert.ok(report.rows.some(r => r.target === 'microbit' && r.translated));
        assert.deepEqual(report.rows.find(r => r.format === 'sb3').missingOpcodes.map(x => x.opcode),
            ['unknownwidget_doThing']);
        assert.match(fs.readFileSync(md, 'utf8'), /unknownwidget_doThing/);
    } finally { fs.rmSync(dir, {recursive: true, force: true}); }
});

test('CLI counts Code-to-Blocks warnings as partial imports', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'bw-compat-warnings-'));
    try {
        fs.writeFileSync(path.join(dir, 'optional.ts'), `function repeatIt(message: string, times?: number) {
    console.log(message)
}
repeatIt("Hello")`);
        const json = path.join(dir, 'audit.json');
        const run = spawnSync(process.execPath, ['--disable-warning=MODULE_TYPELESS_PACKAGE_JSON', CLI,
            '--target', 'arcade', '--out', json, path.join(dir, 'optional.ts')],
        {cwd: ROOT, encoding: 'utf8'});
        assert.equal(run.status, 0, run.stderr);
        const row = JSON.parse(fs.readFileSync(json, 'utf8')).rows[0];
        assert.equal(row.stage, 'partial');
        assert.ok(row.unsupported.some(gap => gap.includes('Code to Blocks:') &&
            gap.includes('missing argument')));
    } finally { fs.rmSync(dir, {recursive: true, force: true}); }
});

test('compiled audit separates PXT compile failures from Brickwright gaps', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'bw-compat-invalid-source-'));
    try {
        const source = path.join(dir, 'invalid.ts');
        fs.writeFileSync(source, 'let sprite = sprites.create(img`1`)\nsprite.onOverlap(function () {})\n');
        const json = path.join(dir, 'audit.json');
        const run = spawnSync(process.execPath, ['--disable-warning=MODULE_TYPELESS_PACKAGE_JSON', CLI,
            '--target', 'arcade', '--compile', '--out', json, source],
        {cwd: ROOT, encoding: 'utf8', timeout: 60000});
        assert.equal(run.status, 0, run.stderr);
        const row = JSON.parse(fs.readFileSync(json, 'utf8')).rows[0];
        assert.equal(row.stage, 'pxt-compile-failed');
        assert.equal(row.compile.status, 'fail');
        assert.ok(row.compile.diagnostics.some(diagnostic => diagnostic.includes('onOverlap')));
    } finally { fs.rmSync(dir, {recursive: true, force: true}); }
});
