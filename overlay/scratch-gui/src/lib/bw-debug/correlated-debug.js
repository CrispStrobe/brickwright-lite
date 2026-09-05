/** Explicit causal correlation for multi-CPU debugger sessions. */
const refusal = (code, reason, details = {}) => Object.freeze({accepted: false, code, reason, ...details});
const plain = value => value && typeof value === 'object' && !Array.isArray(value);
const clone = value => structuredClone(value);
const freeze = value => { if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    Object.values(value).forEach(freeze); Object.freeze(value); } return value; };
const cursor = value => plain(value) && typeof value.branchId === 'string' && value.branchId &&
    Number.isSafeInteger(value.eventCursor) && value.eventCursor >= 0 ?
    {branchId: value.branchId, eventCursor: value.eventCursor} : null;
const ticks = value => {
    try { const n = BigInt(value); return n >= 0n ? n : null; } catch { return null; }
};
const rejected = value => value === false || value?.accepted === false || value?.refused;

export function createCorrelatedDebugger ({targets, capacity = 8192, maxBranches = 64} = {}) {
    if (!plain(targets) || !Object.keys(targets).length || !Number.isSafeInteger(capacity) || capacity < 1 ||
        !Number.isSafeInteger(maxBranches) || maxBranches < 1) throw new TypeError('correlated debugger requires bounded named targets');
    for (const [id, target] of Object.entries(targets)) {
        if (!id || typeof target?.clockDomain !== 'string' || !target.clockDomain ||
            typeof target.captureCheckpoint !== 'function' || typeof target.prepareRestore !== 'function' ||
            typeof target.restoreCheckpoint !== 'function') throw new TypeError(`target ${id} lacks clock/checkpoint hooks`);
    }
    const branches = new Map([['main', {parentCursor: null, nextCursor: 0}]]);
    let events = []; let dropped = 0; let causalOrder = 0; const triggers = new Map();
    const retained = at => events.find(event => event.cursor.branchId === at.branchId &&
        event.cursor.eventCursor === at.eventCursor);
    const api = {
        fork ({branchId, parentCursor}) {
            const parent = cursor(parentCursor);
            if (typeof branchId !== 'string' || !branchId || branches.has(branchId) ||
                branches.size >= maxBranches || !parent || !branches.has(parent.branchId) || !retained(parent)) {
                return refusal('invalid-causal-branch', 'fork requires a unique bounded id and retained parent cursor');
            }
            branches.set(branchId, {parentCursor: freeze(clone(parent)), nextCursor: parent.eventCursor + 1});
            return Object.freeze({accepted: true, branchId});
        },
        append (branchId, input) {
            const branch = branches.get(branchId); const target = targets[input?.targetId];
            if (!branch || !target || !plain(input?.time) || input.time.domain !== target.clockDomain ||
                ticks(input.time.ticks) === null || typeof input.kind !== 'string' || !input.kind) {
                throw new TypeError('correlated event requires a branch, named target, native clock, and kind');
            }
            const cause = input.cause === undefined ? null : cursor(input.cause);
            if (input.cause !== undefined && (!cause || !retained(cause))) {
                throw new TypeError('causal cursor must identify a retained earlier event');
            }
            const value = freeze({...clone(input), cause: cause ? freeze(clone(cause)) : null,
                cursor: freeze({branchId, eventCursor: branch.nextCursor++}), causalOrder: causalOrder++});
            events.push(value);
            if (events.length > capacity) { events.shift(); dropped++; }
            const hits = [];
            for (const spec of triggers.values()) {
                if (spec.sourceTarget === value.targetId && (!spec.kind || spec.kind === value.kind)) {
                    hits.push(freeze({triggerId: spec.id, source: clone(value.cursor),
                        targetId: spec.targetId, causeKind: value.kind}));
                }
            }
            return freeze({accepted: true, event: clone(value), triggers: hits});
        },
        addTrigger (spec) {
            if (!plain(spec) || typeof spec.id !== 'string' || !spec.id || triggers.has(spec.id) ||
                !targets[spec.sourceTarget] || !targets[spec.targetId] || spec.sourceTarget === spec.targetId ||
                (spec.kind !== undefined && typeof spec.kind !== 'string')) {
                return refusal('invalid-cross-core-trigger', 'trigger requires unique source and target CPUs');
            }
            triggers.set(spec.id, freeze(clone(spec))); return Object.freeze({accepted: true, id: spec.id});
        },
        compareTimes (left, right) {
            if (!plain(left) || !plain(right) || typeof left.domain !== 'string' || !left.domain ||
                typeof right.domain !== 'string' || !right.domain ||
                ticks(left.ticks) === null || ticks(right.ticks) === null) {
                return refusal('invalid-clock-time', 'times require clock domains and integer ticks');
            }
            if (left.domain !== right.domain) return refusal('uncorrelated-clock-domains',
                'numeric timestamps from different clock domains are not comparable');
            return Object.freeze({accepted: true, order: ticks(left.ticks) < ticks(right.ticks) ? -1 :
                ticks(left.ticks) > ticks(right.ticks) ? 1 : 0});
        },
        compareCursors (left, right) {
            const a = cursor(left); const b = cursor(right); const ea = a && retained(a); const eb = b && retained(b);
            if (!ea || !eb) return refusal('causal-cursor-not-retained', 'both causal cursors must be retained');
            return Object.freeze({accepted: true, order: Math.sign(ea.causalOrder - eb.causalOrder)});
        },
        async captureCheckpoint (branchId = 'main') {
            const branch = branches.get(branchId);
            if (!branch) return refusal('unknown-causal-branch', 'checkpoint branch is unknown');
            const states = {};
            try { for (const [id, target] of Object.entries(targets)) states[id] = await target.captureCheckpoint(); }
            catch (error) { return refusal('whole-machine-capture-failed', error?.message || String(error)); }
            if (Object.values(states).some(value => value === undefined || rejected(value))) {
                return refusal('whole-machine-capture-failed', 'a target refused checkpoint capture');
            }
            return freeze({accepted: true, checkpoint: {schema: 1,
                cursor: {branchId, eventCursor: branch.nextCursor}, states}});
        },
        async restoreCheckpoint (checkpoint) {
            if (!plain(checkpoint) || checkpoint.schema !== 1 || !cursor(checkpoint.cursor) ||
                !plain(checkpoint.states) || Object.keys(targets).some(id => !Object.hasOwn(checkpoint.states, id)) ||
                Object.keys(checkpoint.states).some(id => !targets[id])) return refusal('invalid-whole-machine-checkpoint',
                'checkpoint must contain exactly every named target');
            const staged = {}; const rollback = {};
            try {
                for (const [id, target] of Object.entries(targets)) {
                    rollback[id] = await target.captureCheckpoint();
                    if (rollback[id] === undefined || rejected(rollback[id])) {
                        throw new Error(`target ${id} refused rollback checkpoint capture`);
                    }
                }
            } catch (error) {
                return refusal('whole-machine-rollback-capture-failed', error?.message || String(error));
            }
            try {
                for (const [id, target] of Object.entries(targets)) {
                    staged[id] = await target.prepareRestore(clone(checkpoint.states[id]));
                    if (staged[id] === undefined || rejected(staged[id])) throw new Error(`target ${id} refused restore preparation`);
                }
            } catch (error) { return refusal('whole-machine-prepare-failed', error?.message || String(error)); }
            try {
                for (const [id, target] of Object.entries(targets)) {
                    const result = await target.restoreCheckpoint(staged[id]);
                    if (rejected(result)) throw new Error(`target ${id} refused restore commit`);
                }
            } catch (error) {
                try { for (const [id, target] of Object.entries(targets)) {
                    const restored = await target.restoreCheckpoint(rollback[id]);
                    if (rejected(restored)) throw new Error(`target ${id} refused rollback`);
                } }
                catch (rollbackError) { return refusal('whole-machine-rollback-failed',
                    `${error.message}; rollback failed (${rollbackError?.message || String(rollbackError)})`); }
                return refusal('whole-machine-restore-failed', error?.message || String(error));
            }
            return Object.freeze({accepted: true, cursor: clone(checkpoint.cursor), targets: Object.keys(targets)});
        },
        view () { return freeze({capacity, dropped, targets: Object.entries(targets).map(([id, target]) =>
            ({id, clockDomain: target.clockDomain})), branches: [...branches].map(([branchId, branch]) =>
            ({branchId, parentCursor: clone(branch.parentCursor)})), events: events.map(clone)}); }
    };
    return Object.freeze(api);
}

export default createCorrelatedDebugger;
