#!/usr/bin/env node
/** P19: bound the scratch-storage fetch worker before attempting a lazy split. */
import {createHash} from 'node:crypto';
import {readFileSync, statSync, writeFileSync} from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
let statsArgument;
let writeReceipt;
let checkReceipt;
for (let index = 0; index < args.length; index++) {
    const argument = args[index];
    if (argument === '--write-receipt' || argument === '--check-receipt') {
        const value = args[++index];
        if (!value) throw new Error(`${argument} needs a path`);
        if (argument === '--write-receipt') writeReceipt = path.resolve(value);
        else checkReceipt = path.resolve(value);
    } else if (argument.startsWith('--')) {
        throw new Error(`unknown option ${argument}`);
    } else if (statsArgument) {
        throw new Error(`unexpected argument ${argument}`);
    } else {
        statsArgument = argument;
    }
}

const statsPath = path.resolve(statsArgument ||
    path.join(ROOT, 'artifacts', 'i8086-performance', 'webpack-stats.json'));
const storageRoot = path.resolve(process.env.BW_SCRATCH_STORAGE_ROOT ||
    path.join(ROOT, 'packages', 'scratch-gui', 'node_modules', 'scratch-storage'));
const read = relative => readFileSync(path.join(storageRoot, relative));
const bytes = relative => {
    const value = statSync(path.join(storageRoot, relative)).size;
    if (!Number.isFinite(value) || value <= 0) throw new Error(`${relative} has invalid size ${value}`);
    return value;
};
const sha256 = data => createHash('sha256').update(data).digest('hex');
const positiveSize = (value, label) => {
    if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0) {
        throw new Error(`${label} has invalid size ${String(value)}`);
    }
    return value;
};
const normalizeName = value => String(value || '').split(/[?#]/, 1)[0].replace(/\\/g, '/');

const pkg = JSON.parse(read('package.json'));
if (pkg.version !== '2.3.284' || pkg.repository?.sha !== '6285d012425f3de521aad5a849f31f52721d096c') {
    throw new Error(`expected scratch-storage 2.3.284 @ 6285d012, got ${pkg.version} @ ${pkg.repository?.sha}`);
}

const stats = JSON.parse(readFileSync(statsPath));
const compilations = [];
const visitCompilation = compilation => {
    if (compilation && typeof compilation === 'object') {
        compilations.push(compilation);
        for (const child of compilation.children || []) visitCompilation(child);
    }
};
visitCompilation(stats);

const leaves = (modules, inheritedChunks = []) => (modules || []).flatMap(module => {
    const chunks = module.chunks?.length ? module.chunks : inheritedChunks;
    return module.modules?.length ? leaves(module.modules, chunks) : [{...module, chunks}];
});
const modulesFor = compilation => compilation.modules?.length ? leaves(compilation.modules) :
    (compilation.chunks || []).flatMap(chunk => leaves(chunk.modules, [chunk.id]));
const storageMatches = compilations.flatMap(compilation => modulesFor(compilation)
    .filter(module => /\/scratch-storage\/dist\/web\/scratch-storage\.js$/.test(
        normalizeName(module.name || module.identifier).split('!').at(-1)))
    .map(module => ({compilation, module})));
if (storageMatches.length !== 1) {
    throw new Error(`expected one scratch-storage browser module, found ${storageMatches.length}`);
}
const {compilation, module: storageModule} = storageMatches[0];
if (!Array.isArray(compilation.assets) || !Array.isArray(compilation.chunks)) {
    throw new Error('scratch-storage compilation has no assets or chunks');
}
const chunkById = new Map(compilation.chunks.map(chunk => [String(chunk.id), chunk]));
const moduleChunkIds = (storageModule.chunks || []).map(String);
if (!moduleChunkIds.length) throw new Error('scratch-storage module has no chunk ownership');
const missingChunkIds = moduleChunkIds.filter(id => !chunkById.has(id));
if (missingChunkIds.length) {
    throw new Error(`scratch-storage module references missing chunks: ${missingChunkIds.join(', ')}`);
}
const asyncChunkIds = moduleChunkIds.filter(id => !chunkById.get(id).initial);
if (asyncChunkIds.length) {
    throw new Error(`scratch-storage has unaccounted async ownership in chunks: ${asyncChunkIds.join(', ')}`);
}
const storageModuleSourceBytes = positiveSize(storageModule.size, 'scratch-storage module');

// scratch-storage is itself a webpack 4 bundle. worker-loader's inline mode
// passes one JSON string to InlineWorker and a URL for a fallback asset. Count
// the raw literal as it appears in the outer bundle: this includes escaping,
// so it is a conservative pre-minification measure of what can move.
const browserBundle = read('dist/web/scratch-storage.js').toString('utf8');
const workerName = 'f6240eab828e6d415177.worker.js';
const callMarker = 'InlineWorker.js")(';
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
    inlineWorkerLiteral: positiveSize(Buffer.byteLength(inlineLiteral), 'inline worker literal'),
    fetchWorkerTool: bytes('src/FetchWorkerTool.js'),
    inlineWorkerRuntime: bytes('node_modules/worker-loader/dist/workers/InlineWorker.js'),
    entireProxyTool: bytes('src/ProxyTool.js')
};
const movableRawUpperBoundBytes = Object.values(componentBytes).reduce((sum, value) => sum + value, 0);
const emittedFloorBytes = 75 * 1024;
const fallbackAssets = compilation.assets.filter(asset => {
    const name = normalizeName(asset.name);
    return path.posix.basename(name) === workerName || name.endsWith(`/${workerName}`);
});
if (fallbackAssets.length > 1) throw new Error(`expected at most one fallback asset, found ${fallbackAssets.length}`);
if (fallbackAssets.length) positiveSize(fallbackAssets[0].size, `fallback asset ${fallbackAssets[0].name}`);
const fallbackFileBytes = bytes(`dist/web/${workerName}`);
const decodedInlineWorkerBytes = positiveSize(Buffer.byteLength(decodedWorker), 'decoded inline worker');
const fallbackEmitted = fallbackAssets.length === 1;
const webpackHash = compilation.hash || stats.hash;
if (typeof webpackHash !== 'string' || !webpackHash) throw new Error('webpack compilation hash is missing');
const report = {
    schema: 'brickwright/p19-scratch-storage-worker-attribution/v1',
    package: {version: pkg.version, repositorySha: pkg.repository.sha},
    inputs: {
        webpackHash,
        browserBundleSha256: sha256(Buffer.from(browserBundle)),
        stats: path.basename(statsPath)
    },
    ownership: {
        storageModuleSourceBytes,
        chunks: moduleChunkIds,
        initialOnly: true
    },
    worker: {
        componentBytes,
        movableRawUpperBoundBytes,
        decodedInlineWorkerBytes,
        fallbackFileBytes,
        fallbackEmitted
    },
    emittedFloorBytes,
    shortfallBytes: emittedFloorBytes - movableRawUpperBoundBytes,
    plausible: movableRawUpperBoundBytes >= emittedFloorBytes
};
const receipt = {
    schema: report.schema,
    package: report.package,
    webpackHash: report.inputs.webpackHash,
    browserBundleSha256: report.inputs.browserBundleSha256,
    storageModuleSourceBytes,
    movableRawUpperBoundBytes,
    decodedInlineWorkerBytes,
    fallbackFileBytes,
    fallbackEmitted,
    emittedFloorBytes,
    plausible: report.plausible
};
if (writeReceipt) writeFileSync(writeReceipt, `${JSON.stringify(receipt, null, 2)}\n`);
if (checkReceipt) {
    const expected = JSON.parse(readFileSync(checkReceipt));
    if (JSON.stringify(expected) !== JSON.stringify(receipt)) {
        throw new Error(`P19 receipt differs from ${checkReceipt}`);
    }
}
console.log(JSON.stringify(report, null, 2));
if (!report.plausible) process.exitCode = 2;
