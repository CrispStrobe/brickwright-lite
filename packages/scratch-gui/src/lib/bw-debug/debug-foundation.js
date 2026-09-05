/** Compose the versioned event, capability, breakpoint and recording contracts. */
import {
    eventBreakpointCapabilities,
    normalizeDebugCapabilities
} from './debug-capabilities.js';
import {EventBreakpointEngine, executeBreakpointPlan} from './event-breakpoints.js';
import {createDebugEventStream} from './event-stream.js';
import {createDebugRecorder} from './recorder.js';
import {createDebugTimeline} from './timeline.js';
import {createHaltOccurrenceLedger} from './halt-occurrence-ledger.js';

/** Connect a target-owned fact source to the runner-owned sequenced stream. */
export function subscribeDebugTargetEvents (target, eventStream, onPublished = null) {
    if (!target || typeof target.onDebugEvent !== 'function') return null;
    if (!eventStream || typeof eventStream.publish !== 'function') {
        throw new TypeError('debug target events require a publish-capable event stream');
    }
    const unsubscribe = target.onDebugEvent(event => {
        const published = eventStream.publish(event);
        if (typeof onPublished === 'function') onPublished(published);
    });
    if (typeof unsubscribe !== 'function') {
        throw new TypeError('onDebugEvent must return an unsubscribe function');
    }
    return unsubscribe;
}

export function createDebugFoundation ({eventCapacity = 4096, conditionEvaluator = null} = {}) {
    const events = createDebugEventStream({capacity: eventCapacity});
    const recorder = createDebugRecorder();
    const timeline = createDebugTimeline({capacity: eventCapacity});
    const haltOccurrences = createHaltOccurrenceLedger({maxOccurrences: eventCapacity});
    let capabilities = normalizeDebugCapabilities();
    let breakpoints = new EventBreakpointEngine(eventBreakpointCapabilities(capabilities), conditionEvaluator);

    return {
        events,
        recorder,
        timeline,
        haltOccurrences,
        ingestTimeline: batch => timeline.append(batch),
        attachCapabilities (raw, options) {
            capabilities = normalizeDebugCapabilities(raw, options);
            // Breakpoints are scoped to an attached execution target. Keeping
            // predicates compiled for a previous address space would be worse
            // than requiring the host to re-add them from its durable store.
            breakpoints = new EventBreakpointEngine(
                eventBreakpointCapabilities(capabilities), conditionEvaluator);
            return capabilities;
        },
        capabilities: () => capabilities,
        addBreakpoint: spec => breakpoints.add(spec),
        evaluateBreakpoints: (event, context) => breakpoints.evaluate(event, context),
        executeBreakpointPlan: (plan, handlers, context) =>
            executeBreakpointPlan(plan, handlers, context),
        clear () {
            events.clear();
            recorder.clear();
            timeline.clear();
            haltOccurrences.clear();
            capabilities = normalizeDebugCapabilities();
            breakpoints = new EventBreakpointEngine(
                eventBreakpointCapabilities(capabilities), conditionEvaluator);
        }
    };
}
