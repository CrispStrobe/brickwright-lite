import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import test from 'node:test';

const source = readFileSync(new URL('../overlay/scratch-gui/src/containers/lazy-pseudocode-importer.jsx',
    import.meta.url), 'utf8');

// The helpers are plain expressions; evaluate exactly the shipped text.
const helper = name => {
    const match = new RegExp(`export const ${name} = ([\\s\\S]*?\\n)(?=\\n|//|export )`).exec(source);
    assert.ok(match, `${name} is exported`);
    return new Function(`return (${match[1].trim().replace(/;$/, '')});`)();
};
const isStaleBuildError = helper('isStaleBuildError');
const failingComponentOf = helper('failingComponentOf');

test('stale-build failures are recognised so the boundary offers a reload', () => {
    const chunk = new Error('Loading chunk 412 failed.');
    chunk.name = 'ChunkLoadError';
    assert.equal(isStaleBuildError(chunk), true);
    assert.equal(isStaleBuildError(new Error('Minified React error #306; visit https://reactjs.org/docs/error-decoder.html?invariant=306&args[]=undefined&args[]=')), true);
    assert.equal(isStaleBuildError(new TypeError('Failed to fetch dynamically imported module: x.js')), true);
    assert.equal(isStaleBuildError(Object.assign(new Error('x'), {bwStaleBuild: true})), true);
    assert.equal(isStaleBuildError(new TypeError('Cannot read properties of null')), false);
    assert.equal(isStaleBuildError(null), false);
});

test('the innermost failing component is named from the React stack', () => {
    assert.equal(failingComponentOf('\n    in Lazy\n    in Suspense\n    in PseudocodeImporter'), 'Lazy');
    assert.equal(failingComponentOf('\n    at CircuitDebugger (x.js:1:2)\n    at div'), 'CircuitDebugger');
    assert.equal(failingComponentOf(null), null);
});

test('a chunk without a default export fails with a named, stale-build error', () => {
    // The check sits in the loader's .then, before its .catch resets the request.
    const start = source.indexOf('.then(module => {');
    const end = source.indexOf('}).catch(error => {', start);
    assert.ok(start > 0 && end > start, 'the loader validates the module before its catch');
    assert.ok(source.slice(start, end).includes('error.bwStaleBuild = true;'));
    assert.match(source, /"pseudocode-importer" chunk loaded without a default/);
    assert.match(source, /componentDidCatch \(error, info\)/);
    assert.match(source, /Reload page/);
    assert.match(source, /Retry code editor/);
});
