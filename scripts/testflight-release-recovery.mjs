#!/usr/bin/env node
/** Metadata only. Captured writer output and API identifiers are never printed. */
import {readFileSync, realpathSync} from 'node:fs';
import {resolve, join} from 'node:path';
import {pathToFileURL} from 'node:url';
import {execFileSync, spawnSync} from 'node:child_process';
import {client, readEnv} from './lib-appstore.mjs';
import {RELEASE, admitRelease, releaseNotes, discoverReleaseApp, inspectRelease, recoverRelease} from './lib/testflight-release-state.mjs';

export function argumentsFor(argv) {
    const result = {action: 'audit'};
    const seen = new Set();
    for (let i = 0; i < argv.length; i += 2) {
        const key = argv[i];
        if (!['--action', '--release-dir'].includes(key) || seen.has(key) || !argv[i + 1] || argv[i + 1].startsWith('--')) {
            throw Object.assign(new Error('INVALID_ARGUMENTS'), {code: 'INVALID_ARGUMENTS'});
        }
        seen.add(key); result[key.slice(2)] = argv[i + 1];
    }
    if (!['audit', 'recover'].includes(result.action) || !result['release-dir']) {
        throw Object.assign(new Error('INVALID_ARGUMENTS'), {code: 'INVALID_ARGUMENTS'});
    }
    return result;
}

export function sourceIdentity(directory) {
    const git = (...args) => execFileSync('/usr/bin/git', ['-C', directory, ...args], {encoding: 'utf8', maxBuffer: 1000000}).trim();
    if (git('status', '--porcelain')) throw Object.assign(new Error('DIRTY_RELEASE_SOURCE'), {code: 'DIRTY_RELEASE_SOURCE'});
    const config = JSON.parse(readFileSync(join(directory, 'apps/tauri/src-tauri/tauri.conf.json'), 'utf8'));
    const identity = {tag: RELEASE.tag, commit: git('rev-parse', 'HEAD'),
        version: config.version, bundleId: config.identifier};
    if (git('rev-parse', `refs/tags/${RELEASE.tag}^{commit}`) !== identity.commit) {
        throw Object.assign(new Error('TAG_COMMIT_MISMATCH'), {code: 'TAG_COMMIT_MISMATCH'});
    }
    admitRelease(identity);
    return identity;
}

async function main() {
    const options = argumentsFor(process.argv.slice(2));
    const directory = realpathSync(resolve(options['release-dir']));
    const identity = sourceIdentity(directory);
    const notes = releaseNotes(readFileSync(join(directory, 'docs/app-store-metadata.md'), 'utf8'));
    const env = readEnv(['APPSTORE_API_KEY_ID', 'APPSTORE_API_ISSUER_ID', 'APPSTORE_API_KEY_P8']);
    const api = client(env);
    const appId = await discoverReleaseApp({api, identity});
    const inspect = () => inspectRelease({api, appId, identity, notes});
    const runWriter = async kind => {
        sourceIdentity(directory);
        const args = kind === 'notes' ? ['scripts/push-tester-notes.mjs', '--platform', 'IOS'] :
            kind === 'distribution' ? ['scripts/testflight-submit.mjs', '--version', RELEASE.version] : null;
        if (!args) throw Object.assign(new Error('INVALID_WRITER'), {code: 'INVALID_WRITER'});
        const childEnv = {...process.env, APPSTORE_APP_ID: appId, NODE_OPTIONS: '', NODE_PATH: ''};
        const result = spawnSync(process.execPath, args, {cwd: directory, env: childEnv,
            encoding: 'utf8', timeout: 180000, maxBuffer: 2 * 1024 * 1024});
        if (result.status !== 0 || result.error || result.signal) {
            throw Object.assign(new Error('WRITER_FAILED_OR_UNCERTAIN'), {code: 'WRITER_FAILED_OR_UNCERTAIN'});
        }
    };
    const result = options.action === 'audit' ? {action: 'audit', ...(await inspect()).summary} :
        await recoverRelease({inspect, runWriter});
    console.log(JSON.stringify(result));
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
    main().catch(error => {
        // Never print an API body, child output, private resource ID, token or stack.
        console.error(JSON.stringify({status: 'REFUSED', code: /^[A-Z_]+$/.test(error.code || '') ? error.code : 'API_OR_SOURCE_FAILURE',
            httpStatus: Number.isInteger(error.status) ? error.status : null}));
        process.exitCode = 1;
    });
}
