import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';

const script = readFileSync(new URL('../scripts/verify-chrome-sweep.mjs', import.meta.url), 'utf8');
const start = script.indexOf('const libraryRequests = [];');
const end = script.indexOf('\n\ntry {', start);
assert.ok(start >= 0 && end > start, 'actual bounded request witness exists');
const witness = script.slice(start, end);

test('actual library request witness uses the URL constructor despite the proof-address binding', () => {
    let listener;
    const requests = runInNewContext(`const URL = 'https://proof.invalid/';\n${witness}\nlibraryRequests;`, {
        URL: globalThis.URL,
        page: {on(event, callback) { assert.equal(event, 'request'); listener = callback; }}
    });
    listener({url: () => 'https://proof.invalid/chunks/other.js'});
    assert.equal(requests.length, 0);
    listener({url: () => 'https://proof.invalid/chunks/bw-library.js?version=1'});
    assert.equal(requests.length, 1);
    assert.equal(requests[0], 'https://proof.invalid/chunks/bw-library.js?version=1');
});

test('the pre-repair proof-address shadow is rejected by the same actual callback control', () => {
    let listener;
    runInNewContext(`const URL = 'https://proof.invalid/';\n${witness.replace('new globalThis.URL(', 'new URL(')}`, {
        URL: globalThis.URL,
        page: {on(_event, callback) { listener = callback; }}
    });
    assert.throws(() => listener({url: () => 'https://proof.invalid/chunks/bw-library.js'}), /not a constructor/);
});
