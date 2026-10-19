// SPDX-License-Identifier: BSD-3-Clause
// Copyright (c) 2026 Brickwright contributors
//
// ONE CLOCK for the Robot Lab: the program's time and the simulated time are
// the same clock on every machine (docs/SIM-LAB-PLAN.md §4.9, "One clock").
//
// THE BUG THIS REMOVES. The physics runs in a worker that advances at most
// MAX_BATCH_STEPS (100 ms) of simulated time per round trip and used to drop the
// wall time it could not keep up with, while the Scratch VM and the spikeprime
// extension ran on WALL time: `wait 5 seconds`, the `timer` reporter, `move for
// 2 seconds`, the extension's estimated and stall waits. On a slow machine the
// world fell behind the program's clock, so a timed block ended early in
// simulated time: the same program drove a shorter distance on a slow
// Chromebook than on a fast Mac.
//
// THE RULE. Program time advances only by VM steps, a step only runs when the
// world has caught up with it, and each step buys exactly its nominal
// `runtime.currentStepTime` of simulated time (the SPIKE arena's VmStepClock,
// spike-arena/arena-clock.js, counts the steps; here it also holds them back):
//
//   step k        the VM runs at program time T (runtime.currentMSecs = epoch + T);
//                 its commands reach the hub in that step's promise continuations
//   flush         a macrotask later (after those continuations): session.tick(stepMs)
//   applied       the batch has reached the hub (session.idle()): program time is
//                 T + stepMs = the session's simulated time; the extension's timers
//                 due by then fire, and their continuations run
//   step k + 1    only now may the VM step again: the VM's interval tick that came
//                 while the world was busy was held back and runs as soon as it is applied
//
// If the physics cannot keep up, the whole program slows down — the real-time
// factor drops below 1 — and never runs ahead of the world. This is the order
// the headless runs have always used (test/helpers/spike-arena-vm.mjs: timers,
// VM step, world tick, in fake time), now in the browser too.
//
// WHAT IS ON THIS CLOCK while installed:
//   - the VM's own: control_wait and every stack timer, and the `timer`
//     reporter, read `runtime.currentMSecs`, which _step refreshes through
//     `runtime.updateCurrentMSecs()` — replaced on the instance while installed;
//   - the CrispStrobe extensions' timers: the adapter
//     (scratch-vm extensions/crispstrobe/adapter.js) hands each extension a
//     setTimeout/setInterval/clearTimeout/clearInterval/Date that use
//     `runtime.bwProgramClock` (this object) while it is set, the browser's
//     otherwise — `move for N seconds`, `_waitForMovement`'s fallback and stall
//     timers, the send rate limiter, the hub timer;
//   - NOT the VM's stepping interval itself (wall time: it is the pace a fast
//     machine keeps), and not the virtual hub's transports, which deliver at
//     once (spike-prime-peripheral.js notifies on every hubState.changed()).
//
// On uninstall (Pause, a new model, the pane closing) timers still pending move
// to the wall clock with the time they had left, so nothing waits forever.

import {VmStepClock} from '../spike-arena/arena-clock.js';

/** The window the real-time factor is measured over (wall ms). */
export const RTF_WINDOW_MS = 2000;

/** A macrotask: runs after every promise continuation the current task queued. */
const macrotask = fn => setTimeout(fn, 0);
const wallNow = () => (typeof performance !== 'undefined' ? performance.now() : Date.now());

/** Reports an error thrown by a program-clock timer as a real timer's would be: uncaught, not swallowed. */
const rethrow = error => { setTimeout(() => { throw error; }, 0); };

export class SimLabClock {
    /**
     * @param {object} [options]
     * @param {function(function): void} [options.defer] schedules a macrotask (default setTimeout 0)
     * @param {function(): number} [options.wallNow] wall ms for the real-time factor
     */
    constructor ({defer = macrotask, wallNow: now = wallNow} = {}) {
        this.defer = defer;
        this.wallNow = now;
        this.steps = new VmStepClock({beforeStep: () => this._beforeStep(), afterStep: ms => this._afterStep(ms)});
        this.runtime = null;
        this.session = null;
        /** Simulated per real time, (0, 1]: slow motion below 1 (the Robot Lab API's setTimeScale). */
        this.timeScale = 1;
        this._reset();
    }

    _reset () {
        /** Program ms since install: the VM's steps the world has caught up with. */
        this.programMs = 0;
        /** Simulated ms a step has bought that the world has not yet applied. */
        this.owedMs = 0;
        this.epoch = 0;
        this.simStart = 0;
        this.deferred = false;
        this._timers = new Map();
        this._nextTimer = 1;
        this._samples = [];
        this._generation = (this._generation || 0) + 1;
        /** VM steps run, steps held back until the world caught up, the largest program-vs-simulated gap seen when a step began. */
        this.stats = {steps: 0, heldBack: 0, maxSkewMs: 0};
    }

    /** True while this clock drives a runtime. */
    get installed () { return this.runtime !== null; }

    /**
     * Put `runtime` (a scratch-vm Runtime) and `session` (a SimSession) on one clock.
     * Installing again on the same runtime only swaps the session.
     */
    install (runtime, session) {
        if (this.runtime === runtime) {
            this.session = session;
            return false;
        }
        if (this.runtime) this.uninstall();
        if (!this.steps.install(runtime)) return false;
        this._reset();
        this.runtime = runtime;
        this.session = session;
        // Continuous with the wall clock at install: a wait already running does not jump.
        this.epoch = Date.now();
        this.simStart = session ? session.time : 0;
        this._ownUpdate = Object.prototype.hasOwnProperty.call(runtime, 'updateCurrentMSecs') ? runtime.updateCurrentMSecs : null;
        this._update = () => { runtime.currentMSecs = this.now(); };
        runtime.updateCurrentMSecs = this._update;
        runtime.currentMSecs = this.now();
        runtime.bwProgramClock = this;
        this._sample();
        return true;
    }

    /** Back to wall time: the VM steps freely again, pending timers move to the wall clock. */
    uninstall () {
        const runtime = this.runtime;
        if (!runtime) return false;
        this.steps.uninstall();
        if (runtime.updateCurrentMSecs === this._update) {
            if (this._ownUpdate) runtime.updateCurrentMSecs = this._ownUpdate;
            else delete runtime.updateCurrentMSecs;
        }
        if (runtime.bwProgramClock === this) delete runtime.bwProgramClock;
        this.runtime = null;
        this.session = null;
        const pending = [...this._timers.values()];
        this._timers.clear();
        // Bumping the generation drops a flush or an application still on its way.
        this._generation += 1;
        for (const timer of pending) this._toWall(timer);
        return true;
    }

    /** The program's Date.now(): continuous with the wall clock at install, then simulated time. */
    now () { return this.epoch + this.programMs; }

    /** Simulated ms the session has applied since install (equals programMs whenever a step may run). */
    get simulatedMs () { return this.session ? this.session.time - this.simStart : this.programMs; }

    /** True when the step hook is installed but the runtime steps around it (arena-clock.js isInert). */
    get inert () { return this.steps.isInert(); }

    /** Called once per animation frame by the pane: the inertness check counts frames. */
    noteFrame () { this.steps.take(); }

    /** Program ms per wall ms over the last RTF_WINDOW_MS (null until measured). */
    get realTimeFactor () {
        const s = this._samples;
        if (s.length < 2) return null;
        const wall = s[s.length - 1][0] - s[0][0];
        if (wall < RTF_WINDOW_MS / 4) return null;
        return (s[s.length - 1][1] - s[0][1]) / wall;
    }

    _sample () {
        const wall = this.wallNow();
        this._samples.push([wall, this.programMs]);
        while (this._samples.length > 2 && wall - this._samples[1][0] >= RTF_WINDOW_MS) this._samples.shift();
    }

    // ---- the step gate (VmStepClock hooks) --------------------------------------------------

    _beforeStep () {
        if (this.owedMs > 0) {
            // The world has not caught up with the last step: hold this one back.
            if (!this.deferred) this.stats.heldBack += 1;
            this.deferred = true;
            return false;
        }
        this.deferred = false;
        this.stats.steps += 1;
        this.stats.maxSkewMs = Math.max(this.stats.maxSkewMs, Math.abs(this.simulatedMs - this.programMs));
        return true;
    }

    _afterStep (ms) {
        this.owedMs += ms;
        const generation = this._generation;
        this.defer(() => { if (generation === this._generation) this._flush(generation); });
    }

    _flush (generation) {
        const ms = this.owedMs;
        if (ms <= 0) return;
        const session = this.session;
        const applied = () => { if (generation === this._generation) this._applied(ms); };
        if (!session || session.failed || session._disposed) { applied(); return; }
        session.tick(ms);
        // Slow motion (the Robot Lab API's setTimeScale, < 1): the step is held back for the wall time
        // that makes simulated time run at `timeScale` of real time. At 1 (always, unless asked) the
        // order of operations is exactly as it was.
        const pace = this.timeScale > 0 && this.timeScale < 1 ? ms * (1 / this.timeScale - 1) : 0;
        if (pace > 0) {
            session.idle().then(() => new Promise(resolve => setTimeout(resolve, pace))).then(applied, applied);
            return;
        }
        session.idle().then(applied, applied);
    }

    _applied (ms) {
        this.owedMs = Math.max(0, this.owedMs - ms);
        this.programMs += ms;
        this._sample();
        this._runTimers();
        if (this.deferred) {
            const generation = this._generation;
            // A macrotask, so the timers' continuations (a resolved wait, a rate-limited send) come first.
            this.defer(() => {
                if (generation !== this._generation || !this.deferred || this.owedMs > 0) return;
                this.runtime._step();
            });
        }
    }

    // ---- timers on program time (the adapter's setTimeout & co.) -------------------------

    _add (fn, ms, args, repeat) {
        const delay = Math.max(0, Number(ms) || 0);
        const timer = {bwProgramTimer: true, clock: this, id: this._nextTimer++, fn, args,
            due: this.programMs + delay, every: repeat ? Math.max(1, delay) : 0, wall: null, wallRepeat: false};
        this._timers.set(timer.id, timer);
        return timer;
    }

    setTimeout (fn, ms, ...args) { return this._add(fn, ms, args, false); }

    setInterval (fn, ms, ...args) { return this._add(fn, ms, args, true); }

    /** Cancels a timer this clock made, whether it still runs on program time or moved to the wall. */
    clearTimer (timer) {
        if (!timer || timer.clock !== this) return;
        timer.cancelled = true;
        this._timers.delete(timer.id);
        if (timer.wall !== null) {
            if (timer.wallRepeat) clearInterval(timer.wall);
            else clearTimeout(timer.wall);
            timer.wall = null;
        }
    }

    clearTimeout (timer) { this.clearTimer(timer); }

    clearInterval (timer) { this.clearTimer(timer); }

    /** Fires every timer due by programMs, in due order; an interval fires at most once per call. */
    _runTimers () {
        const fired = new Set();
        for (;;) {
            let next = null;
            for (const timer of this._timers.values()) {
                if (timer.due > this.programMs || fired.has(timer)) continue;
                if (!next || timer.due < next.due || (timer.due === next.due && timer.id < next.id)) next = timer;
            }
            if (!next) return;
            fired.add(next);
            if (next.every) {
                while (next.due <= this.programMs) next.due += next.every;
            } else this._timers.delete(next.id);
            try { next.fn(...next.args); } catch (error) { rethrow(error); }
        }
    }

    _toWall (timer) {
        if (timer.cancelled) return;
        const remaining = Math.max(0, timer.due - this.programMs);
        const run = () => { try { timer.fn(...timer.args); } catch (error) { rethrow(error); } };
        if (!timer.every) {
            timer.wall = setTimeout(() => { timer.wall = null; run(); }, remaining);
            return;
        }
        timer.wall = setTimeout(() => {
            run();
            if (timer.cancelled) return;
            timer.wall = setInterval(run, timer.every);
            timer.wallRepeat = true;
        }, remaining);
    }
}
