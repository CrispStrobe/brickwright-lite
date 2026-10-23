import {createHash, randomUUID} from 'node:crypto';
import {lstat, readFile, mkdir, writeFile, link, unlink} from 'node:fs/promises';
import path from 'node:path';

// PyPI's published 0.32 wheel; changing this input requires fresh native-byte proof.
export const APYCULA_WHEEL = Object.freeze({
    filename: 'apycula-0.32-py3-none-any.whl',
    url: 'https://files.pythonhosted.org/packages/7d/5f/eb484a60a206098de747f8c3b232646e5bfe2fdd7ac5ef334ca162808dac/apycula-0.32-py3-none-any.whl',
    bytes: 3571664,
    sha256: '9842eef0bb54d316f7a75d883d19bf042ed423c0c6f5d5f078c64e0c9e5f9c51'
});

function verify(bytes, spec) {
    if (bytes.length !== spec.bytes) throw new Error('Apycula wheel byte size mismatch');
    if (createHash('sha256').update(bytes).digest('hex') !== spec.sha256) {
        throw new Error('Apycula wheel SHA256 mismatch');
    }
    return bytes;
}

async function cached(file, spec) {
    let stat;
    try { stat = await lstat(file); } catch (error) {
        if (error.code === 'ENOENT') return null;
        throw error;
    }
    if (!stat.isFile() || stat.isSymbolicLink()) throw new Error('Apycula wheel cache must be a regular file');
    if (stat.size !== spec.bytes) throw new Error('Apycula wheel cache byte size mismatch');
    return verify(await readFile(file), spec);
}

/** Fetch only missing input; corrupt input fails visibly, without an index fallback.
 * Transport/descriptor injection is for acquisition controls; the probe uses defaults.
 */
export async function acquireApyculaWheel(cacheDir, {
    spec = APYCULA_WHEEL, fetchImpl = globalThis.fetch, timeoutMs = 30000
} = {}) {
    const file = path.join(cacheDir, spec.filename);
    const hit = await cached(file, spec);
    if (hit) return hit;

    const signal = AbortSignal.timeout(timeoutMs);
    const response = await fetchImpl(spec.url, {signal, redirect: 'error'});
    if (!response.ok) throw new Error(`Apycula wheel download HTTP ${response.status}`);
    const declared = response.headers.get('content-length');
    if (declared !== null && Number(declared) !== spec.bytes) {
        await response.body?.cancel();
        throw new Error('Apycula wheel download byte size mismatch');
    }
    if (!response.body) throw new Error('Apycula wheel download has no body');
    const reader = response.body.getReader();
    const chunks = [];
    let size = 0;
    try {
        for (;;) {
            signal.throwIfAborted();
            const {done, value} = await reader.read();
            if (done) break;
            size += value.length;
            if (size > spec.bytes) throw new Error('Apycula wheel download exceeds byte size');
            chunks.push(value);
        }
    } finally {
        await reader.cancel();
    }
    const bytes = verify(Buffer.concat(chunks, size), spec);
    await mkdir(cacheDir, {recursive: true});
    const temporary = `${file}.${randomUUID()}.tmp`;
    try {
        await writeFile(temporary, bytes, {flag: 'wx', mode: 0o600});
        try { await link(temporary, file); } catch (error) {
            if (error.code !== 'EEXIST') throw error;
            // A concurrent caller may publish the same verified wheel, never overwrite it.
            await cached(file, spec);
        }
    } finally {
        await unlink(temporary).catch(error => { if (error.code !== 'ENOENT') throw error; });
    }
    return bytes;
}
