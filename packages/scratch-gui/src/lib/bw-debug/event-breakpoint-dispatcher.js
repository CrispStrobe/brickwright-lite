/**
 * Target-neutral coordination of one canonical event-breakpoint decision.
 *
 * Replay suppression happens before validation and evaluation: replay already
 * contains the immutable forward halt occurrences and must not advance
 * stateful breakpoint predicates or repeat action side effects.
 */
import {executeBreakpointPlan} from './event-breakpoints.js';
import {normalizeDebugEvent} from './event-stream.js';

const DEFERRED_KINDS = new Set(['memory', 'port', 'interrupt']);

export function createEventBreakpointDispatcher ({engine, handlers = {}, recordingSession = null,
    maxPendingPlans = 1024, suppressedActions = []} = {}) {
    if (!engine || typeof engine.evaluate !== 'function') {
        throw new TypeError('event breakpoint dispatcher requires an evaluate-capable engine');
    }
    if (!handlers || typeof handlers !== 'object' || Array.isArray(handlers)) {
        throw new TypeError('event breakpoint handlers must be an object');
    }
    if (!Number.isSafeInteger(maxPendingPlans) || maxPendingPlans < 1) {
        throw new RangeError('maxPendingPlans must be a positive safe integer');
    }
    if (!Array.isArray(suppressedActions) || suppressedActions.some(type =>
        typeof type !== 'string' || type.length === 0)) {
        throw new TypeError('suppressedActions must be an array of non-empty action type names');
    }
    const suppressedTypes = new Set(suppressedActions);
    let pending = [];
    const effectiveHandlers = {...handlers};
    if (recordingSession) effectiveHandlers.checkpoint = () => {
        if (typeof recordingSession.status !== 'function' || !recordingSession.status().active) {
            throw new Error('checkpoint action requires active deterministic recording');
        }
        const result = recordingSession.checkpoint();
        if (!result?.accepted) throw new Error(result?.reason || 'checkpoint action was refused');
        return result;
    };

    const hasDecision = plan => plan.matchingIds.length > 0 || plan.actions.length > 0 || plan.halt;
    const aggregate = entries => {
        const matchingIds = [];
        const seen = new Set();
        const actions = [];
        let halt = false;
        for (const entry of entries) {
            const {plan} = entry;
            for (const id of plan.matchingIds) {
                if (!seen.has(id)) {
                    seen.add(id);
                    matchingIds.push(id);
                }
            }
            actions.push(...plan.actions.map(action => ({...action,
                triggerEventSeq: entry.triggerEventSeq})));
            halt ||= plan.halt;
        }
        return {matchingIds, halt, actions};
    };
    const withTrigger = (plan, triggerEventSeq) => ({...plan,
        actions: plan.actions.map(action => ({...action, triggerEventSeq}))});
    const suppress = plan => {
        const suppressed = plan.actions.filter(action => suppressedTypes.has(action.type));
        return {
            plan: {
                ...plan,
                halt: plan.halt && !suppressedTypes.has('halt'),
                actions: plan.actions.filter(action => !suppressedTypes.has(action.type))
            },
            suppressed
        };
    };
    const checkpointLast = plan => ({
        ...plan,
        actions: [
            ...plan.actions.filter(action => action.type !== 'checkpoint'),
            ...plan.actions.filter(action => action.type === 'checkpoint')
        ]
    });

    return {
        /**
         * Evaluate and execute exactly one forward event. Set `replay: true`
         * when reconstructing history to suppress predicates and all actions.
         */
        dispatch (input, {context = {}, replay = false} = {}) {
            if (typeof replay !== 'boolean') throw new TypeError('replay must be a boolean');
            if (replay) {
                const clearedPendingPlans = pending.length;
                pending = [];
                return {
                    suppressed: true,
                    reason: 'replay',
                    event: null,
                    plan: null,
                    outcome: null,
                    clearedPendingPlans
                };
            }
            const event = normalizeDebugEvent(input);
            const plan = engine.evaluate(event, context);
            if (DEFERRED_KINDS.has(event.kind) && hasDecision(plan)) {
                if (pending.length >= maxPendingPlans) {
                    return {
                        suppressed: false,
                        reason: null,
                        event,
                        plan,
                        outcome: null,
                        deferred: false,
                        failure: {
                            code: 'breakpoint-pending-overflow',
                            maxPendingPlans,
                            pendingPlans: pending.length
                        }
                    };
                }
                pending.push({plan, triggerEventSeq: event.seq});
                return {
                    suppressed: false, reason: null, event, plan, outcome: null,
                    deferred: true, pendingPlans: pending.length, failure: null
                };
            }

            const isRetire = event.kind === 'instruction' && event.phase === 'retire';
            const flushedPlans = isRetire ? pending.length : 0;
            const entries = isRetire ? [...pending,
                ...(hasDecision(plan) ? [{plan, triggerEventSeq: event.seq}] : [])] : [];
            const executable = isRetire && entries.length ? aggregate(entries) :
                withTrigger(plan, event.seq);
            const triggerEventSeqs = isRetire ? entries.map(entry => entry.triggerEventSeq) :
                (hasDecision(plan) ? [event.seq] : []);
            if (isRetire) pending = [];
            const filtered = suppress(executable);
            const outcome = executeBreakpointPlan(checkpointLast(filtered.plan), effectiveHandlers,
                {...context, triggerEventSeqs});
            return {
                suppressed: false, reason: null, event, plan: executable, outcome,
                deferred: false, flushedPlans, triggerEventSeqs,
                suppressedActions: filtered.suppressed.map(action => ({...action})), failure: null
            };
        },

        pending () {
            return {plans: pending.length, maxPendingPlans};
        },

        clear () {
            pending = [];
        }
    };
}
