import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const overlay = resolve(here, '../overlay/scratch-gui/src');

test('codemirror-editor.jsx exists in overlay', () => {
    assert.ok(existsSync(resolve(overlay, 'lib/codemirror-editor.jsx')),
        'codemirror-editor.jsx missing');
});

test('cm-lang-pseudocode.js exists', () => {
    assert.ok(existsSync(resolve(overlay, 'lib/cm-lang-pseudocode.js')),
        'cm-lang-pseudocode.js missing');
});

test('cm-lang-basic.js exists', () => {
    assert.ok(existsSync(resolve(overlay, 'lib/cm-lang-basic.js')),
        'cm-lang-basic.js missing');
});

test('heavy grammars have dedicated deferred chunks while learner modes stay synchronous', () => {
    const languages = readFileSync(resolve(overlay, 'lib/codemirror-languages.js'), 'utf8');
    const editor = readFileSync(resolve(overlay, 'lib/codemirror-editor.jsx'), 'utf8');
    for (const [language, chunk] of [
        ['@codemirror/lang-cpp', 'bw-codemirror-lang-cpp'],
        ['@codemirror/lang-python', 'bw-codemirror-lang-python'],
        ['@codemirror/lang-javascript', 'bw-codemirror-lang-javascript']
    ]) {
        assert.match(languages, new RegExp(`import\\([^\\n]+${chunk}[^\\n]+${language}`),
            `${language} must keep a named async boundary`);
        assert.ok(!editor.includes(`from '${language}'`),
            `${language} must not re-enter the base CodeMirror chunk`);
    }
    for (const localMode of ['pseudocodeLang()', 'basicLang()', 'asmLang()']) {
        assert.ok(languages.includes(localMode), `${localMode} stopped loading synchronously`);
    }
    assert.match(editor, /_langCompartment\.reconfigure\(extension\)/,
        'language arrival must reconfigure only the language compartment');
});

test('latest language request applies sync modes immediately and rejects stale grammar arrivals', async () => {
    const source = readFileSync(resolve(overlay, 'lib/latest-language-request.js'), 'utf8');
    const {default: LatestLanguageRequest} = await import(
        `data:text/javascript,${encodeURIComponent(source)}`);
    const pending = new Map();
    const applied = [];
    const editorState = {
        document: 'MOV AX, 1',
        selection: {anchor: 4, head: 6},
        highlightedLine: 1
    };
    const request = new LatestLanguageRequest({
        getImmediate: language => language === 'asm' ? 'asm-extension' : undefined,
        loadDeferred: language => new Promise((resolvePromise, rejectPromise) => {
            pending.set(language, {resolve: resolvePromise, reject: rejectPromise});
        }),
        fallback: 'plain-text',
        apply: (extension, language) => applied.push({extension, language}),
        onError: error => { throw error; }
    });

    assert.equal(request.select('asm'), null);
    assert.deepEqual(applied.pop(), {extension: 'asm-extension', language: 'asm'},
        'the ASM mode must apply in the selecting call stack');

    const python = request.select('python');
    const javascript = request.select('javascript');
    pending.get('python').resolve('python-extension');
    assert.equal(await python, false, 'an older grammar must not win a rapid switch');
    pending.get('javascript').resolve('javascript-extension');
    assert.equal(await javascript, true);
    assert.deepEqual(applied.slice(-3), [
        {extension: 'plain-text', language: 'python'},
        {extension: 'plain-text', language: 'javascript'},
        {extension: 'javascript-extension', language: 'javascript'}
    ]);
    assert.deepEqual(editorState, {
        document: 'MOV AX, 1',
        selection: {anchor: 4, head: 6},
        highlightedLine: 1
    }, 'language requests must not own or replace editor state');
});

test('failed and unmounted grammar requests stay on plain text without late application', async () => {
    const source = readFileSync(resolve(overlay, 'lib/latest-language-request.js'), 'utf8');
    const {default: LatestLanguageRequest} = await import(
        `data:text/javascript,${encodeURIComponent(source)}#dispose`);
    const applied = [];
    const errors = [];
    let rejectLoad;
    const failed = new LatestLanguageRequest({
        getImmediate: () => undefined,
        loadDeferred: () => new Promise((resolvePromise, rejectPromise) => { rejectLoad = rejectPromise; }),
        fallback: 'plain-text',
        apply: extension => applied.push(extension),
        onError: error => errors.push(error.message)
    });
    const result = failed.select('python');
    rejectLoad(new Error('offline'));
    assert.equal(await result, false);
    assert.deepEqual(applied, ['plain-text']);
    assert.deepEqual(errors, ['offline']);

    let resolveLoad;
    const unmounted = new LatestLanguageRequest({
        getImmediate: () => undefined,
        loadDeferred: () => new Promise(resolvePromise => { resolveLoad = resolvePromise; }),
        fallback: 'plain-text',
        apply: extension => applied.push(extension)
    });
    const late = unmounted.select('c');
    unmounted.dispose();
    resolveLoad('cpp-extension');
    assert.equal(await late, false);
    assert.ok(!applied.includes('cpp-extension'));
});

test('hosted editor gate proves ASM isolation and optional grammar encoded size', () => {
    const gate = readFileSync(resolve(here, '../scripts/verify-editor.mjs'), 'utf8');
    assert.match(gate, /ASM tab did not fetch optional C, Python or JavaScript grammars/);
    assert.match(gate, /grammarReceipt\.encodedBodyBytes >= 100 \* 1024/);
    for (const chunk of ['cpp', 'python', 'javascript']) {
        assert.ok(gate.includes(`'${chunk}'`), `hosted gate stopped demanding ${chunk}`);
    }
});

test('pseudocode-importer uses lazy CM import', () => {
    const src = readFileSync(
        resolve(overlay, 'components/tw-pseudocode/pseudocode-importer.jsx'), 'utf8'
    );
    assert.ok(src.includes('React.lazy'), 'React.lazy not found');
    assert.ok(src.includes('bw-codemirror'), 'bw-codemirror chunk name not found');
    assert.ok(src.includes('codemirror-editor.jsx'), 'codemirror-editor import not found');
});

test('pseudocode-importer has maximize toggle', () => {
    const src = readFileSync(
        resolve(overlay, 'components/tw-pseudocode/pseudocode-importer.jsx'), 'utf8'
    );
    assert.ok(src.includes('bw-editor-max'), 'bw-editor-max not found');
    assert.ok(src.includes('toggleMaximize'), 'toggleMaximize not found');
    assert.ok(src.includes('bw-editor-maximize'), 'maximize testid not found');
});

test('pseudocode-importer has setHighlightedLine', () => {
    const src = readFileSync(
        resolve(overlay, 'components/tw-pseudocode/pseudocode-importer.jsx'), 'utf8'
    );
    assert.ok(src.includes('setHighlightedLine'),
        'setHighlightedLine not found — debugger seam missing');
});

test('about-data.js includes CodeMirror', () => {
    const src = readFileSync(
        resolve(overlay, 'components/menu-bar/about-data.js'), 'utf8'
    );
    assert.ok(src.includes('CodeMirror'), 'CodeMirror not in about-data.js');
    assert.ok(src.includes('codemirror.net'), 'codemirror.net URL not in about-data.js');
});

test('THIRD-PARTY-NOTICES.md includes CodeMirror', () => {
    const src = readFileSync(resolve(here, '../THIRD-PARTY-NOTICES.md'), 'utf8');
    assert.ok(src.includes('CodeMirror'), 'CodeMirror not in THIRD-PARTY-NOTICES.md');
    assert.ok(src.includes('@codemirror/lang-cpp'), '@codemirror/lang-cpp not listed');
    assert.ok(src.includes('@codemirror/lang-python'), '@codemirror/lang-python not listed');
});

test('integrate.mjs adds codemirror deps', () => {
    const src = readFileSync(resolve(here, '../scripts/integrate.mjs'), 'utf8');
    assert.ok(src.includes("codemirror"), 'codemirror dep not in integrate.mjs');
    assert.ok(src.includes("@codemirror/lang-cpp"), 'lang-cpp dep not in integrate.mjs');
});

test('old CodeEditor class removed from pseudocode-importer', () => {
    const src = readFileSync(
        resolve(overlay, 'components/tw-pseudocode/pseudocode-importer.jsx'), 'utf8'
    );
    assert.ok(!src.includes('class CodeEditor'), 'old CodeEditor class still present');
    assert.ok(!src.includes('function highlight ('), 'old highlight function still present');
});
