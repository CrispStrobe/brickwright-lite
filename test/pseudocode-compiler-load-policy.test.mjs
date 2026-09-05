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

test('bundled examples wait for the no-device Tools menu', () => {
    const reveal = source.slice(source.indexOf('_reveal ()'), source.indexOf('componentDidUpdate'));
    assert.doesNotMatch(reveal, /loadExamples|_loadBundledExamples/,
        'showing Code must not fetch its optional bundled-example picker');

    const menu = source.slice(source.indexOf('renderActionMenu (csel)'), source.indexOf('render ()'));
    assert.match(menu, /onToggle=\{event => \{[\s\S]*actionsOpen: event\.currentTarget\.open/,
        'the component must retain whether Tools is open across device changes');
    const update = source.slice(source.indexOf('componentDidUpdate (prevProps, prevState)'),
        source.indexOf('readAutosave ()'));
    assert.match(update,
        /this\.state\.actionsOpen && !this\.currentDevice\(\)[\s\S]*bundledExamplesStatus === 'idle'[\s\S]*this\._loadBundledExamples\(\)/,
        'opening Tools, or changing its selected device to none, must demand the bundled picker');
    assert.match(menu, /bundledExamplesStatus === 'error'[\s\S]*bw-load-example-retry/,
        'a failed chunk fetch must expose a retry action');
    assert.match(menu, /bundledExamplesStatus !== 'ready'[\s\S]*bw-load-example-loading/,
        'the picker must describe its loading state instead of appearing empty');
    for (const text of ['Loading built-in examples…', 'Built-in examples unavailable — retry',
        'Eingebaute Beispiele werden geladen…',
        'Eingebaute Beispiele nicht verfügbar — erneut versuchen']) {
        assert.ok(source.includes(text), `the retry/loading UX lost its localized text: ${text}`);
    }
});

test('bundled example loading is retryable, race-safe and unmount-safe', () => {
    const loader = source.slice(source.indexOf('const loadExamples = () =>'),
        source.indexOf('// Device groups'));
    assert.match(loader, /if \(examplesPending === pending\) examplesPending = null/,
        'only the failed request may reopen the shared loader for retry');

    const componentLoader = source.slice(source.indexOf('_loadBundledExamples ()'),
        source.indexOf('/** The tab is (or has been) shown'));
    assert.match(componentLoader, /if \(examplesReady\)[\s\S]*return Promise\.resolve\(examples\)/,
        'reopening Tools after success must not flash a second loading state');
    assert.match(componentLoader, /this\._examplesLoadRequest = request/);
    assert.match(componentLoader, /!this\._unmounted && this\._examplesLoadRequest === request/g,
        'late or stale async completions must not mutate component state');

    const controls = source.slice(source.indexOf('_publishControlsFor (source)'),
        source.indexOf('_loadBundledExamples ()'));
    assert.match(controls, /loadExamples\(\)\.then/,
        'restored games still demand-load examples to publish their controls');
    assert.match(controls, /catch\([\s\S]*publishGameControls\(null\)/,
        'a failed restored-source lookup must not leave stale game controls active');
    const loadExample = source.slice(source.indexOf('async loadExample (key)'),
        source.indexOf('publishGameControls (gameKey)'));
    assert.match(loadExample, /await this\._loadBundledExamples\(\)/,
        'selecting while a fetch is pending must await that same loader');
});

test('hosted pre-Circuit receipts reject speculative bundled examples', () => {
    const bench = readFileSync(new URL('../scripts/bench-i8086-browser.mjs', import.meta.url), 'utf8');
    assert.match(bench, /speculativeExampleAssets/);
    assert.match(bench, /pseudocode-examples\\\.js/);
    assert.match(bench, /bundled examples before[\s\S]*no-device Tools menu opened/);
});
