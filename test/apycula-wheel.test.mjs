import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {mkdtemp, readFile, writeFile, readdir, rm, symlink} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {createServer} from 'node:http';
import {acquireApyculaWheel, APYCULA_WHEEL} from '../scripts/lib/apycula-wheel.mjs';

const bytes = Buffer.from('verified fixture wheel');
const spec = Object.freeze({filename: 'fixture.whl', url: 'https://example.invalid/fixed.whl',
    bytes: bytes.length, sha256: createHash('sha256').update(bytes).digest('hex')});
async function fixture(t) {
    const dir = await mkdtemp(path.join(tmpdir(), 'apycula-wheel-'));
    t.after(() => rm(dir, {recursive: true, force: true}));
    return {dir, file: path.join(dir, spec.filename)};
}

test('published wheel descriptor preserves the existing version and immutable input', () => {
    assert.ok(Object.isFrozen(APYCULA_WHEEL));
    assert.equal(APYCULA_WHEEL.filename, 'apycula-0.32-py3-none-any.whl');
    assert.equal(APYCULA_WHEEL.bytes, 3571664);
    assert.equal(APYCULA_WHEEL.sha256, '9842eef0bb54d316f7a75d883d19bf042ed423c0c6f5d5f078c64e0c9e5f9c51');
    assert.match(APYCULA_WHEEL.url, /^https:\/\/files\.pythonhosted\.org\/packages\/.+\/apycula-0\.32-py3-none-any\.whl$/);
});

test('missing wheel is verified before publication; a cache hit performs no network access', async t => {
    const {dir, file} = await fixture(t);
    let calls = 0;
    const fetchImpl = async (url, options) => {
        calls++;
        assert.equal(url, spec.url);
        assert.equal(options.redirect, 'error');
        assert.ok(options.signal instanceof AbortSignal);
        return new Response(bytes, {headers: {'content-length': String(bytes.length)}});
    };
    assert.deepEqual(await acquireApyculaWheel(dir, {spec, fetchImpl}), bytes);
    assert.deepEqual(await readFile(file), bytes);
    assert.deepEqual(await acquireApyculaWheel(dir, {spec, fetchImpl}), bytes);
    assert.equal(calls, 1);
    assert.deepEqual(await readdir(dir), [spec.filename]);
});

for (const [name, payload] of [['corrupt', Buffer.alloc(bytes.length)], ['truncated', bytes.subarray(1)]]) {
    test(`${name} cached input is refused without download or overwrite`, async t => {
        const {dir, file} = await fixture(t);
        await writeFile(file, payload);
        await assert.rejects(acquireApyculaWheel(dir, {spec, fetchImpl: () => assert.fail('no fallback')}), /mismatch/);
        assert.deepEqual(await readFile(file), payload);
    });
}

test('symbolic-link cache input is refused', async t => {
    const {dir, file} = await fixture(t);
    const target = path.join(dir, 'target');
    await writeFile(target, bytes);
    await symlink(target, file);
    await assert.rejects(acquireApyculaWheel(dir, {spec, fetchImpl: () => assert.fail('no download')}), /regular file/);
});

for (const [name, response, pattern] of [
    ['HTTP failure', () => new Response(null, {status: 503}), /HTTP 503/],
    ['missing body', () => new Response(null), /no body/],
    ['wrong declared length', () => new Response(bytes, {headers: {'content-length': '1'}}), /byte size mismatch/],
    ['truncation', () => new Response(bytes.subarray(1)), /byte size mismatch/],
    ['oversize', () => new Response(Buffer.concat([bytes, bytes])), /exceeds byte size/],
    ['hash mismatch', () => new Response(Buffer.alloc(bytes.length)), /SHA256 mismatch/]
]) {
    test(`${name} cannot publish a cache entry or fall back to an index`, async t => {
        const {dir} = await fixture(t);
        let calls = 0;
        await assert.rejects(acquireApyculaWheel(dir, {spec, fetchImpl: async () => {calls++; return response();}}), pattern);
        assert.equal(calls, 1);
        assert.deepEqual(await readdir(dir), []);
    });
}

test('a stalled real HTTP body is aborted by the acquisition deadline', async t => {
    const {dir} = await fixture(t);
    let requested = false;
    const server = createServer((request, response) => {
        requested = true;
        response.writeHead(200);
        response.write(bytes.subarray(0, 1)); // Send headers, then deliberately never finish.
    });
    await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
    t.after(() => { server.closeAllConnections(); server.close(); });
    const start = Date.now();
    await assert.rejects(acquireApyculaWheel(dir, {spec, timeoutMs: 150,
        fetchImpl: (url, options) => fetch(`http://127.0.0.1:${server.address().port}/wheel`, options)
    }), error => ['AbortError', 'TimeoutError'].includes(error.name));
    assert.ok(requested, 'the real download reached its body');
    assert.ok(Date.now() - start < 3000, 'the acquisition deadline stops a stalled body');
    assert.deepEqual(await readdir(dir), []);
});

test('concurrent downloads publish one verified cache entry without temporary files', async t => {
    const {dir} = await fixture(t);
    const options = {spec, fetchImpl: async () => new Response(bytes)};
    const results = await Promise.all([acquireApyculaWheel(dir, options), acquireApyculaWheel(dir, options)]);
    for (const result of results) assert.deepEqual(result, bytes);
    assert.deepEqual(await readdir(dir), [spec.filename]);
});
