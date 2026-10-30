import test from 'node:test';
import assert from 'node:assert/strict';
import {parseMakeCodeTs} from '../overlay/scratch-gui/src/lib/bw-makecode/ts-import.js';
import {prepareProcedureConstraintSource as eager, prepareProcedureConstraintSourceForTranslation as owned,
    validateProcedureConstraintSource} from '../overlay/scratch-gui/src/lib/bw-makecode/procedure-constraint-source.js';
import {declarationIdentityInput} from '../overlay/scratch-gui/src/lib/bw-makecode/declaration-identity-input.js';
import {importProjectFiles} from '../overlay/scratch-gui/src/lib/bw-makecode/index.js';
const parse = source => parseMakeCodeTs(source, {parameterDefaults: true, retainPrimitiveProcedureDefaults: true,
    retainCallableMetadata: true, retainParentheses: true});
const facts = value => ({program: value.program, diagnostics: value.diagnostics, independentRoutes: value.independentRoutes,
    prefixes: value.program.body.filter(node => node.type === 'FunctionDeclaration').map(fn => value.prefix(fn, fn.name + ' %s'))});
const result = operation => {try {return {value: operation()};} catch (error) {return {error: {name: error.name, message: error.message}};}};
const parity = (program, mode = 'supported-default') => {
    const original = result(() => facts(eager(program, {mode}))), actual = result(() => facts(owned(program, {mode})));
    assert.deepEqual(actual, original); return actual;
};
const nodes = root => {
    const out = [], seen = new Set();
    const visit = value => {if (!value || typeof value !== 'object' || seen.has(value)) return;
        seen.add(value); out.push(value); for (const child of Object.values(value)) visit(child);};
    visit(root); return out;
};

test('empty ordinary selection preserves actual parser Program identity and complete preparation results', () => {
    for (const source of ['let count=1;count+=2;', 'function read(){return 7}let result=read();',
        'let values=[1,2];values.push(3);let result=values[0];']) for (const mode of ['prototype', 'supported-default']) {
        const program = parse(source), before = JSON.stringify(program);
        assert.ok(declarationIdentityInput(program));
        const actual = parity(program, mode); assert.ok(actual.value); assert.deepEqual(actual.value.diagnostics, []);
        assert.equal(actual.value.program, program); assert.equal(JSON.stringify(program), before);
        assert.deepEqual(actual.value.prefixes.flat(), []);
    }
});

test('nonempty Number Text and captured formal obligations still require complete actual producers', () => {
    for (const source of ['function read(n:number){return n+1}let result=read(2);',
        'function read(n:string){return n}let result=read("ok");',
        'function read(n:number){return n}let result=read("wrong");',
        'function read(n:string){let later=()=>{n=2;}}read("ok");']) {
        const actual = parity(parse(source)); assert.ok(actual.value); assert.equal(actual.value.prefixes[0].length, 1);
        assert.equal(actual.value.diagnostics.length > 0, source.includes('wrong') || source.includes('n=2'));
    }
});

test('selected omitted Any defaults retain real lowering explicit flags and default producer diagnostics', () => {
    for (const source of ['function read(n:any=2){return n}let result=read();',
        'function read(n:number,value:any=20){return value}read(1);',
        'function read(n:any=unknown){return n}read();']) {
        const program = parse(source), actual = parity(program); assert.ok(actual.value);
        if (source.includes('unknown')) assert.ok(actual.value.diagnostics.length);
        else {
            assert.deepEqual(actual.value.diagnostics, []); assert.notEqual(actual.value.program, program);
            assert.ok(actual.value.program.body[0].params.some(name => name.startsWith('__bwOmittedDefault')));
        }
    }
});

test('exclusions escapes callback deselection and duplicates remain visible when selection becomes empty', () => {
    for (const source of ['function read(n:number[]){return n}let result=read([1]);',
        'function read(n:number=2){return n}let result=read();',
        'function read(n:number){return n}let alias=read;let result=alias(2);',
        'function read(n:number){return n}function read(n:number){return n+1}read(2);',
        'function read(n:number){return n}game.onUpdate(read);']) {
        for (const mode of ['prototype', 'supported-default']) assert.ok(parity(parse(source), mode).value);
    }
    const duplicate = parity(parse('function read(n:number){return n}function read(n:number){return n+1}read(2);'));
    assert.ok(duplicate.value.diagnostics.some(text => text.includes('duplicate ordinary declaration')));
    const escaped = parity(parse('function read(n:number){return n}let alias=read;'));
    assert.ok(escaped.value.diagnostics.some(text => text.includes('escaped or nonordinary')));
    const callback = parity(parse('function read(n:number){return n}game.onUpdate(read);'));
    assert.deepEqual(callback.value.diagnostics, []); assert.deepEqual(callback.value.prefixes, [[]]);
});

test('independent numeric callable factory route remains separate from empty ordinary selection', () => {
    const source = 'function makeCounter(start:number):()=>number{let n=start;return()=>{n+=1;return n}}let first=makeCounter(2);let value=first();';
    for (const mode of ['prototype', 'supported-default']) {
        const actual = parity(parse(source), mode); assert.ok(actual.value); assert.deepEqual(actual.value.diagnostics, []);
        assert.ok(actual.value.independentRoutes.some(row => row.name === 'makeCounter' && row.protocol === 'existing-numeric-callable'));
        assert.deepEqual(actual.value.prefixes, [[]]);
    }
});

test('Throw unknown malformed and accessor-bearing inputs retain original eager errors and exceptional paths', () => {
    const throwing = parse('function fail(){throw 2}fail();'); assert.equal(declarationIdentityInput(throwing), null);
    parity(throwing);
    const unknown = parse('let value=1;'); unknown.body.push({type: 'Unknown', text: 'unparsed'});
    assert.equal(declarationIdentityInput(unknown), null); parity(unknown);
    const malformed = parse('screen.print("hi");'); nodes(malformed).find(node => node.type === 'Call').args = null;
    assert.ok(parity(malformed).error);
    const marker = new Error('actual body accessor refusal'); let reads = 0;
    const make = () => {const program = parse('let value=1;'); Object.defineProperty(program, 'body', {
        enumerable: true, configurable: true, get () {reads++; throw marker;}}); return program;};
    assert.throws(() => eager(make()), error => error === marker); assert.equal(reads, 1);
    assert.throws(() => owned(make()), error => error === marker); assert.equal(reads, 2);
    // Public validation remains eager even when explicitly given no functions.
    assert.throws(() => validateProcedureConstraintSource(malformed, {onlyFunctions: new Set()}), TypeError);
});

test('changed intrinsic admission stays negative after restoration and preserves later malformed validation error', () => {
    const freeze = Object.freeze;
    const run = prepare => {
        const program = parse('screen.print("hi");'), call = nodes(program).find(node => node.type === 'Call');
        const callbacks = []; let error;
        try {
            Object.freeze = value => {
                callbacks.push({value, restored: Object.freeze === freeze});
                Object.freeze = freeze; call.args = null; return freeze(value);
            };
            try {prepare(program);} catch (caught) {error = caught;}
        } finally {Object.freeze = freeze;}
        // analyseGraph evaluates the OUTER freeze callee before its argument.
        // Its first nested freeze restores the global, but the already-held
        // outer callee still invokes this replacement a second time.
        assert.equal(callbacks.length, 2);
        assert.ok(Array.isArray(callbacks[0].value)); assert.equal(callbacks[0].value.length, 0);
        assert.equal(callbacks[0].restored, false); assert.equal(callbacks[1].restored, true);
        const graph = callbacks[1].value;
        assert.equal(typeof graph.typesAt, 'function'); assert.equal(typeof graph.unchangedFunctionAt, 'function');
        assert.equal(graph.localUndefinedDeclarations, callbacks[0].value);
        assert.ok(Object.isFrozen(graph)); assert.ok(Object.isFrozen(callbacks[0].value));
        assert.equal(call.args, null); assert.ok(error instanceof TypeError);
        return {error, callbacks: callbacks.map(({value, restored}) => ({
            kind: Array.isArray(value) ? 'localUndefinedDeclarations' : 'completedGraph', restored
        }))};
    };
    const original = run(eager), actual = run(owned);
    assert.deepEqual(actual, original);
    const fresh = parity(parse('let value=1;')); assert.deepEqual(fresh.value.diagnostics, []);
});

test('fresh physical declarations and actual public translation retain current obligations without cached truth', () => {
    const program = parse('function read(n:number){return n}let result=read(2);');
    assert.deepEqual(parity(program).value.diagnostics, []);
    const call = nodes(program).find(node => node.type === 'Call'), original = call.args[0];
    call.args[0] = {type: 'String', value: 'wrong'}; assert.ok(parity(program).value.diagnostics.length);
    call.args[0] = original; assert.deepEqual(parity(program).value.diagnostics, []);
    const root = importProjectFiles({'main.ts': 'let count=1;count+=2;'}, {target: 'arcade'});
    assert.equal(root.lang, 'pseudocode'); assert.deepEqual(root.unsupported, []); assert.equal(typeof root.code, 'string');
    const bad = importProjectFiles({'main.ts': 'function hold(value:string){}hold(2);'}, {target: 'arcade'});
    assert.ok(bad.unsupported.some(text => /actual producers/.test(text)));
    const good = importProjectFiles({'main.ts': 'function hold(value:number){}hold(2);'}, {target: 'arcade'});
    assert.deepEqual(good.unsupported, []); assert.match(good.code, /declare arcade procedure "hold %s" parameter "value" as Number/);
});


test('changed iterator chains and serialization intrinsics preserve original callback errors then restore fresh admission', () => {
    // Construct the actual parsed inputs and iterator rows before altering a
    // native. The held .next wrapper counts only original semantic work.
    const prototypeRows = [Object.getPrototypeOf([][Symbol.iterator]()),
        Object.getPrototypeOf(new Map().entries()), Object.getPrototypeOf(new Set().values()),
        Object.getPrototypeOf(''[Symbol.iterator]())];
    const apply = Reflect.apply, define = Object.defineProperty, descriptor = Object.getOwnPropertyDescriptor;
    const marker = new Error('actual changed iterator callback');
    for (let index = 0; index < prototypeRows.length; index++) {
        const prototype = prototypeRows[index], row = descriptor(prototype, 'next');
        const originalInput = parse('let value=1;'), actualInput = parse('let value=1;');
        const run = (prepare, program) => {
            let calls = 0, actual;
            try {
                define(prototype, 'next', {...row, value: function (...args) {
                    calls++;
                    if (index < 3) throw marker;
                    return apply(row.value, this, args);
                }});
                try {actual = {value: facts(prepare(program))};} catch (error) {actual = {error};}
            } finally {define(prototype, 'next', row);}
            return {actual, calls};
        };
        const original = run(eager, originalInput), actual = run(owned, actualInput);
        assert.equal(actual.calls, original.calls);
        if (index < 3) {assert.ok(original.calls > 0); assert.equal(original.actual.error, marker); assert.equal(actual.actual.error, marker);}
        else assert.deepEqual(actual.actual, original.actual);
        assert.deepEqual(parity(parse('let value=1;')).value.diagnostics, []);
    }
    // A changed constructor supplies genuine native storage behind a proxy.
    // The original eager route uses its ordinary methods successfully; declined
    // admission must not call a native size getter on that proxy at all.
    const nativeMap = Map, nativeGet = Reflect.get, bind = Function.prototype.bind;
    const runMap = prepare => {
        const program = parse('let value=1;'); let actual;
        function WrappedMap(...args) {
            const target = new nativeMap(...args);
            return new Proxy(target, {get(object, key) {
                const value = nativeGet(object, key, object);
                return typeof value === 'function' ? apply(bind, value, [object]) : value;
            }});
        }
        WrappedMap.prototype = nativeMap.prototype;
        try {globalThis.Map = WrappedMap; actual = result(() => facts(prepare(program)));}
        finally {globalThis.Map = nativeMap;}
        return actual;
    };
    const mapOriginal = runMap(eager), mapActual = runMap(owned);
    assert.ok(mapOriginal.value, 'original changed-constructor route completes');
    assert.deepEqual(mapActual, mapOriginal);
    assert.deepEqual(parity(parse('let value=1;')).value.diagnostics, []);

    const originalInput = parse('let value=1;'), actualInput = parse('let value=1;');
    const stringify = JSON.stringify;
    const runJSON = (prepare, program) => {
        let calls = 0, error;
        try {
            JSON.stringify = () => {calls++; throw marker;};
            try {prepare(program);} catch (actual) {error = actual;}
        } finally {JSON.stringify = stringify;}
        return {calls, error};
    };
    const original = runJSON(eager, originalInput), actual = runJSON(owned, actualInput);
    assert.ok(original.calls > 0); assert.equal(original.error, marker);
    assert.equal(actual.calls, original.calls); assert.equal(actual.error, marker);
    assert.deepEqual(parity(parse('let value=1;')).value.diagnostics, []);
});
