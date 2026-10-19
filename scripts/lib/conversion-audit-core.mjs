/** Actual conversion shared by the audit CLI and bounded conversion consumers.
 * No filesystem, process, compiler, SDK or runtime helper is imported here.
 */
import {importProjectFiles, importProjectFilesWithDependencies} from '../../overlay/scratch-gui/src/lib/bw-makecode/index.js';

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
export async function auditConversionSubject (subject, {onObservation = async () => {}} = {}) {
    const files = subject.files;
    const options = {target: subject.target, name: subject.name};
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
    await onObservation({phase: 'creator', status: 'return', value: observed});
    return {...result, ...finishLegacyLabel(imported, creator, false, legacyUnsupported), creator: {status: 'return', ...observed}};
}

/** JSON-safe data graph for CLI reports. Does not invoke getters/toJSON. Own
 * values, maps, byte payloads, special primitives and sharing remain explicit;
 * callable/accessor implementations are declared unobserved, never executed.
 */
export function conversionObservationGraph (root) {
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
        if (typeof input === 'function') {node.kind = 'callable'; node.implementation = 'unobserved'; return {ref: id};}
        const mapIterator = nativeIterator(mapEntries, input);
        const setIterator = mapIterator ? null : nativeIterator(setValues, input);
        const bytes = mapIterator || setIterator ? null : nativeBytes(input);
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
            node.kind = 'bytes'; node.bytes = []; node.byteLength = observeApply(typedSlots[2], bytes, []);
            // Fresh native view and indexed octets; no Array.from/iterator or
            // ordinary buffer/offset/length read on the supplied view.
            for (let i = 0; i < node.byteLength; i++) node.bytes[i] = bytes[i];
        } else if (Array.isArray(input)) node.kind = 'array';
        const prototype = Object.getPrototypeOf(input);
        node.prototype = prototype === null ? 'null' : prototype === Object.prototype ? 'Object' :
            prototype === Array.prototype ? 'Array' : 'other-unobserved';
        for (const key of Reflect.ownKeys(input)) {
            if (++entries > 1048576) throw new Error('Conversion observation entry bound');
            const d = Object.getOwnPropertyDescriptor(input, key);
            if (!d) throw new Error('Conversion observation property disappeared');
            node.fields.push({key: value(key), enumerable: d.enumerable, configurable: d.configurable,
                ...(own(d, 'value') ? {writable: d.writable, value: value(d.value, depth + 1)} :
                    {kind: 'accessor', implementation: 'unobserved', get: !!d.get, set: !!d.set})});
        }
        return {ref: id};
    };
    const symbols = new Map(); const symbolID = input => {if (!symbols.has(input)) symbols.set(input, symbols.size); return symbols.get(input);};
    const result = value(root); return {schema: 'brickwright/conversion-observation-graph/v1', root: result, nodes};
}
