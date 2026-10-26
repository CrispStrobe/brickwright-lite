#!/usr/bin/env node
/** Observe an explicitly admitted release. No build, upload or metadata writer. */
import {readFileSync, realpathSync} from 'node:fs';
import {resolve, join} from 'node:path';
import {pathToFileURL} from 'node:url';
import {execFileSync} from 'node:child_process';
import {client, readEnv} from './lib-appstore.mjs';
import {createReadOnlyReleaseReader} from './lib/testflight-release-state.mjs';

const refuse = code => { throw Object.assign(new Error(code), {code}); };
export function argumentsFor(argv) {
    const options = {}, seen = new Set();
    for (let i = 0; i < argv.length; i += 2) {
        const key = argv[i];
        if (!['--release-dir', '--tag', '--expected-commit'].includes(key) || seen.has(key) ||
            !argv[i + 1] || argv[i + 1].startsWith('--')) refuse('INVALID_ARGUMENTS');
        seen.add(key); options[key.slice(2)] = argv[i + 1];
    }
    if (seen.size !== 3) refuse('INVALID_ARGUMENTS');
    expectedRelease(options.tag, options['expected-commit']);
    return options;
}
export function expectedRelease(tag, commit) {
    const descriptor = {tag, commit, version: typeof tag === 'string' ? tag.slice(1) : '',
        bundleId: 'com.crispstrobe.brickwright'};
    createReadOnlyReleaseReader(descriptor);
    return Object.freeze(descriptor);
}
export function sourceIdentity(directory, expected) {
    const reader = createReadOnlyReleaseReader(expected);
    const git = (...args) => execFileSync('/usr/bin/git', ['-C', directory, ...args], {
        encoding: 'utf8', maxBuffer: 1000000, stdio: ['ignore', 'pipe', 'ignore']}).trim();
    if (realpathSync(git('rev-parse', '--show-toplevel')) !== realpathSync(directory)) refuse('INVALID_RELEASE_ROOT');
    if (git('status', '--porcelain')) refuse('DIRTY_RELEASE_SOURCE');
    const commit = git('rev-parse', 'HEAD');
    if (git('rev-parse', '--verify', `refs/tags/${expected.tag}^{commit}`) !== commit) refuse('TAG_COMMIT_MISMATCH');
    for (const path of ['apps/tauri/src-tauri/tauri.conf.json', 'docs/app-store-metadata.md']) {
        git('ls-files', '--error-unmatch', '--', path);
    }
    const config = JSON.parse(readFileSync(join(directory, 'apps/tauri/src-tauri/tauri.conf.json'), 'utf8'));
    const identity = {tag: expected.tag, commit, version: config.version, bundleId: config.identifier};
    reader.admit(identity);
    return identity;
}
async function main() {
    const options = argumentsFor(process.argv.slice(2));
    const expected = expectedRelease(options.tag, options['expected-commit']);
    const directory = realpathSync(resolve(options['release-dir']));
    const identity = sourceIdentity(directory, expected);
    const reader = createReadOnlyReleaseReader(expected);
    const notes = reader.notes(readFileSync(join(directory, 'docs/app-store-metadata.md'), 'utf8'));
    // Source and bilingual notes are admitted before reading credentials or using the API.
    const api = client(readEnv(['APPSTORE_API_KEY_ID', 'APPSTORE_API_ISSUER_ID', 'APPSTORE_API_KEY_P8']));
    const appId = await reader.discover({api, identity});
    const {summary} = await reader.inspect({api, appId, identity, notes});
    sourceIdentity(directory, expected);
    console.log(JSON.stringify({action: 'audit', ...summary}));
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
    main().catch(error => {
        console.error(JSON.stringify({status: 'REFUSED',
            code: /^[A-Z_]+$/.test(error.code || '') ? error.code : 'API_OR_SOURCE_FAILURE',
            httpStatus: Number.isInteger(error.status) ? error.status : null}));
        process.exitCode = 1;
    });
}
