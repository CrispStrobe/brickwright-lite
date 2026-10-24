import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {types} from 'node:util';
import {conversionObservationGraph as v1, compactConversionObservationGraph as compact,
    expandConversionObservationGraph as expand} from '../scripts/lib/conversion-audit-core.mjs';

const json = value => JSON.parse(JSON.stringify(value));
const parity = factory => {
    const left = factory(), right = factory();
    const original = json(v1(left.input)), packed = json(compact(right.input));
    assert.deepEqual(expand(packed), original);
    if (left.finish) assert.deepEqual(right.finish(), left.finish());
    return packed;
};
const outcome = (observe, factory) => {
    const {input, finish} = factory();
    try {return {graph: json(observe(input)), log: finish()};}
    catch (error) {return {error: {name: error.name, message: error.message}, log: finish()};}
};

test('compact native brands preserve complete ordinary record Array descriptor and shared graph observations', () => {
    const packed = parity(() => {
        let gets = 0;
        const child = {nan: NaN, negative: -0, absent: undefined, big: 71n};
        const input = {child, again: child, array: [child, , null]};
        input.self = input;
        Object.defineProperty(input, Symbol.toStringTag, {get () {gets++; throw new Error('tag must not run');}});
        Object.defineProperty(child, 'accessor', {get () {gets++; throw new Error('value must not run');}});
        Object.defineProperty(child, 'hidden', {value: 4, enumerable: false, writable: false});
        return {input, finish: () => {assert.equal(gets, 0); return {gets};}};
    });
    assert.equal(packed.nodes[0].kind, 'object');
    assert.ok(packed.nodes.some(node => node.kind === 'array'));
});

test('compact native brands retain genuine Map and Set slots with null misleading and custom prototypes', () => {
    for (const kind of ['map', 'set']) for (const prototype of [null, {}, Array.prototype]) {
        const packed = parity(() => {
            let gets = 0;
            const shared = {value: 9};
            const input = kind === 'map' ? new Map([[shared, shared], ['last', 3]]) : new Set([shared, 3]);
            Object.setPrototypeOf(input, prototype);
            for (const key of [Symbol.iterator, Symbol.toStringTag, 'constructor']) Object.defineProperty(input, key, {
                configurable: true, get () {gets++; throw new Error('native brand must not read properties');}});
            return {input, finish: () => {assert.equal(gets, 0); return {gets};}};
        });
        assert.equal(packed.nodes[0].kind, kind);
        assert.equal(packed.nodes[0].entries.length, 2);
    }
});

test('compact native byte candidates retain original slot checks payloads custom tails and view offsets', () => {
    const factories = [
        () => new ArrayBuffer(7),
        () => new Uint8Array([0, 7, 255]),
        () => new Uint16Array([1, 65535]),
        () => new Int32Array([-2147483648, 7]),
        () => new BigInt64Array([-1n, 7n]),
        () => new Float64Array([NaN, -0, Infinity]),
        () => new DataView(Uint8Array.from([1, 2, 3, 4, 5]).buffer, 1, 3),
        () => Buffer.from([7, 8, 9]),
        () => new SharedArrayBuffer(7),
        () => new Uint8Array(new SharedArrayBuffer(7))
    ];
    for (const create of factories) parity(() => {
        let gets = 0;
        const input = create();
        for (const key of ['buffer', 'byteOffset', 'byteLength', Symbol.toStringTag]) Object.defineProperty(input, key, {
            configurable: true, get () {gets++; throw new Error('own slot getter must not run');}});
        input.alias = input;
        return {input, finish: () => {assert.equal(gets, 0); return {gets};}};
    });
    if (Object.getOwnPropertyDescriptor(ArrayBuffer.prototype, 'resizable')) parity(() => {
        const backing = new ArrayBuffer(8, {maxByteLength: 16});
        return {input: {backing, view: new Uint8Array(backing)}};
    });
    // Detached views must keep the original complete operation's result/error.
    for (const createView of [buffer => buffer, buffer => new Uint8Array(buffer), buffer => new DataView(buffer)]) {
        const create = () => {
            const buffer = new ArrayBuffer(4), input = createView(buffer);
            structuredClone(buffer, {transfer: [buffer]});
            return {input, finish: () => []};
        };
        const left = outcome(v1, create), right = outcome(compact, create);
        if (right.graph) right.graph = expand(right.graph);
        assert.deepEqual(right, left);
    }
});

test('compact brand negatives preserve Proxy traps revoked failures and spoofed native prototypes', () => {
    for (const targetFactory of [() => ({}), () => [], () => new Map([['a', 1]]), () => new Set([1]),
        () => new Uint8Array([1, 2]), () => new DataView(new ArrayBuffer(2))]) parity(() => {
        const log = [], target = targetFactory();
        const input = new Proxy(target, {
            get () {throw new Error('input get must not run');},
            getPrototypeOf (object) {log.push('prototype'); return Reflect.getPrototypeOf(object);},
            ownKeys (object) {log.push('keys'); return Reflect.ownKeys(object);},
            getOwnPropertyDescriptor (object, key) {log.push('descriptor:' + String(key)); return Reflect.getOwnPropertyDescriptor(object, key);}
        });
        return {input, finish: () => log};
    });
    for (const prototype of [Map.prototype, Set.prototype, Uint8Array.prototype, DataView.prototype, ArrayBuffer.prototype]) {
        parity(() => ({input: Object.create(prototype)}));
    }
    const revoked = () => {
        const pair = Proxy.revocable({}, {}); pair.revoke();
        return {input: pair.proxy, finish: () => []};
    };
    assert.deepEqual(outcome(compact, revoked), outcome(v1, revoked));
});

test('compact collection iteration preserves mutation by nested descriptor callbacks and named byte tails', () => {
    parity(() => {
        const log = [], input = new Map();
        const child = new Proxy({value: 4}, {ownKeys (target) {
            log.push('child-keys'); input.set('added-during-entry', 7); return Reflect.ownKeys(target);
        }});
        input.set('first', child);
        return {input, finish: () => ({log, entries: [...input.keys()]})};
    });
    parity(() => {
        const bytes = new Uint8Array([1, 2, 3]), log = [];
        bytes.tail = new Proxy({value: 5}, {ownKeys (target) {
            log.push('tail-keys'); bytes[0] = 99; return Reflect.ownKeys(target);
        }});
        return {input: bytes, finish: () => ({log, after: [...bytes]})};
    });
});

test('held native brands and original slot methods ignore post-import aliases and altered intrinsic surfaces', () => {
    const changed = [], restore = [];
    const replace = (object, key) => {
        const row = Object.getOwnPropertyDescriptor(object, key);
        restore.push(() => Object.defineProperty(object, key, row));
        Object.defineProperty(object, key, {...row, value: () => {changed.push(key); throw new Error('changed intrinsic');}});
    };
    try {
        for (const key of ['isMap', 'isSet', 'isArrayBuffer', 'isTypedArray', 'isDataView']) replace(types, key);
        replace(Map.prototype, 'entries'); replace(Set.prototype, 'values');
        parity(() => ({input: {map: new Map([['a', 1]]), set: new Set([2]), bytes: new Uint8Array([3, 4])}}));
        assert.deepEqual(changed, []);
    } finally {for (let i = restore.length - 1; i >= 0; i--) restore[i]();}
    const input = new Uint8Array([1, 2]);
    Object.defineProperty(Object.prototype, 'brandTestInherited', {value: 1, configurable: true});
    try {assert.deepEqual(expand(json(compact(input))), json(v1(input)));}
    finally {delete Object.prototype.brandTestInherited;}
});

test('native brand checks retain cross-realm Map Set buffers and typed views without instanceof or tag observations', () => {
    parity(() => ({input: vm.runInNewContext(`(() => {
        const buffer = new ArrayBuffer(5); const view = new Uint8Array(buffer); view[1] = 91;
        const map = new Map(); const set = new Set([view]); map.set(view, set);
        return {map, set, buffer, view, data: new DataView(buffer, 1, 3)};
    })()`)}));
});

test('compact brand source boundary leaves original v1 slot operations and all semantic conversion calls intact', () => {
    const source = fs.readFileSync(new URL('../scripts/lib/conversion-audit-core.mjs', import.meta.url), 'utf8');
    assert.match(source, /import \{types as observationNativeTypes\} from 'node:util'/);
    assert.match(source, /const mapIterator = !compactBytes \|\| compactIsMap\(input\) \? nativeIterator\(mapEntries, input\) : null/);
    const nativeBytes = source.slice(source.indexOf('const nativeBytes = input => {'), source.indexOf('// Compact-only negative admission'));
    assert.doesNotMatch(nativeBytes, /compactIs|observationNativeTypes|instanceof/);
    const checks = source.slice(source.indexOf('const compactIsMap'), source.indexOf('const nativeBytes'));
    assert.doesNotMatch(checks, /instanceof|getPrototypeOf|toStringTag|constructor/);
    assert.match(source, /export function conversionObservationGraph \(root\) \{return observeConversionGraph\(root, false\);\}/);
    assert.match(source, /await importProjectFilesWithDependencies\(files, options\)/);
    assert.match(source, /importProjectFiles\(files, options\)/);
    assert.match(source, /creator\.parse\(imported\.code\)/);
});
