import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {gzipSync, gunzipSync} from 'node:zlib';
import {conversionObservationGraph as originalGraph, compactConversionObservationGraph as compactGraph,
    expandConversionObservationGraph as expand} from '../scripts/lib/conversion-audit-core.mjs';
import {encodeObservationBytePayload, appendObservationByteField} from '../scripts/lib/conversion-observation-codec.mjs';
const clone = value => JSON.parse(JSON.stringify(value));
const check = value => {
    const original = originalGraph(value), packed = compactGraph(value);
    assert.equal(original.schema, 'brickwright/conversion-observation-graph/v1');
    assert.equal(packed.schema, 'brickwright/conversion-observation-graph/v2');
    assert.deepEqual(expand(clone(packed)), clone(original));
    return {original, packed};
};
const byteNode = graph => graph.nodes.find(node => node.kind === 'bytes');

test('compact byte payload roundtrips empty remainder lengths and all octets without changing original graph API', () => {
    for (const length of [0, 1, 2, 3, 4, 5, 255, 256, 257]) {
        const bytes = new Uint8Array(length);
        for (let i = 0; i < length; i++) bytes[i] = i & 255;
        const {original, packed} = check(bytes);
        assert.deepEqual(byteNode(original).bytes, Array.from(bytes));
        assert.equal(byteNode(packed).bytePayload.byteLength, length);
        assert.equal(Object.hasOwn(byteNode(packed), 'bytes'), false);
        if (length > 1) assert.equal(byteNode(packed).fields[0].count, length);
    }
});
test('signed wide floating shifted and DataView values retain actual indexed descriptors instead of byte reinterpretation', () => {
    const base = new Uint8Array([0, 1, 127, 128, 254, 255, 4, 8]);
    for (const input of [base, new Uint8ClampedArray(base), new Int8Array(base.buffer),
        new Uint16Array(base.buffer), new Float32Array([1.5, -0, NaN, Infinity]),
        new Float64Array([-1.25, -0, NaN, -Infinity]), new DataView(base.buffer, 1, 5),
        new Uint8Array(base.buffer, 2, 4), base.buffer, Buffer.from([2, 128, 255])]) check(input);
    const signed = compactGraph(new Int8Array([-1, -128]));
    assert.equal(byteNode(signed).fields.some(field => field.kind === 'byte-index-descriptor-run'), false);
    const floating = compactGraph(new Float64Array([-0, NaN]));
    assert.equal(byteNode(floating).fields.some(field => field.kind === 'byte-index-descriptor-run'), false);
});
test('full graph references maps sets errors causes accessors symbols and nonbyte values remain lossless', () => {
    const bytes = new Uint8Array([1, 2, 3]);
    const symbol = Symbol('same'); const root = {bytes, again: bytes, missing: undefined,
        nan: NaN, minusZero: -0, infinity: Infinity, bigint: 123n, symbol,
        map: new Map([[symbol, bytes]]), set: new Set([bytes])};
    root.self = root; root.error = new Error('outer', {cause: new Error('inner')});
    Object.defineProperty(root, 'unobserved', {get () {throw new Error('getter executed');}});
    const {packed} = check(root);
    assert.equal(packed.nodes.filter(node => node.kind === 'bytes').length, 1);
    const refs = packed.nodes[0].fields.filter(field => ['bytes', 'again'].includes(field.key)).map(field => field.value.ref);
    assert.equal(refs.length, 2); assert.equal(refs[0], refs[1]);
});
test('native input iterators buffer getters and toJSON are never invoked by either representation', () => {
    let calls = 0;
    const bytes = new Uint8Array([2, 4, 8]);
    for (const key of ['buffer', 'byteOffset', 'byteLength', 'toJSON']) Object.defineProperty(bytes, key, {get () {calls++; throw new Error(key);}});
    const map = new Map([['bytes', bytes]]);
    Object.defineProperty(map, Symbol.iterator, {get () {calls++; throw new Error('iterator');}});
    check(map); assert.equal(calls, 0);
    const decoded = clone(compactGraph(new Uint8Array([1, 2])));
    Object.defineProperty(decoded.nodes, Symbol.iterator, {get () {calls++; throw new Error('decoded iterator');}});
    assert.throws(() => expand(decoded), /JSON accessor or symbol/); assert.equal(calls, 0);
    const options = {}; Object.defineProperty(options, 'maxPayloadBytes', {enumerable: true, get () {calls++; throw new Error('options');}});
    assert.throws(() => expand(clone(compactGraph(bytes)), options), /JSON accessor or symbol/); assert.equal(calls, 0);
});
test('descriptor runs preserve observed attributes gaps named properties and mismatching index values', () => {
    const buffer = new Uint8Array([1, 2, 3, 4]).buffer;
    for (const [key, value, writable] of [['0', 1, false], ['1', 2, false], ['2', 3, true], ['3', 99, true]]) {
        Object.defineProperty(buffer, key, {value, writable, configurable: writable, enumerable: true});
    }
    Object.defineProperty(buffer, 'named', {value: 'exact', enumerable: false});
    const {packed} = check(buffer), fields = byteNode(packed).fields;
    assert.deepEqual(fields[0], {kind: 'byte-index-descriptor-run', firstIndex: 0, count: 2,
        attributes: {enumerable: true, configurable: false, writable: false}});
    assert.equal(fields.find(field => field.key === '3').value, 99);
    assert.equal(fields.find(field => field.key === 'named').enumerable, false);
    // A later backing change cannot make packed descriptors reference newer
    // octets than the already captured payload. Nonmatching values stay explicit.
    const live = new Uint8Array([1, 2]), captured = encodeObservationBytePayload(live, 2);
    live[0] = 9; live[1] = 9; const changed = [];
    for (let i = 0; i < 2; i++) appendObservationByteField(changed, {key: String(i), enumerable: true,
        configurable: true, writable: true, value: live[i]}, captured.octets, 2);
    assert.equal(captured.payload.data, 'AQI='); assert.deepEqual(captured.octets, [1, 2]);
    assert.equal(changed.some(field => field.kind === 'byte-index-descriptor-run'), false);
    assert.deepEqual(changed.map(field => field.value), [9, 9]);
});
test('malformed payload runs attributes references schemas and expanded budgets refuse without partial expansion', () => {
    const good = compactGraph(new Uint8Array([1, 2, 3, 4]));
    const edits = [g => {g.schema = 'unknown';}, g => {byteNode(g).bytePayload.data = 'AQI=';},
        g => {byteNode(g).bytePayload.data = 'AR==';}, g => {byteNode(g).bytePayload.byteLength++;},
        g => {byteNode(g).fields[0].firstIndex = -1;}, g => {byteNode(g).fields[0].count = 1048577;},
        g => {byteNode(g).fields[0].attributes.writable = 'true';},
        g => {byteNode(g).fields.push({key: '0', enumerable: true, configurable: true, writable: true, value: 1});},
        g => {g.root.ref = 1000;}, g => {byteNode(g).extra = 'not in format';}];
    for (const edit of edits) {const graph = clone(good); edit(graph); assert.throws(() => expand(graph), /Conversion observation codec:/);}
    assert.throws(() => expand(clone(good), {maxPayloadBytes: 3}), /bound|size/);
    assert.throws(() => expand(clone(good), {maxPayloadBytes: 64 * 1024 * 1024 + 1}), /payload budget/);
    assert.throws(() => expand({...clone(good), arbitrary: true}), /record fields/);
    const accessor = clone(good); let calls = 0;
    Object.defineProperty(accessor.nodes[0], 'bytePayload', {enumerable: true, get () {calls++; throw new Error('payload getter');}});
    assert.throws(() => expand(accessor), /JSON accessor/); assert.equal(calls, 0);
});
test('the bounded decoder retains old v1 graphs and validates aggregate native payload budgets', () => {
    const graph = originalGraph({one: new Uint8Array([1, 2]), two: new Uint8Array([3, 4])});
    assert.deepEqual(expand(clone(graph)), clone(graph));
    assert.throws(() => expand(clone(graph), {maxPayloadBytes: 3}), /bound/);
    const packed = compactGraph({one: new Uint8Array([1, 2]), two: new Uint8Array([3, 4])});
    assert.throws(() => expand(clone(packed), {maxPayloadBytes: 3}), /bound|size/);
    assert.deepEqual(expand(clone(packed), {maxPayloadBytes: 4}), clone(graph));
    const malformed = clone(graph); byteNode(malformed).bytes[0] = 256;
    assert.throws(() => expand(malformed), /byte payload/);
});
test('explicit full JSON gzip retains the complete report and CLI source still uses the same real conversion operation', () => {
    const report = {schema: 'authored-test-report', rows: [{id: 'logical-\u00e9%__proto__', conversion: compactGraph({bytes: new Uint8Array([1, 2, 3]), text: 'unchanged'})}]};
    const json = JSON.stringify(report, null, 2) + '\n';
    const gzip = gzipSync(Buffer.from(json, 'utf8'));
    assert.equal(gunzipSync(gzip).toString('utf8'), json);
    assert.deepEqual(expand(JSON.parse(gunzipSync(gzip)).rows[0].conversion), clone(originalGraph({bytes: new Uint8Array([1, 2, 3]), text: 'unchanged'})));
    const cli = fs.readFileSync(new URL('../scripts/compat-audit.mjs', import.meta.url), 'utf8');
    assert.match(cli, /conversion: compactConversionObservationGraph\(observation\)/);
    assert.match(cli, /if \(out\.endsWith\('\.json\.gz'\)\) \{\s*const \{gzipSync\} = await import\('node:zlib'\)/);
    assert.match(cli, /fs\.writeFileSync\(out, gzipSync\(Buffer\.from\(json, 'utf8'\)\)\)/);
    assert.match(cli, /auditConversionSubject/);
    assert.doesNotMatch(cli, /rows\.slice\(|delete row\./);
});
