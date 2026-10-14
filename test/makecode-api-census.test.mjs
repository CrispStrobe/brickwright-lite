import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import fs from 'node:fs';
import os from 'node:os';
import {spawnSync} from 'node:child_process';
import {createRequire} from 'node:module';
import {censusTarget, parsePxtMetadata, verifyTargetVersions} from '../scripts/lib/makecode-api-census.mjs';
const root = process.env.BW_INTEGRATED_ROOT || path.resolve(import.meta.dirname, '..');
const ts = createRequire(path.join(root, 'packages/scratch-gui/package.json'))('typescript');
const versions = {target: 'owned-fixture@1', core: 'owned-core@1'};
test('target manifest must agree with bundled original versions', () => {
    const original = {versions: {target: '1', pxt: '1', tag: 'v1', commits: 'https://example.org/owned/commit/abc'}};
    assert.equal(verifyTargetVersions('owned', original, versions).sourceCommits, original.versions.commits);
    assert.throws(() => verifyTargetVersions('owned', original, {...versions, core: 'owned-core@2'}), /disagreement/);
    assert.throws(() => verifyTargetVersions('owned', {}, versions), /disagreement/);
});
const source = `namespace owned {
    export namespace nested {
        //% blockId=owned_choose block="choose %value" advanced=true value.fieldEditor="image"
        //% value.fieldOptions.gallery="sprites" value.min=0 value.max=10 value.defl=3 value.shadow=math_number
        export function choose<T>(value: T): T;
        export function choose<T>(value: T, fallback?: T): T;
        export function choose<T>(value: T, fallback: T = value): T { const secret = 42; return value; }
        function helper(): number { return 0; }
        export class Box<T> extends Parent<T> {
            private hidden: number;
            protected internal(): void {}
            public item: T;
            constructor(public value: T, readonly label: string = 'box', private pin: number = 3) {}
            method<U>(other: U = null): U { function local() {} return other; }
            get size(): number { return 1; }
            set size(value: number) {}
            static create(): Box<number> { return null; }
        }
        export interface Callable<T> { (input: T): T; [key: string]: T; field?: T; method(value: T): void; }
        export enum Mode { First, Other = 9 }
        export const size: number = 9;
        export const callable = () => { return 123456; };
        export type Pair<T> = [T, T];
    }
}`;
const bundle = files => ({bundledpkgs: {owned: {
    'pxt.json': JSON.stringify({files: ['api.ts', 'ambient.d.ts', 'test.ts'], testFiles: ['test.ts'], dependencies: {external: 'github:owned/external#pin'}}),
    'api.ts': source, 'ambient.d.ts': 'declare namespace ambient { function run(value?: string): void; interface State { readonly value: number; } }',
    'test.ts': 'namespace shouldNotAppear { export function test() {} }', ...files
}}, apiInfo: {}});

test('bundled declarations preserve nested signatures/defaults/generics and exclude implementation locals/private/test files', () => {
    const report = censusTarget(ts, 'arcade', bundle(), versions);
    const records = report.declarations;
    const names = records.map(row => row.qualifiedName);
    const overloads = records.filter(row => row.qualifiedName === 'owned.nested.choose');
    assert.equal(overloads.length, 3);
    assert.ok(overloads.every(row => row.overload.recordCount === 3));
    assert.equal(overloads[0].metadata.rawLines.length, 2);
    assert.ok(overloads[0].metadata.entries.some(row => row.key === 'value.fieldEditor' && row.value === 'image'));
    assert.ok(overloads[0].metadata.entries.some(row => row.key === 'block' && row.value === 'choose %value'));
    assert.equal(records.filter(row => row.qualifiedName === 'owned.nested.choose' && row.implementation).length, 1);
    assert.ok(records.some(row => row.signature.includes('fallback: T = value')));
    assert.ok(records.some(row => row.qualifiedName === 'owned.nested.Box.method' && row.signature.includes('<U>')));
    for (const name of ['owned.nested.Box.value', 'owned.nested.Box.label', 'owned.nested.Box.size',
        'owned.nested.Callable.[call]', 'owned.nested.Callable.[index]', 'owned.nested.Mode.Other',
        'owned.nested.Pair', 'ambient.run', 'ambient.State.value']) assert.ok(names.includes(name), name);
    for (const name of ['secret', 'helper', 'hidden', 'internal', 'pin', 'local', 'shouldNotAppear']) {
        assert.ok(!names.some(value => value.split('.').includes(name)), name);
    }
    assert.ok(report.excluded.some(row => row.file === 'test.ts'));
    assert.ok(report.unresolved.some(row => row.kind === 'dependency-boundary'));
    assert.ok(report.unresolved.some(row => row.kind === 'inherited-members-not-expanded'));
    assert.ok(records.every(row => /^[a-f0-9]{64}$/.test(row.sourceSha256) && /^[a-f0-9]{64}$/.test(row.id)));
    assert.ok(records.some(row => row.visibility === 'global-script-candidate-publicness-unresolved'));
    const callable = records.find(row => row.qualifiedName === 'owned.nested.callable');
    assert.equal(callable.initializerSyntax, 'ArrowFunction');
    assert.equal(callable.initializerPreview, undefined);
    assert.ok(!callable.signature.includes('123456'));
});

test('hashes change with public source while missing manifest files and aliases remain explicit', () => {
    const before = censusTarget(ts, 'arcade', bundle(), versions);
    const after = censusTarget(ts, 'arcade', bundle({'api.ts': source.replace('size: number = 9', 'size: number = 10')}), versions);
    assert.notEqual(before.declarations.find(row => row.qualifiedName === 'owned.nested.size').sourceSha256,
        after.declarations.find(row => row.qualifiedName === 'owned.nested.size').sourceSha256);
    const report = censusTarget(ts, 'arcade', {bundledpkgs: {example: {
        'pxt.json': JSON.stringify({files: ['exports.ts', 'missing.d.ts']}),
        'exports.ts': 'export {PublicName} from "./other"; export const good = 1; const local = 2;'
    }}}, versions);
    assert.ok(report.unresolved.some(row => row.kind === 'manifest-source-missing'));
    assert.ok(report.unresolved.some(row => row.kind === 'alias-or-reexport-not-resolved'));
    assert.ok(report.declarations.some(row => row.qualifiedName === 'good'));
    assert.ok(!report.declarations.some(row => row.qualifiedName === 'local'));
});


test('dotted namespaces and explicit global augmentation retain their public declarations', () => {
    const report = censusTarget(ts, 'arcade', {bundledpkgs: {owned: {
        'pxt.json': JSON.stringify({files: ['dotted.ts', 'augment.ts']}),
        'dotted.ts': 'namespace dotted.chain { export function next<T>(value: T): T { return value; } }',
        'augment.ts': 'export {}; declare global { interface Added { value: number; } }'
    }}}, versions);
    assert.ok(report.declarations.some(row => row.qualifiedName === 'dotted.chain.next'));
    assert.ok(report.declarations.some(row => row.qualifiedName === 'global.Added.value'));
});

test('CLI refuses absent pinned runtime instead of choosing installed target versions', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'bw-api-census-'));
    try {
        const cli = new URL('../scripts/makecode-api-census.mjs', import.meta.url);
        const run = spawnSync(process.execPath, [cli.pathname, '--runtime-root', dir,
            '--out', path.join(dir, 'report.json')], {encoding: 'utf8'});
        assert.notEqual(run.status, 0);
        assert.match(run.stderr, /Pinned MakeCode target bundle\/versions missing/);
        assert.ok(!fs.existsSync(path.join(dir, 'report.json')));
    } finally { fs.rmSync(dir, {recursive: true, force: true}); }
});


test('editor metadata retains raw options, repeated keys and unresolved quoted syntax', () => {
    const result = parsePxtMetadata(['//% weight=50 block="two words" value.fieldOptions.width=16',
        '//% advanced blockId=first blockId=second blockHidden = true', '//% block="unterminated']);
    assert.equal(result.rawLines.length, 3);
    assert.equal(result.entries.filter(entry => entry.key === 'blockId').length, 2);
    assert.deepEqual(result.unparsedLines, ['//% block="unterminated']);
    assert.ok(result.entries.some(entry => entry.key === 'advanced' && entry.flag));
    assert.ok(result.entries.some(entry => entry.key === 'blockHidden' && entry.value === 'true'));
    assert.deepEqual(parsePxtMetadata(['//% block="']).unparsedLines, ['//% block="']);
});
