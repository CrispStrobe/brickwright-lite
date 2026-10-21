import {createPublicKey, createHash, randomBytes, publicEncrypt, createCipheriv, constants} from 'node:crypto';
import {gzipSync} from 'node:zlib';

const FILE_LIMIT = 8 * 1024 * 1024;
const TOTAL_LIMIT = 64 * 1024 * 1024;
const FILE_COUNT_LIMIT = 256;
const HEADER_LIMIT = 4096;
const MAGIC = Buffer.from('BWPAE001', 'ascii');
const ALGORITHM = 'RSA-OAEP-SHA256+A256GCM+GZIP';
const typedArrayPrototype = Object.getPrototypeOf(Uint8Array.prototype);
const byteLength = Object.getOwnPropertyDescriptor(typedArrayPrototype, 'byteLength').get;
const backingBuffer = Object.getOwnPropertyDescriptor(typedArrayPrototype, 'buffer').get;
const arrayBufferLength = Object.getOwnPropertyDescriptor(ArrayBuffer.prototype, 'byteLength').get;
const typedArrayName = Object.getOwnPropertyDescriptor(typedArrayPrototype, Symbol.toStringTag).get;
const copyBytes = Uint8Array.prototype.set;

function ownRecord(value, names) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) throw new TypeError('Envelope record required');
    const fields = Object.getOwnPropertyDescriptors(value), keys = Reflect.ownKeys(fields);
    if (keys.length !== names.length || keys.some(key => !names.includes(key)) ||
        keys.some(key => !Object.hasOwn(fields[key], 'value'))) throw new TypeError('Envelope record fields differ');
    return Object.fromEntries(names.map(name => [name, fields[name].value]));
}

function inputSize(data) {
    if (!ArrayBuffer.isView(data) || Reflect.apply(typedArrayName, data, []) !== 'Uint8Array') {
        throw new TypeError('Envelope file data must be bytes');
    }
    // The native ArrayBuffer getter rejects SharedArrayBuffer: concurrent
    // mutation cannot race our bounded, synchronous private byte snapshot.
    Reflect.apply(arrayBufferLength, Reflect.apply(backingBuffer, data, []), []);
    return Reflect.apply(byteLength, data, []);
}

function fileName(name) {
    if (typeof name !== 'string' || name.length < 1 || name.length > 1024 ||
        !/^[A-Za-z0-9._/-]+$/.test(name)) throw new TypeError('Envelope file name is invalid');
    const parts = name.split('/');
    if (parts.some(part => !part || part === '.' || part === '..' || part.endsWith('.') ||
        /^(?:CON|PRN|AUX|NUL|COM[1-9]|LPT[1-9])(?:\..*)?$/i.test(part))) {
        throw new TypeError('Envelope file path is invalid');
    }
    return name;
}

/** Seal caller-supplied byte files; this API never opens paths or accepts a private key. */
export function sealEnvelope(options) {
    const {recipientPem, contextJson, files} = ownRecord(options, ['recipientPem', 'contextJson', 'files']);
    if (typeof recipientPem !== 'string' || Buffer.byteLength(recipientPem, 'utf8') > 16384 ||
        !/^-----BEGIN PUBLIC KEY-----\r?\n[A-Za-z0-9+/=\r\n]+\r?\n-----END PUBLIC KEY-----$/.test(recipientPem.trim())) {
        throw new TypeError('Recipient must be an SPKI public PEM');
    }
    const recipient = createPublicKey({key: recipientPem, format: 'pem', type: 'spki'});
    if (recipient.asymmetricKeyType !== 'rsa' || !Number.isInteger(recipient.asymmetricKeyDetails?.modulusLength) ||
        recipient.asymmetricKeyDetails.modulusLength < 3072 || recipient.asymmetricKeyDetails.modulusLength > 8192) {
        throw new TypeError('Recipient RSA modulus must be between 3072 and 8192 bits');
    }
    if (typeof contextJson !== 'string' || Buffer.byteLength(contextJson, 'utf8') > FILE_LIMIT) {
        throw new TypeError('Envelope context must be a bounded primitive JSON string');
    }
    JSON.parse(contextJson);
    const quotedContext = JSON.stringify(contextJson);
    if (!Array.isArray(files)) throw new TypeError('Envelope files must be an array');
    const descriptors = Object.getOwnPropertyDescriptors(files), fileKeys = Reflect.ownKeys(descriptors);
    const count = descriptors.length?.value;
    if (!Number.isInteger(count) || count < 0 || count > FILE_COUNT_LIMIT || fileKeys.length !== count + 1 ||
        fileKeys.some(key => key !== 'length' && !/^(0|[1-9][0-9]*)$/.test(key))) {
        throw new TypeError('Envelope file array differs');
    }
    const pending = [], names = new Set();
    let totalInput = 0;
    // Exact UTF-8 serialized size, including escaped context, names, base64,
    // hashes, decimal counts, commas and all envelope syntax, before base64.
    let jsonBytes = Buffer.byteLength('{"version":1,"contextJson":' + quotedContext + ',"files":[]}', 'utf8');
    for (let index = 0; index < count; index++) {
        const descriptor = descriptors[String(index)];
        if (!descriptor || !Object.hasOwn(descriptor, 'value')) throw new TypeError('Envelope file array is sparse or accessor based');
        const {name: rawName, data} = ownRecord(descriptor.value, ['name', 'data']);
        const name = fileName(rawName), folded = name.toLowerCase();
        if (names.has(folded)) throw new TypeError('Envelope file names collide');
        names.add(folded);
        const bytes = inputSize(data);
        if (bytes > FILE_LIMIT || totalInput + bytes > TOTAL_LIMIT) throw new RangeError('Envelope input byte limit exceeded');
        totalInput += bytes;
        const rowBytes = Buffer.byteLength(JSON.stringify({name, bytes, sha256: '0'.repeat(64), base64: ''}), 'utf8') + 4 * Math.ceil(bytes / 3);
        jsonBytes += rowBytes + (index ? 1 : 0);
        if (jsonBytes > TOTAL_LIMIT) throw new RangeError('Envelope decoded JSON limit exceeded');
        pending.push({name, data, bytes});
    }
    if (jsonBytes > TOTAL_LIMIT) throw new RangeError('Envelope decoded JSON limit exceeded');
    const records = [];
    for (const file of pending) {
        if (inputSize(file.data) !== file.bytes) throw new TypeError('Envelope byte input changed');
        const snapshot = Buffer.alloc(file.bytes);
        Reflect.apply(copyBytes, snapshot, [file.data]);
        records.push({name: file.name, bytes: snapshot.length,
            sha256: createHash('sha256').update(snapshot).digest('hex'), base64: snapshot.toString('base64')});
    }
    const plaintext = Buffer.from(JSON.stringify({version: 1, contextJson, files: records}), 'utf8');
    if (plaintext.length !== jsonBytes || plaintext.length > TOTAL_LIMIT) throw new RangeError('Envelope serialization size differs');
    const key = randomBytes(32);
    try {
        const iv = randomBytes(12);
        const wrapped = publicEncrypt({key: recipient, oaepHash: 'sha256', padding: constants.RSA_PKCS1_OAEP_PADDING}, key);
        const header = Buffer.from(JSON.stringify({alg: ALGORITHM,
            keyFingerprint: createHash('sha256').update(recipient.export({format: 'der', type: 'spki'})).digest('hex'),
            iv: iv.toString('base64'), wrappedKey: wrapped.toString('base64')}), 'utf8');
        if (header.length > HEADER_LIMIT) throw new RangeError('Envelope public header limit exceeded');
        const length = Buffer.alloc(4); length.writeUInt32BE(header.length);
        const aad = Buffer.concat([MAGIC, length, header]);
        const payloadLimit = FILE_LIMIT - aad.length - 16;
        const compressed = gzipSync(plaintext, {level: 6, maxOutputLength: payloadLimit});
        if (compressed.length > payloadLimit) throw new RangeError('Envelope ciphertext limit exceeded');
        const cipher = createCipheriv('aes-256-gcm', key, iv, {authTagLength: 16});
        cipher.setAAD(aad);
        const encrypted = Buffer.concat([cipher.update(compressed), cipher.final()]);
        const sealed = Buffer.concat([aad, encrypted, cipher.getAuthTag()]);
        if (sealed.length > FILE_LIMIT) throw new RangeError('Envelope ciphertext limit exceeded');
        return sealed;
    } finally {
        key.fill(0);
    }
}
