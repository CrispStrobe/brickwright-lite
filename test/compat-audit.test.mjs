import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import JSZip from 'jszip';
import {hasRuntime} from '../scripts/lib/pxt-node.mjs';

// Ported from the parked Codex WIP (task F1 of docs/OPEN-TASKS-2026-09-29.md).
// The corpus itself is not in this repository; these are small inline fixtures.
const ROOT = path.resolve(import.meta.dirname, '..');
const CLI = path.join(ROOT, 'scripts/compat-audit.mjs');

test('CLI reports both a real MakeCode import and a missing Scratch extension opcode', async () => {
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
            '--out', json, '--markdown', md, '--corpus-commit', '1'.repeat(40), dir], {cwd: ROOT, encoding: 'utf8'});
        assert.equal(run.status, 1, run.stderr);
        const report = JSON.parse(fs.readFileSync(json, 'utf8'));
        assert.equal(report.count, 2);
        assert.equal(report.provenance.corpus.declaredCommit, '1'.repeat(40));
        assert.equal(report.provenance.corpus.commitVerified, false);
        assert.match(report.provenance.source.commit, /^[a-f0-9]{40}$/);
        assert.match(report.provenance.corpus.contentMultisetSha256, /^[a-f0-9]{64}$/);
        assert.ok(report.provenance.vendorPins['sb3-creator']);
        assert.deepEqual(report.gapRanking.find(g => g.family === 'scratch: unknownwidget_doThing'),
            {family: 'scratch: unknownwidget_doThing', affectedProjects: 1, occurrences: 1});
        assert.ok(!fs.readFileSync(md, 'utf8').includes(dir));
        assert.ok(report.rows.some(r => r.target === 'microbit' && r.translated));
        assert.deepEqual(report.rows.find(r => r.format === 'sb3').missingOpcodes.map(x => x.opcode),
            ['unknownwidget_doThing']);
        assert.match(fs.readFileSync(md, 'utf8'), /unknownwidget_doThing/);
    } finally { fs.rmSync(dir, {recursive: true, force: true}); }
});

test('CLI preserves the named empty-body warning without treating it as a parse failure', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'bw-compat-warnings-'));
    try {
        // Empty bodies parse, but the parser still reports its named warning.
        // Keep that warning visible in the static compatibility classification.
        fs.writeFileSync(path.join(dir, 'optional.ts'), 'if (0) {\n}\nlet x = 1\n');
        const json = path.join(dir, 'audit.json');
        const run = spawnSync(process.execPath, ['--disable-warning=MODULE_TYPELESS_PACKAGE_JSON', CLI,
            '--target', 'arcade', '--out', json, path.join(dir, 'optional.ts')],
        {cwd: ROOT, encoding: 'utf8'});
        assert.equal(run.status, 0, run.stderr);
        const row = JSON.parse(fs.readFileSync(json, 'utf8')).rows[0];
        assert.equal(row.stage, 'partial');
        assert.equal(row.staticTranslation.status, 'partial');
        assert.ok(row.blockCount > 0);
        assert.ok(row.unsupported.some(gap => gap.includes('Code to Blocks:') &&
            gap.includes('Empty body')));
        assert.equal(row.qualification.behavioralEquivalence, 'not-measured');
    } finally { fs.rmSync(dir, {recursive: true, force: true}); }
});

test('compiled audit separates PXT compile failures from Brickwright gaps',
    {skip: hasRuntime('arcade') ? false : 'MakeCode runtime not synced (npm run sync:makecode) — pxt compiler absent'}, () => {
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

test('executed audit runs an Arcade import with its imported artwork, as the importer GUI does', () => {
    // Without the importer's costumes every Arcade image read failed in the
    // VM ("cannot read this sprite artwork"): the run measured the harness,
    // not the game. 22 of the 89 translated corpus games failed that way.
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'bw-compat-execute-'));
    try {
        const source = path.join(dir, 'paint.ts');
        fs.writeFileSync(source, `let hero = sprites.create(img\`
    . . 2 2 . .
    . 2 2 2 2 .
    . . 2 2 . .
\`, SpriteKind.Player)
hero.image.fill(5)
`);
        const json = path.join(dir, 'audit.json');
        const run = spawnSync(process.execPath, ['--disable-warning=MODULE_TYPELESS_PACKAGE_JSON', CLI,
            '--target', 'arcade', '--execute', '--out', json, source],
        {cwd: ROOT, encoding: 'utf8', timeout: 120000});
        assert.equal(run.status, 0, run.stderr);
        const row = JSON.parse(fs.readFileSync(json, 'utf8')).rows[0];
        assert.equal(row.stage, 'translated', JSON.stringify(row.unsupported));
        assert.deepEqual(row.execution.errors, []);
        assert.equal(row.execution.status, 'stepped');
        assert.equal(row.qualification.behavioralEquivalence, 'not-measured');
        assert.equal(row.qualification.staticTranslation, 'translated');
        assert.equal(row.qualification.originalCompile, 'not-requested');
    } finally { fs.rmSync(dir, {recursive: true, force: true}); }
});
