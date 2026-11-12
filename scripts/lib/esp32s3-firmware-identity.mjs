import assert from 'node:assert/strict';

const fullSha = /^[0-9a-f]{40}$/;
const repository = /^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/;

/** Retained firmware/ROM provenance and the executing engine are independent
 * identities. Read the engine identity from the same synchronizer whose web
 * asset hashes the browser proof checks; do not infer it from the fixtures. */
export function admitEsp32S3FirmwareIdentity ({manifest, romSource, engineSyncSource}) {
    assert.equal(manifest?.schema, 1, 'ESP32-S3 fixture manifest must have schema 1');
    assert.match(romSource?.repository || '', repository, 'ROM source must name its repository');
    assert.match(romSource?.commit || '', fullSha, 'ROM source must name a complete commit');
    assert.equal(manifest.sourceRepository, romSource.repository,
        'Retained firmware repository differs from the ROM source');
    assert.equal(manifest.sourceCommit, romSource.commit,
        'Retained firmware commit differs from the ROM source');

    assert.equal(typeof engineSyncSource, 'string', 'Authoritative browser engine synchronizer is required');
    const declaration = (name, pattern) => {
        const matches = [...engineSyncSource.matchAll(new RegExp(`^const ${name} = '([^'\\r\\n]+)';$`, 'gm'))];
        assert.equal(matches.length, 1, `Browser synchronizer must declare ${name} exactly once`);
        assert.match(matches[0][1], pattern, `Browser synchronizer has an invalid ${name}`);
        return matches[0][1];
    };
    const engine = {
        sourceCommit: declaration('PIN', fullSha),
        releaseRepository: declaration('REPO', repository),
        releaseTag: declaration('TAG', /^\S+$/)
    };
    for (const [name, expected] of Object.entries(engine)) {
        assert.equal(manifest.engine?.[name], expected,
            `Fixture engine ${name} differs from the authoritative browser engine`);
    }
    return {retainedSource: {repository: romSource.repository, commit: romSource.commit}, engine};
}
