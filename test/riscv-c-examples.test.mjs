// The RISC-V C starter programs (Code tab) must be honest about their route.
// A `browser` example has to compile in the in-browser shecc subset; a `server`
// example has to be something that subset REJECTS (otherwise it would not need
// the hosted full-C compiler, and the label would mislead). We prove both by
// actually running the source through bw-board's shecc.wasm — the same compiler
// the browser route uses — so an example that quietly drifts out of (or into)
// the subset is caught here, not by a confused learner.

import {test} from 'node:test';
import assert from 'node:assert/strict';
import {riscvCExamplesFor} from '../overlay/scratch-gui/src/lib/bw-asm/examples.js';
import {compileRiscvC, RiscvCcError} from 'bw-board/riscv-cc-wasm.js';

const EX = riscvCExamplesFor('riscv32');

test('riscv32 offers C starters; non-riscv devices get none', () => {
    assert.ok(EX.length >= 2, 'at least a subset and a full-C example');
    assert.equal(riscvCExamplesFor('i8086').length, 0);
    assert.equal(riscvCExamplesFor('z80').length, 0);
    for (const ex of EX) {
        assert.ok(ex.id && ex.label && ex.labelDe, `${ex.id} has id + both labels`);
        assert.ok(['browser', 'server'].includes(ex.route), `${ex.id} names a valid route`);
        assert.ok(ex.source.includes('\n') && /main\s*\(/.test(ex.source), `${ex.id} is a real program`);
    }
});

test('there is at least one of each route (a subset one and a full-C one)', () => {
    assert.ok(EX.some(e => e.route === 'browser'), 'a no-server subset example');
    assert.ok(EX.some(e => e.route === 'server'), 'a full-C (server) example');
});

for (const ex of EX) {
    test(`${ex.id}: its route label is honest against the shecc subset`, async () => {
        let compiles;
        try { await compileRiscvC(ex.source); compiles = true; }
        catch (e) {
            assert.ok(e instanceof RiscvCcError, `${ex.id} failed for an unexpected reason`);
            // a compile error means shecc's subset does not accept it
            compiles = !(e.reason === 'compile');
            if (e.reason !== 'compile') throw e;   // a tool/transport failure is a test bug
        }
        if (ex.route === 'browser') {
            assert.equal(compiles, true, `${ex.id} is labelled browser but shecc rejects it`);
        } else {
            assert.equal(compiles, false, `${ex.id} is labelled server but shecc ACCEPTS it — it does not need the server`);
        }
    });
}
