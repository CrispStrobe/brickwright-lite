#!/usr/bin/env node
// Refresh the About dialog's "Our apps" list and icons from Apple's own records.
//
//   node scripts/refresh-app-showcase.mjs [--dry-run]
//
// Reads (GET only, nothing on Apple's side changes):
//   - App Store Connect: every app of the account, its app-info subtitles
//     (en-US, de-DE), its public TestFlight group links, its latest build icon;
//   - the public App Store lookup (itunes.apple.com/lookup, DE and US
//     storefronts, iOS and Mac): which apps are live, where, and their artwork.
// Writes overlay/scratch-gui/src/components/menu-bar/app-showcase-data.js and
// overlay/scratch-gui/static/app-showcase/<slug>.png (128 px), then prints
// what changed. --dry-run prints the changes and writes nothing.
//
// Kept from the current file: an `en`/`de` text where Apple has no subtitle
// (the script never invents a description: a new app without one is listed
// with a TODO note to write it), `icon: 'local'` (the icon was supplied by
// hand, typically because the build icon is a placeholder), and `self`.
//
// Credentials, as in CI (scripts/lib-appstore.mjs): APPSTORE_API_KEY_ID,
// APPSTORE_API_ISSUER_ID, and APPSTORE_API_KEY_P8 (base64 of the .p8) or
// APPSTORE_API_KEY_PATH (the .p8 file; default
// ~/.appstoreconnect/private_keys/AuthKey_<KEY_ID>.p8).
import {existsSync, readFileSync, writeFileSync} from 'node:fs';
import {homedir} from 'node:os';
import path from 'node:path';
import {fileURLToPath, pathToFileURL} from 'node:url';
import {client} from './lib-appstore.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DATA = path.join(ROOT, 'overlay/scratch-gui/src/components/menu-bar/app-showcase-data.js');
const ICONS = path.join(ROOT, 'overlay/scratch-gui/static/app-showcase');
const SELF_BUNDLE = 'com.crispstrobe.brickwright';
const dryRun = process.argv.includes('--dry-run');

export const slugOf = name => name.toLowerCase().replace(/\s+[-–]\s+.*$/, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');

const env = () => {
    const keyId = process.env.APPSTORE_API_KEY_ID;
    const issuer = process.env.APPSTORE_API_ISSUER_ID;
    if (!keyId || !issuer) throw new Error('Set APPSTORE_API_KEY_ID and APPSTORE_API_ISSUER_ID');
    let p8 = process.env.APPSTORE_API_KEY_P8;
    if (!p8) {
        const file = process.env.APPSTORE_API_KEY_PATH ||
            path.join(homedir(), '.appstoreconnect/private_keys', `AuthKey_${keyId}.p8`);
        p8 = readFileSync(file).toString('base64');
    }
    return {APPSTORE_API_KEY_ID: keyId, APPSTORE_API_ISSUER_ID: issuer, APPSTORE_API_KEY_P8: p8};
};

/**
 * Merge Apple's records into the current list (pure; exported for tests).
 * @param {Array<object>} current entries of app-showcase-data.js
 * @param {Array<object>} apple [{id, name, bundleId, subtitle: {en, de}, betaCode, store: {mac}|null, beta: text}]
 * @returns {{apps: Array<object>, notes: Array<string>}} the new list, and what a human should look at
 */
export const mergeApps = (current, apple) => {
    const byId = new Map(current.map(app => [app.id, app]));
    const notes = [];
    const apps = apple.map(record => {
        const old = byId.get(record.id) || {};
        const app = {slug: old.slug || slugOf(record.name), id: record.id, name: record.name};
        if (record.store) app.store = record.id;
        if (record.store && record.store.mac) app.mac = true;
        if (record.betaCode) app.beta = record.betaCode;
        if (old.icon === 'local') app.icon = 'local';
        if (old.self || record.bundleId === SELF_BUNDLE) app.self = true;
        for (const lang of ['en', 'de']) {
            app[lang] = record.subtitle[lang] || old[lang] || '';
            if (!app[lang]) notes.push(`${record.name}: no ${lang} description; write one in app-showcase-data.js`);
        }
        if (!byId.has(record.id)) notes.push(`${record.name}: new app`);
        return app;
    });
    for (const old of current) {
        if (!apple.some(record => record.id === old.id)) notes.push(`${old.name}: no longer in App Store Connect, removed`);
    }
    apps.sort((a, b) => a.name.localeCompare(b.name));
    return {apps, notes};
};

const quote = value => `'${String(value).replace(/\\/g, '\\\\').replace(/'/g, '\\\'')}'`;
export const renderData = (apps, date) => {
    const keys = ['slug', 'id', 'name', 'store', 'mac', 'beta', 'icon', 'self'];
    const line = app => {
        const head = keys.filter(key => app[key] !== undefined)
            .map(key => `${key}: ${app[key] === true ? 'true' : quote(app[key])}`)
            .join(', ');
        return `    {${head},\n        en: ${quote(app.en)}, de: ${quote(app.de)}}`;
    };
    return `${readFileSync(DATA, 'utf8').split('export const REFRESHED')[0]}export const REFRESHED = '${date}';\n\n` +
        `export const APPS = [\n${apps.map(line).join(',\n')}\n];\n`;
};

const appleRecords = async () => {
    const api = client(env());
    const apps = (await api('/v1/apps?limit=200&fields[apps]=name,bundleId')).data;
    const lookup = new Map();
    for (const country of ['de', 'us']) {
        for (const entity of ['software', 'macSoftware']) {
            const url = `https://itunes.apple.com/lookup?id=${apps.map(app => app.id).join(',')}&country=${country}&entity=${entity}`;
            const result = await (await fetch(url)).json();
            for (const item of result.results || []) {
                const id = String(item.trackId);
                const seen = lookup.get(id) || {mac: true, artwork: item.artworkUrl512};
                if (item.kind !== 'mac-software') seen.mac = false;
                lookup.set(id, seen);
            }
        }
    }
    const records = [];
    for (const app of apps) {
        const subtitle = {};
        const infos = (await api(`/v1/apps/${app.id}/appInfos?limit=5`)).data;
        if (infos[0]) {
            for (const loc of (await api(`/v1/appInfos/${infos[0].id}/appInfoLocalizations?limit=50`)).data) {
                const lang = loc.attributes.locale.slice(0, 2);
                if ((lang === 'en' || lang === 'de') && loc.attributes.subtitle) subtitle[lang] = loc.attributes.subtitle;
            }
        }
        const groups = (await api(`/v1/apps/${app.id}/betaGroups?limit=50` +
            '&fields[betaGroups]=publicLinkEnabled,publicLink')).data;
        const link = groups.map(group => group.attributes)
            .find(group => group.publicLinkEnabled && group.publicLink);
        const builds = await api(`/v1/builds?filter[app]=${app.id}&limit=1&sort=-uploadedDate` +
            '&include=icons&fields[buildIcons]=iconAsset');
        const buildIcon = (builds.included || []).find(item => item.type === 'buildIcons');
        const store = lookup.get(app.id) || null;
        records.push({id: app.id, name: app.attributes.name, bundleId: app.attributes.bundleId, subtitle,
            betaCode: link ? link.publicLink.split('/').pop() : null, store,
            iconUrl: store ? store.artwork.replace(/\/\d+x\d+bb\.(jpg|png)$/, '/128x128bb.png') :
                buildIcon && buildIcon.attributes.iconAsset.templateUrl
                    .replace('{w}', '128').replace('{h}', '128').replace('{f}', 'png')});
    }
    return records;
};

const main = async () => {
    const {APPS} = await import(pathToFileURL(DATA).href);
    const records = await appleRecords();
    const {apps, notes} = mergeApps(APPS, records);
    const before = new Map(APPS.map(app => [app.id, JSON.stringify(app)]));
    const changed = apps.filter(app => before.get(app.id) !== JSON.stringify(app)).map(app => app.name);
    const iconUpdates = [];
    for (const app of apps) {
        const record = records.find(item => item.id === app.id);
        if (app.icon === 'local' || !record.iconUrl) continue;
        const bytes = Buffer.from(await (await fetch(record.iconUrl)).arrayBuffer());
        const file = path.join(ICONS, `${app.slug}.png`);
        if (!existsSync(file) || !readFileSync(file).equals(bytes)) {
            iconUpdates.push(app.slug);
            if (!dryRun) writeFileSync(file, bytes);
        }
    }
    if (!dryRun) writeFileSync(DATA, renderData(apps, new Date().toISOString().slice(0, 10)));
    console.log(`${dryRun ? '[dry-run] ' : ''}${apps.length} apps: ` +
        `${apps.filter(app => app.store).length} on the App Store, ${apps.filter(app => app.beta).length} with a public TestFlight link`);
    console.log(`changed entries: ${changed.join(', ') || 'none'}`);
    console.log(`new or changed icons: ${iconUpdates.join(', ') || 'none'}`);
    for (const note of notes) console.log(`NOTE ${note}`);
};

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
    main().catch(error => {
        console.error(error.message, error.cause ? `(${error.cause.code || error.cause.message})` : '');
        process.exit(1);
    });
}
