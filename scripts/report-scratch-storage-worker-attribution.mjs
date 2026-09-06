#!/usr/bin/env node
/** P19: bound the scratch-storage fetch worker before attempting a lazy split. */
import {createHash} from 'node:crypto';
import {readFileSync, statSync} from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const statsPath = path.resolve(process.argv[2] ||
    path.join(ROOT, 'artifacts', 'i8086-performance', 'webpack-stats.json'));
const storageRoot = path.resolve(process.env.BW_SCRATCH_STORAGE_ROOT ||
    path.join(ROOT, 'packages', 'scratch-gui', 'node_modules', 'scratch-storage'));
const read = relative => readFileSync(path.join(storageRoot, relative));
const bytes = relative => statSync(path.join(storageRoot, relative)).size;
const sha256 = data => createHash('sha256').update(data).digest('hex');

const pkg = JSON.parse(read('package.json'));
if (pkg.version !== '2.3.284' || pkg.repository?.sha !== '6285d012425f3de521aad5a849f31f52721d096c') {
    throw new Error(`expected scratch-storage 2.3.284 @ 6285d012, got ${pkg.version} @ ${pkg.repository?.sha}`);
}

const stats = JSON.parse(readFileSync(statsPath));
const compilation = stats.assets?.length && stats.chunks?.length ? stats :
    (stats.children || []).find(child => child.assets?.length && child.chunks?.length);
if (!compilation) throw new Error(`${statsPath} has no webpack compilation with assets and chunks`);

const leaves = (modules, inheritedChunks = []) => (modules || []).flatMap(module => {
    const chunks = module.chunks?.length ? module.chunks : inheritedChunks;
    return module.modules?.length ? leaves(module.modules, chunks) : [{...module, chunks}];
});
const modules = compilation.modules?.length ? leaves(compilation.modules) :
    (compilation.chunks || []).flatMap(chunk => leaves(chunk.modules, [chunk.id]));
const storageModules = modules.filter(module =>
    /\/scratch-storage\/dist\/web\/scratch-storage\.js$/.test(
        String(module.name || module.identifier || '').split('!').at(-1).split('?')[0].replace(/\\\\/g, '/')));
if (storageModules.length !== 1) {
    throw new Error(`expected one scratch-storage browser module, found ${storageModules.length}`);
}
const storageModule = storageModules[0];
const initialIds = new Set((compilation.chunks || []).filter(chunk => chunk.initial)
    .map(chunk => String(chunk.id)));
const moduleChunkIds = (storageModule.chunks || []).map(String);
const initialOnly = moduleChunkIds.length > 0 && moduleChunkIds.every(id => initialIds.has(id));

// scratch-storage is itself a webpack 4 bundle. worker-loader's inline mode
// passes one JSON string to InlineWorker and a URL for a fallback asset. Count
// the raw literal as it appears in the outer bundle: this includes escaping,
// so it is a conservative pre-minification measure of what can move.
const browserBundle = read('dist/web/scratch-storage.js').toString('utf8');
const workerName = 'f6240eab828e6d415177.worker.js';
const callMarker = 'InlineWorker.js\")(';
const literalStart = browserBundle.indexOf(callMarker);
if (literalStart < 0) throw new Error('worker-loader InlineWorker call is missing');
const start = literalStart + callMarker.length;
const endMarker = `, __webpack_require__.p + "${workerName}")`;
const end = browserBundle.indexOf(endMarker, start);
if (end < 0) throw new Error('worker-loader fallback argument is missing');
const inlineLiteral = browserBundle.slice(start, end);
let decodedWorker;
try {
    decodedWorker = JSON.parse(inlineLiteral);
} catch (error) {
    throw new Error(`worker-loader inline payload is not one JSON string: ${error.message}`);
}

const componentBytes = {
    inlineWorkerLiteral: Buffer.byteLength(inlineLiteral),
    fetchWorkerTool: bytes('src/FetchWorkerTool.js'),
    inlineWorkerRuntime: bytes('node_modules/worker-loader/dist/workers/InlineWorker.js'),
    entireProxyTool: bytes('src/ProxyTool.js')
};
const movableRawUpperBoundBytes = Object.values(componentBytes).reduce((sum, value) => sum + value, 0);
const emittedFloorBytes = 75 * 1024;
const fallbackEmitted = (compilation.assets || []).some(asset => asset.name === workerName);
const report = {
    schema: 'brickwright/p19-scratch-storage-worker-attribution/v1',
    package: {version: pkg.version, repositorySha: pkg.repository.sha},
    inputs: {
        webpackHash: compilation.hash || null,
        browserBundleSha256: sha256(Buffer.from(browserBundle)),
        stats: path.basename(statsPath)
    },
    ownership: {
        storageModuleSourceBytes: Number(storageModule.size) || 0,
        chunks: moduleChunkIds,
        initialOnly
    },
    worker: {
        componentBytes,
        movableRawUpperBoundBytes,
        decodedInlineWorkerBytes: Buffer.byteLength(decodedWorker),
        fallbackFileBytes: bytes(`dist/web/${workerName}`),
        fallbackEmitted
    },
    emittedFloorBytes,
    shortfallBytes: emittedFloorBytes - movableRawUpperBoundBytes,
    plausible: initialOnly && movableRawUpperBoundBytes >= emittedFloorBytes
};
console.log(JSON.stringify(report, null, 2));
if (!report.plausible) process.exitCode = 2;
