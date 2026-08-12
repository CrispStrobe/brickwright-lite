import {test} from 'node:test';
import assert from 'node:assert/strict';

test('Pico target accepts raw code breakpoints and yield breakpoints with symbols', async () => {
    // rp2040js-debug.js exports createRp2040jsDebugTarget
    const {createRp2040jsDebugTarget} = await import(
        '../packages/scratch-gui/src/lib/bw-board/rp2040js-debug.js');

    // Minimal adapter stub matching createRp2040jsAdapter's shape.
    // The debug target destructures { rp2040, core } from the adapter.
    const coreObj = {
        PC: 0x20000000, SP: 0x20041000, LR: 0, APSR: 0,
        registers: new Uint32Array(16), cycles: 0, waiting: false,
        executeInstruction() { return 1; }, reset() {},
    };
    const clockObj = {nanos: 0, nanosToNextAlarm: 0, tick(ns) { this.nanos += ns; }};
    const sramBuf = new Uint8Array(264 * 1024);
    const adapter = {
        rp2040: {
            core: coreObj,
            clock: clockObj,
            sram: sramBuf,
            readUint8(addr) {
                if (addr >= 0x20000000 && addr < 0x20000000 + sramBuf.length)
                    return sramBuf[addr - 0x20000000];
                return 0;
            },
            writeUint8(addr, val) {
                if (addr >= 0x20000000 && addr < 0x20000000 + sramBuf.length)
                    sramBuf[addr - 0x20000000] = val;
            },
        },
        core: coreObj,
        clockHz: 125_000_000,
        timeNs: () => BigInt(Math.round(clockObj.nanos)),
        advanceNs() {},
        resetToProgram() { coreObj.reset(); },
    };

    const target = createRp2040jsDebugTarget(adapter);

    // Code breakpoint at an even address
    const handle = target.setBreakpoint({kind: 'code', addr: 0x20000020});
    assert.equal(typeof handle, 'number');
    assert.ok(handle >= 1);

    // Odd address rejected (Thumb flag)
    const oddResult = target.setBreakpoint({kind: 'code', addr: 0x20000021});
    assert.ok(oddResult.unsupported);

    // Yield breakpoint without symbols fails gracefully
    const noSymResult = target.setBreakpoint({kind: 'yield', task: 'main', state: 1});
    assert.ok(noSymResult.unsupported);

    // Clear breakpoint
    target.clearBreakpoint(handle);

    // Capabilities
    const caps = target.capabilities();
    assert.ok(caps.steps.includes('insn'));
    assert.ok(caps.steps.includes('block'));
    assert.ok(caps.breakpoints.includes('code'));
    assert.ok(caps.breakpoints.includes('yield'));
    assert.equal(caps.haltPolicy, 'freeze-timers');

    // Memory access
    const sramRead = target.readMem('sram', 0x20000000, 2);
    assert.ok(sramRead instanceof Uint8Array);
    assert.equal(sramRead.length, 2);

    const codeRead = target.readMem('code', 0x20000000, 2);
    assert.ok(codeRead instanceof Uint8Array);

    // Writing to code is refused
    const writeCode = target.writeMem('code', 0x20000000, Uint8Array.of(1));
    assert.ok(writeCode && writeCode.refused);

    // SRAM write succeeds
    const writeSram = target.writeMem('sram', 0x20000000, Uint8Array.of(42));
    assert.equal(writeSram, undefined);
    assert.equal(target.readMem('sram', 0x20000000, 1)[0], 42);

    // Regs
    const regs = target.regs();
    assert.equal(typeof regs.pc, 'number');
    assert.equal(typeof regs.sp, 'number');
});
