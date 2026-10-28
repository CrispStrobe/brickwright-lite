// Unsaved editor drafts that survive a reload or a crash (IndexedDB, this
// browser only). An editor writes its working state while it differs from what
// it last saved, clears it on save, and offers it back when the same item is
// opened again. Failures are swallowed: a draft is a convenience, never a gate.

const DB_NAME = 'bw-editor-drafts';
const MAX_DRAFTS = 50;
let dbPromise = null;

const openDb = () => {
    if (!dbPromise) {
        dbPromise = new Promise((resolve, reject) => {
            if (typeof indexedDB === 'undefined') return reject(new Error('IndexedDB is unavailable'));
            const request = indexedDB.open(DB_NAME, 1);
            request.onupgradeneeded = () => request.result.createObjectStore('drafts');
            request.onsuccess = () => resolve(request.result);
            request.onerror = () => reject(request.error);
        });
        dbPromise.catch(() => {
            dbPromise = null;
        });
    }
    return dbPromise;
};

const run = (mode, work) => openDb().then(db => new Promise((resolve, reject) => {
    const transaction = db.transaction('drafts', mode);
    const request = work(transaction.objectStore('drafts'));
    transaction.oncomplete = () => resolve(request && request.result);
    transaction.onerror = () => reject(transaction.error);
}));

/**
 * @param {string} key editor-specific identity of the item being edited
 * @param {object} value structured-cloneable working state
 * @returns {Promise<void>}
 */
export const writeDraft = (key, value) => run('readwrite', store => store.put({at: Date.now(), value}, key))
    .then(() => run('readonly', store => store.getAllKeys()))
    .then(keys => (keys && keys.length > MAX_DRAFTS ?
        run('readwrite', store => keys.slice(0, keys.length - MAX_DRAFTS).forEach(old => store.delete(old))) : null))
    .catch(() => {});

/**
 * @param {string} key the item
 * @returns {Promise<?{at: number, value: object}>} the stored draft
 */
export const readDraft = key => run('readonly', store => store.get(key)).catch(() => null);

export const clearDraft = key => run('readwrite', store => store.delete(key)).catch(() => {});
