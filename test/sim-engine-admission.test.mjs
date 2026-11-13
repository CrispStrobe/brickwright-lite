// SPDX-License-Identifier: BSD-3-Clause
// Synthetic release-pin controls. No test bytes represent an engine package.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync, writeFileSync, mkdirSync, mkdtempSync, rmSync} from 'node:fs';
import {pathToFileURL} from 'node:url';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {engineArchiveHashes, resolveEngineAdmission, readEngineAdmission, currentEngineIdentity, currentJoltFetchPin} from '../scripts/lib/sim-engine-admission.mjs';
const repo = new URL('../', import.meta.url), read = file => readFileSync(new URL(file, repo));
const bytes = Buffer.from('SYNTHETIC PIN TEST INPUT: NOT AN ENGINE OR A RELEASE');
const inputFor = (version = '1.1.0-bw.10', releaseTag = 'bw.10-test') => {
    // Assemble the synthetic URL so the fetch census sees only actual fetch pins.
    const resolved = 'https://' + 'github.com/' + `CrispStrobe/JoltPhysics.js/releases/download/${releaseTag}/jolt-physics-${version}.tgz`;
    const {integrity} = engineArchiveHashes(bytes);
    const producer = `const JOLT_PHYSICS_URL = '${resolved}';\nconst JOLT_PHYSICS_INTEGRITY = '${integrity}';\n`;
    const lock = {packages: {'': {dependencies: {'jolt-physics': resolved}},
        'node_modules/jolt-physics': {version, resolved, integrity}}};
    return {producer, lock, archiveBytes: bytes};
};

test('matching release pins select new versions without an admission record', () => {
    for (const [version, tag] of [['1.1.0-bw.10', 'bw.10-test'], ['1.1.0-bw.11', 'bw.11-test']]) {
        const input = inputFor(version, tag), result = resolveEngineAdmission(input);
        assert.equal(result.version, version);assert.equal(result.releaseTag, tag);
        assert.equal(result.resolved, input.lock.packages['node_modules/jolt-physics'].resolved);
        assert.equal(result.integrity, engineArchiveHashes(bytes).integrity);
        assert.equal(result.archiveSha256, createHash('sha256').update(bytes).digest('hex'));
    }
});

test('actual producer and lock agree on one content-bound engine release', () => {
    const actual = readEngineAdmission(), lock = JSON.parse(read('packages/scratch-gui/package-lock.json'));
    assert.deepEqual(currentEngineIdentity(), {version: actual.version, resolved: actual.resolved, integrity: actual.integrity});
    const installed = lock.packages['node_modules/jolt-physics'];
    assert.deepEqual({version: installed.version, resolved: installed.resolved, integrity: installed.integrity}, currentEngineIdentity());
    assert.equal(currentJoltFetchPin().text, actual.resolved.replace('https://', ''));
});

test('actual archive bytes must match SHA512 even when producer and lock agree', () => {
    assert.throws(() => resolveEngineAdmission({...inputFor(), archiveBytes: Buffer.from('changed bytes')}), /actual archive bytes/);
    assert.throws(() => resolveEngineAdmission({...inputFor(), archiveBytes: 'not bytes'}), /actual archive bytes required/);
    const {archiveBytes, ...pins} = inputFor();
    assert.equal(resolveEngineAdmission(pins).integrity, engineArchiveHashes(bytes).integrity);
    assert.equal(resolveEngineAdmission(pins).archiveSha256, undefined, 'no unobserved archive SHA256 is reported');
});

test('missing or duplicate pins, wrong versions, and lock divergence refuse selection', () => {
    const cuts = [
        x => {x.producer = '';}, x => {x.producer += x.producer;},
        x => {x.producer += x.producer.split('\n')[1];},
        x => {x.producer = x.producer.split('\n')[0];},
        x => {delete x.lock.packages['node_modules/jolt-physics'];},
        x => {delete x.lock.packages[''];},
        x => {x.lock.packages[''].dependencies['jolt-physics'] = 'different';},
        x => {x.lock.packages['node_modules/jolt-physics'].version = '1.1.0-bw.9';},
        x => {x.lock.packages['node_modules/jolt-physics'].integrity = 'sha512-invalid';},
        x => {x.lock.packages['node_modules/jolt-physics'].resolved = 'different';}
    ];
    for (const cut of cuts) {const input = inputFor();cut(input);assert.throws(() => resolveEngineAdmission(input));}
});

test('malformed SHA512 and unversioned release locations fail even when both pins match', () => {
    for (const integrity of ['sha512-invalid', 'sha256-' + 'a'.repeat(64), 'sha512-' + Buffer.alloc(64).toString('base64') + '!']) {
        const input = inputFor(), locked = input.lock.packages['node_modules/jolt-physics'];
        input.producer = input.producer.replace(locked.integrity, integrity);locked.integrity = integrity;
        assert.throws(() => resolveEngineAdmission(input), /exact SHA512 integrity/);
    }
    for (const resolved of ['https://example.invalid/engine.tgz', 'https://' + 'github.com/' + 'CrispStrobe/JoltPhysics.js/releases/latest/download/engine.tgz']) {
        const input = inputFor(), locked = input.lock.packages['node_modules/jolt-physics'];
        input.producer = input.producer.replace(locked.resolved, resolved);
        locked.resolved = resolved;input.lock.packages[''].dependencies['jolt-physics'] = resolved;
        assert.throws(() => resolveEngineAdmission(input), /versioned engine release/);
    }
});

test('identity lookup needs only producer and lock, independent of historical fixture files', () => {
    mkdirSync(new URL('../test-results/', import.meta.url), {recursive: true});
    const temporary = mkdtempSync(new URL('../test-results/engine-pin-', import.meta.url)), root = pathToFileURL(temporary + path.sep);
    try {
        const input = inputFor();
        for (const [file, data] of [['scripts/integrate.mjs', input.producer], ['packages/scratch-gui/package-lock.json', JSON.stringify(input.lock)]]) {
            const destination = new URL(file, root);mkdirSync(new URL('./', destination), {recursive: true});writeFileSync(destination, data);
        }
        assert.equal(readEngineAdmission({root, archiveBytes: bytes}).version, '1.1.0-bw.10');
        writeFileSync(new URL('scripts/verify-sim-resting-creep.mjs', root), '// independently editable reader\n');
        assert.deepEqual(readEngineAdmission({root}), resolveEngineAdmission({producer: input.producer, lock: input.lock}));
    } finally {rmSync(temporary, {recursive: true, force: true});}
});

test('current observers and independent readers preserve original physical and numerical validation code', async () => {
    const original = await import('./fixtures/resting-creep-1435/observe.mjs');
    const current = await import('./fixtures/resting-creep-current/observe.mjs');
    for (const key of ['prepareInputs', 'buildCase', 'isolateFrame', 'runCase']) assert.equal(current[key], original[key]);
    const reader = await import('../scripts/verify-sim-resting-creep.mjs');
    const currentReader = await import('../scripts/verify-sim-resting-creep-current.mjs');
    for (const key of ['auditRecord', 'auditAll', 'recompute', 'extractRecords']) assert.equal(currentReader[key], reader[key]);
    const contact = await import('../scripts/verify-sim-resting-creep-contact.mjs');
    const currentContact = await import('../scripts/verify-sim-resting-creep-contact-current.mjs');
    for (const key of ['auditContactRecord', 'auditContactAll', 'contactSummary', 'extractContactRecords']) assert.equal(currentContact[key], contact[key]);
    assert.deepEqual(current.sourceIdentities(), currentReader.expectedIdentities().identities);
    const floor = read('scripts/verify-sim-floor-contact.mjs').toString(), floorCurrent = read('scripts/verify-sim-floor-contact-current.mjs').toString();
    assert.equal(floorCurrent.slice(floorCurrent.indexOf('const text=')), floor.slice(floor.indexOf('const text='))
        .replace('{version:manifest.engine.version,resolved:pinnedURL,integrity:manifest.engine.integrity}', 'engine'));
    const actor = read('test/fixtures/bw-sim/floor-contact/actor.mjs').toString(), actorCurrent = read('test/fixtures/bw-sim/floor-contact-current/actor.mjs').toString();
    assert.equal(actorCurrent.slice(actorCurrent.indexOf('const mode = ')), actor.slice(actor.indexOf('const mode = ')));
    const qualify = read('test/fixtures/bw-sim/floor-contact/qualify.mjs').toString(), qualifyCurrent = read('test/fixtures/bw-sim/floor-contact-current/qualify.mjs').toString();
    assert.equal(qualifyCurrent.slice(qualifyCurrent.indexOf('export function')), qualify.slice(qualify.indexOf('export function'))
        .replace("new URL('./register-kernel.mjs'", "new URL('../floor-contact/register-kernel.mjs'"));
});
