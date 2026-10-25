import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import path from 'node:path';
import test from 'node:test';
import {REVIEWED_P20_RECEIPT, reviewedReceiptErrors} from '../scripts/lib/p20-sb1-receipt.mjs';

const ROOT = path.resolve(import.meta.dirname, '..');
const GATE = path.join(ROOT, 'scripts', 'verify-p20-sb1-emitted.mjs');
const INTEGRITY = REVIEWED_P20_RECEIPT.package.integrity;
const apply = readFileSync(new URL('../scripts/apply-vm-overlay.mjs', import.meta.url), 'utf8');
const gate = readFileSync(GATE, 'utf8');

const fixture = ({sizes = [100], eager = false} = {}) => {
    const directory = mkdtempSync(path.join(tmpdir(), 'p20-emitted-'));
    const build = path.join(directory, 'build');
    const chunks = path.join(build, 'chunks');
    const packageJson = path.join(directory, 'package.json');
    const packageLock = path.join(directory, 'package-lock.json');
    const receipt = path.join(directory, 'receipt.json');
    mkdirSync(chunks, {recursive: true});
    writeFileSync(path.join(build, 'index.html'),
        eager ? '<script src="sb1-converter.fixture.js"></script>' : '<script src="main.js"></script>');
    sizes.forEach((size, index) => writeFileSync(
        path.join(chunks, `sb1-converter.fixture-${index}.js`), Buffer.alloc(size, 0x61)));
    writeFileSync(packageJson, JSON.stringify({name: 'scratch-sb1-converter', version: '1.0.317'}));
    writeFileSync(packageLock, JSON.stringify({packages: {'node_modules/scratch-sb1-converter': {
        version: '1.0.317', integrity: INTEGRITY
    }}}));
    return {directory, build, packageJson, packageLock, receipt};
};

const run = subject => spawnSync(process.execPath, [GATE], {
    cwd: ROOT,
    encoding: 'utf8',
    env: {
        ...process.env,
        BW_BUILD: subject.build,
        P20_PACKAGE_JSON: subject.packageJson,
        P20_PACKAGE_LOCK: subject.packageLock,
        P20_RECEIPT: subject.receipt,
        GITHUB_RUN_ID: '1',
        GITHUB_SHA: 'fixture'
    }
});

test('the rejected Scratch 1 candidate is absent from the production overlay', () => {
    assert.doesNotMatch(apply, /webpackChunkName: "sb1-converter"/);
});

test('the reusable emitted measurement retains the declared floor and package pin', () => {
    assert.match(gate, /const floorBytes = 75 \* 1024/);
    assert.match(gate, /emittedBytes >= floorBytes/);
    assert.match(gate, /index\.includes\('sb1-converter'\)/);
    assert.match(gate, /pkg\.version !== '1\.0\.317'/);
    assert.match(gate, /REVIEWED_P20_RECEIPT\.package\.integrity/);
});

test('the emitted gate stops at 76,799 bytes and accepts exactly 76,800', () => {
    for (const [emittedBytes, status, clearsFloor] of [[76799, 2, false], [76800, 0, true]]) {
        const subject = fixture({sizes: [emittedBytes]});
        try {
            const result = run(subject);
            assert.equal(result.status, status, result.stderr);
            const receipt = JSON.parse(readFileSync(subject.receipt, 'utf8'));
            assert.equal(receipt.emittedBytes, emittedBytes);
            assert.equal(receipt.floorBytes, 76800);
            assert.equal(receipt.clearsFloor, clearsFloor);
        } finally {
            rmSync(subject.directory, {recursive: true, force: true});
        }
    }
});

test('zero chunks, duplicate chunks, and an eager index reference fail closed', () => {
    for (const [options, expected] of [
        [{sizes: []}, /expected one sb1-converter chunk, found 0/],
        [{sizes: [100, 100]}, /expected one sb1-converter chunk, found 2/],
        [{sizes: [100], eager: true}, /index\.html eagerly references sb1-converter/]
    ]) {
        const subject = fixture(options);
        try {
            const result = run(subject);
            assert.equal(result.status, 1);
            const receipt = JSON.parse(readFileSync(subject.receipt, 'utf8'));
            assert.match(receipt.errors.join('\n'), expected);
            assert.equal(receipt.clearsFloor, false);
        } finally {
            rmSync(subject.directory, {recursive: true, force: true});
        }
    }
});

test('the reviewed CI receipt pins every evidence and provenance field', () => {
    const receipt = JSON.parse(readFileSync(
        new URL('./fixtures/p20-sb1-converter-emitted-receipt.json', import.meta.url), 'utf8'));
    assert.deepEqual(receipt, REVIEWED_P20_RECEIPT);
    assert.deepEqual(reviewedReceiptErrors(receipt), []);
    assert.equal(receipt.schema, 'brickwright/p20-sb1-converter-emitted/v1');
    assert.equal(receipt.hostedRun, 34058754836);
    assert.equal(receipt.commit, 'c0893500f91b86b60bdcc6bac8ca40fd861fee1d');
    assert.deepEqual(receipt.package, {
        name: 'scratch-sb1-converter',
        version: '1.0.317',
        integrity: INTEGRITY
    });
    assert.equal(receipt.chunk, 'sb1-converter.3ef272d0de5c57251335.js');
    assert.equal(receipt.emittedBytes, 43171);
    assert.equal(receipt.gzipBytes, 14086);
    assert.equal(receipt.sha256, 'a1135f6b88555da7af399161959a77f2981d13eba5b55ef43847d996a4667d84');
    assert.equal(receipt.floorBytes, 76800);
    assert.equal(receipt.clearsFloor, false);
    assert.deepEqual(receipt.errors, []);
});

test('reviewed receipt mutations fail for identity and provenance fields', () => {
    const mutations = [
        receipt => { receipt.schema = 'brickwright/p20-sb1-converter-emitted/v2'; },
        receipt => { receipt.hostedRun++; },
        receipt => { receipt.commit = '0'.repeat(40); },
        receipt => { receipt.package.name = 'other-package'; },
        receipt => { receipt.package.version = '1.0.318'; },
        receipt => { receipt.package.integrity = 'sha512-mutated'; },
        receipt => { receipt.chunk = 'sb1-converter.other.js'; },
        receipt => { receipt.sha256 = '0'.repeat(64); }
    ];
    for (const mutate of mutations) {
        const receipt = structuredClone(REVIEWED_P20_RECEIPT);
        mutate(receipt);
        assert.notDeepEqual(reviewedReceiptErrors(receipt), []);
    }
});
