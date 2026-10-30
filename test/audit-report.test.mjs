import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {spawnSync} from 'node:child_process';

test('public roundtrip summary keeps structural and compile categories and removes private diagnostics', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'bw-public-audit-'));
    try {
        const input = path.join(dir, 'report.json');
        const output = path.join(dir, 'report.md');
        const label = 'makecode -> bw -> makecode -> bw';
        fs.writeFileSync(input, JSON.stringify({generatedAt: 'fixture', rows: [
            {file: '/mnt/storage/private/secret.ts', target: 'arcade', paths: [
                {label, compile: {status: 'fail', diagnostics: ['ghp_secret123 /home/private/source.ts']},
                    differences: {lostOpcodes: []}}
            ]},
            {format: 'sb3', target: 'scratch', paths: [{label: 'project -> bw -> project',
                differences: {missingAssets: ['art']}, binaryAssetsNotRepresented: true}]},
            {target: 'arcade', paths: [{label, exportUnsupported: ['rotation', 'rotation'],
                differences: {lostOpcodes: []}}]}
        ]}));
        const run = spawnSync(process.execPath, ['scripts/report-roundtrips.mjs', input, output],
            {cwd: path.resolve(import.meta.dirname, '..'), encoding: 'utf8'});
        assert.equal(run.status, 0, run.stderr);
        const text = fs.readFileSync(output, 'utf8');
        assert.match(text, /Scratch-format SB3/);
        assert.match(text, /Arcade TypeScript.*\| 0 \| 1 \| 0 \| 1 \|/);
        assert.match(text, /Scratch-format SB3.*\| 0 \| 0 \| 1 \|/);
        assert.match(text, /\| 1 \| rotation \|/); // projects, not repeated diagnostics
        assert.match(text, /No runtime or behavioral equivalence is measured/);
        assert.doesNotMatch(text, /secret|\/mnt\/|\/home\/|ghp_/);
        assert.match(text, /input 1 \| fail/);
    } finally { fs.rmSync(dir, {recursive: true, force: true}); }
});

test('a binary-asset hop with no differences is reported apart from a measured loss', async () => {
    const {pathOutcome, structuralOutcome, BINARY_NOT_COMPARED} = await import('../scripts/lib/roundtrip-status.mjs');
    const none = {missingTargets: [], lostOpcodes: [], missingAssets: []};
    assert.equal(structuralOutcome({differences: none, binaryAssetsNotRepresented: true}), BINARY_NOT_COMPARED);
    assert.equal(structuralOutcome({differences: {...none, missingAssets: ['art']}, binaryAssetsNotRepresented: true}), 'loss');
    assert.equal(structuralOutcome({differences: none, binaryAssetsNotRepresented: true, exportUnsupported: ['x']}), 'partial');
    assert.equal(structuralOutcome({differences: none}), 'preserved');
    assert.equal(pathOutcome({differences: none, compile: {status: 'fail'}}), 'compile-failed');

    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'bw-public-audit-'));
    try {
        const input = path.join(dir, 'report.json'), output = path.join(dir, 'report.md');
        fs.writeFileSync(input, JSON.stringify({generatedAt: 'fixture', rows: [{target: 'arcade', paths: [
            {label: 'makecode -> bw -> sb3 -> bw -> project', differences: none, binaryAssetsNotRepresented: true}]}]}));
        const run = spawnSync(process.execPath, ['scripts/report-roundtrips.mjs', input, output],
            {cwd: path.resolve(import.meta.dirname, '..'), encoding: 'utf8'});
        assert.equal(run.status, 0, run.stderr);
        assert.match(fs.readFileSync(output, 'utf8'),
            /Arcade TypeScript \| makecode -> bw -> sb3 -> bw -> project \| 0 \| 0 \| 0 \| 0 \| 0 \| 0 \| 1 \|/);
    } finally { fs.rmSync(dir, {recursive: true, force: true}); }
});
