/**
 * Frames and locals — what this debugger can honestly say about "where am I?"
 *
 * D28's row reads "There is no frames-or-locals view in the debug UI; Step Out
 * is real, a call stack is not." Both halves are true, and the second one is
 * true for a reason that a frames pane must not paper over: on the C target
 * there IS NO CALL STACK TO SHOW. The program is a cooperative scheduler —
 * `generateC` lowers each WHEN block to a state machine over a millisecond
 * tick — so what a learner calls "inside the pulse procedure" is a VALUE in a
 * `<task>_state` variable, not a frame on a stack. The 8051's hardware stack
 * underneath holds SDCC's return addresses mixed with saved registers and
 * spilled locals, with no frame pointer and no marker separating them.
 *
 * So this module derives three DIFFERENT things and labels each for what it
 * is, because the alternative — one "Frames" list that means something else
 * on every engine — is how a debugger teaches people to distrust it:
 *
 *   `kind: 'scheduler'`  the cooperative position. Each task with the state it
 *                        is in, its deadline, and the block that state belongs
 *                        to. This is a real answer to "where is my program",
 *                        and it is NOT a call stack. `callStack: null` says so
 *                        in the data, and `why` carries the sentence.
 *
 *   `kind: 'machine'`    a real hardware return-address stack, walked out of
 *                        memory. 6502 and Z80 only, because those are the
 *                        targets where a return address is at a known place
 *                        with a known width and a known direction.
 *
 *   `kind: 'none'`       we cannot say. With the reason.
 *
 * Locals are the same question one level down. A cooperative task has no
 * locals in the stack-frame sense; what it has is the program's variables,
 * which the symbol table gives with their addresses and which are readable
 * from memory at any halt. Those are reported as `variables`, never as
 * "locals", because calling a global a local would be the same lie in a
 * smaller place.
 *
 * Every function here takes a runner-shaped object and returns plain data, so
 * it is testable without a browser, a WASM build, or a React tree.
 *
 * @module
 */

/**
 * The scheduler position: which task is where, joined to blocks and symbols.
 *
 * @param {object} runner the debug runner
 * @param {object} [ui] the runner's last snapshot (for blockOfTask / yieldKinds)
 * @returns {object} `{kind, frames, callStack, why, variables}`
 */
export function deriveSchedulerFrames(runner, ui) {
    const symbols = runner.symbols ? runner.symbols() : null;
    const tasks = tasksFrom(runner, ui);

    if (!tasks || !tasks.length) {
        return {
            kind: 'none',
            frames: [],
            callStack: null,
            why: 'No symbol table yet, so there is no position to report. ' +
                 'Build and pause the program first.',
            variables: []
        };
    }

    // The symbol table is the only place the ADDRESSES live: no target exposes
    // task.state.addr, they expose the state VALUE. Showing the address is
    // what makes this a debugger view rather than a status line — it is the
    // number you would type into the memory editor to watch the task move.
    const byName = new Map();
    for (const t of (symbols && symbols.scheduler && symbols.scheduler.tasks) || []) {
        byName.set(t.name, t);
    }

    const frames = tasks.map((t) => {
        const sym = byName.get(t.task);
        return {
            task: t.task,
            state: t.state,
            // `until` is a deadline in scheduler milliseconds. A FINISHED task
            // is not waiting for anything, and emu8051-debug deliberately
            // withholds `until` there rather than reporting a deadline that
            // means nothing — so undefined here is information, not a gap.
            until: t.until,
            stateAddr: sym && sym.state ? sym.state.addr : undefined,
            untilAddr: sym && sym.until ? sym.until.addr : undefined,
            blockId: t.blockId,
            label: t.label,
            kind: t.kind,
            // 0xFFFF is the scheduler's "this task has run to completion".
            finished: t.state === 0xFFFF
        };
    });

    return {
        kind: 'scheduler',
        frames,
        // Not an empty array. An empty list reads as "no frames right now";
        // null plus `why` reads as "this question does not apply here", which
        // is the true statement.
        callStack: null,
        why: 'This program is a cooperative scheduler, not a stack machine: each ' +
             'WHEN block is a state machine over a millisecond tick, so there are ' +
             'no call frames to list. The state below IS the position. Use Step Out ' +
             'and watch where it lands to reconstruct a nesting.',
        variables: runner.variables ? runner.variables() : []
    };
}

/** How many bytes a return address occupies, and which way the stack grows. */
const MACHINE_STACK = {
    // 6502: JSR pushes PC-1, high byte first, at 0x0100 + S, and S DESCENDS.
    // The live entries are above S, i.e. 0x0100+S+1 .. 0x01FF.
    m6502: {
        space: 'mem', width: 2, base: 0x0100, top: 0x01FF,
        // The pushed value is the address of the JSR's last byte, so the
        // instruction to return TO is one further on. Reporting the raw pushed
        // number would send someone to the wrong address in the listing.
        decode: (lo, hi) => ((hi << 8) | lo) + 1,
        order: 'high-first'
    },
    // Z80: CALL pushes the true return address, low byte first, at SP, and SP
    // descends. No fixup.
    z80: {
        space: 'mem', width: 2, base: 0x0000, top: 0xFFFF,
        decode: (lo, hi) => (hi << 8) | lo,
        order: 'low-first'
    }
};

/**
 * A real return-address stack, for the targets that have one.
 *
 * Deliberately labelled `candidates` rather than `frames` in the data: a raw
 * stack walk cannot tell a return address from a pushed register, because
 * nothing on these machines marks the difference. Presenting the walk as a
 * definitive call stack would be inventing structure. The pane says so.
 *
 * @param {object} runner
 * @param {'m6502'|'z80'} flavour
 * @param {number} [limit] how many entries to walk at most
 */
export function deriveMachineStack(runner, flavour, limit = 16) {
    const spec = MACHINE_STACK[flavour];
    if (!spec) {
        return { kind: 'none', frames: [], callStack: null,
            why: `no stack layout is known for ${flavour}`, variables: [] };
    }
    const snap = runner.inspect ? runner.inspect() : null;
    if (!snap || !snap.regs || typeof snap.regs.sp !== 'number') {
        return { kind: 'none', frames: [], callStack: null,
            why: 'the engine reports no stack pointer', variables: [] };
    }

    const sp = snap.regs.sp;
    // The 6502's S is an 8-bit offset into page one; the Z80's SP is already a
    // full address. Normalising here rather than in the table keeps the table
    // about the ARCHITECTURE and this about the register width.
    //
    // The `+ 1` must NOT wrap. S points at the next FREE byte and a push
    // writes then decrements, so the live region is 0x0100+S+1 .. 0x01FF —
    // and at S = 0xFF, the reset value, that region is empty. Masking to 8
    // bits turned 0xFF into base 0x0100 and walked the entire page as if it
    // were sixteen call frames, which is exactly the invented structure this
    // module exists to avoid. The test that caught it is the empty-stack one.
    const first = flavour === 'm6502' ? spec.base + sp + 1 : sp;
    const entries = [];
    for (let a = first; a + 1 <= spec.top && entries.length < limit; a += spec.width) {
        const bytes = runner.readMem(spec.space, a, spec.width);
        if (!bytes || bytes.unsupported || bytes.length < spec.width) break;
        const [b0, b1] = bytes;
        const [lo, hi] = spec.order === 'high-first' ? [b1, b0] : [b0, b1];
        entries.push({ at: a, returnTo: spec.decode(lo, hi) & 0xFFFF });
    }

    return {
        kind: 'machine',
        frames: entries,
        callStack: entries,
        why: entries.length
            ? 'Read from the hardware stack. Nothing on this machine marks a return ' +
              'address apart from a pushed register, so these are CANDIDATES in ' +
              'push order — check each against the listing.'
            : 'The stack is empty: nothing has been called yet.',
        variables: runner.variables ? runner.variables() : []
    };
}

/**
 * Pick the right derivation for whatever is attached.
 *
 * The flavour test is `inspect().flavor` plus the presence of a scheduler,
 * NOT the engine's name — the same reason `inspect()` itself branches on the
 * shape of `regs` rather than on a kind string. A target that grows a
 * scheduler gets the scheduler view without this file learning its name.
 *
 * @param {object} runner
 * @param {object} [ui]
 * @param {object} [opts]
 * @param {string} [opts.kind] the engine kind, when the caller knows it
 */
export function deriveFrames(runner, ui, opts = {}) {
    if (!runner) {
        return { kind: 'none', frames: [], callStack: null,
            why: 'nothing is running yet', variables: [] };
    }

    const tasks = tasksFrom(runner, ui);
    if (tasks && tasks.length) return deriveSchedulerFrames(runner, ui);

    const flavour = machineFlavour(runner, opts.kind);
    if (flavour) return deriveMachineStack(runner, flavour);

    // The honest bottom of the ladder. A machine target with no symbol table
    // and no known stack layout can still show registers and memory — it just
    // cannot answer THIS question, and says which one it cannot answer.
    return {
        kind: 'none',
        frames: [],
        callStack: null,
        why: 'This target reports no scheduler position and no stack layout is known ' +
             'for it, so there is nothing to list that would not be invented. ' +
             'Registers, memory and the trace are still live.',
        variables: runner.variables ? runner.variables() : []
    };
}

/** The tasks the runner currently reports, from either place they live. */
function tasksFrom(runner, ui) {
    if (ui && ui.session && ui.session.tasks && ui.session.tasks.length) {
        return ui.session.tasks;
    }
    const st = runner.state ? runner.state() : null;
    return (st && st.session && st.session.tasks) || null;
}

/** Which hardware stack layout applies, if any. */
function machineFlavour(runner, kind) {
    if (kind === 'z80') return 'z80';
    if (kind === 'eater6502' || kind === 'm6502' || kind === '6502') return 'm6502';
    // Without a kind, ask the engine. Only these two answer `generic` AND
    // carry a numeric sp — the 8051-shaped targets take the scheduler path
    // above, and avr8js/rp2040js report an sp but push return addresses in
    // formats this module does not claim to know.
    const snap = runner.inspect ? runner.inspect() : null;
    if (!snap || snap.flavor !== 'generic') return null;
    const regs = snap.regs || {};
    // The Z80 is the one with a refresh register; the 6502 has X and Y.
    if (typeof regs.r === 'number' && typeof regs.i === 'number') return 'z80';
    if (typeof regs.x === 'number' && typeof regs.y === 'number') return 'm6502';
    return null;
}
