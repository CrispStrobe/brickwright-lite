// SPDX-License-Identifier: BSD-3-Clause
// Decides whether a challenge is passed or failed, one snapshot at a time.
//
// The checker reads only ArenaSim snapshots (arena-sim.js), never the hub or
// the program, so the same verdict comes out whichever language drove the
// robot. Verdicts carry a reason KEY and parameters; the words live in
// l10n.js, so the banner is translated and a test can assert on the key.
//
// Semantics:
//   - failure conditions are checked first, every tick; any one fails the run;
//   - success conditions of the "latched" kinds (reach, touch, sequence) stay
//     met once met; the "state" kinds (stopIn, heading, push) must hold NOW;
//   - the run passes on the first tick at which every success condition is met;
//   - it fails when the time limit passes first.

import {wrap180, convexPieces, pointInShape, polygonOverlapsPieces} from './geometry.js';

/** Below these the robot counts as stopped. */
export const STOPPED = Object.freeze({speed: 0.5, turnRate: 2});
export const DEFAULT_HOLD_MS = 600;

const stopped = view => Math.abs(view.speed) < STOPPED.speed && Math.abs(view.turnRate) < STOPPED.turnRate;
const centre = view => [view.pose.x, view.pose.y];

/**
 * One evaluator per condition type. Each gets (condition, view, memory, ctx)
 * and returns true when the condition is met (success) or VIOLATED (failure).
 * Exported so the mutation test can replace one at a time.
 */
export const EVALUATORS = {
    reach: (c, view, memory, ctx) => pointInShape(centre(view), ctx.zone(c.zone).shape),
    stopIn: (c, view, memory, ctx) => {
        const inside = pointInShape(centre(view), ctx.zone(c.zone).shape) && stopped(view);
        memory.since = inside ? (memory.since ?? view.timeMs) : null;
        return inside && view.timeMs - memory.since >= (c.holdMs ?? DEFAULT_HOLD_MS);
    },
    heading: (c, view, memory, ctx) => {
        const drift = Math.hypot(view.pose.x - ctx.start.x, view.pose.y - ctx.start.y);
        const ok = Math.abs(wrap180(view.pose.heading - (ctx.start.heading || 0) - c.target)) <= (c.tolerance ?? 6) &&
            drift <= (c.maxDrift ?? 4) && stopped(view);
        memory.since = ok ? (memory.since ?? view.timeMs) : null;
        return ok && view.timeMs - memory.since >= (c.holdMs ?? DEFAULT_HOLD_MS);
    },
    sequence: (c, view, memory, ctx) => {
        memory.next = memory.next || 0;
        while (memory.next < c.zones.length && pointInShape(centre(view), ctx.zone(c.zones[memory.next]).shape)) memory.next++;
        return memory.next >= c.zones.length;
    },
    touch: (c, view) => view.touchedEver.includes(c.object),
    push: (c, view, memory, ctx) => {
        const object = view.objects.find(o => o.id === c.object);
        return Boolean(object) && pointInShape(object.centre, ctx.zone(c.zone).shape);
    },
    avoid: (c, view, memory, ctx) => polygonOverlapsPieces(view.footprint, ctx.pieces(c.zone)),
    stayIn: (c, view, memory, ctx) => !pointInShape(centre(view), ctx.zone(c.zone).shape),
    noWallContact: (c, view) => view.touching.includes('wall'),
    noTouch: (c, view) => view.touching.includes(c.object)
};

const LATCHED = new Set(['reach', 'touch', 'sequence']);

/** The reason key a condition gives when it decides the run. */
export const REASONS = {
    reach: 'pass.reached', stopIn: 'pass.stoppedIn', heading: 'pass.heading', sequence: 'pass.sequence',
    touch: 'pass.touched', push: 'pass.pushed',
    avoid: 'fail.enteredZone', stayIn: 'fail.leftZone', noWallContact: 'fail.hitWall', noTouch: 'fail.touched',
    timeLimit: 'fail.timeLimit'
};

export class ArenaChecker {
    constructor (world, {evaluators = EVALUATORS} = {}) {
        this.world = world;
        this.evaluators = evaluators;
        const zones = new Map((world.zones || []).map(zone => [zone.id, zone]));
        const pieces = new Map();
        this.ctx = {
            start: world.start,
            zone: id => zones.get(id),
            pieces: id => { if (!pieces.has(id)) pieces.set(id, convexPieces(zones.get(id).shape)); return pieces.get(id); }
        };
        this.reset();
    }

    reset () {
        this.memory = (this.world.success || []).map(() => ({}));
        this.failMemory = (this.world.failure || []).map(() => ({}));
        this.met = (this.world.success || []).map(() => false);
        this.verdict = {status: 'running', reason: null, params: {}, timeMs: 0};
    }

    /** Evaluates one snapshot; returns (and keeps) the verdict. A decided verdict does not change. */
    evaluate (view) {
        if (this.verdict.status !== 'running') return this.verdict;
        const failures = this.world.failure || [];
        for (let i = 0; i < failures.length; i++) {
            const condition = failures[i];
            if (this.evaluators[condition.type](condition, view, this.failMemory[i], this.ctx)) {
                return this._decide('fail', REASONS[condition.type], condition, view);
            }
        }
        const success = this.world.success;
        for (let i = 0; i < success.length; i++) {
            const condition = success[i];
            if (LATCHED.has(condition.type) && this.met[i]) continue;
            this.met[i] = Boolean(this.evaluators[condition.type](condition, view, this.memory[i], this.ctx));
        }
        if (this.met.every(Boolean)) {
            const last = success[success.length - 1];
            return this._decide('pass', REASONS[last.type], last, view);
        }
        if (view.timeMs >= this.world.timeLimitMs) {
            return this._decide('fail', REASONS.timeLimit, {seconds: Math.round(this.world.timeLimitMs / 1000)}, view);
        }
        this.verdict = {...this.verdict, timeMs: view.timeMs, progress: this.met.filter(Boolean).length, of: this.met.length};
        return this.verdict;
    }

    _decide (status, reason, condition, view) {
        const params = {};
        for (const key of ['zone', 'object', 'target', 'seconds']) if (condition[key] !== undefined) params[key] = condition[key];
        this.verdict = {status, reason, params, timeMs: view.timeMs};
        return this.verdict;
    }
}
