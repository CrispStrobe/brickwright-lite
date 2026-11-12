// A version number per Blocks container that moves on every edit made through the
// container's own mutators (createBlock, changeBlock, moveBlock, deleteBlock and the
// rename helpers all end in resetCache). Proof owners keep a verified result until the
// version moves, instead of re-snapshotting and re-proving the whole graph per call.
const records = new WeakMap();

/** Start counting edits of `blocks`; returns its record, or null for a container without resetCache. */
function track(blocks) {
    if (!blocks || typeof blocks.resetCache !== 'function') return null;
    let record = records.get(blocks);
    if (!record) {
        record = {version: 0};
        const original = blocks.resetCache;
        blocks.resetCache = function resetCacheAndBump (...args) {
            record.version++;
            return original.apply(this, args);
        };
        records.set(blocks, record);
    }
    return record;
}

/** The current version of `blocks`, or -1 when it is not tracked (callers then verify in full). */
function versionOf(blocks) {
    const record = blocks && records.get(blocks);
    return record ? record.version : -1;
}

module.exports = {track, versionOf};
