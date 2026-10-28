import assert from 'node:assert/strict';
import {mkdir, mkdtemp, readFile, rm, writeFile} from 'node:fs/promises';
import {spawnSync} from 'node:child_process';
import {tmpdir} from 'node:os';
import path from 'node:path';
import test from 'node:test';
import {generateProofPackage, writeProofPackage} from '../scripts/package-native-broker-proof-pins.mjs';

const pinsPath = new URL('../overlay/scratch-vm/src/extension-support/gallery-proof-pins.json', import.meta.url);
const sourcePath = new URL('../overlay/scratch-gui/static/test-fixtures/capability-probe.js', import.meta.url);
const load = async () => ({pins: JSON.parse(await readFile(pinsPath, 'utf8')),
    source: new Uint8Array(await readFile(sourcePath))});
const clone = value => JSON.parse(JSON.stringify(value));

test('proof package deterministically emits two aliases sharing one digest-addressed source', async () => {
    const {pins, source} = await load();
    const first = generateProofPackage(pins, source);
    const second = generateProofPackage(clone(pins), source.slice());
    assert.equal(first.manifestText, second.manifestText);
    assert.equal(Object.keys(first.manifest.aliases).length, 2);
    assert.equal(new Set(Object.values(first.manifest.aliases).map(alias => alias.digest)).size, 1);
    assert.equal(first.manifest.source.bytes, source.byteLength);
    assert.equal(first.manifest.source.asset, `sources/${first.digest}.js`);
    assert.deepEqual(Object.values(first.manifest.aliases).map(alias => alias.brokerCapabilities),
        [['project.metadata.read'], []]);
});

test('proof package rejects byte, hash, URL, capability, duplicate, unsorted, deferred, and extra mutations', async () => {
    const {pins, source} = await load();
    const declared = Object.keys(pins)[0];
    const mutations = {
        byte: [pins, Uint8Array.from([...source.slice(0, -1), source.at(-1) ^ 1])],
        hash: [Object.assign(clone(pins), {[declared]: {...pins[declared], served: '0'.repeat(64)}}), source],
        url: [Object.fromEntries(Object.entries(clone(pins)).map(([url, pin], i) =>
            [i ? url : `${url}?changed=1`, pin])), source],
        capability: [Object.assign(clone(pins), {[declared]: {...pins[declared],
            brokerCapabilities: ['native.invoke']}}), source],
        duplicate: [Object.assign(clone(pins), {[declared]: {...pins[declared],
            brokerCapabilities: ['project.metadata.read', 'project.metadata.read']}}), source],
        unsorted: [Object.assign(clone(pins), {[declared]: {...pins[declared],
            brokerCapabilities: ['project.metadata.read', 'platform.kind.read']}}), source],
        deferred: [Object.assign(clone(pins), {[declared]: {...pins[declared], migration: {status: 'deferred'}}}), source],
        'extra fields': [Object.assign(clone(pins), {[declared]: {...pins[declared], source: 'authority'}}), source]
    };
    for (const [name, [candidatePins, candidateSource]] of Object.entries(mutations)) {
        assert.throws(() => generateProofPackage(candidatePins, candidateSource), undefined, name);
    }
});

test('checked-in proof package is fresh', () => {
    const result = spawnSync(process.execPath, ['scripts/package-native-broker-proof-pins.mjs', '--check'],
        {cwd: new URL('../', import.meta.url), encoding: 'utf8'});
    assert.equal(result.status, 0, result.stderr || result.stdout);
    assert.match(result.stdout, /2 aliases/u);
});

test('normal generation refuses an unreferenced executable source asset', async () => {
    const directory = await mkdtemp(path.join(tmpdir(), 'brickwright-broker-pins-'));
    try {
        const {pins, source} = await load();
        const generated = generateProofPackage(pins, source);
        await mkdir(path.join(directory, 'sources'));
        await writeFile(path.join(directory, 'sources', 'stale.js'), 'stale executable source');
        await assert.rejects(writeProofPackage(directory, generated), /stale native broker source assets: stale\.js/u);
        await assert.rejects(readFile(path.join(directory, 'manifest.json')), /ENOENT/u);
    } finally {
        await rm(directory, {recursive: true, force: true});
    }
});

test('integration and every production GUI build gate package freshness', async () => {
    const [pkg, integration, workflow] = await Promise.all([
        readFile(new URL('../package.json', import.meta.url), 'utf8'),
        readFile(new URL('../scripts/integrate.mjs', import.meta.url), 'utf8'),
        readFile(new URL('../.github/workflows/build.yml', import.meta.url), 'utf8')
    ]);
    const scripts = JSON.parse(pkg).scripts;
    assert.match(scripts['build:gui'], /package:broker-proof-pins:check/u);
    assert.match(scripts['build:gui:force'], /package:broker-proof-pins:check/u);
    assert.match(scripts.postvendor, /npm run build:gui/u);
    assert.match(integration, /package-native-broker-proof-pins\.mjs/u);
    assert.match(integration, /\), '--check'\]/u);
    assert.match(workflow, /node scripts\/package-native-broker-proof-pins\.mjs --check/u);
});
