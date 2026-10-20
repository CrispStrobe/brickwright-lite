import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {importGuiDependency} from './helpers/bw-integrated.mjs';
const source = readFileSync(new URL('../overlay/scratch-gui/src/lib/import-csv.js', import.meta.url), 'utf8');
const {createCsvImporter} = await import(`data:text/javascript;base64,${Buffer.from(source).toString('base64')}`);
const Papa = (await importGuiDependency('papaparse/papaparse.js')).default;
const turn = () => new Promise(resolve => setImmediate(resolve));
const deferred = () => {
    let resolve, reject;
    const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
    return {promise, resolve, reject};
};
const dom = () => {
    const events = [], children = [], inputs = [];
    const body = {
        appendChild (input) { assert.equal(children.includes(input), false); children.push(input); events.push(['append', input]); },
        removeChild (input) {
            const index = children.indexOf(input);
            assert.ok(index >= 0, 'only the owned attached input may be removed');
            children.splice(index, 1); events.push(['remove', input]);
        }
    };
    const document = {body, createElement (tag) {
        assert.equal(tag, 'input');
        const input = {attributes: {}, setAttribute (name, value) { this.attributes[name] = value; },
            click () { events.push(['click', this]); }};
        inputs.push(input); events.push(['create', input]); return input;
    }};
    return {document, body, events, children, inputs};
};
const select = (input, file) => input.onchange({target: {files: [file]}});

test('picker creation and click stay synchronous; only a selected file acquires Papa with exact receiver and options', async () => {
    const d = dom(), chunk = deferred(), file = Object.freeze({name: 'owned.csv'}); let loads = 0, call;
    const parser = {parse (input, options) { assert.equal(this, parser); call = {input, options}; }};
    const upload = createCsvImporter({getDocument: () => d.document, loadParser: () => { loads++; return chunk.promise; }});
    const pending = upload(), input = d.inputs[0];
    assert.deepEqual(d.events.map(row => row[0]), ['create', 'append', 'click']);
    assert.deepEqual(input.attributes, {type: 'file', accept: '.csv, .tsv, .txt'});
    assert.equal(loads, 0); await turn(); assert.equal(loads, 0, 'no selection means no parser request');
    select(input, file); await turn(); assert.equal(loads, 1); assert.equal(call, undefined);
    chunk.resolve(parser); await turn();
    assert.equal(call.input, file); assert.deepEqual(Object.keys(call.options), ['header', 'complete', 'error']);
    assert.equal(call.options.header, false);
    const data = [['quoted,value', '猫']]; let reads = 0;
    call.options.complete({get data () { reads++; assert.equal(d.children.includes(input), false); return data; }});
    assert.equal(await pending, data); assert.equal(reads, 1); assert.deepEqual(d.children, []);
    call.options.error(new Error('late callback')); call.options.complete({data: []});
    assert.equal(d.events.filter(row => row[0] === 'remove').length, 1);
});

test('existing real Papa parser retains delimiter detection quoting and complete data', async () => {
    for (const [text, expected] of [
        ['a,b\n1,"two, words"', [['a', 'b'], ['1', 'two, words']]],
        ['a\tb\n1\t"two\twords"', [['a', 'b'], ['1', 'two\twords']]],
        ['a,b\n"line1\nline2",猫', [['a', 'b'], ['line1\nline2', '猫']]]
    ]) {
        const d = dom(), upload = createCsvImporter({getDocument: () => d.document, loadParser: async () => Papa});
        const pending = upload(); select(d.inputs[0], text);
        assert.deepEqual(await pending, expected); assert.deepEqual(d.children, []);
    }
});

test('parser error callbacks reject the owning promise with exact original error and one cleanup', async () => {
    const d = dom(), original = Object.freeze(new TypeError('actual callback failure', {cause: 'original cause'})); let callbacks;
    const upload = createCsvImporter({getDocument: () => d.document, loadParser: async () => ({parse (_file, options) { callbacks = options; }})});
    const pending = upload(), refusal = assert.rejects(pending, error => error === original);
    select(d.inputs[0], {}); await turn(); callbacks.error(original); await refusal;
    callbacks.complete({data: ['late']}); assert.deepEqual(d.children, []);
    assert.equal(original.cause, 'original cause'); assert.equal(d.events.filter(row => row[0] === 'remove').length, 1);
});

test('synchronous parser throws now reject the returned owning promise and clean the file without changing the error', async () => {
    const d = dom(), original = Object.freeze(new SyntaxError('synchronous parser failure', {cause: 'source'}));
    const descriptors = Object.getOwnPropertyDescriptors(original);
    const upload = createCsvImporter({getDocument: () => d.document, loadParser: async () => ({parse () { throw original; }})});
    const pending = upload(), refusal = assert.rejects(pending, error => error === original);
    select(d.inputs[0], {}); await refusal; assert.deepEqual(d.children, []);
    assert.deepEqual(Object.getOwnPropertyDescriptors(original), descriptors);
});

test('a failed parser chunk cleans its picker and a new picker retries acquisition', async () => {
    const d = dom(), original = Object.freeze(new Error('chunk failed')); let loads = 0;
    const upload = createCsvImporter({getDocument: () => d.document, loadParser () {
        loads++; if (loads === 1) return Promise.reject(original);
        return Promise.resolve({parse (_file, options) { options.complete({data: ['retry']}); }});
    }});
    const first = upload(), refusal = assert.rejects(first, error => error === original);
    select(d.inputs[0], {}); await refusal; assert.deepEqual(d.children, []);
    const second = upload(); assert.equal(loads, 1, 'new picker alone still cannot request Papa');
    select(d.inputs[1], {}); assert.deepEqual(await second, ['retry']); assert.equal(loads, 2);
    assert.equal(d.events.filter(row => row[0] === 'remove').length, 2);
});

test('concurrent and repeated selections keep file callback and cleanup ownership per picker', async () => {
    const d = dom(), chunks = [deferred(), deferred()], calls = []; let loads = 0;
    const upload = createCsvImporter({getDocument: () => d.document, loadParser: () => chunks[loads++].promise});
    const first = upload(), second = upload(), files = [{name: 'first'}, {name: 'second'}];
    const live = [files[0]]; d.inputs[0].onchange({target: {files: live}}); live[0] = {name: 'replacement'};
    select(d.inputs[0], {name: 'duplicate'}); select(d.inputs[1], files[1]); await turn(); assert.equal(loads, 2);
    const parser = {parse (file, options) { calls.push({file, options}); }};
    chunks[1].resolve(parser); await turn(); assert.equal(calls[0].file, files[1]);
    calls[0].options.complete({data: ['second']}); assert.deepEqual(await second, ['second']);
    assert.deepEqual(d.children, [d.inputs[0]]); calls[0].options.error(new Error('stale second'));
    chunks[0].resolve(parser); await turn(); assert.equal(calls[1].file, files[0]);
    calls[1].options.complete({data: ['first']}); assert.deepEqual(await first, ['first']); assert.deepEqual(d.children, []);
    select(d.inputs[0], {}); await turn(); assert.equal(loads, 2);
});

test('each invocation retains its original document body and explicit cleanup failure precedence', async () => {
    const a = dom(), b = dom(); let current = a.document;
    const upload = createCsvImporter({getDocument: () => current, loadParser: async () => ({parse (_file, options) { options.complete({data: ['ok']}); }})});
    const first = upload(); current = b.document; const second = upload();
    select(a.inputs[0], {}); select(b.inputs[0], {}); assert.deepEqual(await first, ['ok']); assert.deepEqual(await second, ['ok']);
    assert.deepEqual(a.children, []); assert.deepEqual(b.children, []);
    for (const failed of [false, true]) {
        const d = dom(), cleanup = new Error('cleanup failed'), original = Object.freeze(new Error('parser original'));
        let attempts = 0; d.body.removeChild = () => { attempts++; throw cleanup; };
        const imp = createCsvImporter({getDocument: () => d.document, loadParser: async () => ({parse (_file, options) {
            if (failed) options.error(original); else options.complete({data: ['ok']});
        }})});
        const pending = imp(), refusal = assert.rejects(pending, error => error === (failed ? original : cleanup));
        select(d.inputs[0], {}); await refusal; assert.equal(attempts, 1);
    }
});

test('production loader is an action-only real Papa chunk and tracked overlay mirror is exact', () => {
    assert.match(source, /import\(/); assert.match(source, /webpackChunkName: "csv-parser"/);
    assert.match(source, /'papaparse'\)\s*\.then\(module => module.default\)/);
    assert.doesNotMatch(source, /import\s+Papa\s+from/);
    assert.equal(readFileSync(new URL('../packages/scratch-gui/src/lib/import-csv.js', import.meta.url), 'utf8'), source);
});
