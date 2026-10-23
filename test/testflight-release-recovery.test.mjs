import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {RELEASE, admitRelease, releaseNotes, inspectRelease, recoverRelease} from '../scripts/lib/testflight-release-state.mjs';
import {argumentsFor} from '../scripts/testflight-release-recovery.mjs';
import * as originalState from '../scripts/lib/testflight-release-state.mjs';

const notes = {'en-US': 'English paragraph one.\n\nEnglish paragraph two.', 'de-DE': 'Deutsche Testhinweise.'};
const identity = {...RELEASE};
const appId = 'PRIVATE-APP';
const mk = (id, attributes) => ({id, attributes});

function fixture({platforms = ['IOS'], complete = false} = {}) {
    const state = {internal: 'PRIVATE-INTERNAL', external: 'PRIVATE-EXTERNAL',
        records: platforms.map((platform, index) => ({id: `PRIVATE-BUILD-${index}`, platform,
            version: RELEASE.version, processing: 'VALID', expired: false, encryption: false,
            marketing: RELEASE.version, app: appId, bundle: RELEASE.bundleId,
            locales: {'en-US': complete ? notes['en-US'] : 'old English', 'de-DE': complete ? notes['de-DE'] : 'old German'},
            internal: complete, external: complete, review: complete ? 'APPROVED' : null,
            internalState: complete ? 'IN_BETA_TESTING' : 'READY_FOR_BETA_TESTING',
            externalState: complete ? 'IN_BETA_TESTING' : 'READY_FOR_BETA_SUBMISSION'}))};
    const requests = [], writes = [], events = [];
    const api = async (route, method) => {
        assert.equal(method, 'GET', 'the independent inspector never mutates Apple state');
        requests.push(route);
        const url = new URL(route, 'https://api.appstoreconnect.apple.com');
        const p = url.pathname;
        let result;
        if (p === '/v1/builds') result = {data: state.records.map(r => mk(r.id,
            {version: r.version, processingState: r.processing, expired: r.expired, usesNonExemptEncryption: r.encryption}))};
        else if (p === `/v1/apps/${appId}/betaGroups`) result = {data: [
            ...(state.internal ? [mk(state.internal, {isInternalGroup: true})] : []),
            ...(state.external ? [mk(state.external, {isInternalGroup: false})] : [])]};
        else if (p.startsWith('/v1/betaGroups/')) {
            const internal = p.includes(state.internal);
            result = {data: state.records.filter(r => internal ? r.internal : r.external).map(r => mk(r.id, {version: r.version}))};
        } else if (p === '/v1/betaAppReviewSubmissions') {
            const r = state.records.find(b => b.id === url.searchParams.get('filter[build]'));
            result = {data: r?.review ? [mk('PRIVATE-REVIEW', {betaReviewState: r.review})] : []};
        } else {
            const [, , , buildId, relation] = p.split('/');
            const r = state.records.find(b => b.id === buildId);
            assert.ok(r, 'fixture route names an actual build');
            if (relation === 'preReleaseVersion') result = {data: mk('PRIVATE-PRE', {platform: r.platform, version: r.marketing})};
            else if (relation === 'app') result = {data: mk(r.app, {bundleId: r.bundle})};
            else if (relation === 'betaBuildLocalizations') result = {data: Object.entries(r.locales).map(([locale, whatsNew]) => mk(`PRIVATE-${locale}`, {locale, whatsNew}))};
            else if (relation === 'buildBetaDetail') result = {data: mk('PRIVATE-DETAIL', {internalBuildState: r.internalState, externalBuildState: r.externalState})};
            else assert.fail('unknown fixture relation');
        }
        return structuredClone(result);
    };
    const inspect = async () => { events.push('inspect'); return inspectRelease({api, appId, identity, notes}); };
    const writer = async kind => {
        writes.push(kind); events.push(kind);
        for (const r of state.records) {
            if (kind === 'notes') r.locales = {...notes};
            if (kind === 'distribution') Object.assign(r, {internal: true, external: true, review: 'APPROVED',
                internalState: 'IN_BETA_TESTING', externalState: 'IN_BETA_TESTING'});
        }
    };
    return {state, requests, writes, events, api, inspect, writer};
}

const noPause = async ms => assert.equal(ms, 60000);

test('malformed API testing-state text cannot enter the public summary', async () => {
    for (const field of ['internalState', 'externalState']) {
        const f = fixture({complete: true});
        f.state.records[0][field] = 'PRIVATE-RESOURCE-123';
        await assert.rejects(f.inspect, /INVALID_TESTING_STATE/);
    }
});

test('an unfamiliar categorical state never establishes availability or repeats distribution', async () => {
    const f = fixture({complete: true});
    f.state.records[0].externalState = 'FUTURE_TESTING_STATE';
    const result = await recoverRelease({inspect: f.inspect, runWriter: f.writer, pause: noPause});
    assert.equal(result.complete, false);
    assert.equal(result.outcome, 'PENDING_AVAILABILITY');
    assert.deepEqual(f.writes, []);
});

test('exact release identity is admitted; every identity substitution refuses', () => {
    admitRelease(identity);
    for (const field of Object.keys(RELEASE)) assert.throws(() => admitRelease({...identity, [field]: 'wrong'}), /RELEASE_IDENTITY_MISMATCH/);
});

test('independent notes parser retains full bilingual paragraphs and refuses missing or duplicate sections', () => {
    const md = `# Metadata\n\n## What to Test — 0.1.26 en-US\n\n${notes['en-US']}\n\n## What to Test — 0.1.26 de-DE\n\n${notes['de-DE']}\n\n## Next\nignored`;
    assert.deepEqual(releaseNotes(md), notes);
    assert.deepEqual(releaseNotes(md.replaceAll('\n', '\r\n')), notes);
    assert.throws(() => releaseNotes(md.replace('0.1.26 de-DE', '0.1.25 de-DE')), /HEADING/);
    assert.throws(() => releaseNotes(md + '\n## What to Test — 0.1.26 en-US\nextra'), /HEADING/);
    assert.throws(() => releaseNotes(md.replace(notes['de-DE'], 'x'.repeat(4001))), /OVERSIZED/);
});

test('audit observes actual API fields, never writes and never returns private IDs in its summary', async () => {
    const f = fixture({complete: true, platforms: ['IOS', 'MAC_OS']});
    const result = await f.inspect();
    assert.equal(result.summary.complete, true);
    assert.equal(result.summary.builds.length, 2);
    assert.equal(f.writes.length, 0);
    assert.ok(f.requests.some(p => p.includes('buildBetaDetail')));
    assert.ok(f.requests.some(p => p.includes('betaAppReviewSubmissions')));
    assert.ok(!JSON.stringify(result.summary).includes('PRIVATE'));
});

test('macOS alone is not a usable iOS release', async () => {
    const f = fixture({platforms: ['MAC_OS'], complete: true});
    assert.equal((await f.inspect()).summary.iosPresent, false);
    await assert.rejects(() => recoverRelease({inspect: f.inspect, runWriter: f.writer, pause: noPause}), /PREFLIGHT/);
    assert.deepEqual(f.writes, []);
});

for (const [name, change] of [
    ['processing', r => { r.processing = 'PROCESSING'; }],
    ['expired', r => { r.expired = true; }],
    ['missing locale', r => { delete r.locales['de-DE']; }],
    ['review rejected', r => { r.review = 'REJECTED'; }],
    ['encryption inconsistent', r => { r.encryption = true; }]
]) test(`recovery refuses ${name} without a writer call`, async () => {
    const f = fixture(); change(f.state.records[0]);
    await assert.rejects(() => recoverRelease({inspect: f.inspect, runWriter: f.writer, pause: noPause}), /PREFLIGHT/);
    assert.deepEqual(f.writes, []);
});

for (const [name, change] of [
    ['wrong marketing version', f => { f.state.records[0].marketing = '0.1.25'; }],
    ['wrong app', f => { f.state.records[0].app = 'PRIVATE-OTHER-APP'; }],
    ['wrong bundle', f => { f.state.records[0].bundle = 'not.our.bundle'; }],
    ['unknown platform', f => { f.state.records[0].platform = 'UNKNOWN'; }],
    ['duplicate platform', f => { f.state.records.push({...f.state.records[0], id: 'PRIVATE-DUPLICATE'}); }],
    ['missing group', f => { f.state.external = null; }],
    ['unknown review state', f => { f.state.records[0].review = 'SOMETHING_NEW'; }]
]) test(`audit rejects ${name}`, async () => {
    const f = fixture(); change(f);
    await assert.rejects(f.inspect);
    assert.deepEqual(f.writes, []);
});

test('recovery requires notes readback before distribution and fresh postconditions after it', async () => {
    const f = fixture();
    const result = await recoverRelease({inspect: f.inspect, runWriter: f.writer, pause: noPause});
    assert.equal(result.outcome, 'COMPLETE');
    assert.deepEqual(f.events, ['inspect', 'notes', 'inspect', 'distribution', 'inspect']);
    assert.deepEqual(f.writes, ['notes', 'distribution']);
    assert.ok(!JSON.stringify(result).includes('PRIVATE'));
});

test('an already complete release performs no writer operation', async () => {
    const f = fixture({complete: true});
    assert.equal((await recoverRelease({inspect: f.inspect, runWriter: f.writer, pause: noPause})).outcome, 'ALREADY_COMPLETE');
    assert.deepEqual(f.writes, []);
});

test('a successful writer with missing notes cannot pass or proceed to distribution', async () => {
    const f = fixture();
    await assert.rejects(() => recoverRelease({inspect: f.inspect, runWriter: async kind => f.writes.push(kind), pause: noPause}), /READBACK_FAILED/);
    assert.deepEqual(f.writes, ['notes']);
});

test('a tolerated distribution error or wrong build membership cannot produce success', async () => {
    const f = fixture();
    await assert.rejects(() => recoverRelease({inspect: f.inspect, pause: noPause, runWriter: async kind => {
        if (kind === 'notes') await f.writer(kind);
        // Simulates a writer that returns success but leaves both exact memberships absent.
    }}), /READBACK_FAILED/);
});

test('writer failure is preserved and is never followed by the next writer', async () => {
    const f = fixture();
    await assert.rejects(() => recoverRelease({inspect: f.inspect, pause: noPause,
        runWriter: async () => { throw Object.assign(new Error('failed writer'), {code: 'WRITER_FAILED'}); }}), /failed writer/);
    assert.deepEqual(f.events, ['inspect']);
});

test('readback refuses changed build identities and admission lost after notes', async () => {
    for (const change of [f => { f.state.records[0].id = 'PRIVATE-REPLACEMENT'; }, f => { f.state.records[0].expired = true; }]) {
        const f = fixture();
        await assert.rejects(() => recoverRelease({inspect: f.inspect, pause: noPause, runWriter: async kind => {
            await f.writer(kind); change(f);
        }}), /IDENTITY_CHANGED|ADMISSION_CHANGED/);
        assert.deepEqual(f.writes, ['notes']);
    }
});

test('pending review is reported as pending, never approval or complete delivery', async () => {
    const f = fixture();
    const result = await recoverRelease({inspect: f.inspect, pause: noPause, runWriter: async kind => {
        await f.writer(kind);
        if (kind === 'distribution') Object.assign(f.state.records[0], {review: 'WAITING_FOR_REVIEW', externalState: 'WAITING_FOR_BETA_REVIEW'});
    }});
    assert.equal(result.outcome, 'PENDING_REVIEW');
    assert.equal(result.metadataVerified, true);
    assert.equal(result.complete, false);
});

test('bounded readback may observe delayed state but never repeats the writer', async () => {
    const f = fixture(); let pauses = 0;
    const result = await recoverRelease({inspect: f.inspect, runWriter: async kind => {
        f.writes.push(kind);
        if (kind === 'distribution') await f.writer(kind);
    }, pause: async ms => { assert.equal(ms, 60000); pauses++; f.state.records[0].locales = {...notes}; }});
    assert.equal(result.complete, true);
    assert.equal(pauses, 1);
    assert.equal(f.writes.filter(k => k === 'notes').length, 1);
});

test('pagination is bounded and cannot send authenticated requests to a foreign host', async () => {
    for (const next of ['https://attacker.invalid/v1/builds', '/v1/builds?cycle=1']) {
        let calls = 0;
        await assert.rejects(() => inspectRelease({identity, notes, appId, api: async () => {
            calls++; return {data: [], links: {next}};
        }}), /PAGINATION/);
        assert.ok(calls <= 2);
    }
});

test('CLI defaults to audit and refuses unknown, duplicate or implicit recovery arguments', () => {
    assert.deepEqual(argumentsFor(['--release-dir', 'release']), {action: 'audit', 'release-dir': 'release'});
    for (const args of [[], ['--action', 'upload', '--release-dir', 'release'], ['--release-dir'],
        ['--release-dir', 'release', '--release-dir', 'other'], ['--token', 'secret']]) assert.throws(() => argumentsFor(args), /INVALID_ARGUMENTS/);
});

test('actual CLI failures expose no private path, credentials, stack or raw API body', () => {
    const privatePath = '/intentionally-missing-PRIVATE-testflight-source';
    const result = spawnSync(process.execPath, ['scripts/testflight-release-recovery.mjs', '--release-dir', privatePath], {
        cwd: fileURLToPath(new URL('../', import.meta.url)), encoding: 'utf8',
        env: {...process.env, APPSTORE_API_KEY_P8: 'PRIVATE-FAKE-CREDENTIAL'}});
    assert.equal(result.status, 1);
    assert.equal(result.stdout, '');
    assert.equal(JSON.parse(result.stderr).status, 'REFUSED');
    assert.doesNotMatch(result.stderr, /PRIVATE|stack|at file:/);
});

test('workflow is manual-only, least-privilege and cannot build or upload a binary', () => {
    const workflow = readFileSync(new URL('../.github/workflows/testflight-release-recovery.yml', import.meta.url), 'utf8');
    assert.match(workflow, /^  workflow_dispatch:/m);
    assert.doesNotMatch(workflow, /^  (push|pull_request|schedule|workflow_run):/m);
    assert.match(workflow, /default: audit/);
    assert.match(workflow, /ref: refs\/tags\/v0\.1\.26/);
    assert.match(workflow, /contents: read/);
    assert.doesNotMatch(workflow, /contents: write|cancel-in-progress: true/);
    assert.equal((workflow.match(/persist-credentials: false/g) || []).length, 2);
    const runs = [...workflow.matchAll(/^\s+run: (.+)$/gm)].map(m => m[1]);
    assert.deepEqual(runs, ['node recovery/scripts/testflight-release-recovery.mjs --action "$RECOVERY_ACTION" --release-dir release']);
    assert.doesNotMatch(runs.join('\n'), /\$\{\{|tauri|altool|xcrun|npm install|npm ci/);
});

async function mutant(anchor, replacement) {
    const source = readFileSync(new URL('../scripts/lib/testflight-release-state.mjs', import.meta.url), 'utf8');
    assert.equal(source.split(anchor).length, 2, 'the real source mutation anchor is exact and unique');
    return import(`data:text/javascript;base64,${Buffer.from(source.replace(anchor, replacement)).toString('base64')}`);
}

test('mutation: replacing actual group membership with build presence is detected', async () => {
    const oracle = async lib => {
        const f = fixture({complete: true}); f.state.records[0].external = false;
        const result = await lib.inspectRelease({api: f.api, appId, identity, notes});
        assert.equal(result.summary.metadataVerified, false);
    };
    await oracle(originalState);
    const bad = await mutant('const metadataVerified = iosPresent && records.every(metadata);', 'const metadataVerified = iosPresent;');
    await assert.rejects(() => oracle(bad), {code: 'ERR_ASSERTION'});
});

test('mutation: accepting pending review as approval is detected even with a positive beta-state signal', async () => {
    const oracle = async lib => {
        const f = fixture({complete: true}); f.state.records[0].review = 'WAITING_FOR_REVIEW';
        assert.equal((await lib.inspectRelease({api: f.api, appId, identity, notes})).summary.complete, false);
    };
    await oracle(originalState);
    const bad = await mutant("!pendingReview(r.review) && r.review !== 'REJECTED'", 'true');
    await assert.rejects(() => oracle(bad), {code: 'ERR_ASSERTION'});
});

test('mutation: omitting the admitted identity fence is detected by the same recovery oracle', async () => {
    const oracle = async lib => {
        const f = fixture();
        await assert.rejects(() => lib.recoverRelease({inspect: f.inspect, pause: noPause, runWriter: async kind => {
            await f.writer(kind);
            if (kind === 'notes') f.state.records[0].id = 'PRIVATE-NEW-BUILD';
        }}), /IDENTITY_CHANGED/);
    };
    await oracle(originalState);
    const bad = await mutant("if (current.identity !== first.identity) refuse('RECOVERY_IDENTITY_CHANGED');", '');
    await assert.rejects(() => oracle(bad), {code: 'ERR_ASSERTION'});
});

test('mutation: a write in the audit transport is detected before any network execution', async () => {
    const f = fixture({complete: true});
    const bad = await mutant("const response = await api(route, 'GET');\n        if (!Array.isArray(response?.data)",
        "const response = await api(route, 'POST');\n        if (!Array.isArray(response?.data)");
    await assert.rejects(() => bad.inspectRelease({api: f.api, appId, identity, notes}), {code: 'ERR_ASSERTION'});
    assert.deepEqual(f.requests, [], 'the guarded fake transport rejected the method before handling a request');
});
