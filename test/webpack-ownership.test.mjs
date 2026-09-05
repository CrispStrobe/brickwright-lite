import test from 'node:test';
import assert from 'node:assert/strict';
import {
    assertDosChunkBoundary,
    assertLazyPaintEditorBoundary,
    assertLazySvgSanitizerBoundary,
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

test('paint and Paper ownership stays together in a non-initial lazy asset', () => {
    const stats = fixture();
    stats.chunks.push(
        {id: 30, names: ['paint-reducer'], files: ['chunks/paint-reducer.js'], initial: false},
        {id: 31, names: ['paint-editor'], files: ['chunks/paint-editor.js'], initial: false},
        {id: 32, names: [], files: ['chunks/4117.js'], initial: false},
        {id: 33, names: [], files: ['chunks/7549.js'], initial: false}
    );
    stats.assets.push(
        {name: 'chunks/paint-reducer.js', size: 100, chunks: [30]},
        {name: 'chunks/paint-editor.js', size: 100, chunks: [31]},
        {name: 'chunks/4117.js', size: 210000, chunks: [32]},
        {name: 'chunks/7549.js', size: 40000, chunks: [33]}
    );
    stats.modules.push(
        {name: './src/lib/lazy-paint-reducer.js', size: 100, chunks: [30]},
        {name: './src/lib/lazy-paint-editor.jsx', size: 100, chunks: [31]},
        {name: './node_modules/@scratch/paper/dist/paper-core.js', size: 535000, chunks: [32]},
        {name: './node_modules/scratch-paint/src/containers/paint-editor.jsx', size: 105000, chunks: [33]}
    );
    const report = summarizeWebpackOwnership(stats);
    assert.deepEqual(report.lazyPaintEditor.packages, ['@scratch/paper', 'scratch-paint']);
    assert.equal(report.lazyPaintEditor.sourceBytes, 640000);
    assert.equal(report.lazyPaintEditor.emittedBytes, 250000);
    assert.equal(report.lazyPaintEditor.initial, false);
    assert.deepEqual(report.lazyPaintActivation.reducer.files, ['chunks/paint-reducer.js']);
    assert.deepEqual(report.lazyPaintActivation.editor.files, ['chunks/paint-editor.js']);
    assert.deepEqual(assertLazyPaintEditorBoundary(report), []);
});

test('paint boundary rejects eager, incomplete or insignificant ownership', () => {
    const report = summarizeWebpackOwnership(fixture());
    const failures = assertLazyPaintEditorBoundary(report);
    assert.equal(failures.length, 5);
    assert.match(failures.join('\n'), /packages are missing/);
    assert.match(failures.join('\n'), /below 600 KiB/);
    assert.match(failures.join('\n'), /below 200 KiB/);
    assert.match(failures.join('\n'), /paint-reducer chunk is missing/);
    assert.match(failures.join('\n'), /paint-editor chunk is missing/);
});

test('paint boundary rejects eager or collapsed activation stages', () => {
    const stats = fixture();
    stats.chunks.push({id: 30, names: ['paint-reducer', 'paint-editor'], files: ['paint.js'], initial: true});
    stats.assets.push({name: 'paint.js', size: 250000, chunks: [30]});
    stats.modules.push(
        {name: './node_modules/@scratch/paper/dist/paper-core.js', size: 535000, chunks: [30]},
        {name: './node_modules/scratch-paint/src/index.js', size: 105000, chunks: [30]}
    );
    const failures = assertLazyPaintEditorBoundary(summarizeWebpackOwnership(stats));
    assert.match(failures.join('\n'), /paint-reducer became an initial chunk/);
    assert.match(failures.join('\n'), /paint-editor became an initial chunk/);
    assert.match(failures.join('\n'), /same emitted JavaScript asset/);
});

const svgSanitizerFixture = () => {
    const stats = fixture();
    stats.chunks.push(
        {id: 40, names: ['svg-sanitizer'], files: ['chunks/svg-sanitizer.js'], initial: false,
            siblings: [41, 42]},
        {id: 41, names: [], files: ['chunks/renderer.js'], initial: false, siblings: [40, 42]},
        {id: 42, names: [], files: ['chunks/css-data.js'], initial: false, siblings: [40, 41]}
    );
    stats.assets.push(
        {name: 'chunks/svg-sanitizer.js', size: 1000, chunks: [40]},
        {name: 'chunks/renderer.js', size: 20000, chunks: [41]},
        {name: 'chunks/css-data.js', size: 80000, chunks: [42]}
    );
    stats.modules.push(
        {name: './overlay/scratch-gui/src/lib/lazy-svg-sanitizer.js', size: 1000, chunks: [40]},
        {name: './packages/scratch-svg-renderer/src/index.js', size: 12000, chunks: [41]},
        {name: './packages/scratch-svg-renderer/src/sanitize-svg.js', size: 8000, chunks: [41]},
        {name: './node_modules/css-tree/lib/parser/index.js', size: 120000, chunks: [42]}
    );
    return stats;
};

test('SVG sanitizer ownership is named, non-initial and large enough to matter', () => {
    const report = summarizeWebpackOwnership(svgSanitizerFixture());
    assert.equal(report.lazySvgSanitizer.namedChunk.emittedBytes, 1000);
    assert.equal(report.lazySvgSanitizer.namedChunk.ownsSanitizerEntry, true);
    assert.equal(report.lazySvgSanitizer.rendererIndex.initial, false);
    assert.equal(report.lazySvgSanitizer.sanitizeSvg.initial, false);
    assert.equal(report.lazySvgSanitizer.sanitizeSvg.demandChunkOwned, true);
    assert.equal(report.lazySvgSanitizer.cssTree.sourceBytes, 120000);
    assert.equal(report.lazySvgSanitizer.mdnData.found, false);
    assert.equal(report.lazySvgSanitizer.cssPayload.sourceBytes, 120000);
    assert.equal(report.lazySvgSanitizer.cssPayload.emittedBytes, 80000);
    assert.deepEqual(report.lazySvgSanitizer.cssPayload.files, ['chunks/css-data.js']);
    assert.deepEqual(assertLazySvgSanitizerBoundary(report), []);
});

test('SVG sanitizer boundary rejects missing modules and an insignificant payload', () => {
    const failures = assertLazySvgSanitizerBoundary(summarizeWebpackOwnership(fixture()));
    assert.match(failures.join('\n'), /named svg-sanitizer chunk is missing/);
    assert.match(failures.join('\n'), /css-tree sanitizer asset fell below 75 KiB/);
    assert.match(failures.join('\n'), /scratch-svg-renderer sanitize-svg is missing/);
    assert.match(failures.join('\n'), /css-tree is missing/);
});

test('SVG sanitizer boundary rejects eager or incorrectly owned modules', () => {
    const stats = svgSanitizerFixture();
    stats.chunks.push({id: 43, names: [], files: ['chunks/eager.js'], initial: true});
    stats.assets.push({name: 'chunks/eager.js', size: 100, chunks: [43]});
    const rendererIndex = stats.modules.find(module => module.name.endsWith('/src/index.js'));
    rendererIndex.chunks = [41, 43];
    const cssTree = stats.modules.find(module => module.name.includes('/css-tree/'));
    cssTree.chunks = [42, 43];
    stats.modules = stats.modules.filter(module => !module.name.includes('lazy-svg-sanitizer'));
    const failures = assertLazySvgSanitizerBoundary(summarizeWebpackOwnership(stats));
    assert.match(failures.join('\n'), /scratch-svg-renderer barrel\/index became initial JavaScript/);
    assert.match(failures.join('\n'), /css-tree became initial JavaScript/);
    assert.match(failures.join('\n'), /does not own a sanitizer bridge or module/);
});

test('SVG sanitizer boundary rejects dependencies outside its async chunk group', () => {
    const stats = svgSanitizerFixture();
    stats.chunks.find(chunk => chunk.id === 40).siblings = [41];
    const failures = assertLazySvgSanitizerBoundary(summarizeWebpackOwnership(stats));
    assert.match(failures.join('\n'), /css-tree is not owned by the svg-sanitizer demand chunk group/);
});

test('SVG sanitizer boundary rejects every required module family becoming eager', () => {
    const mutations = [
        ['/src/index.js', /scratch-svg-renderer barrel\/index became initial JavaScript/],
        ['/src/sanitize-svg.js', /scratch-svg-renderer sanitize-svg became initial JavaScript/],
        ['/css-tree/', /css-tree became initial JavaScript/]
    ];
    for (const [modulePath, expectedFailure] of mutations) {
        const stats = svgSanitizerFixture();
        stats.chunks.push({id: 43, names: [], files: ['chunks/eager.js'], initial: true});
        stats.assets.push({name: 'chunks/eager.js', size: 100, chunks: [43]});
        stats.modules.find(module => module.name.includes(modulePath)).chunks.push(43);
        assert.match(
            assertLazySvgSanitizerBoundary(summarizeWebpackOwnership(stats)).join('\n'),
            expectedFailure
        );
    }
});

test('SVG sanitizer boundary rejects an eager or assetless named entry', () => {
    const stats = svgSanitizerFixture();
    stats.chunks.find(chunk => chunk.names.includes('svg-sanitizer')).initial = true;
    stats.assets = stats.assets.filter(asset => !asset.name.endsWith('svg-sanitizer.js'));
    const failures = assertLazySvgSanitizerBoundary(summarizeWebpackOwnership(stats));
    assert.match(failures.join('\n'), /svg-sanitizer became an initial chunk/);
    assert.match(failures.join('\n'), /svg-sanitizer chunk emitted no JavaScript asset/);
});

test('SVG sanitizer boundary rejects MDN lexer data and a shrunken emitted asset', () => {
    const stats = svgSanitizerFixture();
    stats.assets.find(asset => asset.name.endsWith('css-data.js')).size = 76799;
    stats.modules.push({name: './node_modules/mdn-data/css/properties.json', size: 220000, chunks: [42]});
    const failures = assertLazySvgSanitizerBoundary(summarizeWebpackOwnership(stats));
    assert.match(failures.join('\n'), /asset fell below 75 KiB: 76799 bytes/);
    assert.match(failures.join('\n'), /mdn-data is bundled/);
});
