/**
 * Versioned debugger capability negotiation.
 *
 * Existing targets return a compact legacy object. This module normalizes that
 * object without upgrading its claims: in particular, an instruction step does
 * not imply a cycle boundary and a writable space does not imply passive reads.
 */

export const DEBUG_CAPABILITY_SCHEMA = 1;

const COMMAND_REQUIREMENTS = Object.freeze({
    stepInstruction: ['steps', 'insn'],
    stepCycle: ['steps', 'cycle'],
    stepPhase: ['steps', 'phase'],
    stepSource: ['steps', 'line'],
    stepBlock: ['steps', 'block'],
    stepTask: ['steps', 'task'],
    stepOver: ['steps', 'over'],
    stepOut: ['steps', 'out'],
    reverseInstruction: ['reverse', 'insn'],
    reverseCycle: ['reverse', 'cycle'],
    reverseContinue: ['reverse', 'continue'],
    checkpoint: ['recording', 'checkpoint'],
    restore: ['recording', 'restore'],
    fork: ['recording', 'fork']
});

const uniqueStrings = (value) => [...new Set(
    (Array.isArray(value) ? value : []).filter(item => typeof item === 'string')
)];

const normalizeSpaces = (raw) => {
    const spaces = {};
    const writable = new Set(uniqueStrings(raw.writable));
    if (Array.isArray(raw.spaces)) {
        for (const name of uniqueStrings(raw.spaces)) {
            spaces[name] = {read: true, write: writable.has(name), passiveRead: null};
        }
    } else if (raw.spaces && typeof raw.spaces === 'object') {
        for (const [name, value] of Object.entries(raw.spaces)) {
            if (!value || typeof value !== 'object') continue;
            spaces[name] = {
                read: value.read === true,
                write: value.write === true || value.write === 'curated' ? value.write : false,
                passiveRead: typeof value.passiveRead === 'boolean' ? value.passiveRead : null
            };
        }
    }
    return spaces;
};

/** Normalize a target's capability response into schema 1. */
export function normalizeDebugCapabilities (raw = {}, {target = 'unknown'} = {}) {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
        throw new TypeError('debug capabilities must be an object');
    }
    if (raw.schema !== undefined && raw.schema !== DEBUG_CAPABILITY_SCHEMA) {
        throw new Error(`unsupported debug capability schema ${String(raw.schema)}`);
    }

    const steps = uniqueStrings(raw.steps);
    const events = uniqueStrings(raw.events);
    const fidelity = {...(raw.fidelity || {})};
    // This default is intentionally conservative. Existing cores execute whole
    // instructions per call; only a target explicitly advertising `cycle` may
    // claim recorded cycle boundaries.
    fidelity.instruction = fidelity.instruction || (steps.includes('insn') ? 'recorded' : 'unsupported');
    fidelity.cycle = fidelity.cycle || (steps.includes('cycle') ? 'recorded' : 'unsupported');

    return Object.freeze({
        schema: DEBUG_CAPABILITY_SCHEMA,
        target,
        steps: Object.freeze(steps),
        breakpoints: Object.freeze(uniqueStrings(raw.breakpoints)),
        events: Object.freeze(events),
        reverse: Object.freeze(uniqueStrings(raw.reverse)),
        recording: Object.freeze(uniqueStrings(raw.recording)),
        spaces: Object.freeze(normalizeSpaces(raw)),
        fidelity: Object.freeze(fidelity),
        haltPolicy: raw.haltPolicy || null,
        timeFreezes: raw.timeFreezes === true,
        consumes: Object.freeze(uniqueStrings(raw.consumes)),
        extensions: Object.freeze({...raw.extensions})
    });
}

export function negotiateDebugCapabilities (target, options) {
    if (!target || typeof target.capabilities !== 'function') {
        throw new TypeError('debug target must provide capabilities()');
    }
    return normalizeDebugCapabilities(target.capabilities(), options);
}

/** Return a stable structured answer suitable for UI controls and protocols. */
export function commandCapability (capabilities, command) {
    const requirement = COMMAND_REQUIREMENTS[command];
    if (!requirement) {
        return Object.freeze({
            accepted: false,
            command,
            code: 'unknown-command',
            reason: `unknown debugger command: ${command}`
        });
    }
    const [group, value] = requirement;
    if (capabilities[group] && capabilities[group].includes(value)) {
        return Object.freeze({accepted: true, command, capability: `${group}.${value}`});
    }
    return Object.freeze({
        accepted: false,
        command,
        code: 'unsupported-capability',
        missing: `${group}.${value}`,
        reason: `${command} requires ${group}.${value}, which this target does not advertise`
    });
}

export function memoryCapability (capabilities, space, operation = 'read') {
    const descriptor = capabilities.spaces[space];
    if (!descriptor) return {accepted: false, code: 'unknown-address-space', space, operation};
    const support = descriptor[operation];
    if (support === true) return {accepted: true, space, operation};
    if (support === 'curated') {
        return {accepted: true, space, operation, restricted: true};
    }
    return {accepted: false, code: 'unsupported-memory-operation', space, operation};
}

/** Adapter for the event predicate engine; keeps its hot-path shape private. */
export function eventBreakpointCapabilities (capabilities) {
    const addressSpaces = {};
    for (const [name, descriptor] of Object.entries(capabilities.spaces)) {
        addressSpaces[name] = {
            read: descriptor.read,
            write: descriptor.write,
            // Unknown is deliberately false: conditions may only inspect a
            // space whose producer explicitly promises a passive debug read.
            passive: descriptor.passiveRead === true
        };
    }
    return {
        eventKinds: [...capabilities.events],
        addressSpaces,
        maxConditionReads: capabilities.extensions.maxConditionReads,
        allowBreakpointWrites: capabilities.extensions.allowBreakpointWrites === true
    };
}
