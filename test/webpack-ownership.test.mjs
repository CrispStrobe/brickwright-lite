import test from 'node:test';
import assert from 'node:assert/strict';
import {
    assertDosChunkBoundary,
    assertOptionalCodeMirrorGrammarBoundary,
    auditWebpackResourceWindow,
    summarizeWebpackOwnership
} from '../scripts/lib/webpack-ownership.mjs';

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

test('a causal resource window maps fetched assets back to nested webpack modules and bytes', () => {
    const stats = fixture();
    stats.modules.push({name: './concatenated', size: 1000, chunks: [8], modules: [
        {name: './src/lib/bw-board/mna.js', size: 600},
        {name: './src/lib/bw-board/audio-bus.js', size: 400}
    ]});
    const report = auditWebpackResourceWindow(stats, [
        {name: 'http://localhost/chunks/bw-debug-i8086.js', kind: 'script', at: 12,
            transferSize: 0, encodedBodySize: 1000, decodedBodySize: 2200},
        {name: 'http://localhost/gui.12345678.js', kind: 'script', at: 2,
            transferSize: 3000, encodedBodySize: 3000, decodedBodySize: 3000}
    ], {from: 10, to: 20, origin: 'http://localhost'});
    assert.equal(report.scripts, 1);
    assert.equal(report.transferBytes, 0, 'cached scripts legitimately transfer zero bytes');
    assert.equal(report.encodedBodyBytes, 1000);
    assert.equal(report.decodedBodyBytes, 2200);
    assert.deepEqual(report.assets, ['chunks/bw-debug-i8086.js']);
    assert.deepEqual(report.forbiddenModules.map(module => module.reason), ['solver']);
    assert.deepEqual(report.unmatchedAssets, []);
});

test('webpack verbose stats can carry modules on chunks instead of the compilation root', () => {
    const stats = fixture();
    const modules = stats.modules;
    delete stats.modules;
    for (const chunk of stats.chunks) {
        chunk.modules = modules.filter(module => module.chunks.includes(chunk.id));
    }
    stats.children = [{name: 'HtmlWebpackCompiler', assets: [], chunks: [{id: 0, modules: []}]}];
    const report = summarizeWebpackOwnership(stats);
    assert.equal(report.initial.bytes, 12000);
    assert.equal(report.dosChunk.found, true);
    assert.deepEqual(report.dosChunk.forbiddenModules, []);
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

test('optional CodeMirror grammar ownership is non-initial, complete and large enough to matter', () => {
    const stats = fixture();
    stats.chunks.push(
        {id: 20, names: ['bw-codemirror-lang-cpp'], files: ['bw-codemirror-lang-cpp.js'], initial: false},
        {id: 21, names: ['bw-codemirror-lang-python'], files: ['bw-codemirror-lang-python.js'], initial: false},
        {id: 22, names: ['bw-codemirror-lang-javascript'], files: ['bw-codemirror-lang-javascript.js'], initial: false}
    );
    stats.assets.push(
        {name: 'bw-codemirror-lang-cpp.js', size: 50000, chunks: [20]},
        {name: 'bw-codemirror-lang-python.js', size: 45000, chunks: [21]},
        {name: 'bw-codemirror-lang-javascript.js', size: 40000, chunks: [22]}
    );
    stats.modules.push(
        {name: './node_modules/@codemirror/lang-cpp/dist/index.js', size: 100000, chunks: [20]},
        {name: './node_modules/@codemirror/lang-python/dist/index.js', size: 80000, chunks: [21]},
        {name: './node_modules/@codemirror/lang-javascript/dist/index.js', size: 80000, chunks: [22]}
    );
    const report = summarizeWebpackOwnership(stats);
    assert.deepEqual(report.optionalCodeMirrorGrammars.packages, [
        '@codemirror/lang-cpp', '@codemirror/lang-javascript', '@codemirror/lang-python'
    ]);
    assert.equal(report.optionalCodeMirrorGrammars.sourceBytes, 260000);
    assert.equal(report.optionalCodeMirrorGrammars.emittedBytes, 135000);
    assert.equal(report.optionalCodeMirrorGrammars.initial, false);
    assert.deepEqual(assertOptionalCodeMirrorGrammarBoundary(report), []);
});

test('optional grammar boundary rejects eager, incomplete or insignificant splits', () => {
    const report = summarizeWebpackOwnership(fixture());
    const failures = assertOptionalCodeMirrorGrammarBoundary(report);
    assert.equal(failures.length, 3);
    assert.match(failures.join('\n'), /packages are missing/);
    assert.match(failures.join('\n'), /below 250 KiB/);
    assert.match(failures.join('\n'), /below 100 KiB/);
});
