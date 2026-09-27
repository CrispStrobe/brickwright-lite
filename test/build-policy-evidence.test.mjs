import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp, writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {readFileSync} from 'node:fs';

const ROOT = path.resolve(import.meta.dirname, '..');
const verifier = path.join(ROOT, 'scripts/verify-build-policy.mjs');

const fixture = async policies => {
    const directory = await mkdtemp(path.join(tmpdir(), 'bw-policy-'));
    await writeFile(path.join(directory, 'brickwright-build.json'), `${JSON.stringify({
        schema: 2,
        product: 'Brickwright',
        commit: '1234abc',
        builtAt: '2026-09-27T00:00:00.000Z',
        distributionPolicy: policies
    })}\n`);
    const evidence = [
        `remote-extensions=${policies.remoteExtensions}`,
        `toolchains=${policies.executableToolchains}`,
        `machine-images=${policies.machineImages}`,
        policies.remoteExtensions === 'allow' ? 'extensions-v0.json' :
            'This distribution can load only bundled extensions',
        policies.executableToolchains === 'allow' ? 'crispstrobe.github.io/sdcc-wasm' :
            'distribution cannot download executable toolchains',
        policies.machineImages === 'allow' ? 'brickwright-media-lab' :
            'restricted build does not download executable machine images'
    ].join(' ');
    await writeFile(path.join(directory, 'gui.js'), evidence);
    return directory;
};

const verify = (directory, expected) => spawnSync(process.execPath, [verifier, directory, expected], {
    encoding: 'utf8'
});

test('allow and deny artifacts carry matching immutable policy evidence', async () => {
    for (const policy of ['allow', 'deny']) {
        const policies = {remoteExtensions: policy, executableToolchains: policy, machineImages: policy};
        const result = verify(await fixture(policies), policy);
        assert.equal(result.status, 0, result.stderr);
        assert.match(result.stdout, new RegExp(`"remoteExtensions":"${policy}"`));
    }
});

test('a mixed artifact proves each independent capability', async () => {
    const policies = {remoteExtensions: 'deny', executableToolchains: 'allow', machineImages: 'allow'};
    const directory = await fixture(policies);
    const result = spawnSync(process.execPath, [verifier, directory], {
        encoding: 'utf8',
        env: {...process.env, BW_EXPECT_REMOTE_EXTENSIONS_POLICY: 'deny',
            BW_EXPECT_REMOTE_TOOLCHAINS_POLICY: 'allow', BW_EXPECT_REMOTE_MACHINE_IMAGES_POLICY: 'allow'}
    });
    assert.equal(result.status, 0, result.stderr);
});

test('the artifact verifier rejects an expected-policy mismatch and missing UI evidence', async () => {
    const policies = {remoteExtensions: 'allow', executableToolchains: 'allow', machineImages: 'allow'};
    const directory = await fixture(policies);
    const mismatch = verify(directory, 'deny');
    assert.notEqual(mismatch.status, 0);
    assert.match(mismatch.stderr, /compiled remoteExtensions policy is allow, expected deny/);

    await writeFile(path.join(directory, 'gui.js'), 'extensions-v0.json');
    const missing = verify(directory, 'allow');
    assert.notEqual(missing.status, 0);
    assert.match(missing.stderr, /emitted UI does not expose remote-extensions=allow/);
});

test('webpack derives the manifest and UI constants from one build identity', () => {
    const config = readFileSync(path.join(ROOT, 'overlay/scratch-gui/webpack.config.js'), 'utf8');
    assert.match(config, /const buildManifest =/);
    assert.match(config, /distributionPolicy\n/);
    assert.match(config, /BW_REMOTE_EXTENSIONS_POLICY/);
    assert.match(config, /from: Buffer\.from\(buildManifest\)/);
    assert.match(config, /'process\.env\.BW_VERSION': JSON\.stringify\(buildCommit\)/);
    assert.match(config, /'process\.env\.BW_BUILD_TIME': JSON\.stringify\(buildTime\)/);
});
