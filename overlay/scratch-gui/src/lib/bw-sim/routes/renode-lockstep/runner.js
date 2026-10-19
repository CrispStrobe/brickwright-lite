// SPDX-License-Identifier: BSD-3-Clause
// Copyright (c) 2026 Brickwright contributors
//
// The in-thread lockstep runner (docs/ROBOT-LAB-SPIKE-EMULATION.md §2.3 option
// (c), §2.4; owner answer Q1/D3): a scene with a non-rewindable hub — one
// whose route runs in an emulator a Jolt checkpoint cannot rewind — runs its
// physics on the main thread, ONE STEP PER EXCHANGE, and nothing is ever
// speculated, so nothing ever needs undoing:
//
//   for each due step k:
//       await every lockstep hub's exchange()   // the emulator runs [t_k, t_k+1]
//       bridge.step()                           // advanceTo → readDrives → physics → writeReadings
//
// Other hubs of the scene (Scratch-driven SpikeVirtualHubs) step in the same
// bridge.step(), and the VM's commands reach them between steps, as on the
// main thread without the worker.
//
// Slow emulators: simulated time waits for every exchange (an exact
// slow-motion mode). Wall time that arrives while steps are still owed beyond
// a short backlog is dropped (stats.droppedMs), never simulated time; the
// real-time factor (simulated ms per wall ms over the last couple of seconds)
// is what the pane shows.

const now = () => (typeof performance !== 'undefined' ? performance.now() : Date.now());

/** At most this many steps are owed at once; more wall time than that is dropped. */
export const MAX_BACKLOG_STEPS = 10;
/** The real-time factor is measured over this much wall time. */
export const RTF_WINDOW_MS = 2000;

/** The diagnostic code when a scene with a non-rewindable hub is offered the worker (plan §2.3). */
export const L3_HUB_NEEDS_LOCKSTEP = 'l3-hub-needs-lockstep';

/** Whether a VirtualHub cannot be rewound (its exportState says so). */
export const isNonRewindable = hub => {
    try {
        return Boolean(hub.exportState()?.nonRewindable);
    } catch (_) {
        return false;
    }
};

export class LockstepRunner {
    /**
     * @param {object} options
     * @param {object} options.bridge the scene's SimHubBridge (in-thread physics)
     * @param {object[]} options.hubs the VirtualHubs to exchange with before each step (exchange())
     * @param {Function} [options.onAdvance] called after each run of steps (simulated ms advanced)
     * @param {Function} [options.onFail] called once with the error that stopped the scene
     * @param {Function} [options.clock] wall clock, ms (tests pass a fake one)
     */
    constructor ({bridge, hubs, onAdvance = () => {}, onFail = () => {}, clock = now, maxBacklogSteps = MAX_BACKLOG_STEPS}) {
        this.bridge = bridge;
        this.lockstepHubs = hubs.filter(h => typeof h.exchange === 'function');
        this.allHubs = bridge.hubs.map(h => h.hub);
        this.stepMs = bridge.stepMs;
        this.onAdvance = onAdvance;
        this.onFail = onFail;
        this.clock = clock;
        this.maxBacklogSteps = maxBacklogSteps;
        this.accumulator = 0;
        this.due = 0;
        this.running = null;
        this.failed = null;
        this.disposed = false;
        this._idle = [];
        /** [wallMs, simulatedMs] samples, for the real-time factor. */
        this._samples = [];
        this.stats = {steps: 0, simulatedMs: 0, droppedMs: 0, exchangeMs: 0, physicsMs: 0};
    }

    /** Owes the scene `ms` more of simulated time; starts stepping if it is not already. */
    tick (ms) {
        if (this.disposed || this.failed) return;
        this.accumulator += Math.max(0, Number(ms) || 0);
        while (this.accumulator >= this.stepMs - 1e-9) {
            this.accumulator -= this.stepMs;
            if (this.due < this.maxBacklogSteps) this.due++;
            else this.stats.droppedMs += this.stepMs;
        }
        if (this.due > 0 && !this.running) this.running = this._run();
    }

    async _run () {
        let advanced = false;
        try {
            while (this.due > 0 && !this.disposed && !this.failed) {
                const t0 = this.clock();
                await Promise.all(this.lockstepHubs.map(h => h.exchange()));
                if (this.disposed) return;
                const t1 = this.clock();
                this.bridge.step();
                const t2 = this.clock();
                this.due--;
                this.stats.steps++;
                this.stats.simulatedMs += this.stepMs;
                this.stats.exchangeMs += t1 - t0;
                this.stats.physicsMs += t2 - t1;
                this._sample(t2);
                advanced = true;
            }
        } catch (error) {
            this.failed = error;
            this.due = 0;
            this.onFail(error);
        } finally {
            this.running = null;
            if (advanced && !this.disposed) {
                for (const hub of this.allHubs) hub.publish();
                this.onAdvance(this);
            }
            this._settle();
        }
    }

    _sample (wall) {
        this._samples.push([wall, this.stats.simulatedMs]);
        while (this._samples.length > 2 && wall - this._samples[1][0] >= RTF_WINDOW_MS) this._samples.shift();
    }

    /**
     * Simulated ms per wall ms over the last RTF_WINDOW_MS (null before two steps). 1 when
     * the emulator keeps up with the pane's clock; at the VPS's measured Renode rate ≈ 0.04.
     */
    get realTimeFactor () {
        const s = this._samples;
        if (s.length < 2) return null;
        const wall = s[s.length - 1][0] - s[0][0];
        return wall > 0 ? (s[s.length - 1][1] - s[0][1]) / wall : null;
    }

    /** Resolves when every owed step has run (rejects with the failure, if one stopped it). */
    idle () {
        if (this.failed) return Promise.reject(this.failed);
        if (!this.running && this.due === 0) return Promise.resolve();
        return new Promise((resolve, reject) => this._idle.push({resolve, reject}));
    }

    _settle () {
        if (this.running && !this.failed) return;
        if (this.due > 0 && !this.failed && !this.disposed) {
            this.running = this._run();
            return;
        }
        const waiting = this._idle;
        this._idle = [];
        for (const w of waiting) {
            if (this.failed) w.reject(this.failed);
            else w.resolve();
        }
    }

    dispose () {
        this.disposed = true;
        this.due = 0;
        this._settle();
    }
}
