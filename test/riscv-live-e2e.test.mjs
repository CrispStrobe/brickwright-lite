// Live end-to-end: the DEPLOYED stc-compiler actually compiles C for RISC-V and
// the image it returns actually boots. This is the whole hosted path with no
// mocks — lite's own client (lib/bw-debug/riscv-compile.js) POSTs to the live
// service, and bw-board's RiscV32Machine runs the result — so a deploy that
// regresses the contract, the target, or the image shape is caught here rather
// than by a user. Like test/asm-examples.test.mjs it needs the network and
// SKIPS cleanly (a real node:test skip, not a silent pass) when the service is
// unreachable; when it is reachable it must genuinely work.

import {test} from 'node:test';
import assert from 'node:assert/strict';
import {compileRiscvC} from '../overlay/scratch-gui/src/lib/bw-debug/riscv-compile.js';
import {RiscV32Machine} from 'bw-board/riscv32-machine.js';

const ENDPOINT = 'https://stc-compiler.vercel.app';

// Boot an image the way the debug-runner does: place segments, give _start a
// valid stack with argc=0, run, return the console output.
function boot (image) {
    const memSize = 1 << 22;
    const m = new RiscV32Machine({memSize, resetPc: image.entry});
    for (const {addr, bytes} of image.segments) m.load(bytes, addr);
    const sp = (memSize - 4096) >>> 0;
    m.cpu.x[2] = sp | 0;
    for (let i = 0; i < 32; i++) m.mem[sp + i] = 0;
    m.run(50_000_000);
    return m;
}

// One probe decides reachability for the whole file (a cold start can take a
// few seconds, hence the generous timeout).
const online = await (async () => {
    try {
        const r = await compileRiscvC({
            source: 'int main(){return 0;}', endpoint: ENDPOINT, target: 'riscv32-gcc',
            fetchImpl: (u, o) => fetch(u, {...o, signal: AbortSignal.timeout(45000)})
        });
        return r.ok === true;
    } catch { return false; }
})();
const SKIP = online ? false : 'the deployed stc-compiler is not reachable';

test('the deployed service compiles FULL C (riscv32-gcc) and the image boots',
    {skip: SKIP}, async () => {
        const src = `#include <stdio.h>
#include <stdlib.h>
#include <math.h>
static int cmp(const void *a, const void *b) { return *(const int*)a - *(const int*)b; }
int main(void) {
    int v[5] = {5, 3, 9, 1, 7};
    qsort(v, 5, sizeof(int), cmp);
    for (int i = 0; i < 5; i++) printf("%d ", v[i]);
    printf("\\nsqrt2=%.5f\\n", sqrt(2.0));
    return 0;
}`;
        const r = await compileRiscvC({source: src, endpoint: ENDPOINT, target: 'riscv32-gcc'});
        assert.equal(r.ok, true, r.reason || 'the live service refused a valid full-C program');
        const m = boot(r.image);
        assert.ok(m.halted, 'the program halted');
        assert.match(m.output, /1 3 5 7 9/, 'qsort ran (full C)');
        assert.match(m.output, /sqrt2=1\.41421/, 'float printf + math.h ran (full C — shecc cannot)');
    });

test('the deployed service compiles the shecc subset (riscv32) and it boots',
    {skip: SKIP}, async () => {
        const r = await compileRiscvC({
            source: 'int main(){ for(int i=0;i<3;i++) printf("shecc %d\\n", i); return 0; }',
            endpoint: ENDPOINT, target: 'riscv32'});
        assert.equal(r.ok, true, r.reason || 'the live service refused a subset program');
        assert.match(boot(r.image).output, /shecc 0\nshecc 1\nshecc 2/);
    });

test('the deployed service reports a compile error as the program\'s',
    {skip: SKIP}, async () => {
        const r = await compileRiscvC({source: 'int main(){ this is broken ; }',
            endpoint: ENDPOINT, target: 'riscv32-gcc'});
        assert.equal(r.ok, false, 'a broken program must be refused');
        assert.ok(!/service|unreachable|429/i.test(String(r.code)),
            'the refusal is the program\'s, not a transport/rate-limit error');
    });
