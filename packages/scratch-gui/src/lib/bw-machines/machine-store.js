// Machine Manager — the config store (design §5, §8 step 1).
//
// A library of hundreds of machines is hundreds of tiny JSONs (design §2), so
// the store keeps CONFIGS ONLY — never image bytes. One INTERFACE, two impls:
//
//   - createMemoryMachineStore()      — a Map; for Node tests and headless use.
//   - createIndexedDbMachineStore()   — the browser library (design §5:
//                                       "Configs in IndexedDB").
//
// Both are ASYNC (every method returns a Promise) so they are swappable: the
// GUI can hand either to the same manager code. Importing this module in Node
// NEVER touches IndexedDB — the browser impl feature-detects lazily, so a Node
// test can import the whole module and use only the memory store.
//
// Framework-free: no React, no bundler globals.

import {
    normalizeMachineConfig, validateMachineConfig, newMachineConfig
} from './machine-config.js';

const EXPORT_VERSION = 1;

/** Deep-ish clone for small JSON configs — cuts every reference to the stored
 *  object so a caller cannot mutate the store's copy in place. */
const clone = v => JSON.parse(JSON.stringify(v));

/** Normalize, validate, and demand an id. The single admission gate both impls
 *  share, so "a bad config is rejected the same everywhere" (design §2) is true
 *  of the store too. Returns the config to store. Throws on an invalid config. */
function admit(config) {
    const normalized = normalizeMachineConfig(config);
    if (!normalized.id) {
        // A store keys by id; minting here means `put` of a fresh config just
        // works, while `newMachineConfig` stays the explicit factory.
        normalized.id = newMachineConfig(normalized).id;
    }
    const {ok, errors} = validateMachineConfig(normalized);
    if (!ok) {
        const err = new Error(`invalid machine config: ${errors.join('; ')}`);
        err.validationErrors = errors;
        throw err;
    }
    return normalized;
}

/** Build the export envelope from a list of configs. Shared by both impls so an
 *  export from either is byte-identical and importable by either (design §5:
 *  "a config library is exportable as a folder of manifests — i.e. a repo"). */
function envelope(configs) {
    return {version: EXPORT_VERSION, machines: configs.map(clone)};
}

/** Read machines out of either the export envelope or a bare array. */
function machinesFrom(data) {
    if (Array.isArray(data)) return data;
    if (data && Array.isArray(data.machines)) return data.machines;
    throw new Error('import expects an array of configs or an {machines:[…]} envelope');
}

/**
 * The in-memory store — a Map behind the async interface.
 *
 * @param {Iterable<object>} [seed] configs to preload
 * @returns {object} the store interface
 */
export function createMemoryMachineStore(seed = []) {
    const map = new Map();
    for (const cfg of seed) {
        const admitted = admit(cfg);
        map.set(admitted.id, admitted);
    }

    return Object.freeze({
        kind: 'memory',

        async list() {
            return [...map.values()].map(clone);
        },

        async get(id) {
            const found = map.get(id);
            return found ? clone(found) : null;
        },

        async put(config) {
            const admitted = admit(config);
            map.set(admitted.id, admitted);
            return clone(admitted);
        },

        async remove(id) {
            return map.delete(id);
        },

        async duplicate(id, overrides = {}) {
            const source = map.get(id);
            if (!source) throw new Error(`no machine ${JSON.stringify(id)} to duplicate`);
            const copy = newMachineConfig({
                ...clone(source),
                id: null, // force a fresh id
                title: `${source.title || 'machine'} (copy)`,
                ...overrides
            });
            map.set(copy.id, copy);
            return clone(copy);
        },

        async export() {
            return envelope([...map.values()]);
        },

        async import(data) {
            const incoming = machinesFrom(data);
            const imported = [];
            for (const cfg of incoming) {
                const admitted = admit(cfg);
                map.set(admitted.id, admitted);
                imported.push(clone(admitted));
            }
            return imported;
        },

        async clear() {
            map.clear();
        }
    });
}

/** Is an IndexedDB usable in this host? Feature-detected so a Node import of
 *  this module never throws — the check is only run when the browser store is
 *  actually constructed. */
export function indexedDbAvailable(idb = globalThis.indexedDB) {
    return typeof idb !== 'undefined' && idb !== null &&
        typeof idb.open === 'function';
}

/**
 * The browser store — the same async interface backed by IndexedDB.
 *
 * Lazy and feature-detected: constructing it in a host with no IndexedDB throws
 * a clear error rather than a `ReferenceError`, and merely IMPORTING this module
 * in Node is always safe (nothing here runs at import time).
 *
 * @param {object} [opts]
 * @param {string} [opts.dbName='brickwright-machines']
 * @param {string} [opts.storeName='machines']
 * @param {IDBFactory} [opts.indexedDB] injectable for a fake-indexeddb test
 * @returns {object} the store interface
 */
export function createIndexedDbMachineStore(opts = {}) {
    const {
        dbName = 'brickwright-machines',
        storeName = 'machines',
        indexedDB = globalThis.indexedDB
    } = opts;

    if (!indexedDbAvailable(indexedDB)) {
        throw new Error('IndexedDB is unavailable in this environment; ' +
            'use createMemoryMachineStore() for headless/Node contexts');
    }

    let dbPromise = null;
    const openDb = () => {
        if (dbPromise) return dbPromise;
        dbPromise = new Promise((resolve, reject) => {
            const req = indexedDB.open(dbName, 1);
            req.onupgradeneeded = () => {
                const db = req.result;
                if (!db.objectStoreNames.contains(storeName)) {
                    db.createObjectStore(storeName, {keyPath: 'id'});
                }
            };
            req.onsuccess = () => resolve(req.result);
            req.onerror = () => reject(req.error);
        });
        return dbPromise;
    };

    const tx = async (mode, run) => {
        const db = await openDb();
        return new Promise((resolve, reject) => {
            const transaction = db.transaction(storeName, mode);
            const store = transaction.objectStore(storeName);
            let result;
            Promise.resolve(run(store)).then(v => {result = v;}, reject);
            transaction.oncomplete = () => resolve(result);
            transaction.onerror = () => reject(transaction.error);
            transaction.onabort = () => reject(transaction.error);
        });
    };

    const reqAsync = request => new Promise((resolve, reject) => {
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
    });

    return Object.freeze({
        kind: 'indexeddb',

        async list() {
            return tx('readonly', store => reqAsync(store.getAll()));
        },

        async get(id) {
            const found = await tx('readonly', store => reqAsync(store.get(id)));
            return found || null;
        },

        async put(config) {
            const admitted = admit(config);
            await tx('readwrite', store => reqAsync(store.put(admitted)));
            return admitted;
        },

        async remove(id) {
            const existed = (await tx('readonly', store => reqAsync(store.get(id)))) != null;
            await tx('readwrite', store => reqAsync(store.delete(id)));
            return existed;
        },

        async duplicate(id, overrides = {}) {
            const source = await tx('readonly', store => reqAsync(store.get(id)));
            if (!source) throw new Error(`no machine ${JSON.stringify(id)} to duplicate`);
            const copy = newMachineConfig({
                ...source, id: null,
                title: `${source.title || 'machine'} (copy)`,
                ...overrides
            });
            await tx('readwrite', store => reqAsync(store.put(copy)));
            return copy;
        },

        async export() {
            const all = await tx('readonly', store => reqAsync(store.getAll()));
            return envelope(all);
        },

        async import(data) {
            const incoming = machinesFrom(data).map(admit);
            await tx('readwrite', store => {
                for (const cfg of incoming) store.put(cfg);
                return incoming.length;
            });
            return incoming.map(clone);
        },

        async clear() {
            await tx('readwrite', store => reqAsync(store.clear()));
        }
    });
}
