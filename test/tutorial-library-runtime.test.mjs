import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const read = file => readFileSync(new URL(`../${file}`, import.meta.url), 'utf8');
const owned = [
    'src/components/gui/gui.jsx',
    'src/components/gui/tutorial-library-loader.jsx',
    'src/components/gui/tutorial-library-loader.css',
    'src/components/gui/tutorial-library-runtime.jsx',
    'src/components/library/library.jsx',
    'src/lib/libraries/decks/metadata.js',
    'src/lib/tutorial-from-url.js',
    'src/reducers/cards.js',
    'src/reducers/gui.js'
];
const ownedTests = [
    'test/unit/reducers/cards-reducer.test.js',
    'test/unit/util/tutorial-from-url.test.js',
    'test/unit/util/tutorial-metadata.test.js'
];

test('all P15 tutorial runtime sources have durable overlay mirrors', () => {
    for (const file of owned) {
        assert.equal(read(`packages/scratch-gui/${file}`), read(`overlay/scratch-gui/${file}`),
            `${file} package/overlay copies diverged`);
    }
    for (const file of ownedTests) {
        assert.equal(read(`packages/scratch-gui/${file}`), read(`overlay/scratch-gui/${file}`),
            `${file} package/overlay copies diverged`);
    }
});

test('compact startup modules cannot reach the rendered deck registry', () => {
    for (const file of [
        'src/components/gui/gui.jsx',
        'src/components/library/library.jsx',
        'src/lib/tutorial-from-url.js',
        'src/reducers/cards.js',
        'src/reducers/gui.js'
    ]) {
        assert.doesNotMatch(read(`packages/scratch-gui/${file}`), /libraries\/decks\/index\.jsx/,
            `${file} imports full tutorial decks`);
    }
    const metadata = read('packages/scratch-gui/src/lib/libraries/decks/metadata.js');
    assert.doesNotMatch(metadata, /^\s*import\b|require\s*\(/m);
    assert.doesNotMatch(metadata, /<[A-Z][A-Za-z]*\b/);
});

test('one retryable named request owns both tutorial bodies and deck hydration', () => {
    const loader = read('packages/scratch-gui/src/components/gui/tutorial-library-loader.jsx');
    const runtime = read('packages/scratch-gui/src/components/gui/tutorial-library-runtime.jsx');
    assert.match(loader, /let tutorialLibraryRequest = null/);
    assert.match(loader, /webpackChunkName: "tutorial-library"/);
    assert.match(loader, /\.catch\(error => \{\s*tutorialLibraryRequest = null;/);
    assert.match(loader, /this\.mounted = false/);
    assert.match(loader, /generation !== this\.loadGeneration/);
    for (const selector of [
        'tutorial-library-loading',
        'tutorial-library-error',
        'tutorial-library-retry',
        'tutorial-library-cancel'
    ]) assert.match(loader, new RegExp(selector));
    assert.match(runtime, /import Cards from ['"]\.\.\/\.\.\/containers\/cards\.jsx['"]/);
    assert.match(runtime, /import TipsLibrary from ['"]\.\.\/\.\.\/containers\/tips-library\.jsx['"]/);
    assert.match(runtime, /import decks from ['"]\.\.\/\.\.\/lib\/libraries\/decks\/index\.jsx['"]/);
});
