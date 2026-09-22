// Machine Manager — the app's single machine store (design §5).
//
// One shared store so every surface (the manager modal, the quick-picker, a
// future "…" editor) reads and writes the same library. IndexedDB in the
// browser (hundreds of small JSON configs are trivial), an in-memory fallback
// anywhere IndexedDB is absent (a private window, SSR, a Node test) so a caller
// never has to guard. Lazy: nothing is opened until the library is first used.

import {
    createIndexedDbMachineStore, createMemoryMachineStore, indexedDbAvailable
} from './machine-store.js';

let singleton = null;

/**
 * The shared machine store. Returns the same instance on every call.
 * @param {object} [opts]
 * @param {boolean} [opts.forceMemory] use the in-memory store (tests)
 * @returns {object} a machine store (the interface of machine-store.js)
 */
export function getMachineStore(opts = {}) {
    if (singleton) return singleton;
    if (!opts.forceMemory && indexedDbAvailable(globalThis.indexedDB)) {
        try {
            singleton = createIndexedDbMachineStore();
            return singleton;
        } catch (e) {
            // A browser that reports IndexedDB but refuses to open it (private
            // mode, disabled storage) falls back rather than breaking the app.
            if (typeof console !== 'undefined') {
                console.warn('[brickwright] IndexedDB machine store unavailable; using memory:', e && e.message);
            }
        }
    }
    singleton = createMemoryMachineStore();
    return singleton;
}

/** Test hook: drop the singleton so the next getMachineStore rebuilds it. */
export function _resetMachineStore() { singleton = null; }
