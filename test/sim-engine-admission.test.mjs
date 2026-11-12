// SPDX-License-Identifier: BSD-3-Clause
// Synthetic identity boundary controls. No test bytes represent an engine package.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync, writeFileSync, mkdirSync, mkdtempSync, rmSync} from 'node:fs';
import {pathToFileURL} from 'node:url';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {bindEngineArchive, resolveEngineAdmission, readEngineAdmission, currentJoltFetchPin} from '../scripts/lib/sim-engine-admission.mjs';
const repo = new URL('../', import.meta.url), read = file => readFileSync(new URL(file, repo));
const currentAdmission = JSON.parse(read('test/fixtures/bw-sim/engine-admissions/bw10.json'));
const clone = value => structuredClone(value);
// Synthetic lifecycle fixtures never inherit the production admission decision.
const pending = {...clone(currentAdmission), status: 'pending', archive: {sha256: null, integrity: null},
    sources: {nativeCanonicalCommit: null, bindingsCanonicalCommit: null},
    qualification: {summarySha256: null, scalarModuleSha256: null, simdModuleSha256: null}};
const retained = currentAdmission.retainedPackage;
const legacyProducer = `const JOLT_PHYSICS_URL = '${retained.url}';\nconst JOLT_PHYSICS_INTEGRITY = '${retained.integrity}';\n`;
const legacyLock = {packages: {'': {dependencies: {'jolt-physics': retained.url}},
    'node_modules/jolt-physics': {version: retained.version, resolved: retained.url, integrity: retained.integrity}}};
const bytes = Buffer.from('SYNTHETIC ADMISSION TEST INPUT: NOT AN ENGINE OR A RELEASE');
const admittedFixture = () => ({...bindEngineArchive(clone(pending), bytes), status: 'admitted',
    sources: {nativeCanonicalCommit: '1'.repeat(40), bindingsCanonicalCommit: '2'.repeat(40)},
    qualification: {summarySha256: '3'.repeat(64), scalarModuleSha256: '4'.repeat(64), simdModuleSha256: '5'.repeat(64)}});
const inputFor = admission => {
    const producer = `const JOLT_PHYSICS_URL = '${admission.expectedPackage.url}';\nconst JOLT_PHYSICS_INTEGRITY = '${admission.archive.integrity}';\n`;
    const lock = {packages: {'': {dependencies: {'jolt-physics': admission.expectedPackage.url}},
        'node_modules/jolt-physics': {version: admission.expectedPackage.version, resolved: admission.expectedPackage.url, integrity: admission.archive.integrity}}};
    return {admission, producer, lock, archiveBytes: bytes};
};

test('explicit pending fixture binds injected bytes without admitting them', () => {
    assert.equal(pending.status, 'pending');
    assert.deepEqual(pending.archive, {sha256: null, integrity: null});
    assert(Object.values(pending.sources).every(value => value === null));
    assert(Object.values(pending.qualification).every(value => value === null));
    const bound = bindEngineArchive(pending, bytes);
    assert.equal(bound.status, 'pending');assert.notEqual(bound.archive.sha256, null);
    assert.equal(pending.archive.sha256, null, 'original record remains pending and unchanged');
    assert.throws(() => bindEngineArchive(admittedFixture(), bytes), /only pending engine records/);
    assert.throws(() => bindEngineArchive(pending, 'not bytes'), /actual archive bytes required/);
    assert.throws(() => resolveEngineAdmission(inputFor(bound)), /admission is pending/);
});

test('exact retained current pin remains valid while future package is pending', () => {
    const result = resolveEngineAdmission({admission: pending, producer: legacyProducer, lock: legacyLock});
    assert.equal(result.retained, true);assert.equal(result.version, pending.retainedPackage.version);
    // The retained protocol stays valid even after the production record is admitted.
    assert.equal(resolveEngineAdmission({admission: admittedFixture(), producer: legacyProducer, lock: legacyLock}).retained, true);
});

test('actual current producer and lock satisfy their declared production admission', () => {
    assert(['pending', 'admitted'].includes(currentAdmission.status));
    const actual = readEngineAdmission();
    const expected = actual.retained ? currentAdmission.retainedPackage : currentAdmission.expectedPackage;
    assert.equal(actual.version, expected.version);assert.equal(actual.resolved, expected.url);
    assert.equal(actual.integrity, actual.retained ? expected.integrity : currentAdmission.archive.integrity);
    assert.equal(currentJoltFetchPin().text, actual.resolved.replace('https://', ''));
    if (currentAdmission.status === 'admitted') {
        // Validate the real record's complete declared identities without claiming
        // synthetic test bytes are the actual production archive.
        const {archiveBytes, ...declared} = inputFor(currentAdmission);
        assert.equal(resolveEngineAdmission(declared).retained, false);
    }
});

test('explicit admitted fixture binds both digests of injected bytes and exact producer/lock/source identities', () => {
    const admission = admittedFixture(), result = resolveEngineAdmission(inputFor(admission));
    assert.equal(result.retained, false);assert.equal(result.version, '1.1.0-bw.10');
    assert.equal(result.archiveSha256, createHash('sha256').update(bytes).digest('hex'));
    const bad = {...inputFor(admission), archiveBytes: Buffer.from('different synthetic bytes')};
    assert.throws(() => resolveEngineAdmission(bad), /actual eventual archive bytes/);
});

test('missing fields, wrong source identities, unknown pins and lock divergence cannot select the new engine', () => {
    const cuts = [
        x => {x.admission.status = 'pending';}, x => {x.admission.archive.sha256 = null;},
        x => {x.admission.archive.integrity = null;}, x => {x.admission.sources.nativeCanonicalCommit = null;},
        x => {x.admission.sources.bindingsCanonicalCommit = 'short';}, x => {x.admission.qualification.summarySha256 = null;},
        x => {x.admission.qualification.scalarModuleSha256 = null;}, x => {x.admission.qualification.simdModuleSha256 = null;},
        x => {x.producer = x.producer.replace('bw.10-qualified', 'unknown-qualified');},
        x => {x.producer += x.producer;}, x => {delete x.lock.packages['node_modules/jolt-physics'];},
        x => {x.lock.packages[''].dependencies['jolt-physics'] = 'different';},
        x => {x.lock.packages['node_modules/jolt-physics'].version = '1.1.0-bw.9';},
        x => {x.lock.packages['node_modules/jolt-physics'].integrity = 'sha512-invalid';},
        x => {x.lock.packages['node_modules/jolt-physics'].resolved = 'different';}
    ];
    for (const cut of cuts) {const input = inputFor(admittedFixture());cut(input);assert.throws(() => resolveEngineAdmission(input));}
});

test('retained provenance census and every original reader/input byte remain mandatory', () => {
    mkdirSync(new URL('../test-results/', import.meta.url), {recursive: true});
    const temporary = mkdtempSync(new URL('../test-results/engine-admission-', import.meta.url)), root = pathToFileURL(temporary + path.sep);
    try {
        for (const file of Object.keys(pending.retainedFiles)) {
            const destination = new URL(file, root);mkdirSync(new URL('./', destination), {recursive: true});writeFileSync(destination, read(file));
        }
        for (const [file, data] of [['scripts/integrate.mjs', legacyProducer], ['packages/scratch-gui/package-lock.json', JSON.stringify(legacyLock)]]) {
            const destination = new URL(file, root);mkdirSync(new URL('./', destination), {recursive: true});writeFileSync(destination, data);
        }
        assert.equal(readEngineAdmission({root, admission: pending}).retained, true);
        assert.equal(readEngineAdmission({root, admission: admittedFixture()}).retained, true);
        // Exercise a future production-style store using explicitly synthetic
        // admitted data; never change the actual record, producer or lock.
        const future = admittedFixture(), futureInput = inputFor(future);
        writeFileSync(new URL('scripts/integrate.mjs', root), futureInput.producer);
        writeFileSync(new URL('packages/scratch-gui/package-lock.json', root), JSON.stringify(futureInput.lock));
        assert.throws(() => readEngineAdmission({root, admission: {...future, status: 'pending'}}), /admission is pending/);
        assert.equal(readEngineAdmission({root, admission: future}).retained, false);
        writeFileSync(new URL('scripts/integrate.mjs', root), legacyProducer);
        writeFileSync(new URL('packages/scratch-gui/package-lock.json', root), JSON.stringify(legacyLock));
        const changed = new URL('scripts/verify-sim-resting-creep.mjs', root);writeFileSync(changed, Buffer.concat([read('scripts/verify-sim-resting-creep.mjs'), Buffer.from('\n')]));
        assert.throws(() => readEngineAdmission({root, admission: pending}), /retained original changed/);
        const removed = clone(pending);delete removed.retainedFiles['scripts/verify-sim-resting-creep.mjs'];
        assert.throws(() => readEngineAdmission({root, admission: removed}), /exact retained provenance census/);
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
