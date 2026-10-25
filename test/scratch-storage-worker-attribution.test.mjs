import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import path from 'node:path';
import test from 'node:test';

const ROOT = path.resolve(import.meta.dirname, '..');
const PROBE = path.join(ROOT, 'scripts', 'report-scratch-storage-worker-attribution.mjs');
const WORKER = 'f6240eab828e6d415177.worker.js';
const MODULE = '/fixture/node_modules/scratch-storage/dist/web/scratch-storage.js';
const PIN = '6285d012425f3de521aad5a849f31f52721d096c';

const fixture = ({movable = 100, nested = false, fallbackName, fallbackSize = 6, moduleSize = 280064,
    moduleCount = 1, moduleChunks = ['main'], rawStatsTransform} = {}) => {
    const root = mkdtempSync(path.join(tmpdir(), 'p19-storage-'));
    const put = (relative, value) => {
        const destination = path.join(root, relative);
        mkdirSync(path.dirname(destination), {recursive: true});
        writeFileSync(destination, value);
    };
    put('package.json', JSON.stringify({version: '2.3.284', repository: {sha: PIN}}));
    const decoded = 'worker';
    const literal = JSON.stringify(decoded);
    put('dist/web/scratch-storage.js', `head InlineWorker.js\")(${literal}, __webpack_require__.p + \"${WORKER}\") tail`);
    put(`dist/web/${WORKER}`, decoded);
    put('node_modules/worker-loader/dist/workers/InlineWorker.js', 'r');
    put('src/ProxyTool.js', 'p');
    const fetchBytes = movable - Buffer.byteLength(literal) - 2;
    assert.ok(fetchBytes > 0);
    put('src/FetchWorkerTool.js', 'f'.repeat(fetchBytes));
    const storageModules = Array.from({length: moduleCount}, () => ({
        name: MODULE,
        size: moduleSize,
        chunks: moduleChunks
    }));
    const compilation = {
        hash: 'fixture-webpack-hash',
        assets: [{name: 'main.js', size: 1}, ...(fallbackName ? [{name: fallbackName, size: fallbackSize}] : [])],
        chunks: [
            {id: 'main', initial: true},
            {id: 'async', initial: false}
        ],
        modules: storageModules
    };
    const stats = nested ? {children: [{name: 'empty'}, compilation]} : compilation;
    const statsPath = path.join(root, 'stats.json');
    let rawStats = JSON.stringify(stats);
    if (rawStatsTransform) rawStats = rawStatsTransform(rawStats);
    writeFileSync(statsPath, rawStats);
    return {root, statsPath};
};

const run = (subject, extra = []) => spawnSync(process.execPath, [PROBE, subject.statsPath, ...extra], {
    cwd: ROOT,
    encoding: 'utf8',
    env: {...process.env, BW_SCRATCH_STORAGE_ROOT: subject.root}
});
const clean = subject => rmSync(subject.root, {recursive: true, force: true});

test('root and nested webpack stats produce the same closed attribution', () => {
    for (const nested of [false, true]) {
        const subject = fixture({nested});
        try {
            const result = run(subject);
            assert.equal(result.status, 2, result.stderr);
            const report = JSON.parse(result.stdout);
            assert.equal(report.ownership.storageModuleSourceBytes, 280064);
            assert.equal(report.worker.movableRawUpperBoundBytes, 100);
            assert.equal(report.ownership.initialOnly, true);
            assert.equal(report.plausible, false);
        } finally {
            clean(subject);
        }
    }
});

test('the pinned scratch-storage package identity is mandatory', () => {
    for (const pkg of [
        {version: '2.3.285', repository: {sha: PIN}},
        {version: '2.3.284', repository: {sha: 'wrong-revision'}}
    ]) {
        const subject = fixture();
        try {
            writeFileSync(path.join(subject.root, 'package.json'), JSON.stringify(pkg));
            const result = run(subject);
            assert.equal(result.status, 1);
            assert.match(result.stderr, /expected scratch-storage 2\.3\.284/);
        } finally {
            clean(subject);
        }
    }
});

test('missing and duplicate scratch-storage modules fail closed', () => {
    for (const [moduleCount, expected] of [[0, 0], [2, 2]]) {
        const subject = fixture({moduleCount});
        try {
            const result = run(subject);
            assert.equal(result.status, 1);
            assert.match(result.stderr, new RegExp(`expected one scratch-storage browser module, found ${expected}`));
        } finally {
            clean(subject);
        }
    }
});

test('a prefixed fallback asset is recognized by its normalized basename', () => {
    for (const fallbackName of [`assets/${WORKER}?cache=1`, `assets\\workers\\${WORKER}`]) {
        const subject = fixture({fallbackName});
        try {
            const result = run(subject);
            assert.equal(result.status, 2, result.stderr);
            assert.equal(JSON.parse(result.stdout).worker.fallbackEmitted, true);
        } finally {
            clean(subject);
        }
    }
});

test('malformed, nonfinite, and zero module sizes fail closed', () => {
    const cases = [
        {moduleSize: 'broken', expected: /invalid size broken/},
        {moduleSize: 0, expected: /invalid size 0/},
        {
            moduleSize: 123456789,
            rawStatsTransform: raw => raw.replace('123456789', '1e400'),
            expected: /invalid size Infinity/
        }
    ];
    for (const options of cases) {
        const subject = fixture(options);
        try {
            const result = run(subject);
            assert.equal(result.status, 1);
            assert.match(result.stderr, options.expected);
        } finally {
            clean(subject);
        }
    }
});

test('a malformed emitted fallback size fails closed', () => {
    const subject = fixture({fallbackName: `assets/${WORKER}`});
    try {
        const raw = readFileSync(subject.statsPath, 'utf8').replace(`\"size\":6`, `\"size\":0`);
        writeFileSync(subject.statsPath, raw);
        const result = run(subject);
        assert.equal(result.status, 1);
        assert.match(result.stderr, /fallback asset .* invalid size 0/);
    } finally {
        clean(subject);
    }
});

test('unknown and asynchronous chunk ownership fail closed', () => {
    for (const [moduleChunks, expected] of [
        [['missing'], /references missing chunks: missing/],
        [['main', 'async'], /unaccounted async ownership in chunks: async/]
    ]) {
        const subject = fixture({moduleChunks});
        try {
            const result = run(subject);
            assert.equal(result.status, 1);
            assert.match(result.stderr, expected);
        } finally {
            clean(subject);
        }
    }
});

test('76,799 bytes stops and 76,800 bytes permits a candidate', () => {
    for (const [movable, status, plausible] of [[76799, 2, false], [76800, 0, true]]) {
        const subject = fixture({movable});
        try {
            const result = run(subject);
            assert.equal(result.status, status, result.stderr);
            const report = JSON.parse(result.stdout);
            assert.equal(report.worker.movableRawUpperBoundBytes, movable);
            assert.equal(report.plausible, plausible);
        } finally {
            clean(subject);
        }
    }
});

test('the 76,800-byte boundary includes an emitted fallback asset', () => {
    for (const [movable, status, total, plausible] of [
        [76793, 2, 76799, false],
        [76794, 0, 76800, true]
    ]) {
        const subject = fixture({movable, fallbackName: `assets/${WORKER}`, fallbackSize: 6});
        try {
            const result = run(subject);
            assert.equal(result.status, status, result.stderr);
            const report = JSON.parse(result.stdout);
            assert.equal(report.worker.componentBytes.emittedFallbackAsset, 6);
            assert.equal(report.worker.movableRawUpperBoundBytes, total);
            assert.equal(report.plausible, plausible);
        } finally {
            clean(subject);
        }
    }
});

test('receipt writing and exact checking detect evidence drift', () => {
    const subject = fixture();
    const receiptPath = path.join(subject.root, 'receipt.json');
    try {
        const written = run(subject, ['--write-receipt', receiptPath]);
        assert.equal(written.status, 2, written.stderr);
        const checked = run(subject, ['--check-receipt', receiptPath]);
        assert.equal(checked.status, 2, checked.stderr);
        const receipt = JSON.parse(readFileSync(receiptPath, 'utf8'));
        receipt.storageModuleSourceBytes++;
        writeFileSync(receiptPath, JSON.stringify(receipt));
        const drifted = run(subject, ['--check-receipt', receiptPath]);
        assert.equal(drifted.status, 1);
        assert.match(drifted.stderr, /P19 receipt differs/);
    } finally {
        clean(subject);
    }
});

test('the reviewed receipt preserves the real P19 stopping evidence', () => {
    const receipt = JSON.parse(readFileSync(
        path.join(ROOT, 'test', 'fixtures', 'p19-scratch-storage-worker-receipt.json'), 'utf8'));
    assert.equal(receipt.webpackHash, '30fa48f7e6bfb148c743');
    assert.equal(receipt.storageModuleSourceBytes, 280064);
    assert.equal(receipt.movableRawUpperBoundBytes, 32773);
    assert.equal(receipt.decodedInlineWorkerBytes, 22345);
    assert.equal(receipt.fallbackFileBytes, 22345);
    assert.equal(receipt.fallbackEmitted, false);
    assert.equal(receipt.plausible, false);
});
