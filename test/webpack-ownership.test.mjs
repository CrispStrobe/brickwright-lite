import test from 'node:test';
import assert from 'node:assert/strict';
import {assertDosChunkBoundary, summarizeWebpackOwnership} from '../scripts/lib/webpack-ownership.mjs';

const fixture = (dosModules = [
    {name: './src/lib/bw-board/i8086-machine.js', size: 700, chunks: [8]},
    {name: './src/lib/bw-debug/i8086-dos-bench.js', size: 300, chunks: [8]}
]) => ({
    hash: 'abc',
    chunks: [
        {id: 1, names: ['gui'], files: ['gui.12345678.js'], initial: true, size: 3000},
        {id: 2, names: [], files: ['2923.12345678.js'], initial: true, size: 9000},
        {id: 8, names: ['bw-debug-i8086'], files: ['chunks/bw-debug-i8086.js'], initial: false, size: 1000}
    ],
    assets: [
        {name: 'gui.12345678.js', size: 3000, chunks: [1]},
        {name: '2923.12345678.js', size: 9000, chunks: [2]},
        {name: 'chunks/bw-debug-i8086.js', size: 1000, chunks: [8]}
    ],
    modules: [
        {name: './src/playground/index.jsx', size: 3000, chunks: [1]},
        {name: './node_modules/react/index.js', size: 4000, chunks: [2]},
        {name: './node_modules/@scope/large/index.js', size: 5000, chunks: [2]},
        ...dosModules
    ]
});

test('webpack ownership reports initial assets, package owners and the isolated DOS chunk', () => {
    const report = summarizeWebpackOwnership(fixture());
    assert.equal(report.initial.bytes, 12000);
    assert.deepEqual(report.initial.owners, [
        {owner: '@scope/large', bytes: 5000},
        {owner: 'react', bytes: 4000},
        {owner: 'app:playground', bytes: 3000}
    ]);
    assert.deepEqual(report.dosChunk.files, ['chunks/bw-debug-i8086.js']);
    assert.deepEqual(report.dosChunk.forbiddenModules, []);
    assert.deepEqual(assertDosChunkBoundary(report), []);
});

test('the DOS boundary rejects broad registries, solvers and unrelated CPU families', () => {
    const report = summarizeWebpackOwnership(fixture([
        {name: './src/lib/bw-board/index.js', size: 1, chunks: [8]},
        {name: './src/lib/bw-board/analog-solver.js', size: 1, chunks: [8]},
        {name: './src/lib/bw-board/z80-machine.js', size: 1, chunks: [8]}
    ]));
    assert.deepEqual(report.dosChunk.forbiddenModules.map(module => module.reason), [
        'broad-board-or-device-registry', 'solver', 'unrelated-cpu-family'
    ]);
    assert.equal(assertDosChunkBoundary(report).length, 1);
});
