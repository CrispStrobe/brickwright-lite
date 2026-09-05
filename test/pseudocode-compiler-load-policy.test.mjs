import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const source = readFileSync(new URL(
    '../overlay/scratch-gui/src/components/tw-pseudocode/pseudocode-importer.jsx', import.meta.url), 'utf8');

test('device discovery does not speculatively load the full compiler', () => {
    assert.doesNotMatch(source, /computeExampleCompat|exampleCompat|_exampleCompatCache/,
        'the removed compatibility cache made no-pin device selection fetch sb3-creator');

    const mount = source.slice(source.indexOf('componentDidMount ()'), source.indexOf('_publishControlsFor (source)'));
    assert.match(mount, /if \(device\) \{\s*this\.loadCatalog\(\);\s*\}/,
        'restored devices still need lightweight catalog metadata');
    assert.doesNotMatch(mount, /this\.lib\(/,
        'mounting Code must not load the compiler');
});

test('real compiler consumers retain the lazy registering door', () => {
    assert.match(source, /webpackChunkName: "sb3-creator"[\s\S]*sb3-creator-register-art\.js/,
        'real compilation paths must retain vector-art registration');
    const setDevice = source.slice(source.indexOf('async setDevice (deviceId)'),
        source.indexOf('async deployToPico ()'));
    assert.match(setDevice, /if \(hasPins\) \{[\s\S]*await this\.lib\(\)/,
        'retargeting a program with pins still needs the compiler');
    const loadExample = source.slice(source.indexOf('async loadExample (key)'),
        source.indexOf('publishGameControls (gameKey)'));
    assert.match(loadExample, /device && exampleDevice && device !== exampleDevice\.toLowerCase\(\)[\s\S]*await this\.lib\(\)/,
        'loading an example for a different device still needs the compiler');
});

test('hosted pre-Circuit receipts reject a speculative compiler fetch', () => {
    const bench = readFileSync(new URL('../scripts/bench-i8086-browser.mjs', import.meta.url), 'utf8');
    assert.match(bench, /speculativeCompilerAssets/);
    assert.match(bench, /sb3-creator\\\.js/);
    assert.ok(bench.includes('Code layout fetched the compiler without a `') &&
        bench.includes('retarget, conversion, compile, or export request:'),
    'the verdict must explain which user actions legitimately load the compiler');
});
