// SPDX-License-Identifier: BSD-3-Clause
// Copyright (c) 2026 Brickwright contributors

/** Immutable core configuration. A rebuilt core gets a new plan and checkpoint set. */
export const internalEdgeRemovalPlan = (mechanism, experiments = {}) => Object.freeze(
    (experiments.internalEdgeRemovalPairs === false ? [] : (mechanism.internalEdgeRemovalPairs || []))
        .map(pair => Object.freeze(pair.slice())));

/** Refuse an opted-in model before allocating any engine objects on an older module. */
export const requireInternalEdgeRemovalAPI = (J, pairs) => {
    if (pairs.length && (typeof J.PhysicsSystem?.prototype?.SetSimInternalEdgeRemovalPair !== 'function' ||
        typeof J.PhysicsSystem?.prototype?.ClearSimInternalEdgeRemovalPairs !== 'function')) {
        throw new Error('This model needs an engine with explicit internal-edge pair support');
    }
};

/** Setup runs once, before stepping. The existing simulation part-pair filter remains installed. */
export const configureInternalEdgeRemovalPairs = (physicsSystem, bodyMap, pairs) => {
    try {
        for (const [source, surface] of pairs) {
            const a = bodyMap.get(source), b = bodyMap.get(surface);
            if (!a || !b || !physicsSystem.SetSimInternalEdgeRemovalPair(a.bodyID, b.bodyID, true)) {
                throw new Error(`Could not configure internal-edge pair '${source}' / '${surface}'`);
            }
        }
    } catch (primary) {
        try { physicsSystem.ClearSimInternalEdgeRemovalPairs(); }
        catch (error) { retainCleanupError(primary, error); }
        throw primary;
    }
};

const retainCleanupError = (primary, error) => {
    // Cleanup must not replace even a primitive or frozen exception from the API.
    try {
        const errors = [...(primary.cleanupErrors || []), error];
        Object.defineProperty(primary, 'cleanupErrors', {value: errors, configurable: true});
    } catch (_) { /* The original exception still wins. */ }
};

/** JoltInterface owns the entire nascent world; its BodyManager deletes live bodies.
 * Setup precedes constraints, listeners and addons. Dispose the owner once rather
 * than risk native active-body assertions after a partially failed body removal.
 */
export const disposeInternalEdgeRemovalSetup = (primary, world, destroy) => {
    try { destroy(world); } catch (error) { retainCleanupError(primary, error); }
    throw primary;
};
