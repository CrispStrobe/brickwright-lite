import assert from 'node:assert/strict';
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

test('the generated C reads the whole program, evaluates each form and resets the GC', () => {
    const c = feProgramToC('(print 1)', {arenaBytes: 4096});
    assert.ok(c.includes('static const char bw_program[] = "(print 1)";'));
    assert.ok(c.includes('static char bw_arena[4096];'));
    const main = c.slice(c.indexOf('int main(void) {'));
    for (const step of ['fe_open(bw_arena, sizeof bw_arena)', 'fe_read(ctx, bw_next, &p)',
        'if (!expr) break;', 'fe_eval(ctx, expr);', 'fe_restoregc(ctx, gc);', 'fe_close(ctx);']) {
        assert.ok(main.includes(step), step);
    }
});
