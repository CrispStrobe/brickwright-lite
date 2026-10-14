import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {mkdtempSync, readFileSync, rmSync, writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import path from 'node:path';
import test from 'node:test';

import {
    attributeNamedWebpackChunk,
    attributeNamedWebpackChunkGroup
} from '../scripts/lib/webpack-ownership.mjs';

const ROOT = path.resolve(import.meta.dirname, '..');
const REPORTER = path.join(ROOT, 'scripts', 'report-connection-modal-attribution.mjs');
const RECEIPT = path.join(ROOT, 'test', 'fixtures', 'p18-connection-modal-receipt.json');
const RUN = '34059625658';
const HEAD = '60a4b9bb3ea77e2445b6cefc4c1eb7181a9322e2';

const fixture = () => ({
    hash: '056e6af76a94b16e972a',
    chunks: [
        {id: 3972, names: ['gui'], initial: true},
        {id: 1455, names: [], initial: false},
        {id: 3255, names: ['connection-modal'], initial: false}
    ],
    assets: [
        {name: 'gui.js', size: 4224748, chunks: [3972]},
        {name: 'chunks/1455.7f560d7fe652d9d9418c.js', size: 52693, chunks: [1455]},
        {name: 'chunks/connection-modal.js', size: 75446, chunks: [3255]}
    ],
    modules: [
        {name: './src/playground/index.jsx', size: 1, chunks: [3972]},
        {name: './src/components/connection-modal/connection-modal.jsx', size: 78893.42000000001, chunks: [3255]},
        {name: './src/containers/connection-modal.jsx', size: 16223, chunks: [3255]},
        {name: './src/components/progress-ring/progress-ring.jsx', size: 6718, chunks: [3255]},
        {name: './src/lib/microbit-update.js', size: 6170, chunks: [3255]},
        {name: './src/generated/microbit-hex-url.cjs', size: 20, chunks: [3255]}
    ],
    namedChunkGroups: {
        'connection-modal': {
            chunks: [1455, 3255],
            assets: [
                {name: 'chunks/1455.7f560d7fe652d9d9418c.js', size: 52693},
                {name: 'chunks/connection-modal.js', size: 75446}
            ]
        }
    }
});

const runReporter = (stats, receipt = RECEIPT) => {
    const directory = mkdtempSync(path.join(tmpdir(), 'p18-attribution-'));
    const statsPath = path.join(directory, 'stats.json');
    writeFileSync(statsPath, JSON.stringify(stats));
    const result = spawnSync(process.execPath, [REPORTER, statsPath, '--run', RUN, '--head', HEAD,
        '--check-receipt', receipt], {cwd: ROOT, encoding: 'utf8'});
    rmSync(directory, {recursive: true, force: true});
    return result;
};

test('the exact rejected hosted receipt remains reproducible', () => {
    const result = runReporter(fixture());
    assert.equal(result.status, 2, result.stderr);
    const report = JSON.parse(result.stdout);
    assert.equal(report.candidate.namedChunk.asset.bytes, 75446);
    assert.equal(report.shortfallBytes, 1354);
    assert.equal(report.candidate.namedChunkGroup.emittedBytes, 128139);
    assert.equal(report.namedAssetClearsFloor, false);
    assert.equal(report.chunkGroupClearsFloor, true);
    assert.equal(report.retryAcceptancePassed, false);
    assert.equal(report.accepted, false);
});

test('missing, duplicate and eager named chunks fail closed', () => {
    const missing = fixture();
    missing.chunks[2].names = [];
    assert.throws(() => attributeNamedWebpackChunk(missing, 'connection-modal'), /found 0/);
    const duplicate = fixture();
    duplicate.chunks[1].names = ['connection-modal'];
    assert.throws(() => attributeNamedWebpackChunk(duplicate, 'connection-modal'), /found 2/);
    const eager = fixture();
    eager.chunks[2].initial = true;
    assert.match(runReporter(eager).stderr, /connection-modal contains initial chunks/);
});

test('named chunk groups reject malformed ownership and asset accounting', () => {
    const missing = fixture();
    delete missing.namedChunkGroups['connection-modal'];
    assert.throws(() => attributeNamedWebpackChunkGroup(missing, 'connection-modal'), /is missing/);
    const duplicateChunk = fixture();
    duplicateChunk.namedChunkGroups['connection-modal'].chunks = [1455, 1455, 3255];
    assert.throws(() => attributeNamedWebpackChunkGroup(duplicateChunk, 'connection-modal'), /duplicate chunks/);
    const eagerSibling = fixture();
    eagerSibling.chunks[1].initial = true;
    assert.throws(() => attributeNamedWebpackChunkGroup(eagerSibling, 'connection-modal'), /initial chunks/);
    const missingAsset = fixture();
    missingAsset.namedChunkGroups['connection-modal'].assets.pop();
    assert.throws(() => attributeNamedWebpackChunkGroup(missingAsset, 'connection-modal'), /do not match/);
    const duplicateAsset = fixture();
    duplicateAsset.namedChunkGroups['connection-modal'].assets.push(
        duplicateAsset.namedChunkGroups['connection-modal'].assets[0]);
    assert.throws(() => attributeNamedWebpackChunkGroup(duplicateAsset, 'connection-modal'), /duplicate assets/);
    const wrongSize = fixture();
    wrongSize.namedChunkGroups['connection-modal'].assets[0].size = 0;
    assert.throws(() => attributeNamedWebpackChunkGroup(wrongSize, 'connection-modal'), /invalid or mismatched size/);
});

test('the emitted floor remains exactly 76,800 named-asset bytes', () => {
    for (const [bytes, clears] of [[76799, false], [76800, true]]) {
        const stats = fixture();
        stats.assets[2].size = bytes;
        const named = attributeNamedWebpackChunk(stats, 'connection-modal');
        assert.equal(named.asset.bytes >= 75 * 1024, clears);
    }
});

test('receipt identity and measured asset mutations fail the checked evidence', () => {
    const mutations = [
        receipt => { receipt.schema = 'wrong-schema'; },
        receipt => { receipt.evidence.run += 1; },
        receipt => { receipt.evidence.headSha = '0'.repeat(40); },
        receipt => { receipt.evidence.webpackHash = 'wrong-hash'; },
        receipt => { receipt.candidate.namedChunk.asset.name = 'chunks/wrong.js'; },
        receipt => { receipt.candidate.namedChunk.asset.bytes += 1; },
        receipt => { receipt.candidate.namedChunkGroup.assets.pop(); }
    ];
    for (const mutate of mutations) {
        const directory = mkdtempSync(path.join(tmpdir(), 'p18-receipt-'));
        const mutated = path.join(directory, 'receipt.json');
        const receipt = JSON.parse(readFileSync(RECEIPT));
        mutate(receipt);
        writeFileSync(mutated, JSON.stringify(receipt));
        try {
            const result = runReporter(fixture(), mutated);
            assert.equal(result.status, 1);
            assert.match(result.stderr, /P18 receipt differs/);
        } finally {
            rmSync(directory, {recursive: true, force: true});
        }
    }
});
