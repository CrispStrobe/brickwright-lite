// SPDX-License-Identifier: BSD-3-Clause
/**
 * bw-sb3-values — save and load variable and list values that stock sb3 cannot
 * write: BWValues.UNDEFINED, BWValues references, NaN, ±Infinity, -0, null and
 * other non-scalar values (task E3b of docs/OPEN-TASKS-2026-09-29.md).
 *
 * Called from two hooks scripts/apply-vm-overlay.mjs patches into the installed
 * scratch-vm/src/serialization/sb3.js: `save` from serializeTarget, `restore`
 * from parseScratchObject. Both the project save and the sprite export go
 * through serializeTarget; both the project load and the sprite import go
 * through parseScratchObject.
 *
 * WHY. scratch-parser accepts only string, number or boolean as a variable
 * value or a list item. Stock sb3 writes whatever the variable holds, so a
 * reference or UNDEFINED is written as a JSON object (null for undefined/null)
 * and the saved project no longer loads; NaN/±Infinity are written as 0 (the
 * VM's StringUtil.stringify) and -0 as 0 — a silent change of a number.
 *
 * THE ON-DISK FORM (two parts):
 *  1. The standard field always holds a plain scalar, so the file is valid sb3
 *     and stock Scratch / TurboWarp open it and show a meaningful value:
 *       UNDEFINED, raw undefined   -> "undefined"
 *       null                       -> "null"
 *       NaN, Infinity, -Infinity   -> "NaN", "Infinity", "-Infinity"
 *       -0                         -> 0
 *       reference                  -> "[<kind> reference <id>]"  (named placeholder)
 *       other object / array       -> its JSON text, else "[unsaved <type> value]"
 *  2. A sidecar on the target, `bwValues`, records the exact value of each
 *     such entry in BWValues' own tagged JSON form:
 *       {version: 1,
 *        variables: {<id>: <tag>},
 *        lists: {<id>: {length: <n>, items: {<index>: <tag>}}}}
 *     tags: {bwUndefined: true}, {bwNull: true}, {bwNumber: 'NaN'|'Infinity'|
 *     '-Infinity'|'-0'}, {bwReference: {kind, id}}, {bwJson: '<text>'}.
 *     sb3 targets accept unknown keys; stock Scratch ignores the sidecar and a
 *     re-save from stock drops it, leaving the plain field values.
 *
 * ON LOAD (Lite) a sidecar entry is applied only while the standard field still
 * holds exactly the placeholder `save` wrote for it (and, for a list, while the
 * list still has the saved length). A value another tool changed stays the
 * plain value it now is: the sidecar never overrides a plain value.
 *
 * REFERENCES ARE PER RUN. A BWValues reference names a resource of one runtime
 * and one run (it stops resolving on green flag and on project load), so the
 * resource itself is not saved. Lite restores a reference of the same kind and
 * id that resolves to nothing — the value the variable would hold after the
 * next green flag without saving. Raw `undefined` is restored as
 * BWValues.UNDEFINED (Scratch and BWValues read the two identically).
 */
const BWValues = require('../util/bw-values');

const VERSION = 1;
// Never the scope of a live run (those are `<session>:<n>`), so a restored
// reference resolves to nothing, in this VM and any other.
const SAVED_SCOPE = 'saved';
const SPECIAL_NUMBERS = ['NaN', 'Infinity', '-Infinity', '-0'];

const isUndefinedValue = value => value === undefined ||
    (value !== null && typeof value === 'object' && BWValues.decode(value) === undefined);

/**
 * The exact-value tag for a value stock sb3 cannot write, or null for a value
 * it writes faithfully (string, boolean, finite non-negative-zero number).
 * @param {*} value - a variable value or list item
 * @returns {?object} tag
 */
const tagOf = value => {
    if (typeof value === 'string' || typeof value === 'boolean') return null;
    if (typeof value === 'number') {
        if (Number.isFinite(value) && !Object.is(value, -0)) return null;
        return {bwNumber: Object.is(value, -0) ? '-0' : String(value)};
    }
    if (value === null) return {bwNull: true};
    if (isUndefinedValue(value)) return {bwUndefined: true};
    if (BWValues.isReference(value)) {
        return {bwReference: {kind: value.bwReference.kind, id: value.bwReference.id}};
    }
    let text;
    try {
        text = JSON.stringify(value);
    } catch (e) {
        text = undefined;
    }
    return typeof text === 'string' ? {bwJson: text} : {bwUnsaved: typeof value};
};

/**
 * The plain scalar written to the standard field for a tag.
 * @param {object} tag - from tagOf
 * @returns {string|number} field value
 */
const fieldOf = tag => {
    if (tag.bwUndefined) return 'undefined';
    if (tag.bwNull) return 'null';
    if (tag.bwNumber) return tag.bwNumber === '-0' ? 0 : tag.bwNumber;
    if (tag.bwReference) return `[${tag.bwReference.kind} reference ${tag.bwReference.id}]`;
    if (typeof tag.bwJson === 'string') return tag.bwJson;
    return `[unsaved ${tag.bwUnsaved} value]`;
};

/**
 * The value a well-formed tag stands for, or `invalid` for a tag this version
 * does not know.
 * @param {*} tag - a sidecar entry read from a file
 * @param {*} invalid - returned for an unknown or malformed tag
 * @returns {*} the restored value
 */
const valueOf = (tag, invalid) => {
    if (!tag || typeof tag !== 'object') return invalid;
    const keys = Object.keys(tag);
    if (keys.length !== 1) return invalid;
    if (tag.bwUndefined === true) return BWValues.UNDEFINED;
    if (tag.bwNull === true) return null;
    if (SPECIAL_NUMBERS.includes(tag.bwNumber)) return Number(tag.bwNumber);
    const ref = tag.bwReference;
    if (ref && typeof ref === 'object' && typeof ref.kind === 'string' && typeof ref.id === 'string') {
        const restored = BWValues.decode({bwReference: {kind: ref.kind, id: ref.id, scope: SAVED_SCOPE}});
        return BWValues.isReference(restored) ? restored : invalid;
    }
    if (typeof tag.bwJson === 'string') {
        try {
            return JSON.parse(tag.bwJson);
        } catch (e) {
            return invalid;
        }
    }
    return invalid;
};

/**
 * serializeTarget hook: make obj.variables / obj.lists schema-valid and record
 * the exact values in obj.bwValues. Never mutates the runtime's values.
 * @param {object} variables - target.variables (Variable instances by id)
 * @param {object} obj - the serialized target, after serializeVariables
 */
const save = (variables, obj) => {
    const sidecar = {version: VERSION, variables: {}, lists: {}};
    let any = false;
    for (const id of Object.keys(obj.variables || {})) {
        const entry = obj.variables[id];
        const tag = tagOf(entry[1]);
        if (!tag) continue;
        entry[1] = fieldOf(tag);
        if (!tag.bwUnsaved) {
            sidecar.variables[id] = tag;
            any = true;
        }
    }
    for (const id of Object.keys(obj.lists || {})) {
        const entry = obj.lists[id];
        const items = entry[1];
        if (!Array.isArray(items)) continue;
        let copy = null;
        const tags = {};
        let tagged = false;
        for (let i = 0; i < items.length; i++) {
            const tag = tagOf(items[i]);
            if (!tag) continue;
            // The list array is the runtime's own: write a copy, never into it.
            if (!copy) copy = items.slice();
            copy[i] = fieldOf(tag);
            if (!tag.bwUnsaved) {
                tags[i] = tag;
                tagged = true;
            }
        }
        if (copy) entry[1] = copy;
        if (tagged) {
            sidecar.lists[id] = {length: items.length, items: tags};
            any = true;
        }
    }
    if (any) obj.bwValues = sidecar;
};

const UNKNOWN = {};

/**
 * parseScratchObject hook: after stock has set every variable and list from
 * the standard fields, restore the exact values the sidecar records, where
 * the field still holds the placeholder written for them.
 * @param {object} object - the target as read from the project JSON
 * @param {object} variables - the new target's variables (Variable by id)
 */
const restore = (object, variables) => {
    const sidecar = object && object.bwValues;
    if (!sidecar || typeof sidecar !== 'object' || sidecar.version !== VERSION) return;
    const has = (o, k) => Boolean(o) && typeof o === 'object' && Object.prototype.hasOwnProperty.call(o, k);
    for (const id of Object.keys(sidecar.variables || {})) {
        const variable = has(variables, id) ? variables[id] : null;
        if (!variable || Array.isArray(variable.value)) continue;
        const tag = sidecar.variables[id];
        const value = valueOf(tag, UNKNOWN);
        if (value === UNKNOWN || !Object.is(variable.value, fieldOf(tag))) continue;
        variable.value = value;
    }
    for (const id of Object.keys(sidecar.lists || {})) {
        const list = has(variables, id) ? variables[id] : null;
        const saved = sidecar.lists[id];
        if (!list || !Array.isArray(list.value) || !saved || typeof saved !== 'object' ||
            saved.length !== list.value.length) continue;
        for (const index of Object.keys(saved.items || {})) {
            const i = Number(index);
            if (!Number.isInteger(i) || i < 0 || i >= list.value.length) continue;
            const tag = saved.items[index];
            const value = valueOf(tag, UNKNOWN);
            if (value === UNKNOWN || !Object.is(list.value[i], fieldOf(tag))) continue;
            list.value[i] = value;
        }
    }
};

module.exports = {save, restore, tagOf, fieldOf, SAVED_SCOPE};
