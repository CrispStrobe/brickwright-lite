import {createBranchCursor} from './fork-history.js';
import {hashReplayValues} from './recorder.js';

const refusal = (code, reason, details = {}) => Object.freeze({accepted: false, code, reason, ...details});
const encoder = new TextEncoder();
const clone = value => structuredClone(value);
const freeze = value => {
    if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
    for (const child of Object.values(value)) freeze(child);
    return Object.freeze(value);
};
const immutable = value => freeze(clone(value));
const publicInspection = value => {
    if (ArrayBuffer.isView(value) || value instanceof ArrayBuffer) {
        const bytes = value instanceof ArrayBuffer ? new Uint8Array(value) : value;
        return Object.freeze({type: value.constructor.name, length: value.byteLength,
            hash: hashReplayValues(bytes)});
    }
    if (Array.isArray(value)) return Object.freeze(value.map(publicInspection));
    if (value && typeof value === 'object') return Object.freeze(Object.fromEntries(
        Object.keys(value).sort().map(key => [key, publicInspection(value[key])])));
    return value;
};
const normalizedCursor = value => createBranchCursor(value?.branchId, value?.eventCursor);
const text = (value, label, maxBytes, {empty = false} = {}) => {
    if (typeof value !== 'string' || (!empty && !value.trim())) {
        throw new TypeError(`${label} must be ${empty ? 'a string' : 'a non-empty string'}`);
    }
    if (encoder.encode(value).byteLength > maxBytes) {
        throw new RangeError(`${label} exceeds the ${maxBytes}-byte bound`);
    }
    return value;
};
const checkpointView = (checkpoint, cursor) => {
    if (!checkpoint || typeof checkpoint !== 'object' || !checkpoint.time ||
        !Number.isSafeInteger(checkpoint.eventCursor) || checkpoint.eventCursor !== cursor.eventCursor) {
        throw new TypeError('checkpoint resolver did not return the requested checkpoint boundary');
    }
    // `snapshot` is deliberately never cloned, traversed, hashed, or returned.
    // Targets may attach a bounded, public `inspection` specifically for UI comparison.
    const inspection = checkpoint.inspection === undefined ? null : publicInspection(checkpoint.inspection);
    return immutable({cursor, id: checkpoint.id ?? null, time: checkpoint.time, inspection});
};
const flatten = (value, maxFields) => {
    const fields = new Map();
    let truncated = false;
    const visit = (item, path, depth) => {
        if (fields.size >= maxFields) { truncated = true; return; }
        if (item === null || typeof item !== 'object' || depth >= 8) {
            fields.set(path || '$', hashReplayValues(item));
            return;
        }
        if (ArrayBuffer.isView(item) || item instanceof ArrayBuffer) {
            fields.set(path || '$', hashReplayValues(item));
            return;
        }
        const keys = Array.isArray(item) ? item.map((_, index) => String(index)) : Object.keys(item).sort();
        if (!keys.length) fields.set(path || '$', hashReplayValues(item));
        for (const key of keys) visit(item[key], path ? `${path}.${key}` : key, depth + 1);
    };
    visit(value, '', 0);
    return {fields, truncated};
};

/** Bounded branch-qualified bookmarks, notes, and snapshot-free checkpoint comparisons. */
export function createHistoryAnnotationStore ({resolveCheckpoint, maxEntries = 256,
    maxTextBytes = 4096, maxComparisonFields = 512, initialEntries = []} = {}) {
    if (typeof resolveCheckpoint !== 'function') throw new TypeError('resolveCheckpoint is required');
    for (const [value, label] of [[maxEntries, 'maxEntries'], [maxTextBytes, 'maxTextBytes'],
        [maxComparisonFields, 'maxComparisonFields']]) {
        if (!Number.isSafeInteger(value) || value < 1) throw new RangeError(`${label} must be positive`);
    }
    const entries = new Map();
    let nextId = 1;
    const add = (kind, cursor, body) => {
        if (entries.size >= maxEntries) return refusal('annotation-capacity',
            'history annotation capacity is exhausted; remove an entry explicitly', {maxEntries});
        const at = normalizedCursor(cursor);
        const value = immutable({id: nextId++, kind, cursor: at, ...body});
        entries.set(value.id, value);
        return Object.freeze({accepted: true, entry: value});
    };
    if (!Array.isArray(initialEntries) || initialEntries.length > maxEntries) {
        throw new TypeError('initialEntries must fit the annotation capacity');
    }
    for (const entry of initialEntries) {
        if (!entry || !Number.isSafeInteger(entry.id) || entry.id < 1 || entries.has(entry.id) ||
            !['bookmark', 'annotation'].includes(entry.kind)) {
            throw new TypeError('invalid retained history annotation');
        }
        const cursor = normalizedCursor(entry.cursor);
        const value = entry.kind === 'bookmark' ? immutable({id: entry.id, kind: entry.kind, cursor,
            label: text(entry.label, 'bookmark label', maxTextBytes),
            annotation: text(entry.annotation ?? '', 'bookmark annotation', maxTextBytes, {empty: true})}) :
            immutable({id: entry.id, kind: entry.kind, cursor,
                annotation: text(entry.annotation, 'annotation', maxTextBytes)});
        entries.set(value.id, value);
        nextId = Math.max(nextId, value.id + 1);
    }
    return Object.freeze({
        addBookmark ({cursor, label, annotation = ''}) {
            return add('bookmark', cursor, {
                label: text(label, 'bookmark label', maxTextBytes),
                annotation: text(annotation, 'bookmark annotation', maxTextBytes, {empty: true})
            });
        },
        addAnnotation ({cursor, annotation}) {
            return add('annotation', cursor,
                {annotation: text(annotation, 'annotation', maxTextBytes)});
        },
        update (id, changes) {
            const prior = entries.get(id);
            if (!prior) return refusal('annotation-not-retained', 'history annotation is not retained', {id});
            if (!changes || typeof changes !== 'object' || Array.isArray(changes) ||
                Object.keys(changes).some(key => !['label', 'annotation'].includes(key))) {
                return refusal('annotation-update-invalid', 'only label and annotation text may be updated', {id});
            }
            const next = {...prior};
            if (Object.hasOwn(changes, 'label')) {
                if (prior.kind !== 'bookmark') return refusal('annotation-update-invalid',
                    'plain annotations do not have labels', {id});
                next.label = text(changes.label, 'bookmark label', maxTextBytes);
            }
            if (Object.hasOwn(changes, 'annotation')) next.annotation = text(changes.annotation,
                'annotation', maxTextBytes, {empty: prior.kind === 'bookmark'});
            const value = immutable(next); entries.set(id, value);
            return Object.freeze({accepted: true, entry: value});
        },
        remove (id) {
            if (!entries.delete(id)) return refusal('annotation-not-retained',
                'history annotation is not retained', {id});
            return Object.freeze({accepted: true, id});
        },
        list ({branchId = null} = {}) {
            const values = [...entries.values()].filter(entry => branchId === null ||
                entry.cursor.branchId === branchId);
            return Object.freeze(values.map(immutable));
        },
        compareCheckpoints (leftCursor, rightCursor) {
            const leftAt = normalizedCursor(leftCursor);
            const rightAt = normalizedCursor(rightCursor);
            let left; let right;
            try {
                left = checkpointView(resolveCheckpoint(leftAt), leftAt);
                right = checkpointView(resolveCheckpoint(rightAt), rightAt);
            } catch (error) {
                return refusal('checkpoint-comparison-unavailable', error?.message || String(error));
            }
            const leftFlat = flatten(left.inspection, maxComparisonFields);
            const rightFlat = flatten(right.inspection, maxComparisonFields);
            const leftFields = leftFlat.fields;
            const rightFields = rightFlat.fields;
            const paths = [...new Set([...leftFields.keys(), ...rightFields.keys()])].sort();
            const truncated = leftFlat.truncated || rightFlat.truncated || paths.length > maxComparisonFields;
            const differences = paths.slice(0, maxComparisonFields).filter(path =>
                leftFields.get(path) !== rightFields.get(path)).map(path => Object.freeze({
                path, leftHash: leftFields.get(path) ?? null, rightHash: rightFields.get(path) ?? null
            }));
            return freeze({accepted: true, left, right,
                identical: hashReplayValues(left.inspection) === hashReplayValues(right.inspection),
                differences, truncated});
        },
        retention: () => Object.freeze({maxEntries, retainedEntries: entries.size,
            maxTextBytes, maxComparisonFields})
    });
}

export default createHistoryAnnotationStore;
