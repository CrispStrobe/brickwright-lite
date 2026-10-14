const encoder = new TextEncoder();
const decoder = new TextDecoder('utf-8', {fatal: true});

const encodeValue = value => {
    if (typeof value === 'bigint') return {$type: 'bigint', value: value.toString()};
    if (value instanceof Uint8Array) return {$type: 'u8', value: [...value]};
    if (value instanceof Uint16Array) return {$type: 'u16', value: [...value]};
    if (value instanceof Uint32Array) return {$type: 'u32', value: [...value]};
    if (value instanceof ArrayBuffer) return {$type: 'buffer', value: [...new Uint8Array(value)]};
    if (Array.isArray(value)) return value.map(encodeValue);
    if (value && typeof value === 'object') {
        if (Object.getPrototypeOf(value) !== Object.prototype && Object.getPrototypeOf(value) !== null) {
            throw new TypeError('session snapshots may contain only plain objects and supported binary arrays');
        }
        return {$type: 'object', value: Object.keys(value).sort()
            .map(key => [key, encodeValue(value[key])])};
    }
    if (value === undefined) return {$type: 'undefined'};
    if (typeof value === 'function' || typeof value === 'symbol' ||
        (typeof value === 'number' && !Number.isFinite(value))) {
        throw new TypeError('session snapshot contains an unsupported value');
    }
    return value;
};

const decodeValue = value => {
    if (Array.isArray(value)) return value.map(decodeValue);
    if (!value || typeof value !== 'object') return value;
    if (Object.hasOwn(value, '$type')) {
        if (value.$type === 'undefined' && Object.keys(value).length === 1) return undefined;
        if (!Array.isArray(value.value) && value.$type !== 'bigint') throw new TypeError('invalid snapshot tag');
        if (value.$type === 'bigint' && typeof value.value === 'string' && /^-?\d+$/.test(value.value)) {
            return BigInt(value.value);
        }
        if (value.$type === 'u8') return Uint8Array.from(value.value);
        if (value.$type === 'u16') return Uint16Array.from(value.value);
        if (value.$type === 'u32') return Uint32Array.from(value.value);
        if (value.$type === 'buffer') return Uint8Array.from(value.value).buffer;
        if (value.$type === 'object' && Array.isArray(value.value) &&
            value.value.every(entry => Array.isArray(entry) && entry.length === 2 && typeof entry[0] === 'string')) {
            return Object.fromEntries(value.value.map(([key, item]) => [key, decodeValue(item)]));
        }
        throw new TypeError('unknown snapshot tag');
    }
    throw new TypeError('untagged snapshot object');
};

export const DEBUG_SESSION_SNAPSHOT_CODEC = 'brickworks-structured-v1';
export const structuredSessionSnapshotCodec = Object.freeze({
    encode: snapshot => encoder.encode(JSON.stringify(encodeValue(snapshot))),
    decode: bytes => decodeValue(JSON.parse(decoder.decode(bytes)))
});

export default structuredSessionSnapshotCodec;
