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
    source: ['instruction', 'scheduler'],
    block: ['instruction', 'scheduler'],
    task: ['scheduler', 'instruction'],
    scheduler: ['scheduler'],
    device: ['device'],
    call: ['instruction'],
    time: null,
    count: null,
    event: null
};

const ACTIONS = new Set([
    'halt', 'log', 'capture', 'checkpoint', 'counter',
    'script-safe-expression', 'write'
]);

export const EVENT_BREAKPOINT_STATE_SCHEMA = 1;

const definitionFingerprint = spec => {
    const active = new Set();
    const encode = value => {
        if (value === null || typeof value === 'string' || typeof value === 'boolean') {
            return JSON.stringify(value);
        }
        if (typeof value === 'number') return Number.isFinite(value) ? String(value) : `number:${String(value)}`;
        if (typeof value === 'bigint') return `bigint:${value}`;
        if (typeof value === 'undefined') return 'undefined';
        if (typeof value === 'function' || typeof value === 'symbol') return `${typeof value}:${String(value)}`;
        if (active.has(value)) throw new TypeError('Breakpoint definitions cannot contain cycles');
        active.add(value);
        const encoded = Array.isArray(value) ? `[${value.map(encode).join(',')}]` :
            `{${Object.keys(value).filter(key => key !== 'enabled').sort()
                .map(key => `${JSON.stringify(key)}:${encode(value[key])}`).join(',')}}`;
        active.delete(value);
        return encoded;
    };
    const text = encode(spec);
    let hash = 0xcbf29ce484222325n;
    for (const byte of new TextEncoder().encode(text)) {
        hash ^= BigInt(byte);
        hash = BigInt.asUintN(64, hash * 0x100000001b3n);
    }
    return hash.toString(16).padStart(16, '0');
};

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
    case 'source':
        return event => (event.kind === 'instruction' || event.kind === 'scheduler') &&
            (!spec.file || event.source?.file === spec.file) &&
            (spec.line == null || event.source?.line === spec.line);
    case 'block':
        return event => (event.kind === 'instruction' || event.kind === 'scheduler') &&
            event.source?.blockId === spec.blockId;
    case 'task':
        return event => (event.kind === 'scheduler' || event.kind === 'instruction') &&
            (event.source?.task ?? event.scheduler?.task) === spec.task &&
            (!spec.state || event.source?.state === spec.state || event.scheduler?.state === spec.state);
    case 'scheduler':
        return event => event.kind === 'scheduler' &&
            (!spec.event || event.scheduler?.event === spec.event) &&
            (!spec.task || event.scheduler?.task === spec.task) &&
            (!spec.state || event.scheduler?.state === spec.state);
    case 'device':
        return event => event.kind === 'device' &&
            (!spec.deviceId || event.device?.id === spec.deviceId) &&
            (!spec.event || event.device?.event === spec.event) &&
            (!spec.register || event.device?.register === spec.register) &&
            (spec.value == null || event.device?.value === spec.value);
    case 'call':
        return event => event.kind === 'instruction' &&
            (!spec.phase || event.instruction?.controlFlow === spec.phase) &&
            (spec.depth == null || event.instruction?.depth === spec.depth);
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
        kind: spec.kind,
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

/**
 * Execute an arbitration plan without allowing individual `halt` actions to
 * stop later matches. Every non-halt action runs in the already-determined
 * creation/action order, then the host receives one halt containing all causes.
 * Failures are data and may be published by `onActionError`; they never vanish
 * into a console side channel.
 */
export function executeBreakpointPlan(plan, handlers = {}, context = {}) {
    if (!plan || !Array.isArray(plan.actions) || !Array.isArray(plan.matchingIds)) {
        throw new TypeError('breakpoint action plan is invalid');
    }
    const results = [];
    const failures = [];
    for (const action of plan.actions) {
        if (action.type === 'halt') continue;
        const handler = handlers[action.type];
        if (typeof handler !== 'function') {
            const failure = {
                code: 'breakpoint-action-handler-unavailable',
                breakpointId: action.breakpointId,
                actionIndex: action.actionIndex,
                actionType: action.type
            };
            failures.push(failure);
            if (typeof handlers.onActionError === 'function') handlers.onActionError(failure, context);
            continue;
        }
        try {
            const value = handler(action, context);
            if (value && typeof value.then === 'function') {
                throw new TypeError('breakpoint action handlers must be synchronous');
            }
            results.push({
                breakpointId: action.breakpointId,
                actionIndex: action.actionIndex,
                actionType: action.type,
                value
            });
        } catch (error) {
            const failure = {
                code: 'breakpoint-action-failed',
                breakpointId: action.breakpointId,
                actionIndex: action.actionIndex,
                actionType: action.type,
                message: error?.message || String(error)
            };
            failures.push(failure);
            if (typeof handlers.onActionError === 'function') handlers.onActionError(failure, context);
        }
    }
    let halted = false;
    if (plan.halt && typeof handlers.halt === 'function') {
        handlers.halt({matchingIds: [...plan.matchingIds]}, context);
        halted = true;
    }
    return {matchingIds: [...plan.matchingIds], halted, results, failures};
}

/** Stateful collection whose arbitration order is breakpoint creation order. */
export class EventBreakpointEngine {
    constructor(capabilities = {}, evaluator = null) {
        this.capabilities = capabilities;
        this.evaluator = evaluator;
        this.breakpoints = [];
        this.nextCreation = 0;
        this.nextGeneration = 0;
        this.revision = 0;
    }

    add(spec) {
        if (spec && this.breakpoints.some(item => item.id === String(spec.id))) {
            return refusal('duplicate-id', `Breakpoint id "${String(spec.id)}" is already active.`);
        }
        const result = compileEventBreakpoint(spec, this.capabilities, this.evaluator, this.nextCreation);
        if (!result.ok) return result;
        result.breakpoint.generation = this.nextGeneration++;
        result.breakpoint.definitionFingerprint = definitionFingerprint(spec);
        this.nextCreation++;
        this.breakpoints.push(result.breakpoint);
        this.revision++;
        return {ok: true, breakpoint: this.#summary(result.breakpoint)};
    }

    #summary(breakpoint) {
        return {
            id: breakpoint.id,
            generation: breakpoint.generation,
            creation: breakpoint.creation,
            kind: breakpoint.kind,
            enabled: breakpoint.enabled,
            oneShot: breakpoint.oneShot,
            encounters: breakpoint.encounters,
            matches: breakpoint.matches,
            actionTypes: breakpoint.actions.map(action => action.type),
            requiredEventKinds: [...breakpoint.requiredEventKinds]
        };
    }

    list() {
        return this.breakpoints.map(breakpoint => this.#summary(breakpoint));
    }

    remove(id, generation) {
        const index = this.breakpoints.findIndex(item =>
            item.id === String(id) && item.generation === generation);
        if (index < 0) return false;
        this.breakpoints.splice(index, 1);
        this.revision++;
        return true;
    }

    clear() {
        const removed = this.breakpoints.length;
        this.breakpoints = [];
        if (removed) this.revision++;
        return removed;
    }

    exportState() {
        return {
            schema: EVENT_BREAKPOINT_STATE_SCHEMA,
            definitions: this.breakpoints.map(breakpoint => ({
                id: breakpoint.id,
                generation: breakpoint.generation,
                fingerprint: breakpoint.definitionFingerprint,
                enabled: breakpoint.enabled,
                encounters: breakpoint.encounters,
                matches: breakpoint.matches,
                oneShotConsumed: breakpoint.oneShot && !breakpoint.enabled && breakpoint.matches > 0
            }))
        };
    }

    prepareImportState(state) {
        if (!state || typeof state !== 'object' || Array.isArray(state) ||
            state.schema !== EVENT_BREAKPOINT_STATE_SCHEMA || !Array.isArray(state.definitions)) {
            throw new TypeError(`Unsupported event-breakpoint state schema ${String(state?.schema)}`);
        }
        if (state.definitions.length !== this.breakpoints.length) {
            throw new RangeError('Event-breakpoint state definitions do not match the active engine');
        }
        const runtime = state.definitions.map((saved, index) => {
            const active = this.breakpoints[index];
            if (!saved || typeof saved !== 'object' || saved.id !== active.id ||
                saved.generation !== active.generation || saved.fingerprint !== active.definitionFingerprint) {
                throw new RangeError(`Event-breakpoint definition mismatch at index ${index}`);
            }
            if (typeof saved.enabled !== 'boolean' || !Number.isSafeInteger(saved.encounters) ||
                saved.encounters < 0 || !Number.isSafeInteger(saved.matches) || saved.matches < 0 ||
                saved.matches > saved.encounters || typeof saved.oneShotConsumed !== 'boolean' ||
                saved.oneShotConsumed !== (active.oneShot && !saved.enabled && saved.matches > 0)) {
                throw new TypeError(`Invalid event-breakpoint runtime at index ${index}`);
            }
            return {enabled: saved.enabled, encounters: saved.encounters, matches: saved.matches};
        });
        const preparedRevision = this.revision;
        const topology = this.breakpoints.map(item => ({
            id: item.id, generation: item.generation, fingerprint: item.definitionFingerprint
        }));
        let committed = false;
        return {commit: () => {
            if (committed) return {committed: false, code: 'already-committed'};
            const topologyCurrent = this.breakpoints.length === topology.length &&
                topology.every((expected, index) => {
                    const current = this.breakpoints[index];
                    return current && current.id === expected.id &&
                        current.generation === expected.generation &&
                        current.definitionFingerprint === expected.fingerprint;
                });
            if (this.revision !== preparedRevision || !topologyCurrent) {
                return {committed: false, code: 'stale-breakpoint-engine'};
            }
            runtime.forEach((saved, index) => Object.assign(this.breakpoints[index], saved));
            committed = true;
            this.revision++;
            return {committed: true, breakpoints: this.list()};
        }};
    }

    importState(state) {
        const result = this.prepareImportState(state).commit();
        if (!result.committed) throw new Error(`Event-breakpoint state commit failed: ${result.code}`);
        return result.breakpoints;
    }

    setEnabled(id, enabled, generation) {
        const breakpoint = this.breakpoints.find(item =>
            item.id === String(id) && item.generation === generation);
        if (!breakpoint) return false;
        const next = Boolean(enabled);
        if (breakpoint.enabled === next) return false;
        breakpoint.enabled = next;
        this.revision++;
        return true;
    }

    enable(id, generation) {
        return this.setEnabled(id, true, generation);
    }

    disable(id, generation) {
        return this.setEnabled(id, false, generation);
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
        this.revision++;
        return {
            matchingIds: matches.map(breakpoint => breakpoint.id),
            halt: actions.some(action => action.type === 'halt'),
            actions
        };
    }
}
