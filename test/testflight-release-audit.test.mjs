import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync, writeFileSync, mkdirSync, mkdtempSync, rmSync} from 'node:fs';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {execFileSync, spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {createReadOnlyReleaseReader, admitRelease, releaseNotes} from '../scripts/lib/testflight-release-state.mjs';
import {argumentsFor, expectedRelease, sourceIdentity} from '../scripts/testflight-release-audit.mjs';

const expected = expectedRelease('v0.1.27', 'a'.repeat(40));
const notes = {'en-US': 'Full English.\n\nSecond paragraph.', 'de-DE': 'Vollständige deutsche Hinweise.'};
const markdown = `# Notes\n\n## What to Test — 0.1.27 en-US\n\n${notes['en-US']}\n\n## What to Test — 0.1.27 de-DE\n\n${notes['de-DE']}\n`;
const resource = (id, attributes) => ({id, attributes});
function fixture(platforms = ['IOS', 'MAC_OS']) {
    const records = platforms.map((platform, index) => ({id: `PRIVATE-BUILD-${index}`, platform,
        version: expected.version, processingState: 'VALID', expired: false, usesNonExemptEncryption: false,
        marketing: expected.version, bundle: expected.bundleId, app: 'PRIVATE-APP', internal: true, external: true,
        locales: {...notes}, review: 'APPROVED', internalState: 'IN_BETA_TESTING', externalState: 'IN_BETA_TESTING'}));
    const calls = [], state = {records, internalGroup: true, externalGroup: true};
    const api = async (route, method) => {
        assert.equal(method, 'GET'); calls.push(route);
        const url = new URL(route, 'https://api.appstoreconnect.apple.com'), path = url.pathname;
        let data;
        if (path === '/v1/apps') data = [resource('PRIVATE-APP', {bundleId: expected.bundleId})];
        else if (path === '/v1/builds') data = records.map(r => resource(r.id, r));
        else if (path.endsWith('/betaGroups')) data = [
            ...(state.internalGroup ? [resource('PRIVATE-INTERNAL', {isInternalGroup: true})] : []),
            ...(state.externalGroup ? [resource('PRIVATE-EXTERNAL', {isInternalGroup: false})] : [])];
        else if (path.startsWith('/v1/betaGroups/')) data = records.filter(r => path.includes('PRIVATE-INTERNAL') ? r.internal : r.external).map(r => resource(r.id, {}));
        else if (path === '/v1/betaAppReviewSubmissions') {
            const r = records.find(r => r.id === url.searchParams.get('filter[build]'));
            data = r.review ? [resource('PRIVATE-REVIEW', {betaReviewState: r.review})] : [];
        } else {
            const r = records.find(r => path.startsWith(`/v1/builds/${r.id}/`));
            assert.ok(r, 'known build relation');
            if (path.endsWith('/app')) data = resource(r.app, {bundleId: r.bundle});
            else if (path.endsWith('/preReleaseVersion')) data = resource('PRIVATE-PRE', {version: r.marketing, platform: r.platform});
            else if (path.endsWith('/betaBuildLocalizations')) data = Object.entries(r.locales).map(([locale, whatsNew]) => resource(`PRIVATE-${locale}`, {locale, whatsNew}));
            else if (path.endsWith('/buildBetaDetail')) data = resource('PRIVATE-DETAIL', {internalBuildState: r.internalState, externalBuildState: r.externalState});
            else assert.fail('unexpected route');
        }
        return {data: structuredClone(data)};
    };
    const reader = createReadOnlyReleaseReader(expected);
    const inspect = () => reader.inspect({api, appId: 'PRIVATE-APP', identity: expected, notes});
    return {state, records, calls, api, reader, inspect};
}
function checkout(t, config = {}) {
    const dir = mkdtempSync(join(tmpdir(), 'testflight-source-'));
    t.after(() => rmSync(dir, {recursive: true, force: true}));
    const git = (...args) => execFileSync('/usr/bin/git', ['-C', dir, ...args], {encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe']}).trim();
    git('init', '-q'); mkdirSync(join(dir, 'apps/tauri/src-tauri'), {recursive: true}); mkdirSync(join(dir, 'docs'));
    writeFileSync(join(dir, 'apps/tauri/src-tauri/tauri.conf.json'), JSON.stringify({version: expected.version, identifier: expected.bundleId, ...config}));
    writeFileSync(join(dir, 'docs/app-store-metadata.md'), markdown);
    git('add', '.'); git('-c', 'user.name=Test', '-c', 'user.email=test@example.invalid', 'commit', '-qm', 'Frozen release fixture');
    git('tag', expected.tag);
    return {dir, git, identity: expectedRelease(expected.tag, git('rev-parse', 'HEAD'))};
}

test('new observation reader captures identity and has no writer or recovery surface', () => {
    const descriptor = {...expected}, reader = createReadOnlyReleaseReader(descriptor);
    descriptor.commit = 'b'.repeat(40); reader.admit(expected);
    assert.ok(Object.isFrozen(reader)); assert.deepEqual(Object.keys(reader).sort(), ['admit', 'discover', 'inspect', 'notes']);
    assert.deepEqual(reader.notes(markdown), notes);
    assert.throws(() => admitRelease(expected), /RELEASE_IDENTITY_MISMATCH/);
    assert.throws(() => releaseNotes(markdown, expected.version), /INVALID_NOTES_SOURCE/);
    for (const patch of [{version: '01.2.3'}, {tag: 'main'}, {commit: 'abc123'}, {bundleId: 'other.bundle'}]) {
        assert.throws(() => createReadOnlyReleaseReader({...expected, ...patch}), /INVALID_RELEASE_DESCRIPTOR/);
    }
});

test('actual both-platform fields and bilingual notes establish availability without exposing IDs', async () => {
    const f = fixture();
    assert.equal(await f.reader.discover({api: f.api, identity: expected}), 'PRIVATE-APP');
    const {summary} = await f.inspect();
    assert.equal(summary.complete, true); assert.equal(summary.platformsVerified, true);
    assert.equal(summary.metadataVerified, true); assert.equal(summary.macosPresent, true);
    assert.doesNotMatch(JSON.stringify(summary), /PRIVATE/);
    await assert.rejects(() => f.reader.inspect({api: f.api, appId: 'PRIVATE-APP', identity: {...expected, commit: 'b'.repeat(40)}, notes}), /IDENTITY_MISMATCH/);
});
for (const platforms of [[], ['IOS'], ['MAC_OS']]) test(`missing platform ${platforms.join(',') || 'both'} never qualifies a release`, async () => {
    const {summary} = await fixture(platforms).inspect();
    assert.equal(summary.complete, false); assert.equal(summary.platformsVerified, false); assert.equal(summary.metadataVerified, false);
});
for (const [name, change] of [
    ['processing', r => { r.processingState = 'PROCESSING'; }],
    ['failed', r => { r.processingState = 'FAILED'; }],
    ['expired', r => { r.expired = true; }],
    ['rejected review', r => { r.review = 'REJECTED'; }],
    ['pending review with positive beta state', r => { r.review = 'WAITING_FOR_REVIEW'; }],
    ['missing note', r => { delete r.locales['de-DE']; }],
    ['mismatched full note', r => { r.locales['en-US'] = 'Full English.'; }],
    ['unlinked external group', r => { r.external = false; }],
    ['unlinked internal group', r => { r.internal = false; }],
    ['unanswered export compliance', r => { r.usesNonExemptEncryption = null; }],
    ['unknown beta state', r => { r.externalState = 'FUTURE_STATE'; }]
]) test(`${name} on macOS cannot be hidden by available iOS`, async () => {
    const f = fixture(); change(f.records[1]); const {summary} = await f.inspect();
    assert.equal(summary.complete, false);
    if (name.startsWith('pending')) assert.equal(summary.pendingReview, true);
});
for (const [name, change, error] of [
    ['duplicate platform', f => f.records.push({...f.records[0], id: 'PRIVATE-DUPLICATE'}), /AMBIGUOUS_BUILD/],
    ['wrong marketing version', f => { f.records[1].marketing = '0.1.26'; }, /PLATFORM_VERSION/],
    ['foreign app', f => { f.records[1].app = 'PRIVATE-OTHER'; }, /BUILD_APP/],
    ['foreign bundle', f => { f.records[1].bundle = 'other.bundle'; }, /BUILD_APP/],
    ['missing group', f => { f.state.externalGroup = false; }, /AMBIGUOUS_GROUPS/],
    ['arbitrary testing text', f => { f.records[1].externalState = 'PRIVATE-ID'; }, /INVALID_TESTING_STATE/]
]) test(`new reader refuses ${name}`, async () => { const f = fixture(); change(f); await assert.rejects(f.inspect, error); });

test('transport mutation is refused before an underlying API accepting writes can run', async () => {
    const source = readFileSync(new URL('../scripts/lib/testflight-release-state.mjs', import.meta.url), 'utf8');
    const anchor = "const response = await api(route, 'GET');\n        if (!Array.isArray(response?.data)";
    assert.equal(source.split(anchor).length, 2);
    const mutant = await import(`data:text/javascript;base64,${Buffer.from(source.replace(anchor, anchor.replace("'GET'", "'POST'"))).toString('base64')}`);
    let calls = 0;
    await assert.rejects(() => mutant.createReadOnlyReleaseReader(expected).discover({identity: expected, api: async () => { calls++; return {data: []}; }}), /READ_ONLY_TRANSPORT/);
    assert.equal(calls, 0);
});
test('pagination cannot leak authentication to another host or run forever', async () => {
    for (const next of ['https://foreign.invalid/v1/apps', '/v1/apps?cycle=1']) {
        let calls = 0;
        await assert.rejects(() => createReadOnlyReleaseReader(expected).discover({identity: expected, api: async () => {
            calls++; return {data: [], links: {next}};
        }}), /PAGINATION/);
        assert.ok(calls <= 2);
    }
});
test('release source binds clean actual tag, full commit, config and repository root', t => {
    const f = checkout(t); assert.deepEqual(sourceIdentity(f.dir, f.identity), f.identity);
    assert.throws(() => sourceIdentity(f.dir, {...f.identity, commit: 'b'.repeat(40)}), /IDENTITY_MISMATCH/);
    assert.throws(() => sourceIdentity(join(f.dir, 'docs'), f.identity), /INVALID_RELEASE_ROOT/);
    writeFileSync(join(f.dir, 'untracked.txt'), 'unexpected');
    assert.throws(() => sourceIdentity(f.dir, f.identity), /DIRTY_RELEASE_SOURCE/);
});
for (const patch of [{version: '0.1.26'}, {identifier: 'other.bundle'}]) test('mismatched source config refuses before credentials', t => {
    const f = checkout(t, patch); assert.throws(() => sourceIdentity(f.dir, f.identity), /IDENTITY_MISMATCH/);
});
test('a tag at a different actual commit refuses', t => {
    const f = checkout(t); f.git('-c', 'user.name=Test', '-c', 'user.email=test@example.invalid', 'commit', '--allow-empty', '-qm', 'different source');
    assert.throws(() => sourceIdentity(f.dir, expectedRelease(expected.tag, f.git('rev-parse', 'HEAD'))), /TAG_COMMIT_MISMATCH/);
});
test('CLI requires explicit valid identity and safe failures expose no credential, private path or stack', () => {
    const args = ['--release-dir', '/PRIVATE-MISSING', '--tag', expected.tag, '--expected-commit', expected.commit];
    assert.equal(argumentsFor(args).tag, expected.tag);
    for (const argv of [[], args.slice(0, -2), [...args, '--action', 'recover'], [...args, '--tag', expected.tag], args.map(v => v === expected.commit ? 'short' : v)]) assert.throws(() => argumentsFor(argv));
    const result = spawnSync(process.execPath, ['scripts/testflight-release-audit.mjs', ...args], {
        cwd: fileURLToPath(new URL('../', import.meta.url)), encoding: 'utf8', env: {...process.env, APPSTORE_API_KEY_P8: 'PRIVATE-KEY'}});
    assert.equal(result.status, 1); assert.equal(result.stdout, ''); assert.equal(JSON.parse(result.stderr).status, 'REFUSED');
    assert.doesNotMatch(result.stderr, /PRIVATE|stack|at file:/);
});
test('manual workflow freezes auditor and release, keeps least privilege and has no writer', () => {
    const source = readFileSync(new URL('../.github/workflows/testflight-release-audit.yml', import.meta.url), 'utf8');
    assert.match(source, /^  workflow_dispatch:/m); assert.match(source, /ref: \$\{\{ github.sha \}\}/);
    assert.match(source, /ref: refs\/tags\/\$\{\{ inputs.tag \}\}/); assert.match(source, /contents: read/);
    assert.equal((source.match(/persist-credentials: false/g) || []).length, 2);
    assert.doesNotMatch(source, /^  (push|pull_request|schedule|workflow_run):|APPSTORE_APP_ID:|contents: write|cancel-in-progress: true|altool|xcrun|testflight-submit|push-tester-notes|npm ci/m);
    const runs = [...source.matchAll(/^\s+run: (.+)$/gm)].map(m => m[1]); assert.equal(runs.length, 1);
    assert.doesNotMatch(runs[0], /\$\{\{/); assert.match(runs[0], /--expected-commit "\$RELEASE_COMMIT"/);
});
