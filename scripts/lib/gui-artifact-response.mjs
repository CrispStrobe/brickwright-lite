import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';

// HEAD proves resource metadata only. It cannot attest bytes, and it must not
// be counted as a JavaScript/SDK body observed by the production browser.
export async function inspectGuiArtifactResponse(response, {name, sha256, bytes}) {
    assert.match(sha256 || '', /^[0-9a-f]{64}$/, `Unlisted production asset ${name}`);
    assert.ok(Number.isSafeInteger(bytes) && bytes >= 0, `Missing admitted artifact length ${name}`);
    const method = response.request().method();
    assert.equal(response.status(), 200, `Production asset ${method} ${name} must succeed`);
    if (method === 'HEAD') {
        const headers = await response.allHeaders();
        assert.match(headers['content-length'] || '', /^\d+$/, `HEAD ${name} must report its resource length`);
        const contentLength = Number(headers['content-length']);
        assert.ok(Number.isSafeInteger(contentLength), `HEAD ${name} resource length must be an exact safe integer`);
        const contentEncoding = headers['content-encoding'] || 'identity';
        if (contentEncoding === 'identity') assert.equal(contentLength, bytes, `HEAD ${name} must match admitted artifact length`);
        return {name, method, status: 200, contentLength, contentEncoding};
    }
    assert.equal(method, 'GET', `Unexpected production asset method ${method} ${name}`);
    const body = await response.body();
    assert.equal(body.length, bytes, `Actual served production asset ${name} must match admitted length`);
    const observed = createHash('sha256').update(body).digest('hex');
    assert.equal(observed, sha256, `Actual served production asset ${name} must match admitted artifact bytes`);
    return {name, method, status: 200, sha256: observed, bytes: body.length};
}
