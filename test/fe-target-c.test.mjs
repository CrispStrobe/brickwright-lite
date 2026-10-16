import assert from 'node:assert/strict';
import {execFileSync, spawnSync} from 'node:child_process';
import {mkdtempSync, writeFileSync, rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import test from 'node:test';
import {FE_COMMIT, cStringLiteral, feProgramToC} from '../overlay/scratch-gui/src/lib/bw-lang/fe-target-c.js';

test('the fe source is the commit the DOS build records, with its licence', () => {
    assert.equal(FE_COMMIT, 'ed4cda96bd582cbb08520964ba627efb40f3dd91');
    const c = feProgramToC('');
    assert.match(c, /fe_Context\* fe_open\(void \*ptr, int size\)/);
    assert.doesNotMatch(c, /FE_STANDALONE|#include "fe\.h"/);
});

test('program text becomes a plain-ASCII C literal', () => {
    assert.equal(cStringLiteral('a"b\\c?\n'), '"a\\"b\\\\c\\077\\012"');
    assert.equal(cStringLiteral('ü'), '"\\303\\274"');
});

const gcc = spawnSync('gcc', ['--version']).status === 0;
test('the generated C runs fe and prints the program\'s output', {skip: !gcc && 'no host gcc'}, () => {
    const dir = mkdtempSync(join(tmpdir(), 'fe-target-c-'));
    try {
        writeFileSync(join(dir, 'p.c'), feProgramToC(
            '(= fib (fn (n) (if (< n 2) n (+ (fib (- n 1)) (fib (- n 2))))))\n' +
            '(print "fib 15 =" (fib 15))\n(print (cons 1 (cons 2 nil)) "grüß?")\n'));
        execFileSync('gcc', ['-std=c89', '-O1', '-o', join(dir, 'p'), join(dir, 'p.c')]);
        assert.equal(execFileSync(join(dir, 'p'), {encoding: 'utf8'}), 'fib 15 = 610\n(1 2) grüß?\n');
    } finally { rmSync(dir, {recursive: true, force: true}); }
});
