import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import path from 'node:path';
import test from 'node:test';

import {attributePseudocodeImporter, P21_EMITTED_FLOOR_BYTES} from
    '../scripts/lib/p21-pseudocode-attribution.mjs';
import {openCodeActions} from '../scripts/lib-code-actions.mjs';

const read = filename => readFileSync(new URL(`../${filename}`, import.meta.url), 'utf8');
const ROOT = path.resolve(import.meta.dirname, '..');
const REPORTER = path.join(ROOT, 'scripts', 'verify-p21-pseudocode-emitted.mjs');

test('P21 has one retryable background-safe Code importer boundary', () => {
    const gui = read('overlay/scratch-gui/src/components/gui/gui.jsx');
    const wrapper = read('overlay/scratch-gui/src/containers/lazy-pseudocode-importer.jsx');
    const importer = read('overlay/scratch-gui/src/components/tw-pseudocode/pseudocode-importer.jsx');
    assert.doesNotMatch(gui, /import PseudocodeImporter from/);
    assert.match(gui, /import LazyPseudocodeImporter/);
    assert.match(gui, /onFocus=\{preloadPseudocodeImporter\}/);
    assert.match(gui, /onMouseEnter=\{preloadPseudocodeImporter\}/);
    assert.match(gui, /middleContent !== 'code'/);
    assert.match(wrapper, /webpackChunkName: "pseudocode-importer"/);
    assert.match(wrapper, /importerRequest = null/);
    assert.match(wrapper, /data-pseudocode-importer-loading/);
    assert.match(wrapper, /data-pseudocode-importer-load-error/);
    assert.match(wrapper, /Retry code editor/);
    assert.match(wrapper, /bw-project-bundle-loaded/);
    assert.match(wrapper, /bwPseudocodeSource/);
    assert.match(wrapper, /pendingBundleDetail/);
    assert.match(importer, /this\.props\.onPendingBundleHandled\(\)/);
    assert.match(importer, /this\.props\.onReady\(\)/);
    const bindProjectChanged = importer.indexOf("vm.runtime.on('PROJECT_CHANGED', this._onProjectChanged);");
    const replayProjectChanged = importer.indexOf('this._onProjectChanged();', bindProjectChanged);
    assert.ok(bindProjectChanged >= 0 && replayProjectChanged > bindProjectChanged);
    assert.match(importer, /data-testid="bw-code-editor"/);
});

test('Code actions wait for the lazy importer before opening its menu', async () => {
    const calls = [];
    const menu = {
        waitFor: async options => calls.push(['waitFor', options.state]),
        evaluate: async () => false,
        locator: () => ({click: async () => calls.push(['click'])}),
        count: async () => 0
    };
    const page = {
        locator: () => menu,
        waitForFunction: async () => calls.push(['open'])
    };
    assert.equal(await openCodeActions(page), true);
    assert.deepEqual(calls, [['waitFor', 'attached'], ['click'], ['open']]);
});

const fixture = (bytes = 76800) => ({
    hash: 'p21-hash',
    chunks: [
        {id: 1, names: ['gui'], initial: true, files: ['gui.js']},
        {id: 21, names: ['pseudocode-importer'], initial: false, files: ['chunks/pseudocode-importer.js']}
    ],
    assets: [
        {name: 'gui.js', size: 100000, chunks: [1]},
        {name: 'chunks/pseudocode-importer.js', size: bytes, chunks: [21]}
    ],
    modules: [
        {name: './src/playground/index.jsx', size: 10, chunks: [1]},
        {name: './src/components/tw-pseudocode/pseudocode-importer.jsx', size: 262317, chunks: [21]},
        {name: './src/lib/bw-asm/examples-i8086.js', size: 50908, chunks: [21]}
    ],
    namedChunkGroups: {
        'pseudocode-importer': {
            chunks: [21],
            assets: [{name: 'static/chunks/pseudocode-importer.js', size: bytes}]
        }
    }
});

test('P21 attributes a prefixed named group and exact boundary', () => {
    for (const [bytes, accepted] of [[76799, false], [76800, true]]) {
        const report = attributePseudocodeImporter(fixture(bytes));
        assert.equal(report.emittedBytes, bytes);
        assert.equal(report.emittedBytes >= P21_EMITTED_FLOOR_BYTES, accepted);
        assert.equal(report.sourceBytes, 313225);
        assert.equal(report.initialBytes, 100000);
    }
});

test('P21 source attribution counts only the candidate-exclusive closure', () => {
    const stats = fixture();
    stats.modules.push({name: './node_modules/shared.js', size: 500, chunks: [1, 21]});
    const report = attributePseudocodeImporter(stats);
    assert.equal(report.sourceBytes, 313225);
    assert.equal(report.sourceModules.some(module => module.name.endsWith('/shared.js')), false);
});

test('P21 rejects missing, duplicate and eager chunk ownership', () => {
    const missing = fixture();
    delete missing.namedChunkGroups['pseudocode-importer'];
    assert.throws(() => attributePseudocodeImporter(missing), /is missing/);
    const duplicate = fixture();
    duplicate.namedChunkGroups['pseudocode-importer'].chunks.push(21);
    assert.throws(() => attributePseudocodeImporter(duplicate), /duplicate chunk ids/);
    const eager = fixture();
    eager.chunks[1].initial = true;
    assert.throws(() => attributePseudocodeImporter(eager), /is initial/);
    const noModule = fixture();
    noModule.modules.splice(1, 1);
    assert.throws(() => attributePseudocodeImporter(noModule), /source module, found 0/);
    const duplicateModule = fixture();
    duplicateModule.modules.push({...duplicateModule.modules[1]});
    assert.throws(() => attributePseudocodeImporter(duplicateModule), /source module, found 2/);
    const duplicateInitial = fixture();
    duplicateInitial.modules.push({...duplicateInitial.modules[1], chunks: [1]});
    assert.throws(() => attributePseudocodeImporter(duplicateInitial), /source module, found 2/);
    for (const name of [
        './src/lib/bw-asm/examples-i8086.js',
        './src/lib/bw-asm/examples.js',
        './src/lib/bw-matrix/capabilities.js',
        './src/lib/bw-matrix/device-labels.js'
    ]) {
        const initialPayload = fixture();
        initialPayload.modules.push({name, size: 10, chunks: [1]});
        assert.throws(() => attributePseudocodeImporter(initialPayload), /static payload remains initial/);
    }
    const sharedImporter = fixture();
    sharedImporter.modules[1].chunks.push(22);
    assert.throws(() => attributePseudocodeImporter(sharedImporter), /not exclusive/);
});

test('P21 rejects malformed sizes and unaccounted async assets', () => {
    for (const value of [0, -1, Number.NaN, Number.POSITIVE_INFINITY, 'bad']) {
        const malformed = fixture();
        malformed.assets[1].size = value;
        assert.throws(() => attributePseudocodeImporter(malformed), /invalid size|mismatched size/);
    }
    const missingListed = fixture();
    missingListed.namedChunkGroups['pseudocode-importer'].assets = [];
    assert.throws(() => attributePseudocodeImporter(missingListed), /missing or duplicate/);
    const unaccounted = fixture();
    unaccounted.assets.push({name: 'chunks/extra.js', size: 6, chunks: [21]});
    assert.throws(() => attributePseudocodeImporter(unaccounted), /matched 0 assets/);
    const missingFile = fixture();
    missingFile.chunks[1].files.push('chunks/missing.js');
    assert.throws(() => attributePseudocodeImporter(missingFile), /matched 0 assets/);
    const badModule = fixture();
    badModule.modules[1].size = 0;
    assert.throws(() => attributePseudocodeImporter(badModule), /invalid size/);
});

test('P21 hosted receipt binds run, commits, emitted file and SHA-256', () => {
    const directory = mkdtempSync(path.join(tmpdir(), 'p21-attribution-'));
    const build = path.join(directory, 'build');
    const chunks = path.join(build, 'chunks');
    const stats = path.join(directory, 'stats.json');
    const receipt = path.join(directory, 'receipt.json');
    mkdirSync(chunks, {recursive: true});
    writeFileSync(path.join(chunks, 'pseudocode-importer.js'), Buffer.alloc(76800, 21));
    writeFileSync(stats, JSON.stringify(fixture()));
    try {
        const result = spawnSync(process.execPath, [REPORTER, stats, '--build-dir', build,
            '--run', '34060000000', '--head', 'a'.repeat(40), '--base', 'b'.repeat(40),
            '--write-receipt', receipt], {cwd: ROOT, encoding: 'utf8'});
        assert.equal(result.status, 0, result.stderr);
        const value = JSON.parse(readFileSync(receipt));
        assert.equal(value.schema, 'brickwright/p21-pseudocode-attribution/v1');
        assert.deepEqual(value.evidence, {
            run: 34060000000,
            headSha: 'a'.repeat(40),
            baseSha: 'b'.repeat(40),
            webpackHash: 'p21-hash'
        });
        assert.equal(value.attribution.assets[0].bytes, 76800);
        assert.match(value.attribution.assets[0].sha256, /^[0-9a-f]{64}$/);
        assert.equal(value.accepted, true);
        const belowStats = fixture(76799);
        writeFileSync(stats, JSON.stringify(belowStats));
        writeFileSync(path.join(chunks, 'pseudocode-importer.js'), Buffer.alloc(76799, 21));
        const below = spawnSync(process.execPath, [REPORTER, stats, '--build-dir', build,
            '--run', '34060000000', '--head', 'a'.repeat(40), '--base', 'b'.repeat(40),
            '--write-receipt', receipt], {cwd: ROOT, encoding: 'utf8'});
        assert.equal(below.status, 2, below.stderr);
        assert.equal(JSON.parse(readFileSync(receipt)).shortfallBytes, 1);
    } finally {
        rmSync(directory, {recursive: true, force: true});
    }
});

test('P21 CLI writes bound rejection receipts for every evidence failure', () => {
    const directory = mkdtempSync(path.join(tmpdir(), 'p21-rejection-'));
    const build = path.join(directory, 'build');
    const stats = path.join(directory, 'stats.json');
    const receipt = path.join(directory, 'receipt.json');
    mkdirSync(build, {recursive: true});
    const invoke = () => spawnSync(process.execPath, [REPORTER, stats, '--build-dir', build,
        '--run', '34060000001', '--head', 'c'.repeat(40), '--base', 'd'.repeat(40),
        '--write-receipt', receipt], {cwd: ROOT, encoding: 'utf8'});
    try {
        assert.equal(invoke().status, 1);
        let value = JSON.parse(readFileSync(receipt));
        assert.equal(value.failure.stage, 'read-stats');

        writeFileSync(stats, '{bad json');
        assert.equal(invoke().status, 1);
        value = JSON.parse(readFileSync(receipt));
        assert.equal(value.accepted, false);
        assert.equal(value.failure.stage, 'parse-stats');
        assert.deepEqual(value.evidence, {
            run: 34060000001,
            headSha: 'c'.repeat(40),
            baseSha: 'd'.repeat(40),
            webpackHash: null
        });

        const ambiguous = fixture();
        ambiguous.modules.push({...ambiguous.modules[1]});
        writeFileSync(stats, JSON.stringify(ambiguous));
        assert.equal(invoke().status, 1);
        value = JSON.parse(readFileSync(receipt));
        assert.equal(value.failure.stage, 'attribute');
        assert.match(value.failure.message, /source module, found 2/);

        writeFileSync(stats, JSON.stringify(fixture()));
        assert.equal(invoke().status, 1);
        value = JSON.parse(readFileSync(receipt));
        assert.equal(value.failure.stage, 'verify-assets');
        assert.match(value.failure.message, /ENOENT/);
        assert.equal(value.evidence.webpackHash, 'p21-hash');
        assert.equal(value.attribution.emittedBytes, 76800);
    } finally {
        rmSync(directory, {recursive: true, force: true});
    }
});
