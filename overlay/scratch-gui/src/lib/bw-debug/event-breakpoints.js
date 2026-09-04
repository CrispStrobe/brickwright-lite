/**
 * Target-neutral breakpoints over canonical debugger events.
 *
 * This module deliberately does not read a CPU or device.  Producers declare
 * capabilities, callers supply already-recorded events, and conditions are
 * compiled by an injected bounded evaluator.  That keeps inspection from
 * accidentally acknowledging an interrupt or consuming a device register.
 */

const EVENT_KINDS = {
    execute: ['instruction'],
    memory: ['memory'],
    port: ['port'],
    interrupt: ['interrupt'],
    register: ['instruction', 'register'],
    signal: ['signal'],
    time: null,
    count: null,
    event: null
};

const ACTIONS = new Set([
    'halt', 'log', 'capture', 'checkpoint', 'counter',
    'script-safe-expression', 'write'
]);

const refusal = (code, message, details = {}) => ({
    ok: false,
    refusal: {code, message, ...details}
});

const integer = (value, fallback) => Number.isSafeInteger(value) ? value : fallback;

function rangeOf(spec, prefix = '') {
    const exact = spec[`${prefix}address`];
    const start = exact ?? spec[`${prefix}start`] ?? 0;
    const end = exact ?? spec[`${prefix}end`] ?? start;
    return {start, end};
}

function inRange(value, range) {
    return typeof value === 'number' && value >= range.start && value <= range.end;
}

function ordinalAtLeast(value, threshold) {
    if (typeof value === 'bigint' || typeof threshold === 'bigint' ||
        (typeof value === 'string' && /^0x[0-9a-f]+$/i.test(value)) ||
        (typeof threshold === 'string' && /^0x[0-9a-f]+$/i.test(threshold))) {
        try { return BigInt(value) >= BigInt(threshold); } catch { return false; }
    }
    return typeof value === 'number' && typeof threshold === 'number' && value >= threshold;
}

function supportedKinds(capabilities) {
    return new Set(capabilities?.eventKinds || []);
}

function requiredKinds(spec) {
    if (spec.kind === 'event') return spec.eventKinds || (spec.eventKind ? [spec.eventKind] : []);
    return EVENT_KINDS[spec.kind] || [];
}

function compileCondition(spec, evaluator, capabilities) {
    if (spec.condition == null) return {ok: true, test: () => true};
    if (!evaluator || typeof evaluator.compile !== 'function') {
        return refusal('condition-evaluator-unavailable',
            'This breakpoint has a condition but no bounded condition evaluator was provided.');
    }

    const reads = spec.conditionReads || [];
    const spaces = capabilities?.addressSpaces || {};
    for (const read of reads) {
        const space = spaces[read.space];
        if (!space) {
            return refusal('unsupported-address-space',
                `Condition reads unsupported address space "${read.space}".`, {space: read.space});
        }
        if (space.passive !== true) {
            return refusal('destructive-read',
                `Condition read from "${read.space}" is not declared passive.`, {space: read.space});
        }
    }

    let compiled;
    try {
        compiled = evaluator.compile(String(spec.condition), {
            maxReads: integer(capabilities?.maxConditionReads, 16), reads
        });
    } catch (error) {
        return refusal('invalid-condition', error?.message || String(error));
    }
    if (!compiled || typeof compiled.test !== 'function') {
        return refusal('invalid-condition', 'The bounded evaluator did not return a test function.');
    }
    return {ok: true, test: (event, context) => Boolean(compiled.test({event, context}))};
}

function compileMatcher(spec) {
    switch (spec.kind) {
    case 'event': {
        const kinds = new Set(spec.eventKinds || (spec.eventKind ? [spec.eventKind] : []));
        return event => kinds.size === 0 || kinds.has(event.kind);
    }
    case 'execute': {
        const range = rangeOf(spec);
        return event => event.kind === 'instruction' &&
            inRange(event.pcBefore ?? event.instruction?.address, range);
    }
    case 'memory': {
        const range = rangeOf(spec);
        const direction = spec.direction || 'access';
        return event => event.kind === 'memory' &&
            (!spec.space || event.memory?.space === spec.space) &&
            inRange(event.memory?.address, range) &&
            (direction === 'access' || event.memory?.direction === direction) &&
            (!spec.change || (Object.hasOwn(event.memory || {}, 'before') &&
                event.memory.before !== event.memory.value));
    }
    case 'port': {
        const exact = spec.port ?? spec.portAddress ?? spec.address;
        const range = {
            start: exact ?? spec.portStart ?? spec.start ?? 0,
            end: exact ?? spec.portEnd ?? spec.end ?? exact ?? spec.portStart ?? spec.start ?? 0
        };
        return event => event.kind === 'port' &&
            inRange(event.port?.address ?? event.port?.number, range) &&
            (!spec.direction || spec.direction === 'access' || event.port?.direction === spec.direction);
    }
    case 'interrupt':
        return event => event.kind === 'interrupt' &&
            (!spec.phase || event.phase === spec.phase) &&
            (spec.vector == null || event.interrupt?.vector === spec.vector);
    case 'register':
        return event => {
            const change = event.changes?.registers?.[spec.register] ??
                (event.register?.name === spec.register ? event.register : null);
            if (!change) return false;
            if (spec.from != null && change.before !== spec.from) return false;
            if (spec.to != null && change.after !== spec.to) return false;
            return !spec.change || change.before !== change.after;
        };
    case 'signal':
        return event => event.kind === 'signal' && event.signal?.name === spec.signal &&
            (!spec.edge || spec.edge === 'any' ||
                (spec.edge === 'rising' && event.signal.before === 0 && event.signal.value === 1) ||
                (spec.edge === 'falling' && event.signal.before === 1 && event.signal.value === 0));
    case 'time':
        return event => event.time?.domain === spec.domain &&
            ordinalAtLeast(event.time.ticks, spec.at);
    case 'count':
        return (_event, context) => (context?.counts?.[spec.counter || 'events'] || 0) >= spec.at;
    default:
        return null;
    }
}

/** Compile one breakpoint, returning a structured refusal instead of throwing. */
export function compileEventBreakpoint(spec, capabilities = {}, evaluator = null, creation = 0) {
    if (!spec || typeof spec !== 'object') return refusal('invalid-breakpoint', 'Breakpoint must be an object.');
    if (!spec.id) return refusal('missing-id', 'Breakpoint id is required.');
    if (!Object.hasOwn(EVENT_KINDS, spec.kind)) {
        return refusal('unsupported-breakpoint-kind', `Unknown breakpoint kind "${spec.kind}".`, {kind: spec.kind});
    }

    const available = supportedKinds(capabilities);
    const required = requiredKinds(spec);
    const usable = required.length === 0 || required.some(kind => available.has(kind));
    if (!usable) {
        return refusal('unsupported-event-kind',
            `Target does not emit the event kind required by "${spec.kind}".`, {required, available: [...available]});
    }
    if (spec.kind === 'memory' && spec.space &&
        !Object.hasOwn(capabilities.addressSpaces || {}, spec.space)) {
        return refusal('unsupported-address-space',
            `Target does not expose address space "${spec.space}".`, {space: spec.space});
    }

    const matcher = compileMatcher(spec);
    const condition = compileCondition(spec, evaluator, capabilities);
    if (!condition.ok) return condition;
    const actions = spec.actions || [{type: 'halt'}];
    const badAction = actions.find(action => !action || !ACTIONS.has(action.type));
    if (badAction) return refusal('unsupported-action', `Unsupported breakpoint action "${badAction?.type}".`);
    if (actions.some(action => action.type === 'write') && capabilities.allowBreakpointWrites !== true) {
        return refusal('write-action-disabled', 'Breakpoint write actions are not enabled for this target.');
    }

    return {ok: true, breakpoint: {
        id: String(spec.id), creation, enabled: spec.enabled !== false, oneShot: Boolean(spec.oneShot),
        encounters: 0, matches: 0, ignoreCount: Math.max(0, integer(spec.ignoreCount, 0)),
        modulo: Math.max(1, integer(spec.modulo, 1)),
        hitCount: Number.isSafeInteger(spec.hitCount) && spec.hitCount > 0 ? spec.hitCount : null,
        actions: actions.map(action => ({...action})),
        requiredEventKinds: required,
        test(event, context) {
            if (!this.enabled || !matcher(event, context) || !condition.test(event, context)) return false;
            this.encounters++;
            if (this.encounters <= this.ignoreCount) return false;
            const eligible = this.encounters - this.ignoreCount;
            if (this.hitCount != null && eligible !== this.hitCount) return false;
            if (eligible % this.modulo !== 0) return false;
            this.matches++;
            return true;
        }
    }};
}

/** Stateful collection whose arbitration order is breakpoint creation order. */
export class EventBreakpointEngine {
    constructor(capabilities = {}, evaluator = null) {
        this.capabilities = capabilities;
        this.evaluator = evaluator;
        this.breakpoints = [];
        this.nextCreation = 0;
    }

    add(spec) {
        const result = compileEventBreakpoint(spec, this.capabilities, this.evaluator, this.nextCreation++);
        if (result.ok) this.breakpoints.push(result.breakpoint);
        return result;
    }

    setEnabled(id, enabled) {
        const breakpoint = this.breakpoints.find(item => item.id === id);
        if (!breakpoint) return false;
        breakpoint.enabled = Boolean(enabled);
        return true;
    }

    evaluate(event, context = {}) {
        const matches = this.breakpoints
            .filter(breakpoint => breakpoint.test(event, context))
            .sort((a, b) => a.creation - b.creation);
        const actions = [];
        for (const breakpoint of matches) {
            breakpoint.actions.forEach((action, actionIndex) => actions.push({
                breakpointId: breakpoint.id, actionIndex, ...action
            }));
            if (breakpoint.oneShot) breakpoint.enabled = false;
        }
        return {
            matchingIds: matches.map(breakpoint => breakpoint.id),
            halt: actions.some(action => action.type === 'halt'),
            actions
        };
    }
}
