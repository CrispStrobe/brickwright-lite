import {animationResourceFromDocument} from '../bw-animation-resources.js';
import {validateDocument} from '../bw-artwork-bundle.js';

// Documents are inputs to this export, not type annotations. Retain actual
// nested identities and data so a replacement or in-place edit cannot reuse a
// producer proof from an earlier resource revision.
const dataSnapshot = root => {
    const rows = [], seen = new Set(), pending = new Set();
    const visit = value => {
        if (value === null || typeof value !== 'object') {
            if (typeof value === 'function' || typeof value === 'symbol') throw Error('Not document data');
            return;
        }
        if (pending.has(value)) throw Error('Cyclic document data');
        if (seen.has(value)) return;
        const proto = Object.getPrototypeOf(value);
        if (![Object.prototype, Array.prototype, Uint8Array.prototype, null].includes(proto)) throw Error('Not document data');
        seen.add(value); pending.add(value);
        const keys = Reflect.ownKeys(value), values = [], flags = new Uint8Array(keys.length);
        let numeric = Array.isArray(value) || proto === Uint8Array.prototype;
        for (let i = 0; i < keys.length; i++) {
            const key = keys[i], descriptor = Object.getOwnPropertyDescriptor(value, key);
            if (typeof key !== 'string' || !descriptor || !Object.hasOwn(descriptor, 'value')) throw Error('Not document data');
            visit(descriptor.value);
            values.push(descriptor.value);
            flags[i] = Number(descriptor.enumerable) | Number(descriptor.configurable) << 1 | Number(descriptor.writable) << 2;
            numeric &&= typeof descriptor.value === 'number';
        }
        // Pixel containers retain compact exact values/descriptor flags, rather
        // than one descriptor object per pixel. Non-numeric containers retain
        // their actual references, including frame/layer/array identities.
        const stored = numeric ? Float64Array.from(values) : values;
        const view = proto === Uint8Array.prototype ? {
            buffer: value.buffer, offset: value.byteOffset, bytes: value.byteLength, length: value.length
        } : null;
        rows.push({value, proto, keys, values: stored, flags, view}); pending.delete(value);
    };
    visit(root);
    return () => rows.every(row => {
        if (Object.getPrototypeOf(row.value) !== row.proto) return false;
        const keys = Reflect.ownKeys(row.value);
        if (keys.length !== row.keys.length || keys.some((key, i) => key !== row.keys[i])) return false;
        if (row.view && (row.value.buffer !== row.view.buffer || row.value.byteOffset !== row.view.offset ||
            row.value.byteLength !== row.view.bytes || row.value.length !== row.view.length)) return false;
        return row.keys.every((key, i) => {
            const descriptor = Object.getOwnPropertyDescriptor(row.value, key);
            return descriptor && Object.hasOwn(descriptor, 'value') && Object.is(descriptor.value, row.values[i]) &&
                (Number(descriptor.enumerable) | Number(descriptor.configurable) << 1 | Number(descriptor.writable) << 2) === row.flags[i];
        });
    });
};

const resourceLiteral = (target, node) => {
    const slot = node.inputs?.RESOURCE, raw = slot?.[1];
    if (!Array.isArray(slot) || slot[0] !== 1 || slot.length !== 2) return null;
    if (Array.isArray(raw)) return raw.length === 2 && raw[0] === 10 && typeof raw[1] === 'string' ? raw[1] : null;
    const selector = typeof raw === 'string' && target.blocks?.[raw];
    if (!selector || selector.shadow !== true || selector.next != null || selector.mutation != null ||
        Object.keys(selector.inputs || {}).length) return null;
    const field = selector.opcode === 'text' ? 'TEXT' : selector.opcode === 'arcade_menu_animationAssets' ? 'animationAssets' : null;
    if (!field || Object.keys(selector.fields || {}).join('|') !== field) return null;
    const value = selector.fields[field];
    return Array.isArray(value) && value.length === 2 && typeof value[0] === 'string' && value[1] === null ? value[0] : null;
};

// Internal consumers may share this actual validation result. An arbitrary
// options field, boolean or lookalike interface cannot introduce a producer.
const producerOwners = new WeakMap();
export const isAnimationFrameArrayProducer = (producer, options) => producerOwners.get(producer) === options;

export const createAnimationFrameArrayProducers = options => {
    const descriptor = Object.getOwnPropertyDescriptor(options, 'animationDocuments');
    const documents = descriptor && Object.hasOwn(descriptor, 'value') ? descriptor.value : undefined;
    let current = () => true;
    const resources = new Map(), entries = [];
    const immutableSource = document => {
        // This is exactly the serializable representation the companion writer
        // consumes, captured before callbacks rather than reread from live data.
        const copy = JSON.parse(JSON.stringify(document));
        const freeze = value => {
            if (value && typeof value === 'object') {
                for (const child of Object.values(value)) freeze(child);
                Object.freeze(value);
            }
            return value;
        };
        return freeze(copy);
    };
    const normalized = resource => Object.freeze({...resource,
        palette: Object.freeze([...resource.palette]), warnings: Object.freeze([...resource.warnings]),
        frames: Object.freeze(resource.frames.map(frame => Object.freeze({...frame,
            pixels: Object.freeze(Array.from(frame.pixels))})))});
    if (descriptor && !Object.hasOwn(descriptor, 'value')) {
        current = () => false;
        entries.push(Object.freeze({error: 'Animation resources require an own data document collection'}));
    } else if (documents != null) {
        try {
            if (!Array.isArray(documents)) throw Error('Animation resources require a document Array');
            current = dataSnapshot(documents);
            const counts = new Map();
            for (const document of documents) {
                const id = document?.animation?.resource?.id;
                if (typeof id === 'string') counts.set(id, (counts.get(id) || 0) + 1);
            }
            for (const document of documents) {
                // A costume record without a timeline (an ordinary bitmap or
                // Pixel document) is no animation source and no producer; the
                // collection snapshot still binds it. A present but malformed
                // animation is still reported below.
                if (document == null || (typeof document === 'object' && !Object.hasOwn(document, 'animation'))) continue;
                try {
                    const resource = normalized(animationResourceFromDocument(document));
                    // Normalized behavior export accepts a broader input form
                    // than the editor's resource publisher. Only a document the
                    // actual publisher can admit establishes an Array producer.
                    let publicationError = null;
                    try { validateDocument(document); } catch (error) { publicationError = error.message; }
                    const entry = Object.freeze({document, snapshotDocument: immutableSource(document), resource, publicationError});
                    entries.push(entry);
                    if (publicationError === null && counts.get(resource.id) === 1) resources.set(resource.id,
                        {resource, sharedAllocation: Object.freeze({})});
                } catch (error) { entries.push(Object.freeze({document, error: error.message})); }
            }
        } catch (error) {
            resources.clear(); entries.length = 0;
            entries.push(Object.freeze({error: error.message})); current = () => false;
        }
    }
    const unchanged = () => {
        const actual = Object.getOwnPropertyDescriptor(options, 'animationDocuments');
        if (!descriptor) return !actual;
        return actual && Object.hasOwn(actual, 'value') && Object.hasOwn(descriptor, 'value') &&
            actual.value === documents && actual.enumerable === descriptor.enumerable &&
            actual.configurable === descriptor.configurable && actual.writable === descriptor.writable && current();
    };
    const producer = Object.freeze({
        entries: Object.freeze(entries),
        isCurrent: unchanged,
        // Exact private normalized resource identity, never a caller-supplied ID
        // or image literal. Existing resolve remains the allocation admission.
        freshResource(target, node) {
            if(node?.opcode!=='arcade_animationAssetFreshFrames')return null;
            const resource=resources.get(resourceLiteral(target,node))?.resource||null;
            return unchanged()?resource:null;
        },
        resolve(target, node) {
            if (!['arcade_animationAssetFrames', 'arcade_animationAssetFreshFrames'].includes(node?.opcode) ||
                node.mutation != null || Object.keys(node.fields || {}).length ||
                Object.keys(node.inputs || {}).join('|') !== 'RESOURCE' || !unchanged()) return null;
            const value = resources.get(resourceLiteral(target, node));
            if (!value) return null;
            return Object.freeze({allocation: node.opcode === 'arcade_animationAssetFrames' ? value.sharedAllocation : node,
                shared: node.opcode === 'arcade_animationAssetFrames', length: value.resource.frames.length});
        }
    });
    producerOwners.set(producer, options);
    return producer;
};
