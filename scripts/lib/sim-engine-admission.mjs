// SPDX-License-Identifier: BSD-3-Clause
// Current engine identity is separate from retained observations and their readers.
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';

const repo = new URL('../../', import.meta.url);
const recordFile = 'test/fixtures/bw-sim/engine-admissions/bw10.json';
const retainedProvenanceSha256 = 'bfbc609d90e41650717f39f879175b1888ea2f14db7544ebcff2fb257c71d761';
const digest = bytes => createHash('sha256').update(bytes).digest('hex');
const canonical = value => JSON.stringify(value, (_, item) => item && typeof item === 'object' && !Array.isArray(item)
    ? Object.fromEntries(Object.entries(item).sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0)) : item);
const exactField = (source, name) => {
    const hits = [...source.matchAll(new RegExp(`const ${name} = '([^']+)'`, 'g'))];
    assert.equal(hits.length, 1, `one explicit ${name} pin`);
    return hits[0][1];
};
const validSha = (value, length) => typeof value === 'string' && new RegExp(`^[0-9a-f]{${length}}$`).test(value);
const validIntegrity = value => {
    if (typeof value !== 'string' || !value.startsWith('sha512-')) return false;
    const text = value.slice(7), decoded = Buffer.from(text, 'base64');
    return decoded.length === 64 && decoded.toString('base64') === text;
};

const archiveHashes = bytes => {
    assert(bytes instanceof Uint8Array, 'actual archive bytes required');
    return {sha256: digest(bytes), integrity: 'sha512-' + createHash('sha512').update(bytes).digest('base64')};
};
/** Bind eventual bytes only to a pending record; admitted evidence stays immutable. */
export const bindEngineArchive = (admission, bytes) => {
    assert.equal(admission.status, 'pending', 'only pending engine records may bind new bytes');
    return {...admission, archive: archiveHashes(bytes)};
};

/** Pure injectable boundary: an unknown or pending current pin always refuses. */
export function resolveEngineAdmission({admission, producer, lock, archiveBytes}) {
    assert.equal(admission?.schema, 'brickwright.engine-admission.v1');
    const resolved = exactField(producer, 'JOLT_PHYSICS_URL'), integrity = exactField(producer, 'JOLT_PHYSICS_INTEGRITY');
    const locked = lock?.packages?.['node_modules/jolt-physics'];
    assert(locked, 'installed engine lock entry is required');
    assert.equal(lock.packages[''].dependencies['jolt-physics'], resolved, 'root lock dependency agrees');
    assert.equal(locked.resolved, resolved);assert.equal(locked.integrity, integrity);
    assert(validIntegrity(integrity), 'exact SHA512 integrity is required');
    const retained = admission.retainedPackage;
    if (resolved === retained.url) {
        assert.equal(locked.version, retained.version);assert.equal(integrity, retained.integrity);
        return {version: retained.version, releaseTag: retained.releaseTag, resolved, integrity, archiveSha256: retained.sha256, retained: true};
    }
    assert.equal(admission.status, 'admitted', 'current engine package admission is pending');
    const current = admission.expectedPackage;
    assert.equal(current.version, '1.1.0-bw.10');
    assert.equal(current.releaseTag, 'bw.10-qualified-20261112');
    assert.equal(current.url, `https://github.com/CrispStrobe/JoltPhysics.js/releases/download/${current.releaseTag}/jolt-physics-${current.version}.tgz`);
    assert.equal(resolved, current.url);assert.equal(locked.version, current.version);
    assert(validSha(admission.archive?.sha256, 64), 'actual archive SHA256 required');
    assert(validIntegrity(admission.archive?.integrity), 'actual archive SHA512 required');
    assert.equal(integrity, admission.archive.integrity);
    if (archiveBytes !== undefined) {
        const actual = archiveHashes(archiveBytes);
        assert.deepEqual(actual, admission.archive, 'actual eventual archive bytes must match both hashes');
    }
    for (const key of ['nativeCanonicalCommit', 'bindingsCanonicalCommit']) assert(validSha(admission.sources?.[key], 40), `actual ${key} required`);
    for (const key of ['summarySha256', 'scalarModuleSha256', 'simdModuleSha256']) assert(validSha(admission.qualification?.[key], 64), `actual ${key} required`);
    return {version: current.version, releaseTag: current.releaseTag, resolved, integrity, archiveSha256: admission.archive.sha256, retained: false};
}

/** Only exact old files are shared by current producers/readers. No observer replay. */
export function readEngineAdmission({root = repo, admission = JSON.parse(readFileSync(new URL(recordFile, root)))} = {}) {
    const protectedRecord = {retainedPackage: admission.retainedPackage, retainedFiles: Object.fromEntries(Object.entries(admission.retainedFiles || {}).sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0))};
    assert.equal(digest(canonical(protectedRecord)), retainedProvenanceSha256, 'exact retained provenance census');
    for (const [file, sha256] of Object.entries(admission.retainedFiles)) {
        assert(!file.startsWith('/') && !file.split('/').includes('..'), 'contained retained path');
        assert.equal(digest(readFileSync(new URL(file, root))), sha256, `retained original changed: ${file}`);
    }
    return resolveEngineAdmission({admission,
        producer: readFileSync(new URL('scripts/integrate.mjs', root), 'utf8'),
        lock: JSON.parse(readFileSync(new URL('packages/scratch-gui/package-lock.json', root)))});
}

export const currentEngineIdentity = options => {
    const {version, resolved, integrity} = readEngineAdmission(options);
    return {version, resolved, integrity};
};

/** The fetch census still names precisely one current, content-bound archive. */
export const currentJoltFetchPin = () => {
    const engine = readEngineAdmission();
    return {file: 'scripts/integrate.mjs', kind: 'release', text: engine.resolved.replace('https://', ''), class: 'content-hash',
        why: `The Sim Lab engine ${engine.version}, exact archive SHA256 ${engine.archiveSha256}; producer and lockfile bind the same SHA512. ` +
            'A new engine requires explicit canonical source/package qualification admission. Retained bw.9 fixture bytes and readers keep their original identities.'};
};
