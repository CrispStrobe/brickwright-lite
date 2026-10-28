// SPDX-License-Identifier: BSD-3-Clause
/**
 * bw-makecode-original — keep an imported MakeCode project's own files in the
 * saved project, and know when they no longer describe it (task F10 of
 * docs/OPEN-TASKS-2026-09-29.md; owner decision 2026-10-12: keep, marked stale).
 *
 * WHY. Importing a MakeCode project (Arcade, micro:bit, ...) translates its
 * main.ts into blocks. Exporting those blocks back regenerates TypeScript that
 * is equivalent at best, and loses what the translation could not carry. While
 * the program is still the imported one, the original files ARE the best
 * export; once the learner edits it they describe a different program.
 *
 * WHAT IS STORED. A top-level `bwMakeCode` key in project.json (stock Scratch
 * and scratch-parser ignore unknown keys):
 *   {version: 2, target, name, files: {'main.ts': ..., 'pxt.json': ...},
 *    fingerprint}
 * `fingerprint` is null when the importer writes the record (the importer's
 * project.json is not the VM's serialization, so it cannot be fingerprinted
 * there); the first VM load fills it in from the VM's own serialization,
 * before anything can be edited. Saves carry it unchanged.
 *
 * WHAT COUNTS AS THE PROGRAM. Blocks (without positions or comments), the names
 * of variables, lists and broadcasts, costumes and sounds by name and asset,
 * the targets by name and stage flag, and the extensions. Not runtime state:
 * running a game moves sprites and changes values, which must not make the
 * original stale.
 */

const VERSION = 2;

/** The record an importer writes; the first VM load fingerprints it. */
const record = (target, files, name) => ({
    version: VERSION,
    target: String(target || ''),
    name: String(name || ''),
    files: Object.assign({}, files),
    fingerprint: null
});

const valid = r => !!r && typeof r === 'object' && r.version === VERSION &&
    typeof r.target === 'string' && r.files && typeof r.files === 'object' &&
    typeof r.files['main.ts'] === 'string' &&
    (r.fingerprint === null || typeof r.fingerprint === 'string');

/** JSON with object keys in sorted order, so equal content hashes equally. */
const stable = value => {
    if (Array.isArray(value)) return `[${value.map(stable).join(',')}]`;
    if (value && typeof value === 'object') {
        return `{${Object.keys(value).sort()
            .map(k => `${JSON.stringify(k)}:${stable(value[k])}`)
            .join(',')}}`;
    }
    return JSON.stringify(value === undefined ? null : value);
};

/** 64-bit string hash (two independent 32-bit FNV-1a lanes), 16 hex digits. */
const hash = text => {
    let a = 0x811c9dc5;
    let b = 0x01000193 ^ 0x5bd1e995;
    for (let i = 0; i < text.length; i++) {
        const c = text.charCodeAt(i);
        a = Math.imul(a ^ c, 0x01000193) >>> 0;
        b = Math.imul(b ^ c ^ (i & 0xff), 0x01000193) >>> 0;
    }
    return a.toString(16).padStart(8, '0') + b.toString(16).padStart(8, '0');
};

const names = coll => Object.keys(coll || {}).sort()
    .map(id => (Array.isArray(coll[id]) ? coll[id][0] : coll[id]));

const programBlocks = blocks => {
    const out = {};
    for (const id of Object.keys(blocks || {})) {
        const b = blocks[id];
        if (Array.isArray(b)) {
            // A top-level variable/list reporter: [type, name, id, x, y].
            out[id] = b.slice(0, 3);
            continue;
        }
        const copy = Object.assign({}, b);
        delete copy.x;
        delete copy.y;
        delete copy.comment;
        out[id] = copy;
    }
    return out;
};

/**
 * The fingerprint of a serialized project (sb3.serialize's output, or the parsed
 * project.json): what the program is, not where its blocks sit or what it did.
 * @param {object} json the project
 * @returns {string} 16 hex digits
 */
const fingerprint = json => {
    const targets = ((json && json.targets) || []).map(t => ({
        name: t.name,
        isStage: !!t.isStage,
        blocks: programBlocks(t.blocks),
        variables: names(t.variables),
        lists: names(t.lists),
        broadcasts: Object.keys(t.broadcasts || {}).map(id => t.broadcasts[id])
            .sort(),
        costumes: (t.costumes || []).map(c => [c.name, c.assetId, c.dataFormat]),
        sounds: (t.sounds || []).map(s => [s.name, s.assetId, s.dataFormat])
    }));
    return hash(stable({targets, extensions: (json && json.extensions) || []}));
};

/** Write the record into a serialized project (toJSON / saveProjectSb3). */
const save = (json, runtime) => {
    const r = runtime && runtime.bwMakeCode;
    if (!json || !Array.isArray(json.targets) || !valid(r)) return json;
    json.bwMakeCode = r;
    return json;
};

/** Read the record from a project being loaded; null when it has none. */
const load = (json, runtime) => {
    if (!runtime) return;
    runtime.bwMakeCode = json && valid(json.bwMakeCode) ?
        Object.assign({}, json.bwMakeCode, {files: Object.assign({}, json.bwMakeCode.files)}) :
        null;
};

/**
 * After a load: fingerprint a record that has none yet, from the VM's own
 * serialization of the program just installed.
 * @param {object} runtime the VM runtime
 * @param {function(): object} serialize returns sb3.serialize(runtime)
 */
const settle = (runtime, serialize) => {
    const r = runtime && runtime.bwMakeCode;
    if (valid(r) && r.fingerprint === null) r.fingerprint = fingerprint(serialize());
};

/**
 * The original files, if the project still is the program they were imported as.
 * @param {object} json the project (serialized)
 * @returns {{status: 'current'|'stale'|'unsettled'|'none', target?: string,
 *     name?: string, files?: object}} files only when current
 */
const original = json => {
    const r = json && json.bwMakeCode;
    if (!valid(r)) return {status: 'none'};
    if (r.fingerprint === null) return {status: 'unsettled', target: r.target, name: r.name};
    if (fingerprint(json) !== r.fingerprint) return {status: 'stale', target: r.target, name: r.name};
    return {status: 'current', target: r.target, name: r.name, files: Object.assign({}, r.files)};
};

module.exports = {VERSION, record, valid, fingerprint, save, load, settle, original};
