/**
 * The App Store Connect client, exercised without App Store Connect.
 *
 * The upload itself cannot be tested anywhere but against the real listing, so
 * everything that CAN be tested is: the token Apple accepts or rejects, the
 * states a write is allowed to touch, and the refusal to write at all in a dry
 * run. What is left untested is then a short, stated list rather than "all of
 * it".
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import {generateKeyPairSync, createPublicKey, verify} from 'node:crypto';
import {token, client, EDITABLE, PLATFORM} from '../scripts/appstore/asc-client.mjs';

const {privateKey, publicKey} = generateKeyPairSync('ec', {
    namedCurve: 'P-256',
    privateKeyEncoding: {type: 'pkcs8', format: 'pem'},
    publicKeyEncoding: {type: 'spki', format: 'pem'}
});

const parts = jwt => jwt.split('.');
const decode = seg => JSON.parse(Buffer.from(seg.replace(/-/g, '+').replace(/_/g, '/'), 'base64'));

test('the token is a real ES256 JWT that verifies against its own key', () => {
    const jwt = token({keyId: 'ABC123', issuerId: 'iss-1', privateKey, now: 1_000_000});
    const [h, c, s] = parts(jwt);
    assert.equal(parts(jwt).length, 3);
    assert.deepEqual(decode(h), {alg: 'ES256', kid: 'ABC123', typ: 'JWT'});
    assert.deepEqual(decode(c), {iss: 'iss-1', iat: 1_000_000, exp: 1_000_000 + 1200,
        aud: 'appstoreconnect-v1'});

    // THE SIGNATURE MUST BE RAW r||s, NOT DER. Apple rejects a DER signature
    // with an unhelpful message, and Node's default IS DER — so this asserts
    // the one detail most likely to be wrong and hardest to diagnose live.
    const sig = Buffer.from(s.replace(/-/g, '+').replace(/_/g, '/'), 'base64');
    assert.equal(sig.length, 64, `ES256 signatures are 64 bytes; got ${sig.length} (DER?)`);
    assert.ok(verify('sha256', Buffer.from(`${h}.${c}`), {
        key: createPublicKey(publicKey), dsaEncoding: 'ieee-p1363'
    }, sig), 'the signature does not verify');
});

test('Apple\'s 20-minute ceiling is respected', () => {
    const c = decode(parts(token({keyId: 'k', issuerId: 'i', privateKey, now: 0}))[1]);
    assert.ok(c.exp - c.iat <= 20 * 60, 'a token longer than 20 minutes is rejected as invalid');
});

test('missing credentials fail before a request is built, by name', () => {
    for (const missing of ['keyId', 'issuerId', 'privateKey']) {
        const args = {keyId: 'k', issuerId: 'i', privateKey};
        delete args[missing];
        assert.throws(() => token(args), new RegExp(missing),
            `a missing ${missing} must say so`);
    }
});

test('a live version is never writable — only editable states are', () => {
    assert.ok(!EDITABLE.includes('READY_FOR_SALE'), 'the live state must not be editable');
    assert.ok(!EDITABLE.includes('IN_REVIEW'), 'a version under review must not be edited');
    assert.ok(EDITABLE.includes('PREPARE_FOR_SUBMISSION'));
    // A rejected version is the one being fixed, so it IS editable.
    assert.ok(EDITABLE.includes('REJECTED') && EDITABLE.includes('METADATA_REJECTED'));
});

test('every display type the listing uploads maps to a platform', () => {
    assert.equal(PLATFORM.APP_IPHONE_67, 'IOS');
    assert.equal(PLATFORM.APP_IPAD_PRO_3GEN_129, 'IOS');
    assert.equal(PLATFORM.APP_DESKTOP, 'MAC_OS');
});

test('a dry run reads but refuses every write', async () => {
    const calls = [];
    const fetchImpl = async (url, opts) => {
        calls.push(`${opts.method} ${url}`);
        return {status: 200, json: async () => ({data: []}), text: async () => ''};
    };
    const c = client({keyId: 'k', issuerId: 'i', privateKey, dryRun: true, fetchImpl});
    await c.request('GET', '/v1/apps/1');
    await c.request('POST', '/v1/appScreenshotSets', {data: {}});
    await c.request('DELETE', '/v1/appScreenshotSets/2');
    assert.deepEqual(calls, ['GET https://api.appstoreconnect.apple.com/v1/apps/1'],
        'a dry run performed a write');
});

test('a paged listing follows links.next rather than stopping at one page', async () => {
    const pages = {
        '/v1/x': {data: [1, 2], links: {next: 'https://api.appstoreconnect.apple.com/v1/x?p=2'}},
        'https://api.appstoreconnect.apple.com/v1/x?p=2': {data: [3]}
    };
    const fetchImpl = async url => {
        const key = url.endsWith('p=2') ? url : '/v1/x';
        return {status: 200, json: async () => pages[key], text: async () => ''};
    };
    const c = client({keyId: 'k', issuerId: 'i', privateKey, fetchImpl});
    assert.deepEqual(await c.paged('/v1/x'), [1, 2, 3],
        'a truncated listing would silently skip screenshot sets');
});

test('a non-ok status is an error naming the method, path and body', async () => {
    const fetchImpl = async () => ({status: 409, json: async () => ({}), text: async () => 'DUPLICATE'});
    const c = client({keyId: 'k', issuerId: 'i', privateKey, fetchImpl});
    await assert.rejects(() => c.request('POST', '/v1/appScreenshots', {data: {}}),
        /409[\s\S]*DUPLICATE/);
});
