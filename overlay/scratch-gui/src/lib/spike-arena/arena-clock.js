// SPDX-License-Identifier: BSD-3-Clause
// ONE CLOCK for the arena: simulated time advances with the VM's steps, not with
// the wall clock.
//
// WHY THIS EXISTS. The arena used to advance from requestAnimationFrame deltas
// (`Math.min(MAX_FRAME_MS, now - lastFrame)`) while the robot's commands came
// from a program the VM executes on its own schedule. Those are two clocks, and
// nothing synchronised them, so the verdict of a mission depended on how busy
// the machine was. Measured on 2026-09-28 in CI: the same gate, on unchanged
// content, went pass/fail/fail/pass/fail/pass/fail inside half an hour — four
// and four. Every failure was `time is up`, never a wrong position, which is the
// rAF-survives/VM-starves direction: frames keep arriving and the budget keeps
// draining while the program that should be driving has not run.
//
// The `MAX_FRAME_MS` clamp could not help. A clamp can only make simulated time
// run SLOWER than wall time, which makes a mission easier; it has nothing to say
// about the program falling behind.
//
// THE FIX. The VM already steps at a nominal interval and reports it as
// `runtime.currentStepTime`. Advancing simulated time by that nominal amount
// once per executed step makes the two clocks the same clock by construction:
// N steps always buy N x stepTime of mission time, whatever the wall clock did.
// Starve the VM and the mission slows down with it, which is the behaviour a
// deterministic verdict requires.
//
// It is nominal and not measured on purpose. Using the real elapsed time per
// step would put the wall clock straight back in, and with it the flake.

/** scratch-vm's default thread step interval, used when the VM has not started. */
export const NOMINAL_STEP_MS = 1000 / 30;

export class VmStepClock {
    /**
     * @param {object} [options]
     * @param {number} [options.nominalMs] fallback when runtime.currentStepTime is unset
     */
    constructor ({nominalMs = NOMINAL_STEP_MS} = {}) {
        this.nominalMs = nominalMs;
        this.pending = 0;
        this.steps = 0;
        this.runtime = null;
        this.wrapped = null;
        this.original = null;
    }

    /** True while this clock is driving a runtime. */
    get installed () { return this.runtime !== null; }

    /**
     * Count every step of `runtime` until uninstall(). Idempotent: installing
     * twice on the same runtime is a no-op rather than a double count, because
     * a pane that re-enters start() must not make time run twice as fast.
     * @param {object} runtime a VM runtime with a _step method
     * @returns {boolean} whether this call installed the hook
     */
    install (runtime) {
        if (!runtime || typeof runtime._step !== 'function') return false;
        if (this.runtime === runtime) return false;
        if (this.runtime) this.uninstall();
        const original = runtime._step;
        // Bound through `this` so any other wrapper already on the instance
        // still runs: we add a step COUNT, we do not take the step over.
        const wrapped = (...args) => {
            const result = original.apply(runtime, args);
            this.steps += 1;
            this.pending += Number(runtime.currentStepTime) || this.nominalMs;
            return result;
        };
        runtime._step = wrapped;
        this.runtime = runtime;
        this.original = original;
        this.wrapped = wrapped;
        return true;
    }

    /**
     * Restore the runtime's own _step. Refuses to restore over a LATER wrapper
     * that somebody else installed on top of ours — clobbering that would
     * silently remove their behaviour, so we leave the chain alone and simply
     * stop counting.
     * @returns {boolean} whether the original was put back
     */
    uninstall () {
        if (!this.runtime) return false;
        const mine = this.runtime._step === this.wrapped;
        if (mine) this.runtime._step = this.original;
        this.runtime = null;
        this.original = null;
        this.wrapped = null;
        return mine;
    }

    /**
     * Simulated milliseconds owed since the last take(), and reset. Returns 0
     * when the VM has not stepped, which is the whole point: no step, no time.
     * @returns {number}
     */
    take () {
        const ms = this.pending;
        this.pending = 0;
        return ms;
    }

    /** Forget owed time without spending it — for a reset or a fresh run. */
    clear () { this.pending = 0; this.steps = 0; }
}
