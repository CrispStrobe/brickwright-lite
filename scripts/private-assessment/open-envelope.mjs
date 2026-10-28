import {createPrivateKey, createPublicKey, createHash, privateDecrypt, createDecipheriv, constants} from 'node:crypto';
import {gunzipSync} from 'node:zlib';

// This receiver deliberately shares no implementation imports with the sealer.
const WIRE_LIMIT = 8 * 1024 * 1024;
const JSON_LIMIT = 64 * 1024 * 1024;
const HEADER_LIMIT = 4096;
const FILE_COUNT_LIMIT = 256;
const ALGORITHM = 'RSA-OAEP-SHA256+A256GCM+GZIP';
const typedArrayPrototype = Object.getPrototypeOf(Uint8Array.prototype);
const nativeByteLength = Object.getOwnPropertyDescriptor(typedArrayPrototype, 'byteLength').get;
const nativeBuffer = Object.getOwnPropertyDescriptor(typedArrayPrototype, 'buffer').get;
const nativeArrayBufferLength = Object.getOwnPropertyDescriptor(ArrayBuffer.prototype, 'byteLength').get;
const nativeTag = Object.getOwnPropertyDescriptor(typedArrayPrototype, Symbol.toStringTag).get;
const nativeCopy = Uint8Array.prototype.set;

function record(value, fields) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) throw new TypeError('Envelope record required');
    const descriptors = Object.getOwnPropertyDescriptors(value), keys = Reflect.ownKeys(descriptors);
    if (keys.length !== fields.length || keys.some(key => !fields.includes(key)) ||
        keys.some(key => !Object.hasOwn(descriptors[key], 'value'))) throw new TypeError('Envelope record fields differ');
    return Object.fromEntries(fields.map(key => [key, descriptors[key].value]));
}
function bytesSnapshot(value) {
    if (!ArrayBuffer.isView(value) || Reflect.apply(nativeTag, value, []) !== 'Uint8Array') {
        throw new TypeError('Envelope must be bytes');
    }
    Reflect.apply(nativeArrayBufferLength, Reflect.apply(nativeBuffer, value, []), []);
    const length = Reflect.apply(nativeByteLength, value, []);
    if (length < 29 || length > WIRE_LIMIT) throw new RangeError('Envelope wire byte limit exceeded');
    const copy = Buffer.alloc(length);
    Reflect.apply(nativeCopy, copy, [value]);
    return copy;
}
function canonicalJson(bytes) {
    const text = bytes.toString('utf8');
    if (!Buffer.from(text, 'utf8').equals(bytes)) throw new TypeError('Envelope JSON is not UTF-8');
    const value = JSON.parse(text);
    if (JSON.stringify(value) !== text) throw new TypeError('Envelope JSON is not canonical');
    return value;
}
function base64(value, expectedLength) {
    if (typeof value !== 'string' || value.length > 4 * Math.ceil(WIRE_LIMIT / 3) ||
        value.length % 4 !== 0 || !/^[A-Za-z0-9+/]*={0,2}$/.test(value)) {
        throw new TypeError('Envelope base64 is invalid');
    }
    const bytes = Buffer.from(value, 'base64');
    if (bytes.toString('base64') !== value || (expectedLength !== undefined && bytes.length !== expectedLength)) {
        throw new TypeError('Envelope base64 length differs');
    }
    return bytes;
}
function logicalName(value) {
    if (typeof value !== 'string' || value.length < 1 || value.length > 1024 || !/^[A-Za-z0-9._/-]+$/.test(value) ||
        value.split('/').some(part => !part || part === '.' || part === '..' || part.endsWith('.') ||
            /^(?:CON|PRN|AUX|NUL|COM[1-9]|LPT[1-9])(?:\..*)?$/i.test(part))) {
        throw new TypeError('Envelope file name is invalid');
    }
    return value;
}

/** Authenticate and verify byte records. Never extracts files or logs plaintext. */
export function openEnvelope(options) {
    const {identityPem, envelope} = record(options, ['identityPem', 'envelope']);
    if (typeof identityPem !== 'string' || Buffer.byteLength(identityPem, 'utf8') > 16384 ||
        !/^-----BEGIN ((?:RSA )?PRIVATE KEY)-----\r?\n[A-Za-z0-9+/=\r\n]+\r?\n-----END \1-----$/.test(identityPem.trim())) {
        throw new TypeError('Recipient identity must be an unencrypted private PEM');
    }
    const identity = createPrivateKey({key: identityPem, format: 'pem'});
    const bits = identity.asymmetricKeyDetails?.modulusLength;
    if (identity.asymmetricKeyType !== 'rsa' || !Number.isInteger(bits) || bits < 3072 || bits > 8192) {
        throw new TypeError('Recipient RSA modulus must be between 3072 and 8192 bits');
    }
    const wire = bytesSnapshot(envelope);
    if (!wire.subarray(0, 8).equals(Buffer.from('BWPAE001', 'ascii'))) throw new TypeError('Envelope version is unsupported');
    const headerBytes = wire.readUInt32BE(8), end = 12 + headerBytes;
    if (headerBytes < 1 || headerBytes > HEADER_LIMIT || end + 16 >= wire.length) throw new RangeError('Envelope header bounds differ');
    const rawHeader = canonicalJson(wire.subarray(12, end));
    const header = record(rawHeader, ['alg', 'keyFingerprint', 'iv', 'wrappedKey']);
    if (Object.keys(rawHeader).join(',') !== 'alg,keyFingerprint,iv,wrappedKey' || header.alg !== ALGORITHM ||
        typeof header.keyFingerprint !== 'string' || !/^[0-9a-f]{64}$/.test(header.keyFingerprint)) {
        throw new TypeError('Envelope public header differs');
    }
    const fingerprint = createHash('sha256').update(createPublicKey(identity).export({type: 'spki', format: 'der'})).digest('hex');
    if (header.keyFingerprint !== fingerprint) throw new TypeError('Envelope recipient fingerprint differs');
    const iv = base64(header.iv, 12), wrapped = base64(header.wrappedKey, bits / 8);
    const key = privateDecrypt({key: identity, padding: constants.RSA_PKCS1_OAEP_PADDING, oaepHash: 'sha256'}, wrapped);
    try {
        if (key.length !== 32) throw new TypeError('Envelope AES key length differs');
        const decipher = createDecipheriv('aes-256-gcm', key, iv, {authTagLength: 16});
        decipher.setAAD(wire.subarray(0, end));
        decipher.setAuthTag(wire.subarray(-16));
        // No plaintext is parsed or decompressed until final() authenticates.
        const pending = decipher.update(wire.subarray(end, -16));
        const compressed = Buffer.concat([pending, decipher.final()]);
        const plaintext = gunzipSync(compressed, {maxOutputLength: JSON_LIMIT});
        if (plaintext.length > JSON_LIMIT) throw new RangeError('Envelope decoded JSON limit exceeded');
        const raw = canonicalJson(plaintext);
        const {version, contextJson, files} = record(raw, ['version', 'contextJson', 'files']);
        if (Object.keys(raw).join(',') !== 'version,contextJson,files' || version !== 1 || typeof contextJson !== 'string' ||
            Buffer.byteLength(contextJson, 'utf8') > WIRE_LIMIT || !Array.isArray(files) || files.length > FILE_COUNT_LIMIT) {
            throw new TypeError('Envelope private schema differs');
        }
        JSON.parse(contextJson);
        const result = [], names = new Set();
        let aggregateBytes = 0;
        for (let index = 0; index < files.length; index++) {
            const rawFile = files[index];
            const file = record(rawFile, ['name', 'bytes', 'sha256', 'base64']);
            if (Object.keys(rawFile).join(',') !== 'name,bytes,sha256,base64') throw new TypeError('Envelope file schema differs');
            const name = logicalName(file.name), folded = name.toLowerCase();
            if (names.has(folded)) throw new TypeError('Envelope file names collide');
            names.add(folded);
            if (!Number.isInteger(file.bytes) || file.bytes < 0 || file.bytes > WIRE_LIMIT ||
                aggregateBytes + file.bytes > JSON_LIMIT || typeof file.sha256 !== 'string' || !/^[0-9a-f]{64}$/.test(file.sha256)) {
                throw new RangeError('Envelope file bounds or hash differ');
            }
            aggregateBytes += file.bytes;
            // Check declared length against canonical base64 size before allocation.
            if (typeof file.base64 !== 'string' || file.base64.length !== 4 * Math.ceil(file.bytes / 3)) {
                throw new TypeError('Envelope declared byte length differs');
            }
            const data = base64(file.base64, file.bytes);
            if (createHash('sha256').update(data).digest('hex') !== file.sha256) throw new TypeError('Envelope file hash differs');
            result.push({name, bytes: file.bytes, sha256: file.sha256, data});
        }
        return {contextJson, files: result};
    } finally {
        key.fill(0);
    }
}
