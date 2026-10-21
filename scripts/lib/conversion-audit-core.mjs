/** Actual conversion shared by the audit CLI and bounded conversion consumers.
 * No filesystem, process, compiler, SDK or runtime helper is imported here.
 */
import {types as observationNativeTypes} from 'node:util';
import {importProjectFiles, importProjectFilesWithDependencies} from '../../overlay/scratch-gui/src/lib/bw-makecode/index.js';
import {encodeObservationBytePayload, appendObservationByteField} from './conversion-observation-codec.mjs';
export {expandConversionObservationGraph} from './conversion-observation-codec.mjs';

const own = (value, key) => Object.prototype.hasOwnProperty.call(value, key);
// Observer reads native collection/view slots without input property lookup.
// Capture in the normal initial realm; no pre-import hostile-realm claim.
const observeApply = Reflect.apply;
const mapEntries = Map.prototype.entries;
const mapNext = Object.getPrototypeOf(observeApply(mapEntries, new Map(), [])).next;
const setValues = Set.prototype.values;
const setNext = Object.getPrototypeOf(observeApply(setValues, new Set(), [])).next;
const descriptor = Object.getOwnPropertyDescriptor;
const arrayBufferLength = descriptor(ArrayBuffer.prototype, 'byteLength').get;
const typedArrayPrototype = Object.getPrototypeOf(Uint8Array.prototype);
const typedSlots = ['buffer','byteOffset','byteLength'].map(key => descriptor(typedArrayPrototype, key).get);
const viewSlots = ['buffer','byteOffset','byteLength'].map(key => descriptor(DataView.prototype, key).get);
const ByteView = Uint8Array;
const nativeIterator = (method, input) => {try {return observeApply(method, input, []);} catch {return null;}};
// Compact representation only: nonthrowing native brand predicates avoid
// allocating wrong-receiver exceptions on ordinary graph records. They read
// native slots, not prototypes, constructors, tags or supplied properties.
// Capture in the same normal initial realm as the existing slot operations.
// Positive membership only selects the ORIGINAL complete operation below;
// it never supplies entries, byte contents or descriptor/value authority.
const compactIsMap = observationNativeTypes.isMap;
const compactIsSet = observationNativeTypes.isSet;
const compactIsArrayBuffer = observationNativeTypes.isArrayBuffer;
const compactIsTypedArray = observationNativeTypes.isTypedArray;
const compactIsDataView = observationNativeTypes.isDataView;
const nativeBytes = input => {
    try {const length = observeApply(arrayBufferLength, input, []); return new ByteView(input, 0, length);}
    catch { /* Try typed-array and DataView brands without input getters. */ }
    for (const slots of [typedSlots, viewSlots]) {
        let buffer, offset, length;
        try {
            buffer = observeApply(slots[0], input, []);
            offset = observeApply(slots[1], input, []);
            length = observeApply(slots[2], input, []);
        } catch {continue;}
        return new ByteView(buffer, offset, length);
    }
    return null;
};


// Compact-only negative admission. A genuine Uint8Array has dense indexed
// data descriptors even when its prototype is Buffer/subclass/custom. Proxy
// wrappers lack the native slots. Shared/resizable backing keeps the old path.
const compactPrototype = Object.getPrototypeOf, compactKeys = Reflect.ownKeys;
const compactOwn = Object.hasOwn, compactSame = Object.is, compactGlobal = globalThis;
const compactTypedTag = descriptor(typedArrayPrototype, Symbol.toStringTag).get;
const compactTypedLength = descriptor(typedArrayPrototype, 'length').get;
const compactResizable = descriptor(ArrayBuffer.prototype, 'resizable')?.get;
const compactSurface = (() => {
    const objects = [], aliases = [], fields = ['value','writable','get','set','enumerable','configurable'];
    const add = object => {
        if (objects.some(row => row.object === object)) return;
        const names = compactKeys(object), rows = [];
        for (const key of names) rows.push(descriptor(object, key));
        objects.push({object, prototype: compactPrototype(object), names, rows});
    };
    // These are exactly the mutable native surfaces used by the skipped
    // per-index observer/helper work, plus their ordinary prototype chains.
    for (const object of [Object, Reflect, Number, String, Array.prototype, Function.prototype, Object.prototype]) add(object);
    let iterator = compactPrototype([][Symbol.iterator]());
    while (iterator !== null) {add(iterator); iterator = compactPrototype(iterator);}
    for (const key of ['Object','Reflect','Number','String','Array','Function','Uint8Array','ArrayBuffer','globalThis']) {
        aliases.push({key, row: descriptor(compactGlobal, key)});
    }
    return {objects, aliases, fields};
})();
function compactDescriptorSame (a, b) {
    if (!a || !b) return a === b;
    for (let i = 0; i < compactSurface.fields.length; i++) {
        const key = compactSurface.fields[i], present = compactOwn(a, key);
        if (present !== compactOwn(b, key) || (present && !compactSame(a[key], b[key]))) return false;
    }
    return true;
}
function compactRealmCurrent () {
    for (let i = 0; i < compactSurface.aliases.length; i++) {
        const row = compactSurface.aliases[i];
        if (!compactDescriptorSame(row.row, descriptor(compactGlobal, row.key))) return false;
    }
    for (let i = 0; i < compactSurface.objects.length; i++) {
        const row = compactSurface.objects[i];
        if (compactPrototype(row.object) !== row.prototype) return false;
        const names = compactKeys(row.object);
        if (names.length !== row.names.length) return false;
        for (let j = 0; j < names.length; j++) {
            if (names[j] !== row.names[j] || !compactDescriptorSame(row.rows[j], descriptor(row.object, names[j]))) return false;
        }
    }
    return true;
}
function compactNativeIndexCount (input, length) {
    if (!compactResizable) return -1;
    try {
        if (observeApply(compactTypedTag, input, []) !== 'Uint8Array' ||
            observeApply(compactTypedLength, input, []) !== length || !compactRealmCurrent()) return -1;
        const buffer = observeApply(typedSlots[0], input, []);
        // Both getters require an actual ordinary ArrayBuffer, not shared or
        // Proxy backing. No supplied buffer/tag/constructor property is read.
        observeApply(arrayBufferLength, buffer, []);
        if (observeApply(compactResizable, buffer, []) !== false) return -1;
        return length;
    } catch {return -1;}
}

export function providedConversionChannels (value) {
    const channels = Object.create(null);
    for (const key of ['unsupported', 'warnings', 'errors', 'unparsed', 'diagnostics', 'fetchedExtensions',
        'dependencyMessages', 'dependencyInputs']) {
        const descriptor = value && (typeof value === 'object' || typeof value === 'function') ?
            Object.getOwnPropertyDescriptor(value, key) : undefined;
        channels[key] = !descriptor ? {provided: false} : !own(descriptor, 'value') ?
            {provided: true, kind: 'accessor', observed: false} :
            {provided: true, kind: Array.isArray(descriptor.value) ? 'array' : typeof descriptor.value,
                value: descriptor.value};
    }
    return channels;
}

/** Retain actual own error data, including nested cause/details/diagnostics.
 * Accessors are recorded, never invoked. Identity/cycles stay in this graph;
 * a caller must persist it with its reviewed lossless graph codec.
 */
export function conversionException (error) {
    const seen = new Map();
    let nodes = 0;
    const visit = (value, depth = 0) => {
        if (value === null || (typeof value !== 'object' && typeof value !== 'function')) return value;
        if (seen.has(value)) return seen.get(value);
        if (depth > 64 || ++nodes > 65536) throw new Error('Conversion exception observation bound exceeded');
        const result = {kind: typeof value, fields: []};
        seen.set(value, result);
        for (const key of Reflect.ownKeys(value)) {
            const d = Object.getOwnPropertyDescriptor(value, key);
            if (!d) throw new Error('Conversion exception property disappeared');
            result.fields.push({key, enumerable: d.enumerable, configurable: d.configurable,
                ...(own(d, 'value') ? {writable: d.writable, value: visit(d.value, depth + 1)} :
                    {kind: 'accessor', get: d.get, set: d.set, observed: false})});
        }
        return result;
    };
    return {actual: error, ownGraph: visit(error), channels: providedConversionChannels(error)};
}

/** Preserve the original compat-audit raw classification, separately from all
 * observed channels. This intentionally does not turn a missing channel clean.
 */
function finishLegacyLabel (imported, creator, creatorError, unsupported) {
    if (imported.lang !== 'pseudocode') return {stage: 'source-only', unsupported};
    if (creatorError) return {stage: 'parse-failed', unsupported};
    let blockCount = 0;
    for (const target of creator.project.targets) blockCount += Object.keys(target.blocks || {}).length;
    if (creator.warnings.length) unsupported.push(...creator.warnings.map(warning => `Code to Blocks: ${warning}`));
    return {stage: unsupported.length ? 'partial' : 'translated', unsupported, blockCount};
}
export function legacyConversionLabel (imported, creator, creatorError = false) {
    return finishLegacyLabel(imported, creator, creatorError, (imported.unsupported || []).map(String));
}

/** Complete actual operation; no injected importer/Creator or validation bypass.
 * Observer failures propagate; catches enclose only real product operations.
 * onObservation is awaited outside product catches so a bounded consumer can
 * retain each full return/error before classification or later operations.
 */
export async function auditConversionSubject (subject, {onObservation = async () => {}, animationResources = false, onCreator = null} = {}) {
    const files = subject.files;
    const options = {target: subject.target, name: subject.name, ...(animationResources ? {animationResources: true} : {})};
    let imported;
    let dependencyCallback;
    let resolverCalls = 0;
    const rootBefore = JSON.stringify(files);
    const graphBefore = subject.kind === 'RETAINED_CONTEXT' ? JSON.stringify(subject.resolved) : null;
    const inputMutation = () => ({rootChanged: JSON.stringify(files) !== rootBefore,
        resolvedChanged: subject.kind === 'RETAINED_CONTEXT' && JSON.stringify(subject.resolved) !== graphBefore});
    let resolverObserverError;
    let resolverObserverFailed = false;
    let productError;
    let importFailed = false;
    if (subject.kind === 'IMPORTED_ARTEFACT') {
        // The CLI already invoked its original actual artefact reader once.
        imported = subject.imported;
    } else if (subject.kind === 'RETAINED_CONTEXT') {
        options.resolveProjectInputs = async (target, current) => {
            resolverCalls++;
            dependencyCallback = {target, current, returned: subject.resolved, provenance: subject.provenance};
            if (target !== subject.target || Object.keys(current).length !== Object.keys(files).length ||
                Object.entries(files).some(([key, value]) => current[key] !== value)) {
                throw new Error('Retained conversion resolver received a different root input');
            }
            try { await onObservation({phase: 'dependency-callback', target, current, returned: subject.resolved,
                provenance: subject.provenance}); } catch (error) {
                resolverObserverFailed = true; resolverObserverError = error; throw error;
            }
            return subject.resolved;
        };
        try { imported = await importProjectFilesWithDependencies(files, options); }
        catch (error) { productError = error; importFailed = true; }
    } else {
        try { imported = importProjectFiles(files, options); }
        catch (error) { productError = error; importFailed = true; }
    }
    if (resolverObserverFailed) throw resolverObserverError;
    if (importFailed) {
        const exception = conversionException(productError);
        await onObservation({phase: 'import', status: 'throw', exception});
        return {id: subject.id, target: subject.target, stage: 'parse-failed', inputMutation: inputMutation(),
            dependencyCallback, resolverCalls, import: {status: 'throw', exception},
            originalCompile: subject.originalCompile ?? {status: 'not-provided'}, creator: {status: 'unattempted'}};
    }
    await onObservation({phase: 'import', status: 'return', value: imported,
        channels: providedConversionChannels(imported)});
    const result = {id: subject.id, target: imported.project?.target || subject.target,
        sourceRecovered: !!imported.source, translated: imported.lang === 'pseudocode',
        inputMutation: inputMutation(), dependencyCallback, resolverCalls,
        import: {status: 'return', value: imported, channels: providedConversionChannels(imported)},
        originalCompile: subject.originalCompile ?? {status: 'not-provided'}};
    const legacyUnsupported = (imported.unsupported || []).map(String);
    if (!result.translated) return {...result, ...finishLegacyLabel(imported, undefined, false, legacyUnsupported), creator: {status: 'unattempted'}};
    // Reached module acquisition is setup. A missing/denied module must not
    // masquerade as a Creator product parse failure in a pure consumer.
    const {default: SB3Creator} = await import('../../overlay/scratch-gui/src/lib/sb3-creator.js');
    let creator;
    let creatorException;
    let creatorFailed = false;
    try { creator = new SB3Creator(); }
    catch (error) { creatorException = error; creatorFailed = true; }
    if (!creatorFailed) {
        try { creator.parse(imported.code); }
        catch (error) { creatorException = error; creatorFailed = true; }
    }
    if (creatorFailed) {
        const exception = conversionException(creatorException);
        await onObservation({phase: 'creator', status: 'throw', exception});
        return {...result, ...finishLegacyLabel(imported, creator, true, legacyUnsupported), creator: {status: 'throw', exception}};
    }
    // Existing Creator JSON/public channels are observed after the actual parse.
    // Other own fields have descriptor shapes only, not an arbitrary class dump.
    const ownFields = Reflect.ownKeys(creator).map(key => {
        const d = Object.getOwnPropertyDescriptor(creator, key);
        return {key, data: own(d, 'value'), enumerable: d.enumerable,
            configurable: d.configurable, ...(own(d, 'value') ? {writable: d.writable, kind: typeof d.value} : {})};
    });
    const observed = {project: creator.project, assets: creator.assets, channels: providedConversionChannels(creator), ownFields,
        otherPrivateValues: 'unobserved'};
    if (onCreator) await onCreator(creator);
    await onObservation({phase: 'creator', status: 'return', value: observed});
    return {...result, ...finishLegacyLabel(imported, creator, false, legacyUnsupported), creator: {status: 'return', ...observed}};
}

/** JSON-safe data graph for CLI reports. Does not invoke getters/toJSON. Own
 * values, maps, byte payloads, special primitives and sharing remain explicit;
 * callable/accessor implementations are declared unobserved, never executed.
 */
export function conversionObservationGraph (root) {return observeConversionGraph(root, false);}

/** Same full observation, with explicitly versioned lossless byte packing. */
export function compactConversionObservationGraph (root) {return observeConversionGraph(root, true);}

function observeConversionGraph (root, compactBytes) {
    const known = new Map(); const nodes = []; let entries = 0;
    const value = (input, depth = 0) => {
        if (input === undefined) return {kind: 'undefined'};
        if (typeof input === 'number' && (!Number.isFinite(input) || Object.is(input, -0))) return {kind: 'number', value: String(input), negativeZero: Object.is(input, -0)};
        if (typeof input === 'bigint') return {kind: 'bigint', value: String(input)};
        if (typeof input === 'symbol') return {kind: 'symbol', description: input.description, identity: symbolID(input)};
        if (input === null || (typeof input !== 'object' && typeof input !== 'function')) return input;
        if (known.has(input)) return {ref: known.get(input)};
        if (depth > 128 || nodes.length >= 262144) throw new Error('Conversion observation graph bound');
        const id = nodes.length; known.set(input, id); const node = {id, kind: 'object', fields: []}; nodes.push(node);
        let byteSnapshot = null; let compactIndexCount = -1;
        if (typeof input === 'function') {node.kind = 'callable'; node.implementation = 'unobserved'; return {ref: id};}
        const mapIterator = !compactBytes || compactIsMap(input) ? nativeIterator(mapEntries, input) : null;
        const setIterator = mapIterator || (compactBytes && !compactIsSet(input)) ? null : nativeIterator(setValues, input);
        const bytes = mapIterator || setIterator || (compactBytes &&
            !compactIsArrayBuffer(input) && !compactIsTypedArray(input) && !compactIsDataView(input)) ? null : nativeBytes(input);
        if (mapIterator || setIterator) {
            node.kind = mapIterator ? 'map' : 'set'; node.entries = [];
            const iterator = mapIterator || setIterator, next = mapIterator ? mapNext : setNext;
            for (;;) {
                const step = observeApply(next, iterator, []); if (step.done) break;
                if (++entries > 1048576) throw new Error('Conversion observation entry bound');
                node.entries[node.entries.length] = mapIterator ?
                    [value(step.value[0], depth + 1), value(step.value[1], depth + 1)] : value(step.value, depth + 1);
            }
        } else if (bytes) {
            node.kind = 'bytes'; node.byteLength = observeApply(typedSlots[2], bytes, []);
            // Snapshot octets once before own descriptors: concurrent/retained
            // native backing changes cannot make a run refer to later bytes.
            if (compactBytes) {
                // Negative admission stays negative: an altered array setter or
                // alias can restore itself during snapshot/prototype observation.
                compactIndexCount = compactNativeIndexCount(input, node.byteLength);
                const encoded = encodeObservationBytePayload(bytes, node.byteLength);
                node.bytePayload = encoded.payload; byteSnapshot = encoded.octets;
                if (compactIndexCount >= 0 && !compactRealmCurrent()) compactIndexCount = -1;
            } else {
                node.bytes = [];
                for (let i = 0; i < node.byteLength; i++) node.bytes[i] = bytes[i];
            }
        } else if (Array.isArray(input)) node.kind = 'array';
        const prototype = Object.getPrototypeOf(input);
        node.prototype = prototype === null ? 'null' : prototype === Object.prototype ? 'Object' :
            prototype === Array.prototype ? 'Array' : 'other-unobserved';
        // The v1 path below is unchanged. The compact path keeps one real
        // ownKeys observation; only the spec-fixed native index prefix is
        // synthesized. Every named/symbol tail descriptor still uses the loop.
        let compactTail = null;
        if (compactBytes && byteSnapshot) {
            const count = compactIndexCount;
            if (count >= 0) {
                const names = compactKeys(input);
                if (names.length < count) throw new Error('Conversion observation native index shape');
                if (entries + count > 1048576) throw new Error('Conversion observation entry bound');
                entries += count;
                if (count === 1) node.fields.push({key: '0', enumerable: true, configurable: true, writable: true, value: byteSnapshot[0]});
                else if (count > 1) node.fields.push({kind: 'byte-index-descriptor-run', firstIndex: 0, count,
                    attributes: {enumerable: true, configurable: true, writable: true}});
                compactTail = [];
                for (let i = count; i < names.length; i++) compactTail[compactTail.length] = names[i];
            }
        }
        for (const key of compactTail === null ? Reflect.ownKeys(input) : compactTail) {
            if (++entries > 1048576) throw new Error('Conversion observation entry bound');
            const d = Object.getOwnPropertyDescriptor(input, key);
            if (!d) throw new Error('Conversion observation property disappeared');
            const field = {key: value(key), enumerable: d.enumerable, configurable: d.configurable,
                ...(own(d, 'value') ? {writable: d.writable, value: value(d.value, depth + 1)} :
                    {kind: 'accessor', implementation: 'unobserved', get: !!d.get, set: !!d.set})};
            if (byteSnapshot) appendObservationByteField(node.fields, field, byteSnapshot, node.byteLength);
            else node.fields.push(field);
        }
        return {ref: id};
    };
    const symbols = new Map(); const symbolID = input => {if (!symbols.has(input)) symbols.set(input, symbols.size); return symbols.get(input);};
    const result = value(root); return {schema: compactBytes ? 'brickwright/conversion-observation-graph/v2' : 'brickwright/conversion-observation-graph/v1', root: result, nodes};
}
