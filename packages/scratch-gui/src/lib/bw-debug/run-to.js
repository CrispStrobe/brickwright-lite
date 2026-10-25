const refusal = (code, reason, details = {}) => ({accepted: false, code, reason, ...details});

/**
 * Run to an address before it executes by owning one temporary native code
 * breakpoint. This coordinator is deliberately synchronous: callers retain
 * their normal scheduling/UI layer around the bounded runFor slices.
 */
export function createRunToCoordinator ({target, maxSlices = 10000, sliceBudgetNs = 1_000_000} = {}) {
    if (!target || typeof target.capabilities !== 'function' ||
        typeof target.setBreakpoint !== 'function' || typeof target.clearBreakpoint !== 'function' ||
        typeof target.onHalt !== 'function' || typeof target.run !== 'function' ||
        typeof target.runFor !== 'function' || typeof target.state !== 'function' ||
        typeof target.halt !== 'function' || typeof target.regs !== 'function') {
        throw new TypeError('run-to coordinator requires a runnable breakpoint-capable target');
    }
    if (!Number.isSafeInteger(maxSlices) || maxSlices < 1 ||
        !Number.isFinite(sliceBudgetNs) || sliceBudgetNs <= 0) {
        throw new RangeError('run-to bounds must be positive');
    }
    let generation = 0;
    let operation = null;
    let lastResult = null;

    const descriptor = () => {
        const capabilities = target.capabilities();
        return Array.isArray(capabilities?.runTo) && capabilities.runTo.find(item =>
            item?.kind === 'address' && item.space === 'code' &&
            item.stopSides?.includes('before') && item.installation === 'sync' &&
            Number.isSafeInteger(item.addressMin) && Number.isSafeInteger(item.addressMax) &&
            item.addressMin >= 0 && item.addressMax >= item.addressMin);
    };
    const finish = (result, {halt = false} = {}) => {
        const current = operation;
        if (!current) return result;
        let cleanupFailure = null;
        if (halt && target.state() === 'running') {
            try { target.halt(); } catch (error) { cleanupFailure = error; }
        }
        try { current.unsubscribe(); } catch (error) { cleanupFailure ||= error; }
        try {
            const cleared = target.clearBreakpoint(current.breakpointId);
            if (cleared && typeof cleared.then === 'function') {
                throw new TypeError('synchronous run-to target returned a promise during cleanup');
            }
        } catch (error) {
            cleanupFailure ||= error;
        }
        operation = null;
        lastResult = cleanupFailure ? refusal('run-to-cleanup-failed',
            cleanupFailure.message || String(cleanupFailure), {
                generation: current.generation, priorResult: result
            }) : result;
        return lastResult;
    };

    const api = {
        startAddress (address, options = {}) {
            if (operation) return refusal('run-to-busy', 'another run-to operation is active');
            if (!Number.isSafeInteger(address) || address < 0) {
                return refusal('invalid-run-to-address', 'address must be a non-negative safe integer');
            }
            const support = descriptor();
            if (!support) {
                return refusal('run-to-address-unsupported',
                    'target has no bounded synchronous address/code/before run-to capability');
            }
            if (address < support.addressMin || address > support.addressMax) {
                return refusal('run-to-address-out-of-range', 'address is outside target code bounds', {
                    addressMin: support.addressMin, addressMax: support.addressMax
                });
            }
            if (target.state() !== 'halted') {
                return refusal('run-to-target-running', 'target must be halted at the starting boundary');
            }
            const slices = options.maxSlices ?? maxSlices;
            const budgetNs = options.sliceBudgetNs ?? sliceBudgetNs;
            if (!Number.isSafeInteger(slices) || slices < 1 ||
                !Number.isFinite(budgetNs) || budgetNs <= 0) {
                return refusal('invalid-run-to-bound', 'run-to bounds must be positive');
            }

            const operationGeneration = ++generation;
            let installed;
            try {
                installed = target.setBreakpoint({kind: 'code', addr: address});
            } catch (error) {
                return refusal('run-to-breakpoint-refused', error?.message || String(error), {
                    generation: operationGeneration
                });
            }
            if (installed && typeof installed.then === 'function') {
                return refusal('run-to-installation-invalid',
                    'target advertised synchronous installation but returned a promise', {
                        generation: operationGeneration
                    });
            }
            if (installed && typeof installed === 'object') {
                return refusal('run-to-breakpoint-refused',
                    installed.unsupported || installed.reason || 'temporary breakpoint was refused');
            }
            const breakpointId = installed;
            const current = {generation: operationGeneration,
                address, breakpointId, maxSlices: slices, sliceBudgetNs: budgetNs,
                slices: 0, haltCause: null, unsubscribe: null};
            operation = current;
            try {
                current.unsubscribe = target.onHalt(cause => {
                    if (operation?.generation === current.generation) current.haltCause = cause;
                });
                if (typeof current.unsubscribe !== 'function') {
                    throw new TypeError('target halt subscription did not return an unsubscribe function');
                }
                const resumed = target.run();
                if (resumed && typeof resumed.then === 'function') {
                    throw new TypeError('synchronous run-to target returned a promise from run');
                }
                lastResult = {accepted: true, reason: 'started', address,
                    generation: current.generation, maxSlices: slices};
                return lastResult;
            } catch (error) {
                if (!current.unsubscribe) current.unsubscribe = () => {};
                return finish(refusal('run-to-failed', error?.message || String(error), {
                    generation: current.generation
                }), {halt: true});
            }
        },

        pump () {
            const current = operation;
            if (!current) return refusal('run-to-not-active', 'no run-to operation is active');
            try {
                const ran = target.runFor(current.sliceBudgetNs);
                if (ran && typeof ran.then === 'function') {
                    throw new TypeError('synchronous run-to target returned a promise from runFor');
                }
                current.slices++;
                if (target.state() === 'halted') {
                    const atDestination = target.regs().pc === current.address;
                    if (current.haltCause?.cause === 'breakpoint' && atDestination) {
                        return finish({accepted: true, reason: 'address', address: current.address,
                            generation: current.generation, slices: current.slices});
                    }
                    return finish(refusal('run-to-interrupted',
                        'target halted before the temporary breakpoint', {
                            generation: current.generation, slices: current.slices,
                            haltCause: current.haltCause
                        }));
                }
                if (current.slices >= current.maxSlices) {
                    return finish(refusal('run-to-budget-exhausted',
                        'run-to slice budget was exhausted', {
                            generation: current.generation, maxSlices: current.maxSlices
                        }), {halt: true});
                }
                return {accepted: true, reason: 'running', address: current.address,
                    generation: current.generation, slices: current.slices};
            } catch (error) {
                return finish(refusal('run-to-failed', error?.message || String(error), {
                    generation: current.generation
                }), {halt: true});
            }
        },

        cancel () {
            if (!operation) return refusal('run-to-not-active', 'no run-to operation is active');
            return finish({accepted: true, reason: 'cancelled',
                generation: operation.generation, slices: operation.slices}, {halt: true});
        },

        status () {
            return operation ? {active: true, generation: operation.generation,
                address: operation.address, slices: operation.slices,
                maxSlices: operation.maxSlices} : {active: false, generation, lastResult};
        },

        runToAddress (address, options = {}) {
            const started = api.startAddress(address, options);
            if (!started.accepted || started.reason !== 'started') return started;
            let result = started;
            while (api.status().active) result = api.pump();
            return result;
        }
    };
    return api;
}

/** Bounded event/time run control whose stopping boundary is always a full instruction retire. */
export function createInstructionAtomicRunToCoordinator ({target, subscribeEvents,
    maxInstructions = 100000, maxPumpsPerInstruction = 4096, pumpBudgetNs = 1000} = {}) {
    if (!target || typeof target.capabilities !== 'function' || typeof target.step !== 'function' ||
        typeof target.runFor !== 'function' || typeof target.state !== 'function' ||
        typeof target.halt !== 'function' || typeof target.debugTime !== 'function') {
        throw new TypeError('instruction-atomic run-to requires an instruction-step target');
    }
    const subscribe = subscribeEvents || (listener => target.onDebugEvent(listener));
    if (typeof subscribe !== 'function' || !Number.isSafeInteger(maxInstructions) || maxInstructions < 1 ||
        !Number.isSafeInteger(maxPumpsPerInstruction) || maxPumpsPerInstruction < 1 ||
        !Number.isFinite(pumpBudgetNs) || pumpBudgetNs <= 0) {
        throw new TypeError('instruction-atomic run-to configuration is invalid');
    }

    const run = (stop, reason) => {
        if (!target.capabilities()?.steps?.includes('insn')) {
            return refusal('instruction-run-to-unsupported', 'target has no instruction step');
        }
        if (target.state() !== 'halted') {
            return refusal('run-to-target-running', 'target must be halted at the starting boundary');
        }
        let matched = null;
        let callbackError = null;
        let unsubscribe = null;
        try {
            unsubscribe = subscribe(event => {
                if (matched || callbackError) return;
                try {
                    if (stop(event)) matched = event;
                } catch (error) {
                    callbackError = error;
                }
            });
            if (typeof unsubscribe !== 'function') throw new TypeError('event subscription is not removable');
            for (let instruction = 1; instruction <= maxInstructions; instruction++) {
                const stepRefusal = target.step('insn', 1);
                if (stepRefusal) return refusal('instruction-step-refused',
                    stepRefusal.reason || stepRefusal.unsupported || 'instruction step was refused');
                let pumps = 0;
                while (target.state() === 'running' && pumps++ < maxPumpsPerInstruction) {
                    target.runFor(pumpBudgetNs);
                }
                if (target.state() === 'running') {
                    target.halt();
                    return refusal('instruction-run-to-pump-exhausted',
                        'instruction did not reach a halted boundary', {instruction});
                }
                if (callbackError) return refusal('run-to-predicate-failed',
                    callbackError.message || String(callbackError), {instruction});
                if (matched) return {accepted: true, reason, boundary: 'instruction',
                    instructions: instruction, event: matched};
                if (reason === 'time' && stop(null)) return {accepted: true, reason,
                    boundary: 'instruction', instructions: instruction, time: target.debugTime()};
            }
            return refusal('instruction-run-to-budget-exhausted',
                'instruction run-to budget was exhausted', {maxInstructions});
        } catch (error) {
            if (target.state() === 'running') target.halt();
            return refusal('instruction-run-to-failed', error?.message || String(error));
        } finally {
            if (unsubscribe) unsubscribe();
            if (target.state() === 'running') target.halt();
        }
    };

    return {
        runToEvent (predicate) {
            if (typeof predicate !== 'function') {
                return refusal('invalid-run-to-predicate', 'event predicate must be a function');
            }
            return run(predicate, 'event');
        },
        runToTime (time) {
            if (!time || (!Number.isSafeInteger(time.ticks) && typeof time.ticks !== 'bigint') ||
                time.ticks < 0 || typeof time.domain !== 'string' || !time.domain) {
                return refusal('invalid-run-to-time', 'time requires non-negative ticks and a domain');
            }
            const current = target.debugTime();
            if (current.domain !== time.domain) {
                return refusal('run-to-time-domain-mismatch', 'target is in a different time domain');
            }
            if (current.ticks >= time.ticks) return {accepted: true, reason: 'time',
                boundary: 'instruction', instructions: 0, time: current};
            return run(event => {
                if (event !== null) return false;
                const now = target.debugTime();
                if (now.domain !== time.domain) throw new Error('target time domain changed during run-to');
                return now.ticks >= time.ticks;
            }, 'time');
        }
    };
}
