/** Target-neutral, payload-free metadata for debugger history branches. */

const refusal = (code, reason, details = {}) => ({accepted: false, code, reason, ...details});

const cursor = (value, label) => {
    if (!Number.isSafeInteger(value) || value < 0) {
        throw new TypeError(`${label} must be a non-negative safe integer`);
    }
    return value;
};

const branchId = (value, label = 'branchId') => {
    if (typeof value !== 'string' || value.length === 0) {
        throw new TypeError(`${label} must be a non-empty string`);
    }
    return value;
};

export const createBranchCursor = (branch, eventCursor) => Object.freeze({
    branchId: branchId(branch, 'cursor.branchId'),
    eventCursor: cursor(eventCursor, 'cursor.eventCursor')
});

const branchCursor = (value, label = 'forkCursor') => {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
        throw new TypeError(`${label} must be a branch-qualified cursor`);
    }
    return createBranchCursor(value.branchId, value.eventCursor);
};

/**
 * Branch summaries deliberately contain no events, checkpoints, or snapshots.
 * Capacity exhaustion and retention are explicit: nothing disappears on append.
 */
export function createForkHistory ({maxBranches = 128, rootBranchId = 'main'} = {}) {
    if (!Number.isSafeInteger(maxBranches) || maxBranches < 1) {
        throw new RangeError('maxBranches must be a positive safe integer');
    }
    const root = branchId(rootBranchId, 'rootBranchId');
    const branches = new Map();
    const usedIds = new Set([root]);
    const reservedIds = new Set();
    let active = root;
    let nextCreation = 1;
    let evictedBranches = 0;
    let revision = 0;

    const freeze = summary => Object.freeze({...summary,
        forkCursor: branchCursor(summary.forkCursor)});
    branches.set(root, freeze({
        branchId: root,
        parentBranchId: null,
        forkCursor: createBranchCursor(root, 0),
        creation: 0
    }));

    const copy = summary => summary ? freeze(summary) : null;

    return {
        prepareFork ({branchId: requestedId, parentBranchId = active, forkCursor}) {
            const id = branchId(requestedId);
            const parentId = branchId(parentBranchId, 'parentBranchId');
            const at = branchCursor(forkCursor);
            if (usedIds.has(id) || reservedIds.has(id)) {
                return refusal('branch-id-used', `branch id "${id}" has already been used`, {branchId: id});
            }
            const parent = branches.get(parentId);
            if (!parent) {
                return refusal('unknown-parent-branch', `parent branch "${parentId}" is not retained`,
                    {parentBranchId: parentId});
            }
            if (at.branchId !== parentId) {
                return refusal('fork-cursor-branch-mismatch',
                    'fork cursor must identify the retained parent branch',
                    {cursorBranchId: at.branchId, parentBranchId: parentId});
            }
            if (at.eventCursor < parent.forkCursor.eventCursor) {
                return refusal('fork-before-parent', 'fork cursor precedes the parent branch boundary',
                    {forkCursor: at.eventCursor, parentForkCursor: parent.forkCursor.eventCursor});
            }
            if (branches.size + reservedIds.size >= maxBranches) {
                return refusal('branch-capacity', 'fork history capacity is exhausted; retain or evict explicitly',
                    {maxBranches});
            }
            const preparedRevision = revision;
            const preparedActive = active;
            reservedIds.add(id);
            let finished = false;
            const abort = () => {
                if (finished) return {accepted: false, code: 'reservation-finished'};
                finished = true;
                reservedIds.delete(id);
                return {accepted: true, aborted: true};
            };
            const commit = () => {
                if (finished) return {accepted: false, code: 'reservation-finished'};
                if (revision !== preparedRevision || active !== preparedActive || !branches.has(parentId)) {
                    finished = true;
                    reservedIds.delete(id);
                    return refusal('stale-fork-reservation', 'fork history changed before commit');
                }
                const summary = freeze({
                    branchId: id, parentBranchId: parentId, forkCursor: at, creation: nextCreation++
                });
                finished = true;
                reservedIds.delete(id);
                usedIds.add(id);
                branches.set(id, summary);
                active = id;
                revision++;
                return {accepted: true, branch: copy(summary)};
            };
            return {accepted: true, reservation: Object.freeze({branchId: id, commit, abort})};
        },

        fork (request) {
            const prepared = this.prepareFork(request);
            return prepared.accepted ? prepared.reservation.commit() : prepared;
        },

        activate (idValue) {
            const id = branchId(idValue);
            if (!branches.has(id)) {
                return refusal('branch-not-retained', `branch "${id}" is not retained`, {branchId: id});
            }
            active = id;
            revision++;
            return {accepted: true, branch: copy(branches.get(id))};
        },

        activeBranch () {
            return copy(branches.get(active));
        },

        summaries () {
            return Object.freeze([...branches.values()].map(copy));
        },

        /**
         * Discard only inactive leaves strictly before a retained checkpoint.
         * Repeating the leaf pass permits whole obsolete subtrees to disappear
         * without ever leaving a retained child pointing at a missing parent.
         */
        evictBeforeCheckpoint (checkpointCursor) {
            const boundary = branchCursor(checkpointCursor, 'checkpointCursor');
            const removed = [];
            if (!branches.has(boundary.branchId)) {
                return refusal('checkpoint-branch-not-retained', 'checkpoint branch is not retained',
                    {checkpointCursor: boundary});
            }
            const children = new Map();
            for (const summary of branches.values()) {
                if (!children.has(summary.parentBranchId)) children.set(summary.parentBranchId, []);
                children.get(summary.parentBranchId).push(summary.branchId);
            }
            const activeAncestors = new Set();
            for (let id = active; id !== null;) {
                activeAncestors.add(id);
                id = branches.get(id)?.parentBranchId ?? null;
            }
            const removeTree = id => {
                for (const child of children.get(id) || []) removeTree(child);
                branches.delete(id);
                removed.push(id);
                evictedBranches++;
            };
            const obsoleteRoots = [...branches.values()].filter(summary =>
                summary.parentBranchId === boundary.branchId &&
                summary.forkCursor.eventCursor < boundary.eventCursor &&
                !activeAncestors.has(summary.branchId));
            for (const summary of obsoleteRoots) removeTree(summary.branchId);
            if (removed.length) revision++;
            return {accepted: true, removed: Object.freeze(removed), checkpointCursor: boundary};
        },

        retention () {
            return Object.freeze({
                maxBranches,
                retainedBranches: branches.size,
                evictedBranches,
                activeBranchId: active,
                reservedBranches: reservedIds.size
            });
        }
    };
}

export default createForkHistory;
