import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import test from 'node:test';
import {JIMSH0_SHA256, JIMSH0_URL, fetchTclProgramC, tclProgramToC} from '../overlay/scratch-gui/src/lib/bw-lang/tcl-target-c.js';

const shipped = readFileSync(new URL(`../overlay/scratch-gui/${JIMSH0_URL}`, import.meta.url), 'utf8');
const provenance = JSON.parse(readFileSync(new URL('../overlay/scratch-gui/static/roms/jim.provenance.json', import.meta.url), 'utf8'));
const serve = text => async () => ({ok: true, text: async () => text});

test('the shipped jimsh0.c is the pinned file and the only one accepted', async () => {
    assert.equal(JIMSH0_SHA256, provenance.jimsh0Sha256);
    const c = await fetchTclProgramC('puts hi', serve(shipped));
    assert.ok(c.includes('static const char bw_program[] = "puts hi";'));
    await assert.rejects(fetchTclProgramC('puts hi', serve(`${shipped} `)), /expected/);
    await assert.rejects(fetchTclProgramC('puts hi', async () => ({ok: false, status: 404})), /HTTP 404/);
});

test('the board edits apply: no exec/readdir/glob, channel-aware puts, our main', () => {
    const c = tclProgramToC(shipped, '');
    for (const gone of ['#define jim_ext_exec\n', '#define jim_ext_readdir\n', '#define jim_ext_glob\n',
        'Jim_execInit(interp);\n', 'Jim_globInit(interp);\n']) assert.ok(!c.includes(gone), gone);
    assert.ok(c.includes('#if 0 /* readdir: no dirent */'));
    assert.ok(c.includes('{"puts", Jim_PutsCoreCommand, 1, 3, "?-nonewline? ?channel? string" },'));
    assert.ok(c.startsWith('#define BW_BOARD_STUBS 1\n#define main bw_jimsh_main\n'));
    const main = c.slice(c.lastIndexOf('int main(void) {'));
    const order = ['Jim_CreateInterp()', 'Jim_RegisterCoreCommands(interp);', 'Jim_InitStaticExtensions(interp)',
        'Jim_CreateCommand(interp, "puts", Jim_PutsCoreCommand, NULL, NULL);', 'Jim_Eval(interp, bw_program)']
        .map(step => main.indexOf(step));
    assert.ok(order.every(at => at >= 0), 'every step is present');
    assert.deepEqual([...order].sort((a, b) => a - b), order, 'in order');
});

test('a jimsh0.c whose edit anchors moved is refused, not half-edited', () => {
    assert.throws(() => tclProgramToC(shipped.replace('#define jim_ext_glob\n', ''), ''), /edit anchor/);
});
