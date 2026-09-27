import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp, writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {readFileSync} from 'node:fs';

const ROOT = path.resolve(import.meta.dirname, '..');
const verifier = path.join(ROOT, 'scripts/verify-build-policy.mjs');

const fixture = async policy => {
    const directory = await mkdtemp(path.join(tmpdir(), 'bw-policy-'));
    await writeFile(path.join(directory, 'brickwright-build.json'), `${JSON.stringify({
        schema: 1,
        product: 'Brickwright',
        commit: '1234abc',
        builtAt: '2026-09-27T00:00:00.000Z',
        distributionPolicy: {remoteCode: policy}
    })}\n`);
    const evidence = policy === 'allow' ?
        'remote-code=allow extensions-v0.json' :
        'remote-code=deny This distribution can load only bundled extensions';
    await writeFile(path.join(directory, 'gui.js'), evidence);
    return directory;
};

const verify = (directory, expected) => spawnSync(process.execPath, [verifier, directory, expected], {
    encoding: 'utf8'
});

test('allow and deny artifacts carry matching immutable policy evidence', async () => {
    for (const policy of ['allow', 'deny']) {
        const result = verify(await fixture(policy), policy);
        assert.equal(result.status, 0, result.stderr);
        assert.match(result.stdout, new RegExp(`"policy":"${policy}"`));
    }
});

test('the artifact verifier rejects an expected-policy mismatch and missing UI evidence', async () => {
    const directory = await fixture('allow');
    const mismatch = verify(directory, 'deny');
    assert.notEqual(mismatch.status, 0);
    assert.match(mismatch.stderr, /compiled policy is allow, expected deny/);

    await writeFile(path.join(directory, 'gui.js'), 'extensions-v0.json');
    const missing = verify(directory, 'allow');
    assert.notEqual(missing.status, 0);
    assert.match(missing.stderr, /emitted UI does not expose remote-code=allow/);
});

test('webpack derives the manifest and UI constants from one build identity', () => {
    const config = readFileSync(path.join(ROOT, 'overlay/scratch-gui/webpack.config.js'), 'utf8');
    assert.match(config, /const buildManifest =/);
    assert.match(config, /distributionPolicy: \{remoteCode: remoteCodePolicy\}/);
    assert.match(config, /from: Buffer\.from\(buildManifest\)/);
    assert.match(config, /'process\.env\.BW_VERSION': JSON\.stringify\(buildCommit\)/);
    assert.match(config, /'process\.env\.BW_BUILD_TIME': JSON\.stringify\(buildTime\)/);
});
