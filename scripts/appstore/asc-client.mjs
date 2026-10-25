/**
 * The App Store Connect API, as much of it as uploading screenshots needs.
 *
 * Ported from CrispDeck's `tools/asc/client.py`, which has been doing this
 * against these same credentials for months — the flow is proven, only the
 * language is new. Node rather than Python because every other script in this
 * repo is, and because ES256 needs no dependency here: `dsaEncoding:
 * 'ieee-p1363'` gives the raw r||s signature JOSE wants, where the default DER
 * would produce a token Apple rejects with no useful message.
 *
 * @module
 */
import {createPrivateKey, sign} from 'node:crypto';

const b64url = buf => Buffer.from(buf).toString('base64')
    .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

/**
 * A signed ES256 token for the App Store Connect API. Pure apart from the clock.
 * @param {{keyId: string, issuerId: string, privateKey: string, now?: number}} opts
 * @returns {string} the JWT
 */
export function token ({keyId, issuerId, privateKey, now = Math.floor(Date.now() / 1000)}) {
    for (const [name, v] of [['keyId', keyId], ['issuerId', issuerId], ['privateKey', privateKey]]) {
        if (!v) throw new Error(`asc: ${name} is missing — cannot sign a request`);
    }
    const header = b64url(JSON.stringify({alg: 'ES256', kid: keyId, typ: 'JWT'}));
    // 20 minutes is Apple's maximum; anything longer is rejected as invalid.
    const claims = b64url(JSON.stringify({
        iss: issuerId, iat: now, exp: now + 20 * 60, aud: 'appstoreconnect-v1'
    }));
    const body = `${header}.${claims}`;
    const signature = sign('sha256', Buffer.from(body), {
        key: createPrivateKey(privateKey), dsaEncoding: 'ieee-p1363'
    });
    return `${body}.${b64url(signature)}`;
}

/** The states in which a version is still editable. A live one is NOT among them. */
export const EDITABLE = Object.freeze([
    'PREPARE_FOR_SUBMISSION', 'REJECTED', 'DEVELOPER_REJECTED', 'METADATA_REJECTED'
]);

/** Which platform an Apple display type belongs to. */
export const PLATFORM = Object.freeze({
    APP_IPHONE_67: 'IOS',
    APP_IPHONE_65: 'IOS',
    APP_IPAD_PRO_3GEN_129: 'IOS',
    APP_DESKTOP: 'MAC_OS'
});

const BASE = 'https://api.appstoreconnect.apple.com';

/** A client bound to one set of credentials. `dryRun` refuses every write. */
export function client ({keyId, issuerId, privateKey, dryRun = false, fetchImpl = fetch}) {
    let cached = null;
    const auth = () => {
        const now = Math.floor(Date.now() / 1000);
        if (!cached || cached.exp - 60 < now) {
            cached = {value: token({keyId, issuerId, privateKey, now}), exp: now + 20 * 60};
        }
        return cached.value;
    };

    const request = async (method, path, body = null, ok = [200, 201, 204]) => {
        if (dryRun && method !== 'GET') {
            console.log(`  [dry-run] ${method} ${path}`);
            return {data: {id: `dry-run-${method}`, attributes: {}}};
        }
        const res = await fetchImpl(path.startsWith('http') ? path : `${BASE}${path}`, {
            method,
            headers: {
                authorization: `Bearer ${auth()}`,
                ...(body ? {'content-type': 'application/json'} : {})
            },
            ...(body ? {body: JSON.stringify(body)} : {})
        });
        if (!ok.includes(res.status)) {
            const text = await res.text().catch(() => '');
            throw new Error(`asc ${method} ${path} -> ${res.status} ${text.slice(0, 400)}`);
        }
        return res.status === 204 ? null : res.json();
    };

    /** Follow `links.next` so a listing is never silently truncated at the page size. */
    const paged = async path => {
        const out = [];
        let next = path;
        while (next) {
            const page = await request('GET', next);
            out.push(...(page.data || []));
            next = page.links && page.links.next;
        }
        return out;
    };

    return {request, paged, dryRun};
}
