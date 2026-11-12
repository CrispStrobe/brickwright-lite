import test from 'node:test';
import assert from 'node:assert/strict';
import {requestLibraryComponent} from '../overlay/scratch-gui/src/lib/library-component-loader.js';
const turn = () => new Promise(resolve => setImmediate(resolve));
const deferred = () => {
    let resolve, reject;
    const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
    return {promise, resolve, reject};
};

test('library loading starts only for a request and preserves the original default export', async () => {
    let calls = 0, received;
    const Component = () => null;
    assert.equal(calls, 0);
    requestLibraryComponent(() => { calls++; return Promise.resolve({default: Component}); },
        value => { received = value; }, assert.fail);
    await turn();
    assert.equal(calls, 1);
    assert.equal(received, Component);
});

test('closing before the request starts avoids even its module load', async () => {
    let calls = 0;
    const cancel = requestLibraryComponent(() => { calls++; }, assert.fail, assert.fail);
    cancel();
    await turn();
    assert.equal(calls, 0);
});

test('closing a pending library refuses its late successful completion', async () => {
    const load = deferred();
    const published = [];
    const cancel = requestLibraryComponent(() => load.promise,
        value => published.push(value), error => published.push(error));
    await turn();
    cancel();
    load.resolve({default: () => null});
    await turn();
    assert.deepEqual(published, []);
});

test('closing a pending library refuses its late failure', async () => {
    const load = deferred();
    const published = [];
    const cancel = requestLibraryComponent(() => load.promise,
        value => published.push(value), error => published.push(error));
    await turn();
    cancel();
    load.reject(new Error('network failed after close'));
    await turn();
    assert.deepEqual(published, []);
});

test('a failed request reports the error and a new attempt can really load again', async () => {
    const error = new Error('network unavailable');
    let observed, received, calls = 0;
    const Component = () => null;
    const load = () => { calls++; return calls === 1 ? Promise.reject(error) : Promise.resolve({default: Component}); };
    requestLibraryComponent(load, assert.fail, value => { observed = value; });
    await turn();
    assert.equal(observed, error);
    requestLibraryComponent(load, value => { received = value; }, assert.fail);
    await turn();
    assert.equal(calls, 2);
    assert.equal(received, Component);
});

test('an invalid loaded namespace is an honest failure', async () => {
    let error;
    requestLibraryComponent(() => Promise.resolve({}), assert.fail, value => { error = value; });
    await turn();
    assert.match(error.message, /component unavailable/);
});

test('an old closed request cannot replace a newer active library', async () => {
    const old = deferred(), current = deferred();
    const observed = [];
    const stop = requestLibraryComponent(() => old.promise, value => observed.push(value), assert.fail);
    await turn();
    stop();
    requestLibraryComponent(() => current.promise, value => observed.push(value), assert.fail);
    await turn();
    const New = () => null;
    current.resolve({default: New});
    await turn();
    old.resolve({default: () => null});
    await turn();
    assert.deepEqual(observed, [New]);
});
