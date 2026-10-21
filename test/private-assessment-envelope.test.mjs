import test from 'node:test';
import assert from 'node:assert/strict';
import {generateKeyPairSync, createPublicKey, createHash, privateDecrypt, createDecipheriv, randomBytes, constants} from 'node:crypto';
import {gunzipSync} from 'node:zlib';
import {sealEnvelope} from '../scripts/private-assessment/seal-envelope.mjs';

// Finite test-only key generation. No producer private-key API is used.
const recipient = generateKeyPairSync('rsa', {modulusLength: 3072});
const other = generateKeyPairSync('rsa', {modulusLength: 2048});
const pem = key => key.export({type: 'spki', format: 'pem'});
const recipientPem = pem(recipient.publicKey);
const options = (files = [], contextJson = '{}') => ({recipientPem, contextJson, files});
const sha = bytes => createHash('sha256').update(bytes).digest('hex');
const LIMIT = 8 * 1024 * 1024;
const ALG = 'RSA-OAEP-SHA256+A256GCM+GZIP';

// Independent bounded wire reader: intentionally imports no producer reader,
// constants, parsing, decryption or serialization helpers.
function readHeader(bytes) {
    assert(Buffer.isBuffer(bytes) && bytes.length <= LIMIT && bytes.length >= 28);
    assert.equal(bytes.subarray(0, 8).toString('ascii'), 'BWPAE001');
    const length = bytes.readUInt32BE(8);
    assert(length > 0 && length <= 4096 && 12 + length + 16 < bytes.length);
    const header = JSON.parse(bytes.subarray(12, 12 + length).toString('utf8'));
    assert.deepEqual(Object.keys(header), ['alg', 'keyFingerprint', 'iv', 'wrappedKey']);
    assert.equal(header.alg, ALG);
    assert.match(header.keyFingerprint, /^[0-9a-f]{64}$/);
    for (const name of ['iv', 'wrappedKey']) {
        assert.equal(typeof header[name], 'string');
        assert.equal(Buffer.from(header[name], 'base64').toString('base64'), header[name]);
    }
    assert.equal(Buffer.from(header.iv, 'base64').length, 12);
    return {header, end: 12 + length};
}
function decrypt(bytes, privateKey = recipient.privateKey) {
    const {header, end} = readHeader(bytes);
    const publicDer = createPublicKey(privateKey).export({type: 'spki', format: 'der'});
    assert.equal(header.keyFingerprint, sha(publicDer));
    const wrapped = Buffer.from(header.wrappedKey, 'base64');
    assert.equal(wrapped.length, privateKey.asymmetricKeyDetails.modulusLength / 8);
    const key = privateDecrypt({key: privateKey, oaepHash: 'sha256', padding: constants.RSA_PKCS1_OAEP_PADDING}, wrapped);
    try {
        assert.equal(key.length, 32);
        const cipher = createDecipheriv('aes-256-gcm', key, Buffer.from(header.iv, 'base64'), {authTagLength: 16});
        cipher.setAAD(bytes.subarray(0, end));
        cipher.setAuthTag(bytes.subarray(-16));
        const gzip = Buffer.concat([cipher.update(bytes.subarray(end, -16)), cipher.final()]);
        const plain = gunzipSync(gzip, {maxOutputLength: 64 * 1024 * 1024});
        const value = JSON.parse(plain.toString('utf8'));
        assert.deepEqual(Object.keys(value), ['version', 'contextJson', 'files']);
        assert.equal(value.version, 1);
        assert.equal(typeof value.contextJson, 'string');
        JSON.parse(value.contextJson);
        assert(Array.isArray(value.files) && value.files.length <= 256);
        const names = new Set();
        for (const file of value.files) {
            assert.deepEqual(Object.keys(file), ['name', 'bytes', 'sha256', 'base64']);
            assert.equal(typeof file.name, 'string');
            assert(!names.has(file.name.toLowerCase())); names.add(file.name.toLowerCase());
            assert(Number.isInteger(file.bytes) && file.bytes >= 0 && file.bytes <= LIMIT);
            const data = Buffer.from(file.base64, 'base64');
            assert.equal(data.toString('base64'), file.base64);
            assert.equal(data.length, file.bytes);
            assert.equal(sha(data), file.sha256);
        }
        return value;
    } finally { key.fill(0); }
}

test('independent reader recovers exact context and arbitrary byte files without cleartext metadata', () => {
    const data = Buffer.from(Array.from({length: 256}, (_, index) => index));
    const backing = new Uint8Array([99, 0, 255, 13, 88]);
    const context = ' { "privateInputId": "SECRET-CONTEXT-739" } \n';
    const files = [{name: 'private/SECRET-NAME-841.bin', data}, {name: 'empty', data: Buffer.alloc(0)},
        {name: 'view', data: backing.subarray(1, 4)}];
    const before = Buffer.from(data);
    const first = sealEnvelope(options(files, context)), second = sealEnvelope(options(files, context));
    assert(Buffer.isBuffer(first) && first.length <= LIMIT);
    assert.notDeepEqual(first, second);
    const value = decrypt(first);
    assert.deepEqual(decrypt(second), value);
    assert.equal(value.contextJson, context);
    assert.deepEqual(value.files.map(file => file.name), files.map(file => file.name));
    assert.deepEqual(Buffer.from(value.files[0].base64, 'base64'), before);
    assert.deepEqual(Buffer.from(value.files[2].base64, 'base64'), Buffer.from([0, 255, 13]));
    assert.deepEqual(data, before);
    const {header} = readHeader(first);
    const clear = JSON.stringify(header);
    assert(!clear.includes('SECRET-') && !clear.includes(sha(data)));
    assert(!first.includes(Buffer.from('SECRET-CONTEXT-739')));
    assert(!first.includes(Buffer.from('SECRET-NAME-841')));
    assert.equal(decrypt(sealEnvelope(options())).files.length, 0);
});

test('authenticated header, wrapped key, ciphertext and tag reject tampering and wrong recipients', () => {
    const sealed = sealEnvelope(options([{name: 'a', data: Buffer.from('payload')}]));
    const {header, end} = readHeader(sealed);
    for (const index of [0, 8, 20, end, sealed.length - 1]) {
        const changed = Buffer.from(sealed); changed[index] ^= 1;
        assert.throws(() => decrypt(changed));
    }
    assert.throws(() => decrypt(sealed.subarray(0, -1)));
    assert.throws(() => decrypt(Buffer.concat([sealed, Buffer.from([0])])));
    assert.throws(() => decrypt(sealed, other.privateKey));
    assert.throws(() => privateDecrypt({key: other.privateKey, oaepHash: 'sha256', padding: constants.RSA_PKCS1_OAEP_PADDING},
        Buffer.from(header.wrappedKey, 'base64')));
    for (const field of ['iv', 'wrappedKey']) {
        const value = Buffer.from(header[field], 'base64'); value[0] ^= 1;
        const replacement = Buffer.from(JSON.stringify({...header, [field]: value.toString('base64')}));
        const size = Buffer.alloc(4); size.writeUInt32BE(replacement.length);
        assert.throws(() => decrypt(Buffer.concat([sealed.subarray(0, 8), size, replacement, sealed.subarray(end)])));
    }
    const unknown = Buffer.from(JSON.stringify({...header, inputId: 'forbidden'}));
    const length = Buffer.alloc(4); length.writeUInt32BE(unknown.length);
    const forged = Buffer.concat([sealed.subarray(0, 8), length, unknown, sealed.subarray(end)]);
    assert.throws(() => decrypt(forged));
});

test('recipient format and fixed RSA modulus bounds cannot be overridden', () => {
    for (const recipientPem of [pem(other.publicKey), recipient.privateKey.export({type: 'pkcs8', format: 'pem'}),
        'not a key', recipient.publicKey.export({type: 'pkcs1', format: 'pem'}), {}, '']) {
        assert.throws(() => sealEnvelope({...options(), recipientPem}));
    }
    const n = Buffer.alloc(1025, 255); n[0] = 1;
    const oversized = createPublicKey({key: {kty: 'RSA', n: n.toString('base64url'), e: 'AQAB'}, format: 'jwk'});
    assert(oversized.asymmetricKeyDetails.modulusLength > 8192);
    assert.throws(() => sealEnvelope({...options(), recipientPem: pem(oversized)}), /modulus/);
    assert.throws(() => sealEnvelope({...options(), maxBytes: 128 * LIMIT}), /fields/);
});

test('logical paths, duplicate names and filesystem or symlink inputs are refused', () => {
    for (const name of ['', '/absolute', '../x', 'x/../y', './x', 'x//y', 'x/', 'C:/x', 'x\\y', 'x\0y',
        'CON', 'aux.txt', 'x/LPT1', 'x.', 'snow-☃', 'x'.repeat(1025)]) {
        assert.throws(() => sealEnvelope(options([{name, data: Buffer.alloc(0)}])));
    }
    for (const pair of [['same', 'same'], ['A/file', 'a/FILE']]) {
        assert.throws(() => sealEnvelope(options(pair.map(name => ({name, data: Buffer.alloc(0)})))), /collide/);
    }
    for (const file of [{name: 'a', path: 'file'}, {name: 'a', data: Buffer.alloc(0), symlink: true},
        {name: 'a', data: {pipe() { throw new Error('not called'); }}}]) {
        assert.throws(() => sealEnvelope(options([file])));
    }
});

test('fixed file, count, raw aggregate, serialized JSON and ciphertext bounds fail closed', () => {
    assert.throws(() => sealEnvelope(options([{name: 'large', data: Buffer.alloc(LIMIT + 1)}])), /limit/);
    assert.throws(() => sealEnvelope(options(Array.from({length: 257}, (_, i) => ({name: String(i), data: Buffer.alloc(0)})))));
    const chunk = Buffer.alloc(LIMIT);
    // Base64 plus metadata already exceeds 64 MiB with six 8 MiB files;
    // no snapshots or base64 strings should be allocated on this refusal.
    for (const count of [6, 9]) {
        assert.throws(() => sealEnvelope(options(Array.from({length: count}, (_, i) => ({name: String(i), data: chunk})))), /limit/);
    }
    assert.throws(() => sealEnvelope(options([], '"' + 'x'.repeat(LIMIT) + '"')), /bounded/);
    // Genuine incompressible input fits its raw file bound but cannot fit the
    // authenticated ciphertext leaf after JSON/base64/gzip and header overhead.
    assert.throws(() => sealEnvelope(options([{name: 'random', data: randomBytes(LIMIT)}])));
});

test('invalid records, accessors and non-byte or shared inputs never become file reads', () => {
    for (const contextJson of [null, {}, new String('{}'), 'bad JSON']) {
        assert.throws(() => sealEnvelope(options([], contextJson)));
    }
    for (const data of [new Uint16Array(2), new DataView(new ArrayBuffer(4)), new Uint8Array(new SharedArrayBuffer(4)),
        'bytes', [1, 2], new Proxy(new Uint8Array(2), {})]) {
        assert.throws(() => sealEnvelope(options([{name: 'a', data}])));
    }
    const sparse = new Array(1); assert.throws(() => sealEnvelope(options(sparse)));
    let calls = 0;
    const file = {name: 'a', get data() { calls++; return Buffer.alloc(0); }};
    assert.throws(() => sealEnvelope(options([file]))); assert.equal(calls, 0);
    const array = []; Object.defineProperty(array, '0', {get() { calls++; }, configurable: true});
    assert.throws(() => sealEnvelope(options(array))); assert.equal(calls, 0);
    const bytes = new Uint8Array(2); structuredClone(bytes, {transfer: [bytes.buffer]});
    assert.throws(() => sealEnvelope(options([{name: 'detached', data: bytes}])));
});

test('original reflection failures retain exact thrown identity including falsy reasons', () => {
    for (const reason of [Object.freeze(new Error('reflection sentinel')), undefined, null, false, 0, -0, NaN]) {
        let caught = false;
        try { sealEnvelope(new Proxy({}, {ownKeys() { throw reason; }})); }
        catch (error) { caught = true; assert(Object.is(error, reason)); }
        assert.equal(caught, true);
    }
});
