import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {importProjectFiles} from '../overlay/scratch-gui/src/lib/bw-makecode/index.js';
import Creator from '../overlay/scratch-gui/src/lib/sb3-creator.js';
import {auditConversionSubject, legacyConversionLabel, providedConversionChannels,
    conversionException, conversionObservationGraph} from '../scripts/lib/conversion-audit-core.mjs';
import {openConversionCatalogue} from '../scripts/lib/conversion-context-inputs.mjs';
import {fixture} from './fixtures/conversion-context-catalogue.mjs';
const raw = source => ({id: 'authored', name: 'authored', kind: 'RAW_BASELINE', target: 'arcade',
    files: {'main.ts': source, 'pxt.json': JSON.stringify({name: 'authored', dependencies: {device: '*'}, files: ['main.ts']})}});
const original = subject => {
    let imported;
    try {imported = importProjectFiles(subject.files, {target: subject.target, name: subject.name});}
    catch {return {stage: 'parse-failed'};}
    const unsupported = (imported.unsupported || []).map(String);
    if (imported.lang !== 'pseudocode') return {stage: 'source-only', unsupported};
    try {
        const creator = new Creator(); creator.parse(imported.code);
        const blockCount = creator.project.targets.reduce((n, t) => n + Object.keys(t.blocks || {}).length, 0);
        if (creator.warnings.length) unsupported.push(...creator.warnings.map(warning => `Code to Blocks: ${warning}`));
        return {stage: unsupported.length ? 'partial' : 'translated', unsupported, blockCount};
    } catch {return {stage: 'parse-failed', unsupported};}
};

test('shared core matches actual original public import and Creator classifier on complete authored raw cases', async () => {
    for (const source of ['let count=1;', 'function keep(value:number){return value}let result=keep(20);', 'class Unclosed {']) {
        const subject = raw(source); const expected = original(subject); const actual = await auditConversionSubject(subject);
        assert.equal(actual.stage, expected.stage);
        if (expected.unsupported) assert.deepEqual(actual.unsupported, expected.unsupported);
        if (expected.blockCount !== undefined) assert.equal(actual.blockCount, expected.blockCount);
        assert.deepEqual(actual.inputMutation, {rootChanged: false, resolvedChanged: false});
    }
});
test('actual clean import retains full provided channels project assets and ordered observation stages', async () => {
    const stages = []; const result = await auditConversionSubject(raw('let count=1;'), {onObservation: row => stages.push(row)});
    assert.equal(result.import.status, 'return'); assert.equal(result.creator.status, 'return');
    assert.deepEqual(stages.map(row => [row.phase,row.status]), [['import','return'],['creator','return']]);
    assert.equal(stages[0].value, result.import.value); assert.equal(stages[1].value.project, result.creator.project);
    assert.ok(result.creator.assets instanceof Map); assert.equal(result.creator.otherPrivateValues, 'unobserved');
    assert.ok(result.creator.project.targets.length); assert.deepEqual(result.import.channels.unsupported.value, []);
});
test('legacy labels remain distinct from full modern diagnostics and absent channels', () => {
    const creator = {project: {targets: [{blocks: {one: {}}}]}, warnings: []};
    const returned = {lang: 'pseudocode', unsupported: [], errors: ['actual error'], unparsed: ['actual line']};
    assert.equal(legacyConversionLabel(returned, creator).stage, 'translated');
    const channels = providedConversionChannels(returned); assert.deepEqual(channels.errors.value, ['actual error']);
    assert.equal(channels.warnings.provided, false); assert.equal(channels.unparsed.provided, true);
    creator.warnings.push('warning'); assert.equal(legacyConversionLabel(returned, creator).stage, 'partial');
    assert.deepEqual(legacyConversionLabel(returned, creator).unsupported, ['Code to Blocks: warning']);
});
test('actual dependency callback and full original compiler failure are retained without new compilation', async () => fixture(async f => {
    f.catalogue.subjects.push(f.context()); const subject = openConversionCatalogue(f.save()).loadSubject(0);
    const phases = []; const result = await auditConversionSubject(subject, {onObservation: row => phases.push(row.phase)});
    assert.equal(result.resolverCalls, 1); assert.equal(result.dependencyCallback.returned, subject.resolved);
    assert.equal(result.originalCompile.success, false); assert.equal(result.originalCompile.diagnostics.length, 1);
    assert.equal(phases[0], 'dependency-callback'); assert.equal(result.inputMutation.rootChanged, false);
    assert.equal(result.inputMutation.resolvedChanged, false);
}));
test('actual contradictory dependency refs are rejected by unchanged public validator with zero Creator credit', async () => {
    const subject = raw('let count=1;'); subject.kind = 'RETAINED_CONTEXT';
    subject.files['pxt.json'] = JSON.stringify({name: 'authored', dependencies: {library: 'github:owner/library#first'}, files: ['main.ts']});
    subject.resolved = {target: 'arcade', inputFiles: {...subject.files}, dependencyBindings: {library: 'github:owner/library#first'},
        packages: {library: {identity: 'github:owner/library#first', dependencyConfig: {dependencies: {library: 'github:owner/library#second'}}, files: {}}}, fetchedExtensions: []};
    const result = await auditConversionSubject(subject);
    assert.equal(result.import.status, 'throw'); assert.equal(result.import.exception.actual.code, 'DEPENDENCY_IDENTITY_MISMATCH');
    assert.equal(result.creator.status, 'unattempted'); assert.equal(result.stage, 'parse-failed');
});
test('observation failures stay outside product classification including dependency callback propagation', async () => fixture(async f => {
    const marker = new Error('actual observation sink failure');
    await assert.rejects(auditConversionSubject(raw('let count=1;'), {onObservation: () => {throw marker;}}), error => error === marker);
    f.catalogue.subjects.push(f.context()); const subject = openConversionCatalogue(f.save()).loadSubject(0);
    await assert.rejects(auditConversionSubject(subject, {onObservation: () => {throw marker;}}), error => error === marker);
}));
test('own error observations preserve causes special values sharing and accessor absence without invoking getters', () => {
    const original = new Error('actual authored error'); original.code = 'AUTHORED'; original.cause = {diagnostics: ['all'], absent: undefined, special: NaN};
    let gets = 0; Object.defineProperty(original, 'details', {get () {gets++; throw new Error('not called');}});
    original.cause.self = original;
    const observed = conversionException(original); assert.equal(observed.actual, original); assert.equal(gets, 0);
    const fields = observed.ownGraph.fields; assert.ok(fields.some(row => row.key === 'code' && row.value === 'AUTHORED'));
    assert.ok(fields.some(row => row.key === 'details' && row.kind === 'accessor' && !row.observed));
    const graph = conversionObservationGraph(observed); assert.equal(gets, 0);
    assert.ok(graph.nodes.length); assert.doesNotThrow(() => JSON.stringify(graph));
    assert.equal(conversionException(undefined).actual, undefined);
    let collectionGets = 0; const map = new Map([['actual', 7]]), set = new Set([9]);
    for (const collection of [map,set]) Object.defineProperty(collection, Symbol.iterator, {
        get () {collectionGets++; throw new Error('must not read input iterator');}});
    const collections = conversionObservationGraph({map,set});
    assert.equal(collectionGets, 0);
    assert.deepEqual(collections.nodes.find(node => node.kind === 'map').entries, [['actual',7]]);
    assert.deepEqual(collections.nodes.find(node => node.kind === 'set').entries, [9]);
    for (const input of [new Uint8Array([1,2]), new DataView(Uint8Array.from([3,4]).buffer)]) {
        let byteGets = 0;
        for (const key of ['buffer','byteOffset','byteLength']) Object.defineProperty(input, key, {
            get () {byteGets++; throw new Error('must not read input byte getter');}});
        const captured = conversionObservationGraph(input);
        assert.equal(byteGets, 0);
        assert.deepEqual(captured.nodes[0].bytes, input instanceof DataView ? [3,4] : [1,2]);
        assert.ok(captured.nodes[0].fields.some(row => row.key === 'buffer' && row.kind === 'accessor'));
    }
});
test('pure shared core excludes CLI filesystem subprocess SDK and runtime imports while real product boundaries stay present', () => {
    const source = fs.readFileSync(new URL('../scripts/lib/conversion-audit-core.mjs', import.meta.url), 'utf8');
    const imports = [...source.matchAll(/^import .*from ['"]([^'"]+)['"]/gm)].map(match => match[1]);
    assert.deepEqual(imports, ['../../overlay/scratch-gui/src/lib/bw-makecode/index.js']);
    assert.match(source, /await import\('.*sb3-creator\.js'\)/);
    const acquisition = source.indexOf("const {default: SB3Creator} = await import(");
    const construction = source.indexOf('try { creator = new SB3Creator(); }');
    assert.ok(acquisition >= 0 && acquisition < construction);
    assert.doesNotMatch(source.slice(acquisition, construction), /try\s*\{/);
    assert.match(source, /catch \(error\) \{ creatorException = error; creatorFailed = true; \}/);
    assert.doesNotMatch(source, /import\(['"].*(?:pxt|bw-vm)|spawnSync|readFileSync|process\.argv/);
    assert.match(source, /await importProjectFilesWithDependencies\(files, options\)/);
    assert.match(source, /importProjectFiles\(files, options\)/); assert.match(source, /creator\.parse\(imported\.code\)/);
});
