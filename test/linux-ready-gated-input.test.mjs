// Console input typed before a booting Linux is listening must not vanish.
//
// The browser gate went red about 1 run in 10 with "uname -a never answered":
// the command reached a machine that was still booting, where the 8250 driver's
// port start-up clears the 16550A receive FIFO, and was silently dropped. The
// Linux lesson now HOLDS console input until bw-board reports the shell ready
// (lib/bw-debug/ready-gated-input.js, wired in debug-runner's
// attachRiscV32Linux) and flushes it the first frame the prompt is up.
//
// Measured against bw-board's real linux adapter + DebugTarget + debug session,
// with a stand-in kernel that boots SLOWLY (a counted spin), then clears its
// receive FIFO exactly as the 8250 start-up does, then prints the prompt and
// echoes. Input is typed before the first instruction runs. Deterministic: no
// wall clock is involved (the adapter's pacing clock is frozen and its
// per-frame instruction cap bounds each frame).

import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createDebugTarget, createDebugSession} from 'bw-board';
import {assembleRiscv} from 'bw-board/riscv-asm.js';
import {createReadyGatedInput, READY_GATED_INPUT_LIMIT}
    from '../overlay/scratch-gui/src/lib/bw-debug/ready-gated-input.js';

const RAM = 0x80000000;

/** A kernel that takes `spin` loop iterations to "boot", clears its RX FIFO
 *  (FCR = 0x07: enable + clear RX + clear TX, the 8250 start-up), then prints
 *  the markers bw-board's boot progress reads, then echoes the UART. */
function slowKernel (spin) {
    const asm = assembleRiscv(`
        .text
_start: lui s0, 0x10000
        la a0, banner
        call puts
        li t3, ${spin}
boot:   addi t3, t3, -1
        bnez t3, boot
        li t0, 7
        sb t0, 2(s0)
        la a0, prompt
        call puts
echo:   lbu t1, 5(s0)
        andi t1, t1, 1
        beqz t1, echo
        lbu t2, 0(s0)
        sb t2, 0(s0)
        j echo
puts:   lbu t0, 0(a0)
        beqz t0, done
        sb t0, 0(s0)
        addi a0, a0, 1
        j puts
done:   ret
        .data
banner: .string "Linux version 6.1.0-slow\\n"
prompt: .string "Run /init as init process\\nBWB-LINUX-USERSPACE-UP\\nbwb# "
`, {textBase: RAM, dataBase: RAM + 0x1000});
    assert.ok(asm.ok, JSON.stringify(asm.errors || asm.error));
    const kernel = new Uint8Array(0x2000);
    for (const {addr, bytes} of asm.image.segments) kernel.set(bytes, addr - RAM);
    return kernel;
}

/** Boot the stand-in the way debug-runner does and type `line` at once,
 *  through `makeInput(target)`; return the console after `frames` frames. */
async function typeDuringBoot (makeInput, {line = 'uname -a\r', frames = 400, spin = 300_000} = {}) {
    const {target, adapter} = await createDebugTarget('riscv32', {
        linux: {kernel: slowKernel(spin), now: () => 0, maxInstructionsPerAdvance: 20_000}
    });
    let out = '';
    adapter.onSerial(b => { out += String.fromCharCode(b); });
    const session = createDebugSession(target, {onChange () {}});
    session.start();
    const input = makeInput(target);
    for (const ch of line) input.push(ch.charCodeAt(0));
    assert.equal(target.linuxProgress().ready, false, 'the text was typed while the kernel was still booting');
    let readyAt = -1;
    for (let f = 0; f < frames; f++) {
        session.pump();
        if (readyAt < 0 && target.linuxProgress().ready) readyAt = f;
        input.flush();                       // what debug-runner's per-frame watch does
    }
    return {out, readyAt};
}

const gated = target => createReadyGatedInput({
    isReady: () => target.linuxProgress().ready,
    send: b => target.sendSerial(b)
});

test('input typed during a slow boot is held and delivered once the shell is up', async () => {
    const {out, readyAt} = await typeDuringBoot(gated);
    assert.ok(readyAt > 10, `the boot really was slow (ready at frame ${readyAt})`);
    assert.ok(out.endsWith('bwb# uname -a\r'),
        `the command reached the shell after its prompt: ${JSON.stringify(out.slice(-30))}`);
});

test('CONTROL: the same bytes sent straight to the UART during the boot are lost', async () => {
    // Why the gate exists. Without it the FIFO clear at start-up eats them.
    const direct = target => ({push: b => target.sendSerial(b), flush: () => 0});
    const {out, readyAt} = await typeDuringBoot(direct);
    assert.ok(readyAt > 10);
    assert.ok(out.endsWith('bwb# '), `nothing came back: ${JSON.stringify(out.slice(-30))}`);
});

test('once ready and drained, bytes pass straight through, in order', () => {
    let ready = false;
    const sent = [];
    const g = createReadyGatedInput({isReady: () => ready, send: b => { sent.push(b); return true; }});
    assert.equal(g.push(0x61), true);
    assert.equal(g.push(0x62), true);
    assert.deepEqual(sent, [], 'held while not ready');
    assert.equal(g.pending(), 2);
    ready = true;
    g.push(0x63);                             // flushes the queue first, then this one
    assert.deepEqual(sent, [0x61, 0x62, 0x63]);
    g.push(0x64);
    assert.deepEqual(sent, [0x61, 0x62, 0x63, 0x64]);
    assert.equal(g.flush(), 0);
});

test('the queue is bounded and says so rather than dropping silently', () => {
    const g = createReadyGatedInput({isReady: () => false, send: () => true});
    for (let i = 0; i < READY_GATED_INPUT_LIMIT; i++) assert.equal(g.push(0x20), true);
    assert.equal(g.push(0x20), false, 'the byte over the bound is refused, visibly');
    assert.throws(() => createReadyGatedInput({send () {}}), /isReady/);
});
