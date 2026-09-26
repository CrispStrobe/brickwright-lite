#!/usr/bin/env node
/**
 * Replace the App Store screenshot sets from a capture manifest.
 *
 * Ported from CrispDeck's `tools/asc/screenshots.py` - the flow is proven
 * against these same credentials; the language and the dry run are new.
 *
 *   node scripts/appstore/upload-shots.mjs <dir> [--replace] [--dry-run]
 *
 * WHAT IT CAN AND CANNOT TOUCH. Every write targets an appStoreVersion in an
 * EDITABLE state (PREPARE_FOR_SUBMISSION, REJECTED, DEVELOPER_REJECTED,
 * METADATA_REJECTED). A version that is live, in review, or otherwise frozen
 * has no localisation this will find, and the run fails by name rather than
 * touching it. So this stages a store page; it cannot rewrite the one
 * customers are looking at.
 *
 * `--dry-run` performs every READ and no write, printing what it would do. It
 * is the only way to exercise this without a real listing, and it is what the
 * first run should be.
 *
 * Credentials, matching the rest of this repo's Apple steps:
 *   APPSTORE_API_KEY_ID  APPSTORE_API_ISSUER_ID  APPSTORE_API_KEY_P8  APPSTORE_APP_ID
 * APPSTORE_API_KEY_P8 may be PEM or base64-of-PEM.
 */
import {readFileSync, existsSync} from 'node:fs';
import {createHash} from 'node:crypto';
import path from 'node:path';
import {client, EDITABLE, PLATFORM} from './asc-client.mjs';

const args = process.argv.slice(2);
const dir = path.resolve(args.find(a => !a.startsWith('--')) || 'appstore-shots');
const replace = args.includes('--replace');
const dryRun = args.includes('--dry-run');

const env = n => process.env[n] || '';
/** Accept PEM or base64-of-PEM, because both shapes exist across this org's repos. */
const readKey = raw => (raw.includes('BEGIN PRIVATE KEY')
    ? raw
    : Buffer.from(raw, 'base64').toString('utf8'));

const manifestPath = path.join(dir, 'manifest.json');
if (!existsSync(manifestPath)) {
    console.error(`no manifest at ${manifestPath} - run the capture first`);
    process.exit(1);
}
const rows = JSON.parse(readFileSync(manifestPath, 'utf8'));
if (!rows.length) {
    console.error('the manifest is empty - refusing to replace live sets with nothing');
    process.exit(1);
}

const appId = env('APPSTORE_APP_ID');
if (!appId) {
    console.error('APPSTORE_APP_ID is not set');
    process.exit(1);
}
const key = readKey(env('APPSTORE_API_KEY_P8'));
if (!dryRun && !key.includes('BEGIN PRIVATE KEY')) {
    console.error('APPSTORE_API_KEY_P8 is neither PEM nor base64 PEM');
    process.exit(1);
}
const asc = client({
    keyId: env('APPSTORE_API_KEY_ID'),
    issuerId: env('APPSTORE_API_ISSUER_ID'),
    privateKey: key || 'dry-run',
    dryRun
});

/** The editable version localisation for one platform and locale, or throw. */
const localisation = async (platform, locale) => {
    const versions = await asc.paged(`/v1/apps/${appId}/appStoreVersions?limit=50`);
    const editable = versions.filter(v =>
        v.attributes.platform === platform && EDITABLE.includes(v.attributes.appStoreState));
    for (const version of editable) {
        const locs = await asc.paged(
            `/v1/appStoreVersions/${version.id}/appStoreVersionLocalizations?limit=50`);
        const match = locs.find(l => l.attributes.locale === locale);
        if (match) return match.id;
    }
    throw new Error(`no EDITABLE ${platform} version with a ${locale} localisation - `
        + `states seen: ${versions.filter(v => v.attributes.platform === platform)
            .map(v => v.attributes.appStoreState).join(', ') || 'none'}`);
};

/** Reserve, PUT each part, then commit with the checksum Apple verifies. */
const uploadOne = async (setId, file) => {
    const blob = readFileSync(file);
    const created = (await asc.request('POST', '/v1/appScreenshots', {data: {
        type: 'appScreenshots',
        attributes: {fileName: path.basename(file), fileSize: blob.length},
        relationships: {appScreenshotSet: {data: {type: 'appScreenshotSets', id: setId}}}
    }})).data;
    if (dryRun) {
        console.log(`  [dry-run] would upload ${path.basename(file)} (${blob.length} bytes)`);
        return;
    }

    for (const op of created.attributes.uploadOperations || []) {
        const offset = op.offset || 0;
        const part = blob.subarray(offset, offset + (op.length || blob.length));
        const res = await fetch(op.url, {
            method: op.method || 'PUT',
            headers: Object.fromEntries((op.requestHeaders || []).map(h => [h.name, h.value])),
            body: part
        });
        if (![200, 201, 204].includes(res.status)) {
            throw new Error(`part upload returned ${res.status} for ${path.basename(file)}`);
        }
    }
    await asc.request('PATCH', `/v1/appScreenshots/${created.id}`, {data: {
        type: 'appScreenshots', id: created.id,
        attributes: {uploaded: true, sourceFileChecksum: createHash('md5').update(blob).digest('hex')}
    }});

    // Apple processes asynchronously; "committed" is not "accepted".
    for (let i = 0; i < 30; i++) {
        const state = (await asc.request('GET', `/v1/appScreenshots/${created.id}`))
            .data.attributes.assetDeliveryState || {};
        if (state.state === 'COMPLETE' || state.state === 'UPLOAD_COMPLETE') {
            console.log(`  ok ${path.basename(file)}`);
            return;
        }
        if (state.errors && state.errors.length) {
            throw new Error(`${path.basename(file)}: ${JSON.stringify(state.errors)}`);
        }
        await new Promise(r => setTimeout(r, 4000));
    }
    throw new Error(`timed out waiting for Apple to process ${path.basename(file)}`);
};

const groups = new Map();
for (const row of rows) {
    const k = `${row.locale} ${row.displayType}`;
    if (!groups.has(k)) groups.set(k, []);
    groups.get(k).push(path.join(dir, row.name));
}

console.log(`${rows.length} screenshot(s), ${groups.size} set(s)${dryRun ? ' - DRY RUN, no writes' : ''}`);
for (const [k, files] of groups) {
    const [locale, displayType] = k.split(' ');
    const platform = PLATFORM[displayType];
    if (!platform) throw new Error(`unknown display type ${displayType}`);
    const locId = await localisation(platform, locale);
    const sets = await asc.paged(`/v1/appStoreVersionLocalizations/${locId}/appScreenshotSets?limit=50`);
    let set = sets.find(s => s.attributes.screenshotDisplayType === displayType);
    if (replace && set) {
        await asc.request('DELETE', `/v1/appScreenshotSets/${set.id}`, null, [200, 204]);
        set = null;
    }
    if (!set) {
        set = (await asc.request('POST', '/v1/appScreenshotSets', {data: {
            type: 'appScreenshotSets',
            attributes: {screenshotDisplayType: displayType},
            relationships: {appStoreVersionLocalization: {
                data: {type: 'appStoreVersionLocalizations', id: locId}}}
        }})).data;
    }
    console.log(`${displayType} ${locale} (${files.length})`);
    // Sorted, because the manifest order is the order the store shows them.
    for (const file of files.sort()) await uploadOne(set.id, file);
}
console.log(dryRun ? '\ndry run complete - nothing was written' : '\nscreenshot sets replaced');
