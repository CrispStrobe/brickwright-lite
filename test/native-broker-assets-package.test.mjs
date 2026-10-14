import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {spawnSync} from 'node:child_process';
import test from 'node:test';
import vm from 'node:vm';
import {generateNativeBrokerAssets} from '../scripts/package-native-broker-assets.mjs';

const inputs = Object.fromEntries(await Promise.all(Object.entries({
    host: '../overlay/scratch-vm/src/extension-support/native-broker-worker-host.js',
    worker: '../overlay/scratch-vm/src/extension-support/native-broker-extension-worker.js',
    manifest: '../overlay/scratch-gui/static/native-broker/proof-pins/manifest.json',
    proof: '../overlay/scratch-gui/static/native-broker/proof-pins/sources/109b38c1740624623b31e0782f4e8b09769674dd7302851ef3858bc7c3fd2484.js'
}).map(async ([name, relative]) => [name, await readFile(new URL(relative, import.meta.url), 'utf8')])));

test('generator emits deterministic self-contained parseable host and fixed worker assets', () => {
    const first = generateNativeBrokerAssets(inputs);
    const second = generateNativeBrokerAssets({...inputs});
    assert.deepEqual(first, second);
    assert.doesNotThrow(() => new vm.Script(first.host));
    assert.doesNotThrow(() => new vm.Script(first.worker));
    assert.match(first.host, /__brickwrightInstallBrokerHost\(createProtocol\)/u);
    assert.match(first.host, /new Worker\(url\)/u);
    assert.match(first.host, /URL\.revokeObjectURL\(url\)/u);
    assert.doesNotMatch(first.host, /fetch\(|new Worker\('\//u);
    assert.match(first.worker, /installNativeBrokerExtensionWorker/u);
    assert.match(first.worker, /nativeImport\(url\)/u);
    assert.doesNotMatch(first.host, /webpackChunk|sourceMappingURL/u);
    assert.doesNotMatch(first.worker, /webpackChunk|sourceMappingURL/u);
    let factory;
    const realm = vm.createContext({Worker: function () {}, Blob, TextDecoder, TextEncoder,
        Uint8Array, ArrayBuffer, URL, AbortController, performance: {now: () => 0}, setTimeout, clearTimeout,
        __brickwrightInstallBrokerHost: value => { factory = value; }});
    assert.doesNotThrow(() => new vm.Script(first.host).runInContext(realm));
    assert.equal(typeof factory, 'function', 'bundle publishes the protocol factory through the one-shot bootstrap');
    class SuppliedProtocol { constructor (options) { this.options = options; } }
    const owner = {};
    const protocol = factory(owner, 'session-is-routing-only', SuppliedProtocol);
    assert.ok(protocol instanceof SuppliedProtocol, 'factory uses the receiver-authenticated protocol constructor');
    assert.equal(protocol.options.owner, owner);
});

test('every authority/core input participates in freshness output', () => {
    const baseline = generateNativeBrokerAssets(inputs);
    for (const name of ['host', 'worker', 'manifest']) {
        const changed = generateNativeBrokerAssets({...inputs, [name]: name === 'manifest' ?
            inputs[name].replace('browser-proof/declared', 'browser-proof/changed') : `${inputs[name]}\n// mutation`});
        assert.notDeepEqual(changed, baseline, `${name} mutation must stale an asset`);
    }
    assert.throws(() => generateNativeBrokerAssets({...inputs, manifest: '{}'}), /invalid packaged pin manifest/u);
    assert.throws(() => generateNativeBrokerAssets({...inputs, proof: `${inputs.proof}\n// mutation`}),
        /proof bytes do not match/u);
    assert.throws(() => generateNativeBrokerAssets({...inputs, host: inputs.host.replace(
        "require('../../../scratch-gui/static/native-broker/proof-pins/manifest.json')", 'manifest')}),
    /manifest import changed/u);
});

test('checked-in native broker bundles pass generator check mode', () => {
    const result = spawnSync(process.execPath, ['scripts/package-native-broker-assets.mjs', '--check'],
        {cwd: new URL('..', import.meta.url), encoding: 'utf8'});
    assert.equal(result.status, 0, result.stderr || result.stdout);
});

test('build, integration, and CI require broker asset freshness', async () => {
    const pkg = JSON.parse(await readFile(new URL('../package.json', import.meta.url), 'utf8'));
    const integration = await readFile(new URL('../scripts/integrate.mjs', import.meta.url), 'utf8');
    const workflow = await readFile(new URL('../.github/workflows/build.yml', import.meta.url), 'utf8');
    const tauriWorkflow = await readFile(new URL('../.github/workflows/tauri.yml', import.meta.url), 'utf8');
    const tauriPackage = JSON.parse(await readFile(new URL('../apps/tauri/package.json', import.meta.url), 'utf8'));
    assert.match(pkg.scripts['build:gui'], /package:broker-assets:check/u);
    assert.match(pkg.scripts['build:gui:force'], /package:broker-assets:check/u);
    assert.match(pkg.scripts['verify:broker-assets'], /verify-native-broker-assets\.mjs/u);
    assert.match(integration, /package-native-broker-assets\.mjs/u);
    assert.match(workflow, /package-native-broker-assets\.mjs --check/u);
    assert.match(workflow, /node scripts\/verify-native-broker-assets\.mjs/u);
    assert.match(tauriWorkflow, /package-native-broker-assets\.mjs --check/u);
    assert.match(tauriWorkflow, /overlay\/scratch-gui\/static\/native-broker\/\*\*/u);
    assert.match(tauriPackage.scripts.pretauri, /check:broker-assets/u);
    assert.match(tauriPackage.scripts.prebuild, /check:broker-assets/u);
});
