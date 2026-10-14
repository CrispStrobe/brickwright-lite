// SPDX-License-Identifier: BSD-3-Clause
// Read-only Buffer ownership analysis. This is not a collector: an inventory
// cannot establish that every runtime/host closure has exposed all its roots.
const inspect = ({runtime, values, heap, roots, maxNodes = 100000, maxText = 4 * 1024 * 1024}) => {
    if (!Number.isInteger(maxNodes) || maxNodes < 1 || maxNodes > 100000 ||
        !Number.isInteger(maxText) || maxText < 1 || maxText > 4 * 1024 * 1024)
        throw new RangeError('Invalid Buffer root inspection limits');
    const stores = new Map(), ids = new Set(), reachableStores = new Set();
    const reasons = new Set(), seen = new WeakSet(), texts = new Set();
    let nodes = 0, textBytes = 0;
    for (const [id, bytes] of heap?.values || []) {
        if (!stores.has(bytes.buffer)) stores.set(bytes.buffer, new Set());
        stores.get(bytes.buffer).add(id);
    }
    const pending = [...roots];
    const retainStorage = storage => {
        reachableStores.add(storage);
        for (const id of stores.get(storage) || []) ids.add(id);
    };
    while (pending.length) {
        if (++nodes > maxNodes) {reasons.add('node-limit'); break;}
        const value = pending.pop();
        if (typeof value === 'string') {
            if (texts.has(value)) continue;
            texts.add(value);
            // Count UTF-16 code units conservatively before JSON allocates.
            textBytes += value.length * 2;
            if (textBytes > maxText) {reasons.add('text-limit'); break;}
            if (!value.includes('bwReference')) continue;
            try {pending.push(JSON.parse(value));}
            catch (_) {reasons.add('reference-text-fragment');}
            continue;
        }
        if (typeof value === 'function') {reasons.add('closure'); continue;}
        if (!value || typeof value !== 'object' || seen.has(value)) continue;
        seen.add(value);
        if (ArrayBuffer.isView(value)) {retainStorage(value.buffer); continue;}
        if (value instanceof ArrayBuffer) {retainStorage(value); continue;}
        const keys = Reflect.ownKeys(value);
        if (keys.length > maxNodes - nodes) {reasons.add('node-limit'); break;}
        const reference = Object.getOwnPropertyDescriptor(value, 'bwReference')?.value;
        const referenceDescriptors = reference && typeof reference === 'object' ?
            Object.fromEntries(['kind', 'id', 'scope'].map(key => [key, Object.getOwnPropertyDescriptor(reference, key)])) : null;
        const safeReference = referenceDescriptors && ['kind', 'id', 'scope'].every(key =>
            referenceDescriptors[key] && 'value' in referenceDescriptors[key]);
        if (safeReference && values.isReference(value)) {
            const id = values.referenceId(runtime, value, 'buffer');
            if (id !== null) {
                const bytes = heap?.values.get(id);
                if (bytes) {ids.add(id);retainStorage(bytes.buffer);}
            }
            const array = values.arrayValue(runtime, value);
            if (array !== undefined) pending.push(array);
        }
        if (value instanceof Map) {
            if (value.size * 2 > maxNodes - nodes) {reasons.add('node-limit'); break;}
            for (const [key, item] of value) pending.push(key, item);
        } else if (value instanceof Set) {
            if (value.size > maxNodes - nodes) {reasons.add('node-limit'); break;}
            for (const item of value) pending.push(item);
        } else if (value instanceof WeakMap || value instanceof WeakSet) {
            reasons.add('weak-container');
        }
        // Do not call accessors while observing roots. Nonenumerable data can
        // hold references too, so retain it; prototype methods are not roots.
        for (const key of keys) {
            const descriptor = Object.getOwnPropertyDescriptor(value, key);
            if ('value' in descriptor) pending.push(descriptor.value);
            else reasons.add('accessor');
        }
    }
    const sum = collection => [...collection].reduce((total, storage) => total + storage.byteLength, 0);
    return {
        registeredBuffers: heap?.values.size || 0,
        registeredBytes: sum(stores.keys()),
        rootedIds: ids,
        rootedBytes: sum([...reachableStores].filter(storage => stores.has(storage))),
        observedByteStorage: sum(reachableStores),
        traversalComplete: reasons.size === 0,
        reasons: [...reasons],
        visitedNodes: nodes,
        scannedTextBytes: textBytes,
        rootCoverageComplete: false,
        collectionAllowed: false
    };
};
const HANDLERS = ['_createdHandlers', '_wallHandlers', '_legacyWallHandlers', '_tileHandlers',
    '_updateHandlers', '_intervalHandlers', '_buttonHandlers', '_destroyedHandlers',
    '_overlapHandlers', '_foreverHandlers', '_countdownHandlers', '_scenePushHandlers', '_scenePopHandlers'];
const threadRoots = thread => thread ? [thread.stackFrames, thread.justReported,
    thread.bwReturnValue, thread.bwArcadeCaptures, thread.bwArcadeEvent] : [];
const ownerRoots = owner => {
    const roots = [], runtime = owner._runtime;
    const targetRoots = target => {
        roots.push(target?.variables, target?.blocks?._blocks);
    };
    for (const target of runtime?.targets || []) targetRoots(target);
    for (const thread of runtime?.threads || []) roots.push(...threadRoots(thread));
    for (const key of ['_functionCalls', '_creationWaits', '_terrainWaits']) {
        for (const wait of owner[key] || []) roots.push(...threadRoots(wait.thread), ...threadRoots(wait.caller));
    }
    for (const key of HANDLERS) for (const handler of owner[key] || []) roots.push(handler.captures);
    // Suspended scenes hold their own registrations and sprite state. Keep
    // them even when their targets do not participate in the current frame.
    roots.push(owner._sceneBundles, owner._sceneStack, runtime?.bwArcadeDeviceState,
        owner._fallbackState, owner._musicValues, owner._bufferHeap?.literals);
    return roots;
};
module.exports = {inspect, ownerRoots};
