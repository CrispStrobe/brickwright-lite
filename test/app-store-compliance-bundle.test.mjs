import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync, mkdirSync, readFileSync, writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {packageStoreCompliance} from '../scripts/package-store-compliance.mjs';

const ROOT = path.resolve(import.meta.dirname, '..');

test('the reviewer packet states the actual default, alternatives, transfer, and caveat', () => {
    const doc = readFileSync(path.join(ROOT, 'docs/APP-STORE-COMPLIANCE.md'), 'utf8');
    assert.match(doc, /default artifact deliberately enables three independently compiled download\s+classes/);
    assert.match(doc, /hosted compilation\s+sends the source being compiled/);
    assert.match(doc, /not every pinned compatibility extension\s+is editable/);
    assert.match(doc, /BW_REMOTE_CODE_POLICY=deny/);
    assert.match(doc, /not legal advice/);
    const entitlements = readFileSync(path.join(ROOT, 'apps/tauri/src-tauri/entitlements.plist'), 'utf8');
    assert.doesNotMatch(entitlements, /Native builds refuse downloaded extension JS/);
});

test('a compliance bundle binds policy, source commit and every supplied artifact by digest', () => {
    const dir = mkdtempSync(path.join(tmpdir(), 'bw-store-bundle-'));
    const build = path.join(dir, 'build');
    const out = path.join(dir, 'out');
    mkdirSync(build);
    writeFileSync(path.join(build, 'brickwright-build.json'), JSON.stringify({
        schema: 2, product: 'Brickwright', commit: '1234567', builtAt: '2026-09-28T00:00:00Z',
        distributionPolicy: {remoteExtensions: 'allow', executableToolchains: 'deny', machineImages: 'allow'}
    }));
    const artifact = path.join(dir, 'Brickwright.ipa');
    writeFileSync(artifact, 'signed-native-artifact-fixture');
    const manifest = packageStoreCompliance({
        root: ROOT, buildDir: build, artifacts: [artifact], outDir: out, verify: false,
        now: () => '2026-09-28T00:00:00.000Z', sourceCommit: `1234567${'a'.repeat(33)}`
    });
    assert.match(manifest.sourceCommit, /^[0-9a-f]{40}$/);
    assert.equal(manifest.buildReceipt.distributionPolicy.executableToolchains, 'deny');
    assert.equal(manifest.outputScan, 'not run');
    const record = manifest.files.find(file => file.name === 'Brickwright.ipa');
    assert.deepEqual(record, {
        name: 'Brickwright.ipa', bytes: 30,
        sha256: 'b169eb233d3096ebafa27f2749359d086deb64a577853077810c8d32b373198a'
    });
    assert.equal(JSON.parse(readFileSync(path.join(out, 'manifest.json'))).sourceCommit,
        manifest.sourceCommit);
});

test('invalid or incomplete policy receipts cannot produce reviewer evidence', () => {
    const dir = mkdtempSync(path.join(tmpdir(), 'bw-store-bundle-'));
    mkdirSync(path.join(dir, 'build'));
    writeFileSync(path.join(dir, 'build/brickwright-build.json'), JSON.stringify({
        schema: 2, product: 'Brickwright', distributionPolicy: {remoteExtensions: 'sometimes'}
    }));
    assert.throws(() => packageStoreCompliance({
        root: ROOT, buildDir: path.join(dir, 'build'), artifacts: [new URL(import.meta.url).pathname],
        outDir: path.join(dir, 'out'), verify: false, sourceCommit: 'a'.repeat(40)
    }), /invalid remoteExtensions policy/);
});
