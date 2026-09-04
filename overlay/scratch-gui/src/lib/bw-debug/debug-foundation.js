/** Compose the versioned event, capability, breakpoint and recording contracts. */
import {
    eventBreakpointCapabilities,
    normalizeDebugCapabilities
} from './debug-capabilities.js';
import {EventBreakpointEngine} from './event-breakpoints.js';
import {createDebugEventStream} from './event-stream.js';
import {createDebugRecorder} from './recorder.js';

/** Connect a target-owned fact source to the runner-owned sequenced stream. */
export function subscribeDebugTargetEvents (target, eventStream) {
    if (!target || typeof target.onDebugEvent !== 'function') return null;
    if (!eventStream || typeof eventStream.publish !== 'function') {
        throw new TypeError('debug target events require a publish-capable event stream');
    }
    const unsubscribe = target.onDebugEvent(event => eventStream.publish(event));
    if (typeof unsubscribe !== 'function') {
        throw new TypeError('onDebugEvent must return an unsubscribe function');
    }
    return unsubscribe;
}

export function createDebugFoundation ({eventCapacity = 4096, conditionEvaluator = null} = {}) {
    const events = createDebugEventStream({capacity: eventCapacity});
    const recorder = createDebugRecorder();
    let capabilities = normalizeDebugCapabilities();
    let breakpoints = new EventBreakpointEngine(eventBreakpointCapabilities(capabilities), conditionEvaluator);

    return {
        events,
        recorder,
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
        clear () {
            events.clear();
            recorder.clear();
            capabilities = normalizeDebugCapabilities();
            breakpoints = new EventBreakpointEngine(
                eventBreakpointCapabilities(capabilities), conditionEvaluator);
        }
    };
}
