#!/usr/bin/env node
/**
 * Put the release's builds in front of testers.
 *
 * THE GAP THIS CLOSES
 * -------------------
 * mobile.yml built, signed, uploaded and annotated the build, and then stopped.
 * Everything after that — export compliance, adding the build to the tester
 * groups, submitting it for Beta App Review — was done by hand, per release,
 * from a document. Predictably it was done for some and not others: on
 * 2026-08-26 the EXTERNAL group held every version from 0.1.0 to 0.1.9, and the
 * INTERNAL group still held 0.1.0 — nine releases during which internal testers
 * were looking at the first build ever made and nothing said so.
 *
 * Idempotent by construction: every step asks what is already true, and treats
 * App Store Connect's "that is already the case" errors as success. Re-running
 * it after a partial failure is the intended recovery.
 *
 *   APPSTORE_API_KEY_ID=... APPSTORE_API_ISSUER_ID=... \
 *   APPSTORE_API_KEY_P8=<base64 of the .p8> APPSTORE_APP_ID=... \
 *   node scripts/testflight-submit.mjs [--version 0.1.10] [--dry-run]
 *
 * `--dry-run` reports what it would do and changes nothing.
 */
import {readFile} from 'node:fs/promises';
import {pathToFileURL} from 'node:url';

import {alreadyDone, client, readEnv} from './lib-appstore.mjs';

/** Apple finishes processing minutes after the upload step in the same job. */
const VALID_DEADLINE_MS = 25 * 60 * 1000;
const POLL_MS = 60_000;

const arg = name => {
    const at = process.argv.indexOf(`--${name}`);
    return at === -1 ? null : process.argv[at + 1];
};
const flag = name => process.argv.includes(`--${name}`);

async function main() {
    const env = readEnv();
    const api = client(env);
    const dryRun = flag('dry-run');
    const version = arg('version') || JSON.parse(await readFile(
        new URL('../apps/tauri/src-tauri/tauri.conf.json', import.meta.url), 'utf8')).version;

    const say = (...parts) => console.log(`${dryRun ? '[dry-run] ' : ''}${parts.join(' ')}`);
    say(`TestFlight distribution for ${version}`);

    // ---- 1. the builds -----------------------------------------------------
    // One app record carries both platforms, so a version has an iOS build AND
    // a macOS build and both want distributing. Waiting for VALID is not
    // optional: a build that is still processing cannot be added to a group.
    const deadline = Date.now() + VALID_DEADLINE_MS;
    let builds = [];
    for (;;) {
        const all = (await api(`/v1/builds?filter[app]=${env.APPSTORE_APP_ID}` +
            '&limit=20&sort=-uploadedDate' +
            '&fields[builds]=version,processingState,uploadedDate,usesNonExemptEncryption')).data;
        builds = all.filter(b => b.attributes.version === version &&
            b.attributes.processingState === 'VALID');
        if (builds.length) break;
        if (Date.now() > deadline) {
            throw new Error(`no VALID build at ${version} after ${VALID_DEADLINE_MS / 60000} min ` +
                `(have: ${all.map(b => `${b.attributes.version}/${b.attributes.processingState}`)
                    .join(', ') || 'none'})`);
        }
        console.log(`waiting for a VALID ${version} build…`);
        await new Promise(resolve => setTimeout(resolve, POLL_MS));
    }
    // Name the platform in the log; "two builds" is meaningless on its own and
    // this is the line a human reads to check the right things shipped.
    const platforms = new Map();
    for (const build of builds) {
        const pre = await api(`/v1/builds/${build.id}/preReleaseVersion` +
            '?fields[preReleaseVersions]=platform,version');
        platforms.set(build.id, pre.data?.attributes?.platform || 'UNKNOWN');
    }
    say(`${builds.length} VALID build(s):`,
        builds.map(b => `${platforms.get(b.id)} ${b.id}`).join(', '));

    // ---- 2. export compliance ---------------------------------------------
    // A VALID build is NOT testable — internal included — until this is
    // answered. Info.ios.plist declares ITSAppUsesNonExemptEncryption=false, so
    // it normally arrives already answered and the PATCH is refused; that is the
    // desired state, not a failure.
    for (const build of builds) {
        if (build.attributes.usesNonExemptEncryption !== null) {
            say(`  ${build.id}: export compliance already ${build.attributes.usesNonExemptEncryption}`);
            continue;
        }
        if (dryRun) {
            say(`  ${build.id}: would set usesNonExemptEncryption=false`);
            continue;
        }
        await api(`/v1/builds/${build.id}`, 'PATCH', {
            data: {type: 'builds', id: build.id, attributes: {usesNonExemptEncryption: false}}
        });
        say(`  ${build.id}: export compliance set to false`);
    }

    // ---- 3. the groups -----------------------------------------------------
    // Resolved, never created. Creating one silently would leave the real group
    // — the one with the testers and the public link — untouched, which looks
    // like success and reaches nobody.
    const groups = (await api(`/v1/apps/${env.APPSTORE_APP_ID}/betaGroups?limit=50`)).data;
    const internal = groups.find(g => g.attributes.isInternalGroup);
    const external = groups.find(g => !g.attributes.isInternalGroup);
    if (!internal) throw new Error('no internal beta group on this app — create it once, by hand');
    if (!external) throw new Error('no external beta group on this app — create it once, by hand');
    say(`groups: internal "${internal.attributes.name}", external "${external.attributes.name}"` +
        `${external.attributes.publicLink ? ` (${external.attributes.publicLink})` : ''}`);

    for (const group of [internal, external]) {
        const already = new Set((await api(`/v1/betaGroups/${group.id}/builds?limit=200`))
            .data.map(b => b.id));
        for (const build of builds) {
            const label = `${platforms.get(build.id)} ${build.id.slice(0, 8)} -> ${group.attributes.name}`;
            if (already.has(build.id)) {
                say(`  ${label}: already there`);
                continue;
            }
            if (dryRun) {
                say(`  ${label}: would add`);
                continue;
            }
            try {
                await api(`/v1/betaGroups/${group.id}/relationships/builds`, 'POST',
                    {data: [{type: 'builds', id: build.id}]});
                say(`  ${label}: added`);
            } catch (e) {
                if (alreadyDone(e, 'ENTITY_ERROR.RELATIONSHIP.INVALID', 'STATE_ERROR')) {
                    say(`  ${label}: already there (${e.errors[0].code})`);
                    continue;
                }
                throw e;
            }
        }
    }

    // ---- 4. Beta App Review ------------------------------------------------
    // What actually unlocks external installs. Needs the review contact and a
    // betaAppLocalizations entry in the app's PRIMARY locale, both of which are
    // per-app and already set; this only submits.
    for (const build of builds) {
        const label = `${platforms.get(build.id)} ${build.id.slice(0, 8)}`;
        const existing = (await api(`/v1/betaAppReviewSubmissions?filter[build]=${build.id}`)).data;
        if (existing.length) {
            say(`  ${label}: beta review already ${existing[0].attributes.betaReviewState}`);
            continue;
        }
        if (dryRun) {
            say(`  ${label}: would submit for Beta App Review`);
            continue;
        }
        try {
            const sub = await api('/v1/betaAppReviewSubmissions', 'POST', {
                data: {
                    type: 'betaAppReviewSubmissions',
                    relationships: {build: {data: {type: 'builds', id: build.id}}}
                }
            });
            say(`  ${label}: submitted, ${sub.data.attributes.betaReviewState}`);
        } catch (e) {
            if (alreadyDone(e, 'ENTITY_ERROR.ATTRIBUTE.INVALID.DUPLICATE', 'STATE_ERROR')) {
                say(`  ${label}: already submitted (${e.errors[0].code})`);
                continue;
            }
            // BETA_CONTRACT_MISSING is a legal-agreement gate with no API at
            // all; say so plainly rather than dying with a raw 422, because the
            // fix is a human in a browser and nothing here can retry into it.
            if (alreadyDone(e, 'BETA_CONTRACT_MISSING')) {
                console.error(`  ${label}: BLOCKED — the app's Beta Test agreement is missing. ` +
                    'The Account Holder must accept it at appstoreconnect.apple.com; ' +
                    'no API can. Internal testing is unaffected; re-run this afterwards.');
                process.exitCode = 1;
                continue;
            }
            throw e;
        }
    }

    say('done');
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
    await main();
}
