import test from 'node:test';
import assert from 'node:assert/strict';
import {generateKeyPairSync, createPublicKey, createHash, randomBytes, publicEncrypt, createCipheriv, constants} from 'node:crypto';
import {gzipSync} from 'node:zlib';
import {openEnvelope} from '../scripts/private-assessment/open-envelope.mjs';

// Independent fixture sealer. No producer code or producer constants imported.
const identity = generateKeyPairSync('rsa', {modulusLength: 3072});
const identityPem = identity.privateKey.export({type: 'pkcs8', format: 'pem'});
const sha = bytes => createHash('sha256').update(bytes).digest('hex');
const LIMIT = 8 * 1024 * 1024;
const fingerprint = sha(identity.publicKey.export({type: 'spki', format: 'der'}));
const privateRecord = (name = 'input.bin', data = Buffer.from([0, 255, 13])) => ({name, bytes: data.length,
    sha256: sha(data), base64: data.toString('base64')});
const privateValue = () => ({version: 1, contextJson: ' {"privateId":"SECRET-417"} \n', files: [privateRecord()]});
function fixture(value = privateValue(), alterations = {}) {
    const key = randomBytes(32);
    try {
        const iv = randomBytes(12);
        const wrappedKey = publicEncrypt({key: identity.publicKey, padding: constants.RSA_PKCS1_OAEP_PADDING, oaepHash: 'sha256'}, key);
        const header = {alg: 'RSA-OAEP-SHA256+A256GCM+GZIP', keyFingerprint: fingerprint,
            iv: iv.toString('base64'), wrappedKey: wrappedKey.toString('base64'), ...alterations.header};
        const headerBytes = alterations.headerBytes ?? Buffer.from(JSON.stringify(header));
        const length = Buffer.alloc(4); length.writeUInt32BE(headerBytes.length);
        const prefix = Buffer.concat([Buffer.from('BWPAE001'), length, headerBytes]);
        const plaintext = alterations.plaintext ?? Buffer.from(JSON.stringify(value));
        const gzip = alterations.compressed ?? gzipSync(plaintext);
        const cipher = createCipheriv('aes-256-gcm', key, iv, {authTagLength: 16});
        cipher.setAAD(prefix);
        const ciphertext = Buffer.concat([cipher.update(gzip), cipher.final()]);
        return Buffer.concat([prefix, ciphertext, cipher.getAuthTag()]);
    } finally { key.fill(0); }
}
const open = envelope => openEnvelope({identityPem, envelope});

test('independent fixture returns exact context and verified byte records without modifying input', () => {
    const value = privateValue();
    value.files.push(privateRecord('empty', Buffer.alloc(0)), privateRecord('sub/all.bin', Buffer.from(Array.from({length: 256}, (_, i) => i))));
    const sealed = fixture(value), before = Buffer.from(sealed);
    const actual = open(sealed);
    assert.deepEqual(Object.keys(actual), ['contextJson', 'files']);
    assert.equal(actual.contextJson, value.contextJson);
    assert.deepEqual(actual.files.map(file => file.name), value.files.map(file => file.name));
    for (let i = 0; i < value.files.length; i++) {
        assert.deepEqual(Object.keys(actual.files[i]), ['name', 'bytes', 'sha256', 'data']);
        assert(Buffer.isBuffer(actual.files[i].data));
        assert.deepEqual(actual.files[i].data, Buffer.from(value.files[i].base64, 'base64'));
        assert.equal(actual.files[i].bytes, value.files[i].bytes);
        assert.equal(actual.files[i].sha256, value.files[i].sha256);
    }
    assert.deepEqual(sealed, before);
    actual.files[0].data.fill(99);
    assert.deepEqual(open(sealed).files[0].data, Buffer.from([0, 255, 13]));
    assert.equal(open(fixture({version: 1, contextJson: 'null', files: []})).contextJson, 'null');
    const backing = new Uint8Array(sealed.length + 2); backing.set(sealed, 1);
    assert.deepEqual(open(backing.subarray(1, -1)).files[1].data, Buffer.alloc(0));
    const pkcs1 = identity.privateKey.export({type: 'pkcs1', format: 'pem'});
    assert.equal(openEnvelope({identityPem: pkcs1, envelope: sealed}).files.length, 3);
});

test('strict authenticated header rejects unknown fields, wrong recipients, base64 aliases and malformed framing', () => {
    const sealed = fixture(), headerLength = sealed.readUInt32BE(8), end = 12 + headerLength;
    for (const index of [0, 8, 20, end, sealed.length - 1]) {
        const changed = Buffer.from(sealed); changed[index] ^= 1; assert.throws(() => open(changed));
    }
    for (const envelope of [sealed.subarray(0, -1), Buffer.concat([sealed, Buffer.from([0])]), Buffer.alloc(28), Buffer.alloc(LIMIT + 1)]) {
        assert.throws(() => open(envelope));
    }
    for (const header of [{extra: 'inputId'}, {alg: 'AES'}, {keyFingerprint: '0'.repeat(64)},
        {keyFingerprint: fingerprint.toUpperCase()}, {iv: 'AAAAAAAAAAAAAAAA='}, {iv: 'AAAAAAAAAAAAAAAA\n'},
        {iv: 'AAAAAAAAAAAAAAA='}, {wrappedKey: 'AA=='}]) {
        assert.throws(() => open(fixture(undefined, {header})));
    }
    const raw = sealed.subarray(12, end).toString('utf8');
    for (const headerBytes of [Buffer.from(' ' + raw), Buffer.from(raw.replace('{', '{"alg":"ignored",')),
        Buffer.from('{"__proto__":{},"alg":"bad"}'), Buffer.alloc(4097, 32), Buffer.from([255])]) {
        assert.throws(() => open(fixture(undefined, {headerBytes})));
    }
});

test('authentication finishes before gzip and bounded decoded JSON refuses oversized plaintext', () => {
    const invalidGzip = fixture(undefined, {compressed: Buffer.from('not gzip')});
    assert.throws(() => open(invalidGzip));
    const tampered = Buffer.from(invalidGzip); tampered[tampered.length - 1] ^= 1;
    assert.throws(() => open(tampered), error => /authenticat|auth tag|decrypt/i.test(error.message));
    // Very small authenticated ciphertext can still expand past the decoded cap.
    const bomb = fixture(undefined, {plaintext: Buffer.alloc(64 * 1024 * 1024 + 1, 32)});
    assert(bomb.length < LIMIT); assert.throws(() => open(bomb));
});

test('private JSON schemas, context, canonical encoding and per-file bounds are independently checked', () => {
    const base = privateValue();
    for (const value of [{...base, extra: 1}, {...base, version: 2}, {...base, contextJson: {}}, {...base, contextJson: 'invalid'},
        {...base, contextJson: ' '.repeat(LIMIT + 1)}, {...base, files: {}},
        {...base, files: Array.from({length: 257}, (_, i) => privateRecord(String(i), Buffer.alloc(0)))}]) {
        assert.throws(() => open(fixture(value)));
    }
    for (const file of [{...privateRecord(), extra: true}, {...privateRecord(), bytes: -1}, {...privateRecord(), bytes: 1.5},
        {...privateRecord(), bytes: LIMIT + 1}, {...privateRecord(), bytes: 2}, {...privateRecord(), sha256: '0'.repeat(64)},
        {...privateRecord(), sha256: 'AB'.repeat(32)}, {...privateRecord(), base64: 'AP8N\n'},
        {...privateRecord(), base64: 'AP8'}, {...privateRecord(), base64: 'AP8N='},
        {name: 'x', bytes: 1, sha256: sha(Buffer.from([0])), base64: 'AB=='}]) {
        assert.throws(() => open(fixture({...base, files: [file]})));
    }
    for (const plaintext of [Buffer.from(' ' + JSON.stringify(base)), Buffer.from('{"version":0,' + JSON.stringify(base).slice(1)),
        Buffer.from([255]), Buffer.from('{"version":1,"contextJson":"{}","files":[null]}')]) {
        assert.throws(() => open(fixture(undefined, {plaintext})));
    }
});

test('private path, duplicate and symlink schema probes never extract or accept filesystem metadata', () => {
    const base = privateValue();
    for (const name of ['', '/abs', '../x', 'x/../y', 'x//y', 'x/', 'C:/x', 'x\\y', 'x\0y',
        'NUL.txt', 'x/COM9', 'x.', 'snow-☃', 'x'.repeat(1025)]) {
        assert.throws(() => open(fixture({...base, files: [privateRecord(name)]})));
    }
    for (const names of [['a', 'a'], ['A/item', 'a/ITEM']]) {
        assert.throws(() => open(fixture({...base, files: names.map(name => privateRecord(name))})), /collide/);
    }
    for (const file of [{...privateRecord(), symlink: 'target'}, {...privateRecord(), path: '/secret'},
        {name: 'x', bytes: 0, sha256: sha(Buffer.alloc(0)), base64: '', type: 'directory'}]) {
        assert.throws(() => open(fixture({...base, files: [file]})), /fields/);
    }
});

test('strict identity and byte input APIs preserve exact reflection errors and allow no cap overrides', () => {
    const sealed = fixture();
    for (const identityPem of [identity.publicKey.export({type: 'spki', format: 'pem'}), 'not a key', {}, null]) {
        assert.throws(() => openEnvelope({identityPem, envelope: sealed}));
    }
    assert.throws(() => openEnvelope({identityPem, envelope: sealed, maxBytes: LIMIT * 100}), /fields/);
    for (const envelope of ['bytes', [], new Uint16Array(20), new DataView(new ArrayBuffer(40)),
        new Uint8Array(new SharedArrayBuffer(40)), new Proxy(new Uint8Array(40), {})]) {
        assert.throws(() => open(envelope));
    }
    let calls = 0;
    assert.throws(() => openEnvelope({identityPem, get envelope() { calls++; return sealed; }}));
    assert.equal(calls, 0);
    for (const reason of [Object.freeze(new Error('identity sentinel')), undefined, null, false, 0, -0, NaN]) {
        let caught = false;
        try { openEnvelope(new Proxy({}, {ownKeys() { throw reason; }})); }
        catch (error) { caught = true; assert(Object.is(error, reason)); }
        assert.equal(caught, true);
    }
});
