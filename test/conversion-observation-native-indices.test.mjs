import test from 'node:test';
import assert from 'node:assert/strict';
import {conversionObservationGraph as v1, compactConversionObservationGraph as compact,
    expandConversionObservationGraph as expand} from '../scripts/lib/conversion-audit-core.mjs';

const json = value => JSON.parse(JSON.stringify(value));
const bytesNode = graph => graph.nodes.find(node => node.kind === 'bytes');
const parity = input => {
    const original = json(v1(input)), packed = json(compact(input));
    assert.deepEqual(expand(packed), original);
    return packed;
};
// An irrelevant inherited property changes the captured normal surface and
// forces the complete original compact descriptor loop without changing input
// own descriptors. This is only a test oracle, not a shipping option.
const slowCompact = input => {
    const key = Symbol('force original descriptor loop');
    Object.defineProperty(Object.prototype, key, {value: true, configurable: true});
    try {return json(compact(input));} finally {delete Object.prototype[key];}
};

test('native octet index runs equal unchanged v1 and complete old compact graphs at empty singleton shifted and large sizes', () => {
    for (const length of [0, 1, 2, 3, 257, 8192]) {
        const backing = new ArrayBuffer(length + 8), input = new Uint8Array(backing, 3, length);
        for (let i = 0; i < length; i++) input[i] = i & 255;
        const packed = parity(input);
        assert.deepEqual(packed, slowCompact(input));
        const fields = bytesNode(packed).fields;
        assert.equal(fields.length, length ? 1 : 0);
        if (length > 1) assert.deepEqual(fields[0], {kind: 'byte-index-descriptor-run', firstIndex: 0,
            count: length, attributes: {enumerable: true, configurable: true, writable: true}});
        if (length === 1) assert.deepEqual(fields[0], {key: '0', enumerable: true, configurable: true,
            writable: true, value: 0});
    }
});

test('native brands include Buffer subclasses and custom prototypes while all named symbol accessor and alias tails remain exact', () => {
    class Octets extends Uint8Array {}
    let calls = 0;
    for (const input of [Buffer.from([1, 2, 255]), new Octets([1, 2, 255]),
        Object.setPrototypeOf(new Uint8Array([1, 2, 255]), null)]) {
        const symbol = Symbol('tail');
        Object.defineProperty(input, 'hidden', {value: {again: input}, enumerable: false});
        Object.defineProperty(input, '01', {value: 'not an index', enumerable: true});
        Object.defineProperty(input, symbol, {value: input, writable: false});
        for (const key of ['buffer','constructor','byteLength',Symbol.toStringTag]) {
            Object.defineProperty(input, key, {get () {calls++; throw new Error('input getter');}});
        }
        const packed = parity(input);
        assert.deepEqual(packed, slowCompact(input));
        assert.equal(bytesNode(packed).fields[0].count, 3);
        assert.equal(bytesNode(packed).prototype, Object.getPrototypeOf(input) === null ? 'null' : 'other-unobserved');
    }
    assert.equal(calls, 0);
});

test('shared backing aliases cycles and separate calls preserve fresh actual bytes without retained facts', () => {
    const buffer = new ArrayBuffer(8), a = new Uint8Array(buffer, 1, 4), b = new Uint8Array(buffer, 2, 3);
    a.set([1, 2, 3, 4]);
    const root = {a, again: a, b, buffer}; root.self = root;
    assert.deepEqual(parity(root), slowCompact(root));
    a[0] = 9; b[0] = 7;
    const second = parity(root);
    assert.deepEqual(second, slowCompact(root));
    assert.equal(second.nodes.filter(node => node.kind === 'bytes').length, 3);
    assert.deepEqual(expand(second).nodes.find(node => node.kind === 'bytes').bytes, [9, 7, 3, 4]);
});

test('payload and synthesized numeric descriptors precede actual custom-tail callbacks changing backing', () => {
    const make = () => {
        const input = new Uint8Array([1, 2, 3]);
        input.tail = new Proxy({}, {ownKeys () {input[0] = 99; return [];}});
        return input;
    };
    const originalInput = make(), compactInput = make();
    const original = json(v1(originalInput)), packed = json(compact(compactInput));
    assert.deepEqual(expand(packed), original);
    assert.deepEqual(bytesNode(expand(packed)).bytes, [1, 2, 3]);
    assert.equal(bytesNode(expand(packed)).fields[0].value, 1);
    assert.equal(originalInput[0], 99); assert.equal(compactInput[0], 99);
});

test('wide signed clamped floating DataView ArrayBuffer shared and resizable forms retain the full fallback', () => {
    const buffer = new ArrayBuffer(16);
    for (const input of [new Int8Array(buffer), new Uint8ClampedArray(buffer), new Uint16Array(buffer),
        new Float32Array([NaN, -0, Infinity]), new DataView(buffer, 2, 4), buffer]) {
        assert.deepEqual(parity(input), slowCompact(input));
    }
    assert.equal(typeof SharedArrayBuffer, 'function');
    assert.deepEqual(parity(new Uint8Array(new SharedArrayBuffer(4))), slowCompact(new Uint8Array(new SharedArrayBuffer(4))));
    assert.equal(typeof Object.getOwnPropertyDescriptor(ArrayBuffer.prototype, 'resizable').get, 'function');
    const resizable = new ArrayBuffer(8, {maxByteLength: 16}), input = new Uint8Array(resizable);
    assert.equal(resizable.resizable, true);
    assert.deepEqual(parity(input), slowCompact(input));
    resizable.resize(3); assert.deepEqual(parity(input), slowCompact(input));
    const detachedBuffer = new ArrayBuffer(2), detached = new Uint8Array(detachedBuffer);
    structuredClone(detachedBuffer, {transfer: [detachedBuffer]});
    let oldError, newError;
    try {v1(detached);} catch (error) {oldError = error;}
    try {compact(detached);} catch (error) {newError = error;}
    assert.ok(oldError instanceof TypeError); assert.ok(newError instanceof TypeError);
    assert.equal(newError.message, oldError.message);
});

test('changed descriptor and String intrinsics use the original loop and preserve actual fallback throws', () => {
    const input = new Uint8Array([1, 2, 3]), original = Object.getOwnPropertyDescriptor;
    let calls = 0, first, second;
    Object.getOwnPropertyDescriptor = function (object, key) {
        if (object === input && ['0','1','2'].includes(key)) calls++;
        return original(object, key);
    };
    try {
        first = json(v1(input)); assert.equal(calls, 3); calls = 0;
        second = json(compact(input)); assert.equal(calls, 3);
    } finally {Object.getOwnPropertyDescriptor = original;}
    assert.deepEqual(expand(second), first);
    const nativeString = String, failure = new Error('actual old compact String call');
    globalThis.String = () => {throw failure;};
    try {assert.throws(() => compact(input), error => error === failure);}
    finally {globalThis.String = nativeString;}
    const O = Object, globalObject = O.getOwnPropertyDescriptor(globalThis, 'Object');
    const objectABA = forceSlow => {
        const bytes = new Uint8Array([1, 2, 3]), marker = Symbol('old compact'); let reads = 0;
        if (forceSlow) O.defineProperty(O.prototype, marker, {value: true, configurable: true});
        O.defineProperty(globalThis, 'Object', {configurable: true, get () {
            reads++; bytes[0] = 99; O.defineProperty(globalThis, 'Object', globalObject); return O;
        }});
        try {
            const graph = json(compact(bytes)); assert.equal(reads, 1); assert.equal(bytes[0], 99);
            assert.equal(bytesNode(graph).fields[0].value, 99);
            return graph;
        } finally {O.defineProperty(globalThis, 'Object', globalObject); if (forceSlow) delete O.prototype[marker];}
    };
    assert.deepEqual(objectABA(false), objectABA(true));
    const snapshotABA = forceSlow => {
        const bytes = new Uint8Array([1, 2, 3]), marker = Symbol('old compact'); let changed = 0;
        const arrayLength = O.getOwnPropertyDescriptor(Array.prototype, 'length');
        assert.equal(O.hasOwn(Array.prototype, '0'), false);
        if (forceSlow) O.defineProperty(O.prototype, marker, {value: true, configurable: true});
        O.defineProperty(Array.prototype, '0', {configurable: true, set (value) {
            const corrupt = value === 1;
            O.defineProperty(this, '0', {value: corrupt ? 99 : value, writable: true, enumerable: true, configurable: true});
            if (corrupt) {changed++; delete Array.prototype[0]; O.defineProperty(Array.prototype, 'length', arrayLength);}
        }});
        try {
            const graph = json(compact(bytes)); assert.equal(changed, 1); assert.equal(bytes[0], 1);
            assert.equal(bytesNode(graph).fields[0].value, 1);
            assert.equal(expand(graph).nodes[0].bytes[0], 99);
            return graph;
        } finally {delete Array.prototype[0]; O.defineProperty(Array.prototype, 'length', arrayLength); if (forceSlow) delete O.prototype[marker];}
    };
    assert.deepEqual(snapshotABA(false), snapshotABA(true));
    parity(input);
});

test('changed actual array iterator and Proxy wrappers retain ordinary observation and restoration behavior', () => {
    const prototype = Object.getPrototypeOf([][Symbol.iterator]()), original = prototype.next;
    let calls = 0, first, second, oldCalls;
    prototype.next = function () {calls++; return Reflect.apply(original, this, []);};
    try {
        first = slowCompact(new Uint8Array([1, 2, 3])); oldCalls = calls; calls = 0;
        second = json(compact(new Uint8Array([1, 2, 3])));
        assert.equal(calls, oldCalls);
    } finally {prototype.next = original;}
    assert.deepEqual(second, first);
    let traps = 0;
    const proxy = new Proxy(new Uint8Array([4, 5]), {ownKeys (target) {traps++; return Reflect.ownKeys(target);}});
    const packed = parity(proxy); assert.equal(traps, 2);
    assert.equal(packed.nodes[0].kind, 'object');
    parity(new Uint8Array([1, 2, 3]));
});

test('native index synthesis retains the original logical entry overflow and illegal descriptor rejection', () => {
    const huge = new Uint8Array(1048577);
    assert.throws(() => v1(huge), /^Error: Conversion observation entry bound$/);
    assert.throws(() => compact(huge), /^Error: Conversion observation entry bound$/);
    const input = new Uint8Array([1, 2]);
    assert.equal(Reflect.defineProperty(input, '0', {get () {throw new Error('impossible indexed getter');}}), false);
    assert.equal(Reflect.defineProperty(input, '0', {writable: false}), false);
    assert.equal(Reflect.defineProperty(input, '0', {enumerable: false}), false);
    assert.equal(Reflect.defineProperty(input, '0', {configurable: false}), false);
    Object.preventExtensions(input);
    const packed = parity(input);
    assert.deepEqual(packed, slowCompact(input));
    assert.deepEqual(bytesNode(packed).fields[0].attributes, {enumerable: true, configurable: true, writable: true});
});
