/**
 * Send the release's tester notes to App Store Connect.
 *
 * `docs/app-store-metadata.md` is the SOURCE of the "What to Test" text and
 * `test/app-store-metadata.test.mjs` asserts the sections for the current
 * version exist in it. That gate proves the notes were WRITTEN, which is not
 * the property anyone cares about: until this script existed nothing ever sent
 * them, so 0.1.7 and 0.1.8 both reached App Store Connect with `whatsNew` EMPTY
 * in both locales while the gate stayed green.
 *
 * Needs APPSTORE_API_KEY_ID, APPSTORE_API_ISSUER_ID, APPSTORE_API_KEY_P8
 * (base64 of the .p8) and APPSTORE_APP_ID. Run by mobile.yml on a version tag.
 */
import {readFile} from 'node:fs/promises';
import {createSign} from 'node:crypto';
import {pathToFileURL} from 'node:url';

const LOCALES = ['en-US', 'de-DE'];
/** App Store Connect's cap on a single whatsNew field. */
const WHATS_NEW_MAX = 4000;

/**
 * The "What to Test" body for one version and locale, or null if absent/empty.
 *
 * Sliced by heading POSITION rather than a regex lookahead. `(?=^## |$)` under
 * the `m` flag ends the capture at the first LINE break instead of the next
 * heading: it yielded an 81-character fragment and wrote that over the real
 * notes. Exported so a test can prove a whole multi-line section comes back.
 */
export function testerNotes(md, version, locale) {
    const heading = `## What to Test — ${version} ${locale}`;
    const at = md.indexOf(`\n${heading}`);
    if (at === -1) return null;
    const bodyStart = at + 1 + heading.length;
    const next = md.indexOf('\n## ', bodyStart);
    const body = md.slice(bodyStart, next === -1 ? md.length : next).trim();
    return body || null;
}

const b64url = buf => Buffer.from(buf).toString('base64url');

/** ES256 JWT, the shape App Store Connect wants. */
const token = env => {
    const header = {alg: 'ES256', kid: env.APPSTORE_API_KEY_ID, typ: 'JWT'};
    const now = Math.floor(Date.now() / 1000);
    const payload = {iss: env.APPSTORE_API_ISSUER_ID, iat: now, exp: now + 900, aud: 'appstoreconnect-v1'};
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

async function main() {
    const env = {};
    for (const key of ['APPSTORE_API_KEY_ID', 'APPSTORE_API_ISSUER_ID', 'APPSTORE_API_KEY_P8', 'APPSTORE_APP_ID']) {
        if (!process.env[key]) throw new Error(`${key} is not set`);
        env[key] = process.env[key];
    }

    const api = async (path, method = 'GET', body) => {
        const res = await fetch(`https://api.appstoreconnect.apple.com${path}`, {
            method,
            headers: {Authorization: `Bearer ${token(env)}`, 'Content-Type': 'application/json'},
            body: body ? JSON.stringify(body) : undefined,
        });
        if (!res.ok) throw new Error(`${method} ${path} -> ${res.status} ${await res.text()}`);
        const text = await res.text();
        return text ? JSON.parse(text) : {};
    };

    const version = JSON.parse(await readFile(
        new URL('../apps/tauri/src-tauri/tauri.conf.json', import.meta.url), 'utf8')).version;
    const md = await readFile(new URL('../docs/app-store-metadata.md', import.meta.url), 'utf8');

    const notes = {};
    for (const locale of LOCALES) {
        const found = testerNotes(md, version, locale);
        // Refuse rather than send an empty note: writing "" over a good one is
        // the exact failure this script exists to end.
        if (!found) throw new Error(`no "What to Test — ${version} ${locale}" section in docs/app-store-metadata.md`);
        if (found.length > WHATS_NEW_MAX) {
            throw new Error(`${locale} notes are ${found.length} chars; App Store Connect caps whatsNew at ${WHATS_NEW_MAX}`);
        }
        notes[locale] = found;
    }

    // A build is only patchable once Apple has finished processing it, which
    // takes minutes after the upload step in the same job.
    const deadline = Date.now() + 25 * 60 * 1000;
    let builds = [];
    for (;;) {
        const all = (await api(`/v1/builds?filter[app]=${env.APPSTORE_APP_ID}` +
            '&limit=10&sort=-uploadedDate&fields[builds]=version,processingState')).data;
        builds = all.filter(b => b.attributes.version === version && b.attributes.processingState === 'VALID');
        if (builds.length) break;
        if (Date.now() > deadline) throw new Error(`no VALID build at ${version} after 25 min`);
        console.log(`waiting for a VALID ${version} build (have: ` +
            `${all.map(b => `${b.attributes.version}/${b.attributes.processingState}`).join(', ') || 'none'})`);
        await new Promise(resolve => setTimeout(resolve, 60_000));
    }

    let patched = 0;
    for (const build of builds) {
        const locs = (await api(`/v1/builds/${build.id}/betaBuildLocalizations` +
            '?fields[betaBuildLocalizations]=locale,whatsNew')).data;
        for (const loc of locs) {
            const locale = loc.attributes.locale;
            if (!notes[locale]) {
                console.log(`  ${build.id} ${locale}: no note for this locale, left alone`);
                continue;
            }
            await api(`/v1/betaBuildLocalizations/${loc.id}`, 'PATCH', {
                data: {type: 'betaBuildLocalizations', id: loc.id, attributes: {whatsNew: notes[locale]}},
            });
            console.log(`  ${build.id} ${locale}: set ${notes[locale].length} chars`);
            patched++;
        }
    }
    // Silence is the failure mode being fixed: a run that writes nothing must
    // not look like a run that wrote the notes.
    if (!patched) throw new Error('no betaBuildLocalizations were written — the notes would have stayed empty');
    console.log(`tester notes for ${version} sent to ${builds.length} build(s), ${patched} localization(s)`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
    await main();
}
