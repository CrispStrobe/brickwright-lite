import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {admitEsp32S3FirmwareIdentity} from '../scripts/lib/esp32s3-firmware-identity.mjs';

const retainedSource = {repository: 'CrispStrobe/labwired-core', commit: '1'.repeat(40)};
const currentEngine = {sourceCommit: retainedSource.commit,
    releaseRepository: 'CrispStrobe/bw-board', releaseTag: 'labwired-wasm-retained-locked'};
const nextEngine = {...currentEngine, sourceCommit: '2'.repeat(40), releaseTag: 'labwired-wasm-next-locked'};
const synchronizer = engine => `const PIN = '${engine.sourceCommit}';\n` +
    `const TAG = '${engine.releaseTag}';\nconst REPO = '${engine.releaseRepository}';\n`;
const fixture = (engine = currentEngine) => ({
    manifest: {schema: 1, sourceRepository: retainedSource.repository, sourceCommit: retainedSource.commit,
        engine: {...engine}},
    romSource: {...retainedSource}, engineSyncSource: synchronizer(engine)
});

test('the retained firmware and current engine may share the same admitted source', () => {
    assert.deepEqual(admitEsp32S3FirmwareIdentity(fixture()),
        {retainedSource, engine: currentEngine});
});

test('a newer pinned engine may run unchanged retained firmware and ROMs', () => {
    const f = fixture(nextEngine);
    const before = structuredClone(f);
    assert.deepEqual(admitEsp32S3FirmwareIdentity(f), {retainedSource, engine: nextEngine});
    assert.deepEqual(f, before, 'admission must not relabel retained provenance or mutate engine pins');
    assert.notEqual(f.manifest.sourceCommit, f.manifest.engine.sourceCommit);
});

test('changing only the fixture engine cannot authorize a browser engine upgrade', () => {
    const f = fixture(nextEngine);
    f.engineSyncSource = synchronizer(currentEngine);
    assert.throws(() => admitEsp32S3FirmwareIdentity(f), /Fixture engine sourceCommit differs/);
    f.engineSyncSource = synchronizer({...nextEngine, releaseTag: currentEngine.releaseTag});
    assert.throws(() => admitEsp32S3FirmwareIdentity(f), /Fixture engine releaseTag differs/);
});

test('wrong or missing retained firmware and ROM identities are refused independently', () => {
    for (const [name, wrong] of [['sourceRepository', 'Other/retained-source'], ['sourceCommit', '3'.repeat(40)]]) {
        for (const value of [wrong, undefined]) {
            const f = fixture(nextEngine);
            f.manifest[name] = value;
            assert.throws(() => admitEsp32S3FirmwareIdentity(f), /Retained firmware .* differs/);
        }
    }
    for (const change of [{repository: ''}, {commit: 'short'}, {commit: undefined}]) {
        const f = fixture(nextEngine);
        Object.assign(f.romSource, change);
        assert.throws(() => admitEsp32S3FirmwareIdentity(f), /ROM source must name/);
    }
    assert.throws(() => admitEsp32S3FirmwareIdentity({...fixture(), manifest: undefined}), /schema 1/);
    const wrongSchema = fixture(); wrongSchema.manifest.schema = 2;
    assert.throws(() => admitEsp32S3FirmwareIdentity(wrongSchema), /schema 1/);
});

test('each executing-engine identity is required and must match the synchronizer', () => {
    for (const [name, wrong] of [['sourceCommit', '3'.repeat(40)],
        ['releaseRepository', 'Other/engine'], ['releaseTag', 'unadmitted-release']]) {
        for (const value of [wrong, undefined, '']) {
            const f = fixture(nextEngine);
            f.manifest.engine[name] = value;
            assert.throws(() => admitEsp32S3FirmwareIdentity(f),
                new RegExp(`Fixture engine ${name} differs`));
        }
    }
    const f = fixture(nextEngine); delete f.manifest.engine;
    assert.throws(() => admitEsp32S3FirmwareIdentity(f), /Fixture engine sourceCommit differs/);
});

test('missing, ambiguous and malformed synchronizer declarations cannot admit a release', () => {
    for (const name of ['PIN', 'TAG', 'REPO']) {
        const f = fixture();
        const line = f.engineSyncSource.split('\n').find(row => row.startsWith(`const ${name} = `));
        for (const source of [f.engineSyncSource.replace(line, ''), `${f.engineSyncSource}${line}\n`]) {
            assert.throws(() => admitEsp32S3FirmwareIdentity({...f, engineSyncSource: source}),
                new RegExp(`must declare ${name} exactly once`));
        }
    }
    for (const [name, replacement] of [['PIN', 'short'], ['TAG', ' '], ['REPO', 'missing-owner']]) {
        const f = fixture();
        f.engineSyncSource = f.engineSyncSource.replace(new RegExp(`const ${name} = '[^']+';`),
            `const ${name} = '${replacement}';`);
        assert.throws(() => admitEsp32S3FirmwareIdentity(f), new RegExp(`invalid ${name}`));
    }
    assert.throws(() => admitEsp32S3FirmwareIdentity({...fixture(), engineSyncSource: undefined}),
        /Authoritative browser engine synchronizer is required/);
});

test('the checked-in browser synchronizer can supply the admitted engine identity', async () => {
    const engineSyncSource = await readFile(new URL('../scripts/sync-labwired-wasm.mjs', import.meta.url), 'utf8');
    const field = name => engineSyncSource.match(new RegExp(`^const ${name} = '([^']+)';$`, 'm'))?.[1];
    const engine = {sourceCommit: field('PIN'), releaseRepository: field('REPO'), releaseTag: field('TAG')};
    const f = {...fixture(engine), engineSyncSource};
    assert.deepEqual(admitEsp32S3FirmwareIdentity(f), {retainedSource, engine});
    f.manifest.engine.releaseRepository = 'Wrong/producer';
    assert.throws(() => admitEsp32S3FirmwareIdentity(f), /Fixture engine releaseRepository differs/);
});
