import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {gzipSync} from 'node:zlib';
import {openConversionCatalogue, parseContextJSON, decodeContextGzip} from '../scripts/lib/conversion-context-inputs.mjs';
import {fixture, digest, fileRows} from './fixtures/conversion-context-catalogue.mjs';

test('strict JSON preserves exact logical Unicode percent and prototype-spelled data keys', () => {
    const value = parseContextJSON('{"__proto__":"source","constructor":"text","é%2f.ts":"bytes"}');
    assert.equal(Object.getPrototypeOf(value), null); assert.deepEqual(Object.keys(value), ['__proto__','constructor','é%2f.ts']);
    assert.equal(value.__proto__, 'source'); assert.equal(value['é%2f.ts'], 'bytes');
    for (const source of ['{"a":1,"a":2}', '{"x":{"b":1,"b":2}}', '[1,]', '{"a":1,}', 'true false', '1e999']) assert.throws(() => parseContextJSON(source));
});
test('gzip decoding admits exact CRC bytes and rejects corruption multiple members and decoded overflow', () => {
    const original = Buffer.from('{"value":1}'); const packed = gzipSync(original);
    assert.deepEqual(decodeContextGzip(packed, original.length), original);
    const corrupt = Buffer.from(packed); corrupt[corrupt.length - 8] ^= 1;
    for (const bytes of [corrupt, Buffer.concat([packed, packed]), Buffer.concat([packed, Buffer.from([0])]), packed.subarray(0, packed.length - 1)]) assert.throws(() => decodeContextGzip(bytes));
    assert.throws(() => decodeContextGzip(packed, original.length - 1));
});
test('raw catalogue uses exact baseline generated configuration and independent fresh subject maps', async () => fixture(async f => {
    f.catalogue.subjects.push(f.raw()); const reader = openConversionCatalogue(f.save());
    const first = reader.loadSubject(0); const next = reader.loadSubject(0);
    assert.equal(first.files['main.ts'], 'let count=1;'); assert.equal(first.files['pxt.json'], JSON.stringify({name: 'tiny', dependencies: {device: '*'}, files: ['main.ts']}));
    first.files['main.ts'] = 'changed'; assert.equal(next.files['main.ts'], 'let count=1;');
    assert.equal(first.provenance.kind, 'GENERATED_RAW_BASELINE');
    const context = f.context(); context.id = 'tiny'; f.catalogue.subjects.push(context);
    const both = openConversionCatalogue(f.save());
    assert.deepEqual(both.subjects.map(row => [row.kind,row.id]), [['RAW_BASELINE','tiny'],['RETAINED_CONTEXT','tiny']]);
}));
test('complete contexts retain original compiler failure graph resources and unavailable notice evidence', async () => fixture(async f => {
    f.catalogue.subjects.push(f.context()); const reader = openConversionCatalogue(f.save()); const subject = reader.loadSubject(0);
    assert.equal(subject.originalCompile.success, false); assert.equal(subject.originalCompile.diagnostics.length, 1);
    assert.equal(subject.resolved.target, 'arcade'); assert.deepEqual(Object.entries(subject.resolved.dependencyBindings), [['device','target:*']]);
    assert.equal(subject.resolved.inputFiles['main.ts'], subject.files['main.ts']);
    assert.equal(subject.provenance.notices.providedClaims[0].status, 'unavailable');
    assert.equal(subject.provenance.originalExecutionAuthenticity, 'not-authenticated-by-catalogue-reader');
    for (const bad of [['array value'], {'main.ts': 42, 'pxt.json': '{}'}]) {
        const entry = f.catalogue.subjects[0];
        const spec = f.catalogue.blobs[entry.root.blob];
        const envelope = parseContextJSON(decodeContextGzip(fs.readFileSync(path.join(f.directory, spec.path))).toString());
        envelope.files = bad;
        entry.rootFiles = Object.entries(bad).map(([name, value]) => ({name,
            bytes: Buffer.byteLength(String(value)), sha256: digest(Buffer.from(String(value)))}));
        f.blob(spec.path, envelope, 'gzip-json');
        assert.throws(() => openConversionCatalogue(f.save()).loadSubject(0), /root must be an own string map/);
    }
}));
test('reader refuses wrong byte identity extra roots duplicate subjects and noncanonical physical paths', async () => fixture(async f => {
    const subject = f.raw(); f.catalogue.subjects.push(subject); const filename = f.save();
    const blob = f.catalogue.blobs[subject.source.blob]; const saved = {...blob};
    for (const mutation of [{sha256: '0'.repeat(64)}, {bytes: blob.bytes + 1}, {path: '../outside'}, {path: '/absolute'}, {path: 'a\\b'}, {root: 'missing'}]) {
        Object.assign(blob, saved, mutation); f.save(); assert.throws(() => openConversionCatalogue(filename).loadSubject(0));
    }
    Object.assign(blob, saved); f.catalogue.subjects.push({...subject}); f.save(); assert.throws(() => openConversionCatalogue(filename));
}));
test('reader rejects symlink leaf and parent paths without changing logical file names', async () => fixture(async f => {
    const subject = f.raw(); f.catalogue.subjects.push(subject); const spec = f.catalogue.blobs[subject.source.blob];
    fs.symlinkSync(spec.path, path.join(f.directory, 'alias')); spec.path = 'alias'; assert.throws(() => openConversionCatalogue(f.save()).loadSubject(0));
    fs.mkdirSync(path.join(f.directory, 'real')); fs.writeFileSync(path.join(f.directory, 'real/file'), 'let count=1;');
    fs.symlinkSync('real', path.join(f.directory, 'linked')); spec.path = 'linked/file'; assert.throws(() => openConversionCatalogue(f.save()).loadSubject(0));
}));
test('shared metadata does not share mutable parsed objects and catalogue budgets include packed decoded and manifest bytes', async () => fixture(async f => {
    const subject = f.context(); f.catalogue.subjects.push(subject);
    f.catalogue.blobs[subject.root.blob].shared = true;
    const filename = f.save(); const reader = openConversionCatalogue(filename); const first = reader.loadSubject(0);
    first.resolved.jres.extra = 'changed'; first.originalCompile.diagnostics.push('changed');
    const next = reader.loadSubject(0); assert.equal(Object.keys(next.resolved.jres).length, 0); assert.equal(next.originalCompile.diagnostics.length, 1);
    assert.ok(reader.declaredInputBytes >= fs.statSync(filename).size + f.catalogue.blobs[subject.root.blob].bytes + f.catalogue.blobs[subject.root.blob].decodedBytes);
    assert.throws(() => openConversionCatalogue(filename, {aggregateBytes: reader.declaredInputBytes - 1}));
}));
test('exact package sources configs resources notices and logical keys are independently byte-joined', async () => fixture(async f => {
    const subject = f.context(); const envelopeSpec = f.catalogue.blobs[subject.root.blob];
    const packed = fs.readFileSync(path.join(f.directory, envelopeSpec.path)); const envelope = parseContextJSON(decodeContextGzip(packed).toString());
    envelope.files['__proto__'] = 'source data'; subject.rootFiles = fileRows(envelope.files);
    envelope.resolved.packages.library = {files: {'é%2f.ts': 'let libraryValue=1;'}, resourceIds: []};
    const source = f.blob('library.ts', 'let libraryValue=1;', 'utf8'); const config = f.blob('config.json', {dependencies: {}});
    subject.packages = [{id: 'library', files: [{...fileRows(envelope.resolved.packages.library.files)[0], source}], config, resourceIds: {provided: true, value: []}}];
    const replacement = f.blob(envelopeSpec.path, envelope, 'gzip-json'); assert.equal(replacement.blob, subject.root.blob);
    const licence = f.blob('NOTICE', 'Authored test notice', 'utf8'); subject.notices = [{status: 'provided', licence: 'fixture-only', source: licence, bytes: Buffer.byteLength('Authored test notice'), sha256: digest(Buffer.from('Authored test notice'))}];
    f.catalogue.subjects.push(subject); const reader = openConversionCatalogue(f.save()); const loaded = reader.loadSubject(0);
    assert.equal(loaded.files.__proto__, 'source data'); assert.equal(loaded.resolved.packages.library.files['é%2f.ts'], 'let libraryValue=1;');
    assert.equal(loaded.provenance.verifiedByteRelations[0].sourceRelation, 'exact-byte-equality');
    assert.equal(loaded.provenance.notices.verifiedAvailable.length, 1);
    subject.packages[0].files[0].sha256 = '0'.repeat(64); assert.throws(() => openConversionCatalogue(f.save()).loadSubject(0));
}));
