/**
 * App Store Connect: a signed request, and nothing else.
 *
 * Extracted from push-tester-notes.mjs when testflight-submit.mjs needed the
 * same thing. Duplicating an ES256 JWT signer is the kind of copy that drifts
 * silently and then fails at 3am on a release tag.
 *
 * Every caller needs the same four values, so they are read from the same four
 * environment variables the workflow already sets:
 *   APPSTORE_API_KEY_ID, APPSTORE_API_ISSUER_ID,
 *   APPSTORE_API_KEY_P8 (base64 of the .p8), APPSTORE_APP_ID
 */
import {createSign} from 'node:crypto';

const b64url = buf => Buffer.from(buf).toString('base64url');

/** Read and check the environment once, so a missing value fails at the top. */
export const readEnv = (keys = [
    'APPSTORE_API_KEY_ID', 'APPSTORE_API_ISSUER_ID', 'APPSTORE_API_KEY_P8', 'APPSTORE_APP_ID'
]) => {
    const env = {};
    for (const key of keys) {
        if (!process.env[key]) throw new Error(`${key} is not set`);
        env[key] = process.env[key];
    }
    return env;
};

/**
 * ES256 JWT, the shape App Store Connect wants. Short-lived and minted per
 * request, so a long poll cannot outlive its own token.
 */
export const token = env => {
    const header = {alg: 'ES256', kid: env.APPSTORE_API_KEY_ID, typ: 'JWT'};
    const now = Math.floor(Date.now() / 1000);
    const payload = {
        iss: env.APPSTORE_API_ISSUER_ID, iat: now, exp: now + 900, aud: 'appstoreconnect-v1'
    };
    const signingInput = `${b64url(JSON.stringify(header))}.${b64url(JSON.stringify(payload))}`;
    const signer = createSign('SHA256');
    signer.update(signingInput);
    const der = signer.sign(Buffer.from(env.APPSTORE_API_KEY_P8, 'base64').toString('utf8'));
    // DER wraps r and s in ASN.1 INTEGERs; JWS wants them raw and 32 bytes each.
    let i = (der[1] & 0x80) ? 2 + (der[1] & 0x7f) : 2;
    const parts = [];
    for (let n = 0; n < 2; n++) {
        const len = der[i + 1];
        let v = der.subarray(i + 2, i + 2 + len);
        while (v.length > 32 && v[0] === 0) v = v.subarray(1);
        parts.push(Buffer.concat([Buffer.alloc(32 - v.length), v]));
        i += 2 + len;
    }
    return `${signingInput}.${b64url(Buffer.concat(parts))}`;
};

/**
 * One request. Throws on any non-2xx with the API's own error array attached as
 * `.errors`, because App Store Connect's `code` strings are what a caller needs
 * to tell "already done" from "wrong".
 */
export const client = env => async (path, method = 'GET', body) => {
    const res = await fetch(`https://api.appstoreconnect.apple.com${path}`, {
        method,
        headers: {Authorization: `Bearer ${token(env)}`, 'Content-Type': 'application/json'},
        body: body ? JSON.stringify(body) : undefined
    });
    const text = await res.text();
    const json = text ? JSON.parse(text) : {};
    if (!res.ok) {
        const err = new Error(`${method} ${path} -> ${res.status} ${text.slice(0, 400)}`);
        err.status = res.status;
        err.errors = json.errors || [];
        throw err;
    }
    return json;
};

/** True when the failure is App Store Connect saying "that is already the case". */
export const alreadyDone = (error, ...codes) =>
    (error.errors || []).some(e => codes.some(code => String(e.code || '').includes(code)));
