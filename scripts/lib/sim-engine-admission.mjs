// SPDX-License-Identifier: BSD-3-Clause
// Resolve the current engine from its content-bound producer and lockfile pins.
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';

const repo = new URL('../../', import.meta.url);
const exactField = (source, name) => {
    const hits = [...source.matchAll(new RegExp(`const ${name} = '([^']+)'`, 'g'))];
    assert.equal(hits.length, 1, `one explicit ${name} pin`);
    return hits[0][1];
};
const validIntegrity = value => {
    if (typeof value !== 'string' || !value.startsWith('sha512-')) return false;
    const text = value.slice(7), decoded = Buffer.from(text, 'base64');
    return decoded.length === 64 && decoded.toString('base64') === text;
};

export const engineArchiveHashes = bytes => {
    assert(bytes instanceof Uint8Array, 'actual archive bytes required');
    return {sha256: createHash('sha256').update(bytes).digest('hex'),
        integrity: 'sha512-' + createHash('sha512').update(bytes).digest('base64')};
};

// The exported names remain compatible with current observers and readers.
// Package selection requires matching pins, not a separate approval record.
export function resolveEngineAdmission({producer, lock, archiveBytes}) {
    const resolved = exactField(producer, 'JOLT_PHYSICS_URL'), integrity = exactField(producer, 'JOLT_PHYSICS_INTEGRITY');
    const locked = lock?.packages?.['node_modules/jolt-physics'];
    assert(locked, 'installed engine lock entry is required');
    assert.equal(lock.packages['']?.dependencies?.['jolt-physics'], resolved, 'root lock dependency agrees');
    assert.equal(locked.resolved, resolved);assert.equal(locked.integrity, integrity);
    assert(validIntegrity(integrity), 'exact SHA512 integrity is required');
    const release = /^https:\/\/github\.com\/CrispStrobe\/JoltPhysics\.js\/releases\/download\/([^/?#]+)\/jolt-physics-([^/?#]+)\.tgz$/.exec(resolved);
    assert(release, 'versioned engine release URL is required');
    const [, releaseTag, version] = release;
    assert.equal(locked.version, version, 'archive filename and lock version agree');
    const engine = {version, releaseTag, resolved, integrity};
    if (archiveBytes !== undefined) {
        const actual = engineArchiveHashes(archiveBytes);
        assert.equal(actual.integrity, integrity, 'actual archive bytes must match pinned SHA512');
        engine.archiveSha256 = actual.sha256;
    }
    return engine;
}

export function readEngineAdmission({root = repo, archiveBytes} = {}) {
    return resolveEngineAdmission({
        producer: readFileSync(new URL('scripts/integrate.mjs', root), 'utf8'),
        lock: JSON.parse(readFileSync(new URL('packages/scratch-gui/package-lock.json', root))), archiveBytes});
}

export const currentEngineIdentity = options => {
    const {version, resolved, integrity} = readEngineAdmission(options);
    return {version, resolved, integrity};
};

/** The fetch census names precisely one current, content-bound archive. */
export const currentJoltFetchPin = () => {
    const engine = readEngineAdmission();
    return {file: 'scripts/integrate.mjs', kind: 'release', text: engine.resolved.replace('https://', ''), class: 'content-hash',
        why: `The Sim Lab engine ${engine.version}; producer and lockfile bind the same exact SHA512. ` +
            'Package installation verifies archive integrity. Changed bytes require a new release URL and matching producer/lockfile pins.'};
};
