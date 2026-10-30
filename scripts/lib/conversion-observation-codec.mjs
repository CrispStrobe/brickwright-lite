/** Lossless JSON observation encoding only. No conversion or type authority.
 * Decoder inputs are parsed own-data JSON, not arbitrary Proxy-origin proofs.
 */
const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
const own = Object.hasOwn, keys = Reflect.ownKeys, descriptor = Object.getOwnPropertyDescriptor;
const prototype = Object.getPrototypeOf, define = Object.defineProperty, same = Object.is;
const objectPrototype = Object.prototype, arrayPrototype = Array.prototype;
const MAX_NODES = 262144, MAX_ENTRIES = 1048576;
const fail = message => {throw new Error('Conversion observation codec: ' + message);};

// The encoder's sole client passes the fresh native octet view made by the
// observer's held internal-slot getters. No supplied iterator/getter is used.
export function encodeObservationBytePayload (octets, byteLength) {
    const snapshot = [];
    for (let i = 0; i < byteLength; i++) snapshot[i] = octets[i];
    let data = '';
    for (let i = 0; i < byteLength; i += 3) {
        const a = snapshot[i], b = i + 1 < byteLength ? snapshot[i + 1] : 0;
        const c = i + 2 < byteLength ? snapshot[i + 2] : 0;
        data += alphabet[a >>> 2] + alphabet[((a & 3) << 4) | (b >>> 4)] +
            (i + 1 < byteLength ? alphabet[((b & 15) << 2) | (c >>> 6)] : '=') +
            (i + 2 < byteLength ? alphabet[c & 63] : '=');
    }
    return {payload: {encoding: 'base64', byteLength, data}, octets: snapshot};
}
const indexOfField = (field, octets, length) => {
    const names = keys(field), expected = ['key', 'enumerable', 'configurable', 'writable', 'value'];
    if (names.length !== expected.length || names.some((name, index) => name !== expected[index])) return -1;
    if (typeof field.key !== 'string' || !own(field, 'value') ||
        typeof field.value !== 'number' || !same(field.value, field.value | 0)) return -1;
    const index = Number(field.key);
    return Number.isSafeInteger(index) && index >= 0 && String(index) === field.key && index < length &&
        same(field.value, octets[index]) ? index : -1;
};
const attributesEqual = (a, b) => a.enumerable === b.enumerable && a.configurable === b.configurable && a.writable === b.writable;
export function appendObservationByteField (fields, field, octets, length) {
    const index = indexOfField(field, octets, length), previous = fields[fields.length - 1];
    if (index >= 0 && previous) {
        if (previous.kind === 'byte-index-descriptor-run' && previous.firstIndex + previous.count === index &&
            attributesEqual(previous.attributes, field)) {previous.count++; return;}
        if (indexOfField(previous, octets, length) === index - 1 && attributesEqual(previous, field)) {
            fields[fields.length - 1] = {kind: 'byte-index-descriptor-run', firstIndex: index - 1, count: 2,
                attributes: {enumerable: field.enumerable, configurable: field.configurable, writable: field.writable}};
            return;
        }
    }
    fields[fields.length] = field;
}

// No toJSON, getter, supplied iterator or constructor is invoked while copying
// decoded JSON. Bounds here cover metadata work; original logical field/entry
// bounds below are enforced separately, including every expanded descriptor.
function copyJSONData (root) {
    const active = new WeakSet(); let count = 0;
    const copy = (value, depth) => {
        if (++count > 16 * MAX_ENTRIES || depth > 128) fail('JSON metadata bound');
        if (value === null || typeof value === 'string' || typeof value === 'boolean') return value;
        if (typeof value === 'number') {if (!Number.isFinite(value)) fail('non-JSON Number'); return value;}
        if (!value || typeof value !== 'object') fail('non-JSON value');
        if (active.has(value)) fail('cyclic JSON metadata');
        const proto = prototype(value), array = Array.isArray(value);
        if (proto !== (array ? arrayPrototype : objectPrototype) && proto !== null) fail('foreign JSON prototype');
        active.add(value); const result = array ? [] : {};
        for (const key of keys(value)) {
            const d = descriptor(value, key);
            if (typeof key !== 'string' || !d || !own(d, 'value')) fail('JSON accessor or symbol');
            if (array && key === 'length') continue;
            if (!d.enumerable || array && (!Number.isSafeInteger(Number(key)) || Number(key) < 0 || String(Number(key)) !== key)) fail('non-JSON own property');
            define(result, key, {value: copy(d.value, depth + 1), enumerable: true, configurable: true, writable: true});
        }
        if (array) {
            const length = descriptor(value, 'length');
            if (!length || !own(length, 'value') || length.value !== result.length || keys(result).length !== result.length + 1) fail('sparse JSON array');
        }
        active.delete(value); return result;
    };
    return copy(root, 0);
}
const exactKeys = (value, required, optional = []) => {
    if (!value || typeof value !== 'object' || Array.isArray(value)) fail('record required');
    const names = keys(value);
    if (required.some(key => !own(value, key)) || names.some(key => !required.includes(key) && !optional.includes(key))) fail('record fields');
};
const natural = (value, limit) => Number.isSafeInteger(value) && value >= 0 && !same(value, -0) && value <= limit;
const booleans = (value, names) => {for (const name of names) if (typeof value[name] !== 'boolean') fail('descriptor flags');};
function decodePayload (payload, remaining) {
    exactKeys(payload, ['encoding', 'byteLength', 'data']);
    if (payload.encoding !== 'base64' || !natural(payload.byteLength, remaining) || typeof payload.data !== 'string' ||
        payload.data.length !== Math.ceil(payload.byteLength / 3) * 4) fail('payload encoding/size');
    const octets = [];
    for (let i = 0; i < payload.data.length; i += 4) {
        const chars = [payload.data[i], payload.data[i + 1], payload.data[i + 2], payload.data[i + 3]];
        const a = alphabet.indexOf(chars[0]), b = alphabet.indexOf(chars[1]);
        const c = chars[2] === '=' ? 0 : alphabet.indexOf(chars[2]);
        const d = chars[3] === '=' ? 0 : alphabet.indexOf(chars[3]);
        if (a < 0 || b < 0 || c < 0 || d < 0 || chars[2] === '=' && chars[3] !== '=' ||
            (chars[2] === '=' || chars[3] === '=') && i + 4 !== payload.data.length ||
            chars[2] === '=' && (b & 15) !== 0 || chars[3] === '=' && chars[2] !== '=' && (c & 3) !== 0) fail('noncanonical base64');
        octets[octets.length] = (a << 2) | (b >>> 4);
        if (chars[2] !== '=') octets[octets.length] = ((b & 15) << 4) | (c >>> 2);
        if (chars[3] !== '=') octets[octets.length] = ((c & 3) << 6) | d;
    }
    if (octets.length !== payload.byteLength) fail('decoded payload size');
    return octets;
}

/** Expand v1/v2 parsed JSON into the exact v1 data representation. Payload budget
 * is representation memory only, never a source/SDK trust or compatibility flag.
 * Logical original graph limits cannot be raised by an option or descriptor run.
 */
export function expandConversionObservationGraph (input, options = {}) {
    const selected = copyJSONData(options); exactKeys(selected, [], ['maxPayloadBytes']);
    const maxPayloadBytes = own(selected, 'maxPayloadBytes') ? selected.maxPayloadBytes : 16 * 1024 * 1024;
    if (!natural(maxPayloadBytes, 64 * 1024 * 1024)) fail('payload budget');
    const graph = copyJSONData(input);
    exactKeys(graph, ['schema', 'root', 'nodes']);
    const version2 = graph.schema === 'brickwright/conversion-observation-graph/v2';
    if (!version2 && graph.schema !== 'brickwright/conversion-observation-graph/v1') fail('schema');
    if (!Array.isArray(graph.nodes) || graph.nodes.length > MAX_NODES) fail('node bound');
    let entries = 0, payloadBytes = 0;
    const entry = count => {entries += count; if (entries > MAX_ENTRIES) fail('logical entry bound');};
    const value = item => {
        if (item === null || ['string', 'boolean'].includes(typeof item) || typeof item === 'number' && Number.isFinite(item)) return;
        if (!item || typeof item !== 'object' || Array.isArray(item)) fail('encoded value');
        if (own(item, 'ref')) {exactKeys(item, ['ref']); if (!natural(item.ref, graph.nodes.length - 1)) fail('reference'); return;}
        if (item.kind === 'undefined') exactKeys(item, ['kind']);
        else if (item.kind === 'number') {exactKeys(item, ['kind', 'value', 'negativeZero']); if (!['NaN', 'Infinity', '-Infinity', '0'].includes(item.value) || typeof item.negativeZero !== 'boolean' || (item.value === '0') !== item.negativeZero) fail('special Number');}
        else if (item.kind === 'bigint') {exactKeys(item, ['kind', 'value']); if (typeof item.value !== 'string' || item.value === '-0' || !/^-?(?:0|[1-9][0-9]*)$/.test(item.value)) fail('BigInt');}
        else if (item.kind === 'symbol') {exactKeys(item, ['kind', 'identity'], ['description']); if (!natural(item.identity, MAX_ENTRIES) || own(item, 'description') && typeof item.description !== 'string') fail('symbol');}
        else fail('encoded value kind');
    };
    value(graph.root);
    for (let id = 0; id < graph.nodes.length; id++) {
        const node = graph.nodes[id];
        if (!node || node.id !== id || !['object', 'array', 'map', 'set', 'bytes', 'callable'].includes(node.kind) || !Array.isArray(node.fields)) fail('node');
        const required = ['id', 'kind', 'fields'];
        if (node.kind === 'callable') required.push('implementation'); else required.push('prototype');
        if (node.kind === 'map' || node.kind === 'set') required.push('entries');
        if (node.kind === 'bytes') required.push('byteLength', version2 ? 'bytePayload' : 'bytes');
        exactKeys(node, required);
        if (node.kind === 'callable') {if (node.implementation !== 'unobserved' || node.fields.length) fail('callable observation');}
        else if (!['null', 'Object', 'Array', 'other-unobserved'].includes(node.prototype)) fail('prototype label');
        if (node.kind === 'bytes') {
            if (!natural(node.byteLength, maxPayloadBytes - payloadBytes)) fail('payload aggregate bound');
            if (version2) {node.bytes = decodePayload(node.bytePayload, maxPayloadBytes - payloadBytes); delete node.bytePayload;}
            if (!Array.isArray(node.bytes) || node.bytes.length !== node.byteLength || node.bytes.some(octet => !natural(octet, 255))) fail('byte payload');
            payloadBytes += node.byteLength;
        }
        const fields = [], names = new Set();
        const append = field => {
            entry(1); exactKeys(field, ['key', 'enumerable', 'configurable'], own(field, 'value') ? ['writable', 'value'] : ['kind', 'implementation', 'get', 'set']);
            booleans(field, ['enumerable', 'configurable']);
            if (typeof field.key !== 'string' && (!field.key || field.key.kind !== 'symbol')) fail('own key');
            value(field.key); const name = typeof field.key === 'string' ? 'string:' + field.key : 'symbol:' + field.key.identity;
            if (names.has(name)) fail('duplicate own key'); names.add(name);
            if (own(field, 'value')) {if (!own(field, 'writable')) fail('missing writable'); booleans(field, ['writable']); value(field.value);}
            else {if (field.kind !== 'accessor' || field.implementation !== 'unobserved') fail('accessor'); booleans(field, ['get', 'set']);}
            fields[fields.length] = field;
        };
        for (const field of node.fields) {
            if (version2 && node.kind === 'bytes' && field?.kind === 'byte-index-descriptor-run') {
                exactKeys(field, ['kind', 'firstIndex', 'count', 'attributes']); exactKeys(field.attributes, ['enumerable', 'configurable', 'writable']); booleans(field.attributes, ['enumerable', 'configurable', 'writable']);
                if (!natural(field.firstIndex, node.byteLength) || !natural(field.count, MAX_ENTRIES) || field.count < 2 || field.firstIndex + field.count > node.byteLength || entries + field.count > MAX_ENTRIES) fail('descriptor run bounds');
                for (let index = field.firstIndex; index < field.firstIndex + field.count; index++) append({key: String(index), ...field.attributes, value: node.bytes[index]});
            } else append(field);
        }
        node.fields = fields;
        if (node.kind === 'map' || node.kind === 'set') {
            if (!Array.isArray(node.entries)) fail('collection entries');
            for (const item of node.entries) {entry(1); if (node.kind === 'map') {if (!Array.isArray(item) || item.length !== 2) fail('map entry'); value(item[0]); value(item[1]);} else value(item);}
        }
    }
    graph.schema = 'brickwright/conversion-observation-graph/v1'; return graph;
}
