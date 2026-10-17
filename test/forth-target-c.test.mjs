import assert from 'node:assert/strict';
import test from 'node:test';
import {ZF_COMMIT, ZF_CONF, forthProgramToC} from '../overlay/scratch-gui/src/lib/bw-lang/forth-target-c.js';

test('the zForth source is the commit the DOS build records, configured for float cells', () => {
    assert.equal(ZF_COMMIT, '41db72d165c1539d57f3f79970fc57ea881a79dc');
    assert.ok(ZF_CONF.includes('typedef float zf_cell;'));
    assert.ok(ZF_CONF.includes('#define ZF_ENABLE_TRACE 0'));
    const c = forthProgramToC('');
    assert.ok(c.includes('zf_result zf_eval(zf_ctx *ctx, const char *buf)'));
    assert.ok(!c.includes('#include "zfconf.h"') && !c.includes('#include "zforth.h"'));
});

test('the generated C boots core.zf, then evaluates the program line by line', () => {
    const c = forthProgramToC('1 2 + .');
    assert.ok(c.includes('static const char bw_program[] = "1 2 + .";'));
    assert.ok(c.includes(': var '), 'core.zf (which defines var) is embedded');
    const main = c.slice(c.indexOf('int main(void) {'));
    const order = ['zf_init(&bw_ctx, 0);', 'zf_bootstrap(&bw_ctx);', 'bw_eval_lines(&bw_ctx, bw_core)',
        'bw_eval_lines(&bw_ctx, bw_program)'].map(step => main.indexOf(step));
    assert.ok(order.every(at => at >= 0), 'every boot step is present');
    assert.deepEqual([...order].sort((a, b) => a - b), order, 'in boot order');
});

test('the host prints strings byte by byte and escapes are real C escapes', () => {
    const c = forthProgramToC('');
    assert.ok(c.includes('for (i = 0; i < (int)len; i++) putchar(buf[i]);'));
    assert.ok(c.includes("text[n] != '\\n'") && !c.includes("'\\\\n'"));
});
