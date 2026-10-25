/**
 * The frames/locals derivation (D28).
 *
 * The interesting assertions here are the REFUSALS, because the defect this
 * closes is "there is no frames view" and the tempting fix is a frames view
 * that shows something on every engine. On the C target there is no call
 * stack to show — the program is a cooperative scheduler — and a pane that
 * rendered a plausible list there would be worse than the gap it filled.
 *
 * Driven against runner-shaped stubs rather than a live session: the shapes
 * are copied from the real producers (debug-runner's `symbols()`, `state()`,
 * `inspect()`, `readMem()`), and every one of them is pinned by a test in
 * this repo or in bw-board, so a stub that drifts gets caught there.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';

const ROOT = path.resolve(import.meta.dirname, '..');
const {deriveFrames, deriveSchedulerFrames, deriveMachineStack} = await import(
    path.join(ROOT, 'overlay/scratch-gui/src/lib/bw-debug/frames.js'));

// ── stubs ────────────────────────────────────────────────────────────────

/** A C-target runner: a scheduler with two tasks, mid-run. */
const schedulerRunner = (tasks) => ({
    symbols: () => ({
        scheduler: {
            bw_ms: {addr: 0x08},
            tasks: [
                {name: 'task0', state: {addr: 0x0A, size: 1}, until: {addr: 0x0B, size: 2},
                    yields: [{state: 1, addr: 0x0120}]},
                {name: 'task1', state: {addr: 0x0D, size: 1}, yields: []}
            ]
        }
    }),
    state: () => ({session: {tasks}}),
    variables: () => [
        {name: 'counter', sprite: null, value: 3, where: 'iram 0x30'},
        {name: 'total', sprite: null, value: -1, where: 'iram 0x32'}
    ]
});

/** A machine-target runner: registers plus a byte-addressable memory. */
const machineRunner = (regs, mem, flavor = 'generic') => ({
    inspect: () => ({regs, sfr: null, stack: null, pc: regs.pc, tNs: 0n, flavor}),
    readMem: (space, addr, len) => {
        if (space !== 'mem') return {unsupported: `no such space: ${space}`};
        const out = [];
        for (let i = 0; i < len; i++) out.push(mem[addr + i] ?? 0);
        return out;
    },
    variables: () => []
});

// ── the scheduler view ───────────────────────────────────────────────────

test('the C target reports a scheduler position, and REFUSES to call it a call stack', () => {
    const r = schedulerRunner([
        {task: 'task0', state: 1, until: 250, blockId: 'blk1', label: 'toggle', kind: 'wait'},
        {task: 'task1', state: 0xFFFF}
    ]);
    const view = deriveFrames(r);

    assert.equal(view.kind, 'scheduler');
    // The load-bearing assertion of this whole file. `callStack` must be null,
    // not an empty array: an empty array reads as "no frames right now", which
    // would be a claim that frames exist and happen to be absent.
    assert.equal(view.callStack, null,
        'a cooperative scheduler has no call stack, and null is how that is said');
    assert.match(view.why, /cooperative scheduler, not a stack machine/,
        'and the reason travels with the refusal, in words a learner can read');
    assert.match(view.why, /Step Out/,
        'and it names what to do instead, which is the lesson debug-call-stack teaches');
});

test('each task carries its state ADDRESS, which no target exposes on its own', () => {
    const r = schedulerRunner([{task: 'task0', state: 2, until: 100}]);
    const {frames} = deriveSchedulerFrames(r);

    assert.equal(frames.length, 1);
    assert.equal(frames[0].task, 'task0');
    assert.equal(frames[0].state, 2);
    assert.equal(frames[0].until, 100);
    // The address is the difference between a status line and a debugger view:
    // it is the number you type into the memory editor to watch the task move.
    // It exists ONLY in the symbol table — session.tasks carries the value.
    assert.equal(frames[0].stateAddr, 0x0A);
    assert.equal(frames[0].untilAddr, 0x0B);
});

test('a finished task is marked finished and reports no deadline', () => {
    const r = schedulerRunner([{task: 'task1', state: 0xFFFF}]);
    const {frames} = deriveSchedulerFrames(r);
    assert.equal(frames[0].finished, true, '0xFFFF is the scheduler\'s "done"');
    // Not zero, not "—": a finished task is not waiting for anything, and the
    // target deliberately withholds `until` there. Undefined is information.
    assert.equal(frames[0].until, undefined);
});

test('a task with no symbol entry still lists, with the address absent rather than faked', () => {
    const r = schedulerRunner([{task: 'ghost', state: 4}]);
    const {frames} = deriveSchedulerFrames(r);
    assert.equal(frames[0].task, 'ghost');
    assert.equal(frames[0].state, 4);
    assert.equal(frames[0].stateAddr, undefined,
        'no symbol entry means no address — 0 would be a real IRAM address and a lie');
});

test('the program variables come through as `variables`, never as `locals`', () => {
    const r = schedulerRunner([{task: 'task0', state: 1}]);
    const view = deriveSchedulerFrames(r);
    assert.equal(view.variables.length, 2);
    assert.equal(view.variables[0].name, 'counter');
    assert.equal(view.variables[0].where, 'iram 0x30');
    assert.equal(view.locals, undefined,
        'these are the program\'s variables; calling a global a local is the same ' +
        'lie in a smaller place');
});

test('no symbol table means no position, said plainly', () => {
    const view = deriveFrames({state: () => ({session: {tasks: []}}), variables: () => []});
    assert.equal(view.kind, 'none');
    assert.equal(view.callStack, null);
    assert.match(view.why, /No symbol table yet|no scheduler position/i);
});

// ── the machine view ─────────────────────────────────────────────────────

test('the 6502 stack walk reads return addresses, and fixes up the JSR off-by-one', () => {
    // JSR pushes PC-1, HIGH byte first, and S descends. A call that should
    // return to 0x8003 pushes 0x8002 as 80 02 at 0x01FE/0x01FF, leaving S=0xFD.
    const mem = [];
    mem[0x01FE] = 0x80; // high
    mem[0x01FF] = 0x02; // low
    const r = machineRunner({pc: 0x8007, a: 0x42, x: 0, y: 0, sp: 0xFD, p: 0, cycles: 12}, mem);

    const view = deriveMachineStack(r, 'm6502');
    assert.equal(view.kind, 'machine');
    assert.equal(view.frames.length, 1);
    assert.equal(view.frames[0].at, 0x01FE, 'the live entry starts one above S');
    // 0x8002 + 1. Reporting the raw pushed value would send someone to the
    // JSR's last byte instead of the instruction after it.
    assert.equal(view.frames[0].returnTo, 0x8003,
        '6502 pushes PC-1, so the return target is the pushed value plus one');
    assert.ok(Array.isArray(view.callStack), 'here a call stack really does exist');
});

test('the 6502 walk still labels its entries as candidates, because nothing marks them', () => {
    const mem = []; mem[0x01FE] = 0x80; mem[0x01FF] = 0x02;
    const r = machineRunner({pc: 0x8007, a: 0, x: 0, y: 0, sp: 0xFD, p: 0}, mem);
    const view = deriveMachineStack(r, 'm6502');
    assert.match(view.why, /CANDIDATES/,
        'a raw stack walk cannot tell a return address from a pushed register, ' +
        'and inventing that distinction would be inventing structure');
});

test('the Z80 stack walk takes the address as pushed, low byte first, with no fixup', () => {
    // CALL pushes the TRUE return address, low byte first, at SP.
    const mem = []; mem[0xFEFE] = 0x03; mem[0xFEFF] = 0x00; // 0x0003
    const r = machineRunner({pc: 0x0008, a: 0, sp: 0xFEFE, i: 0, r: 0x7F, cycles: 17}, mem);

    const view = deriveMachineStack(r, 'z80');
    assert.equal(view.frames.length > 0, true);
    assert.equal(view.frames[0].at, 0xFEFE);
    assert.equal(view.frames[0].returnTo, 0x0003,
        'the Z80 pushes the real return address — a +1 here would be the 6502\'s rule');
});

test('an empty stack says it is empty rather than listing nothing', () => {
    const r = machineRunner({pc: 0x8000, a: 0, x: 0, y: 0, sp: 0xFF, p: 0}, []);
    const view = deriveMachineStack(r, 'm6502');
    assert.equal(view.frames.length, 0);
    assert.match(view.why, /empty: nothing has been called/);
});

test('an engine whose stack layout is unknown refuses by name', () => {
    const r = machineRunner({pc: 0, sp: 0}, []);
    const view = deriveMachineStack(r, 'sparc');
    assert.equal(view.kind, 'none');
    assert.match(view.why, /no stack layout is known for sparc/);
});

// ── routing ──────────────────────────────────────────────────────────────

test('deriveFrames prefers the scheduler when there is one, whatever the engine', () => {
    const r = {...schedulerRunner([{task: 'task0', state: 1}]),
        inspect: () => ({regs: {pc: 0, sp: 0xFD, x: 0, y: 0}, flavor: 'generic'}),
        readMem: () => [0, 0]};
    assert.equal(deriveFrames(r).kind, 'scheduler',
        'a scheduler position is a better answer than a stack walk when both exist');
});

test('deriveFrames identifies the machine by its REGISTERS, not by a kind string', () => {
    const mem = []; mem[0x01FE] = 0x80; mem[0x01FF] = 0x02;
    // x and y, no i/r -> 6502. No kind passed at all.
    const six = machineRunner({pc: 0x8007, a: 0, x: 1, y: 2, sp: 0xFD, p: 0}, mem);
    six.state = () => ({session: {tasks: []}});
    assert.equal(deriveFrames(six).kind, 'machine');

    const zmem = []; zmem[0xFEFE] = 0x03; zmem[0xFEFF] = 0x00;
    const z = machineRunner({pc: 8, a: 0, sp: 0xFEFE, i: 0, r: 0x7F}, zmem);
    z.state = () => ({session: {tasks: []}});
    const zv = deriveFrames(z);
    assert.equal(zv.kind, 'machine');
    assert.equal(zv.frames[0].returnTo, 0x0003, 'and it used the Z80 rule, not the 6502 one');
});

test('an 8051-flavoured target with no tasks does not get walked as a machine', () => {
    // avr8js and rp2040js both report `flavor: '8051'` today (inspect branches
    // on Array.isArray(regs.r)), and neither pushes return addresses the way
    // this module knows. Claiming a stack for them would be the bug.
    const r = machineRunner({pc: 0, sp: 0x5D, r: [0, 0, 0]}, [], '8051');
    r.state = () => ({session: {tasks: []}});
    const view = deriveFrames(r);
    assert.equal(view.kind, 'none');
    assert.match(view.why, /no stack layout is known for it|nothing to list that would not be invented/);
});

test('nothing running at all is a refusal, not a crash', () => {
    const view = deriveFrames(null);
    assert.equal(view.kind, 'none');
    assert.deepEqual(view.frames, []);
    assert.match(view.why, /nothing is running yet/);
});
