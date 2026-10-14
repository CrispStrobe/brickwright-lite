import test from 'node:test';
import assert from 'node:assert/strict';
import {addCLineRecords, buildSymbolTable, parseCdb, SymbolTableError} from '../overlay/scratch-gui/src/lib/sdcc-wasm/symtab.js';

const SOURCE = `/* @bw-begin
 * @bw yield bw_task0 0 block%2FA hat
 * @bw yield bw_task0 1 blockB wait
 * @bw var counter "Counter"
 * @bw-end */
static void bw_task0(void)
{
  switch (bw_task0_state) {
    case 0:
      bw_task0_state = 1;
    case 1:
      return;
  }
}`;
const CDB = `M:main
S:Fmain$bw_ms$0_0$0({2}SI:U),E,0,0
S:Fmain$bw_task0_state$0_0$0({2}SI:U),E,0,0
S:Fmain$bw_task0_until$0_0$0({2}SI:U),E,0,0
S:Fmain$counter$0_0$0({2}SI:U),E,0,0
L:Fmain$bw_ms$0_0$0:8
L:Fmain$bw_task0$0_0$0:E2
L:Fmain$bw_task0_state$0_0$0:C
L:Fmain$bw_task0_until$0_0$0:E
L:Fmain$counter$0_0$0:10
L:C$main.c$9$0_0$2:105
L:C$main.c$11$0_0$2:10A`;

test('browser symbol builder emits protocol 004 addresses and decoded block ids', () => {
    const out = buildSymbolTable(CDB, SOURCE, {fosc: 12000000, device: 'stc12c5a60s2'});
    assert.deepEqual(out.scheduler.bw_ms, {space: 'iram', addr: 8, size: 2});
    assert.equal(out.scheduler.tasks[0].func_addr, 0xe2);
    assert.deepEqual(out.scheduler.tasks[0].yields.map(y => [y.state, y.addr, y.block]),
        [[0, 0x105, 'block/A'], [1, 0x10a, 'blockB']]);
    assert.deepEqual(out.variables[0], {c: 'counter', name: 'Counter', space: 'iram', addr: 0x10, size: 2});
});

test('browser symbol builder refuses mismatched yield metadata and unknown spaces', () => {
    assert.throws(() => buildSymbolTable(CDB, SOURCE.replace('bw_task0 1', 'bw_task0 2')), SymbolTableError);
    const bad = CDB.replace('({2}SI:U),E,0,0', '({2}SI:U),Z,0,0');
    assert.throws(() => buildSymbolTable(bad, SOURCE), /unmapped SDCC address space/);
    assert.equal(parseCdb(CDB).lines.size, 2);
});

test('c1mode assembly markers recover linked C-line records without an ADB sidecar', () => {
    const cdb = 'M:main\nL:A$main$3:105\nL:A$main$5:10A\n';
    const asm = ['.module main', '; /work/main.c:9: case 0', 'inc r0',
        '; /work/main.c:11: case 1', 'ret'].join('\n');
    const parsed = parseCdb(addCLineRecords(cdb, asm));
    assert.equal(parsed.lines.get(`main.c\0${9}`), 0x105);
    assert.equal(parsed.lines.get(`main.c\0${11}`), 0x10a);
});
