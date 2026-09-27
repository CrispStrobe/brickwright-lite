import {test} from 'node:test';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {mkdtempSync, readFileSync, rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join, resolve} from 'node:path';

const root = resolve(import.meta.dirname, '..');
const cli = resolve(root, 'bin/bwlite.mjs');
const blink = resolve(root, 'overlay/scratch-gui/examples/01-blink/program.bw');
const run = (...args) => spawnSync(process.execPath, [cli, ...args], {
    cwd: tmpdir(), encoding: 'utf8'
});

test('bwlite reads 8051 C back into pseudocode from outside the repository', () => {
    const dir = mkdtempSync(join(tmpdir(), 'bwlite-cli-'));
    try {
        const c = join(dir, 'blink.c');
        const toC = run('convert', blink, '--to', 'c', '--out', c);
        assert.equal(toC.status, 0, toC.stderr);
        assert.match(readFileSync(c, 'utf8'), /@bw/);
        const back = run('read', c);
        assert.equal(back.status, 0, back.stderr);
        assert.match(back.stdout, /DEVICE STC12C5A60S2/);
        assert.match(back.stdout, /turn on led1/);
        assert.match(back.stdout, /turn off led1/);
    } finally {
        rmSync(dir, {recursive: true, force: true});
    }
});

test('bwlite SB3 conversion and read keep the 8051 program', () => {
    const dir = mkdtempSync(join(tmpdir(), 'bwlite-cli-'));
    try {
        const sb3 = join(dir, 'blink.sb3');
        const converted = run('transpile', blink, '--to', 'sb3', '--out', sb3);
        assert.equal(converted.status, 0, converted.stderr);
        const back = run('read', sb3);
        assert.equal(back.status, 0, back.stderr);
        assert.match(back.stdout, /DEVICE STC12C5A60S2/);
        assert.match(back.stdout, /turn on led1/);
    } finally {
        rmSync(dir, {recursive: true, force: true});
    }
});

test('bwlite forwards the existing machine CLI', () => {
    const result = run('machine', 'normalize');
    assert.equal(result.status, 2);
    assert.match(result.stderr, /machine-manager/);
});

test('bwlite builds with SDCC or explains the missing compiler', () => {
    // This integration check verifies both installed and missing compiler routes.
    // gate-shapes-allow: deliberately probes the user's installed SDCC.
    const hasSdcc = !spawnSync('sdcc', ['--version'], {stdio: 'ignore'}).error;
    const dir = mkdtempSync(join(tmpdir(), 'bwlite-cli-'));
    try {
        const ihx = join(dir, 'blink.ihx');
        const result = run('8051', 'build', blink, '--out', ihx);
        if (!hasSdcc) {
            assert.notEqual(result.status, 0);
            assert.match(result.stderr, /SDCC is required for 8051 build/);
            return;
        }
        assert.equal(result.status, 0, result.stderr);
        assert.match(readFileSync(ihx, 'utf8'), /^:/);
    } finally {
        rmSync(dir, {recursive: true, force: true});
    }
});
