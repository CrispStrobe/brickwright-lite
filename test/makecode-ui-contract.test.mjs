/**
 * The wiring between the MakeCode importer and the Code tab.
 *
 * bw-makecode is tested to death against real files, but every one of
 * those tests would still pass if the Open button never called it. This
 * file gates the seams that only exist in the JSX — and each assertion
 * here is a failure mode that shows up in a browser and nowhere else:
 *
 *   - a hex read as TEXT instead of bytes (silently corrupts .uf2/.png)
 *   - costumes handed over under field names `compile()` does not read
 *     (the artwork vanishes and the code still loads, so nothing errors)
 *   - a lazy import split into three chunks instead of one
 *   - a German string missing, which throws only when the locale is de
 *
 * Source-shape assertions, in the idiom of circuit-tab-index.test.mjs:
 * this is not a rendering test, it is a "the two ends still agree" test.
 */

import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {resolve, dirname} from 'node:path';
import {fileURLToPath} from 'node:url';

import {IMPORT_ACCEPT} from '../overlay/scratch-gui/src/lib/bw-makecode/accept.js';
import {scopeAfter} from './helpers/js-scope.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const IMPORTER = resolve(here, '../overlay/scratch-gui/src/components/tw-pseudocode/pseudocode-importer.jsx');
const source = readFileSync(IMPORTER, 'utf8');

test('the Open button offers the artefact extensions and routes them', () => {
    assert.match(source, /accept=\{`\$\{CODE_ACCEPT\},\$\{IMPORT_ACCEPT\}`\}/,
        'the file input must offer .hex/.uf2/.elf/.png as well as the source extensions');
    assert.match(source, /if \(isImportableArtefact\(file\.name\)\) \{\s*\n\s*this\.openArtefactFile\(file\);/,
        'and route those to the artefact importer rather than reading them as text');
    // accept.js is imported statically for exactly this: reading one
    // constant must not pull the decoders into the main bundle.
    assert.match(source, /import \{IMPORT_ACCEPT, isImportableArtefact\} from '\.\.\/\.\.\/lib\/bw-makecode\/accept\.js'/);
    assert.doesNotMatch(source, /^import .*bw-makecode\/index\.js/m,
        'the importer proper must only ever be loaded on demand');
});

test('an artefact is read as bytes, not as text', () => {
    // A .uf2 or .png read through readAsText is mangled beyond recovery
    // by the encoder, and the failure looks like "no source embedded".
    const method = scopeAfter(source, 'openArtefactFile (file) {');
    assert.match(method, /readAsArrayBuffer\(file\)/);
    assert.match(method, /new Uint8Array\(reader\.result\)/);
});

test('all three entry points share one lazily-loaded chunk', () => {
    const chunks = [...source.matchAll(/webpackChunkName: "([^"]+)" \*\/ '\.\.\/\.\.\/lib\/bw-makecode\/index\.js'/g)]
        .map(m => m[1]);
    assert.equal(chunks.length, 3, 'file import, share import and export');
    assert.deepEqual([...new Set(chunks)], ['bw-makecode'], 'one chunk, not three');
});

test('costumes are handed over under the names compile() reads', () => {
    // The contract: applyMakeCodeImport fills `uploads`, and compile()
    // consumes it. Rename a field on one side and the artwork silently
    // stops arriving — the project still loads, so nothing throws.
    const apply = scopeAfter(source, 'applyMakeCodeImport (res, label) {');
    const uploads = apply.slice(apply.indexOf('uploads:'), apply.indexOf('output: null'));
    for (const field of ['sprite:', 'filename:', 'svg:', 'mode:']) {
        assert.ok(uploads.includes(field), `uploads entries must carry ${field}`);
    }
    const compile = scopeAfter(source, 'this.state.uploads.forEach');
    assert.match(compile, /u\.sprite/);
    assert.match(compile, /u\.svg/);
    assert.match(compile, /u\.mode === 'add'/);
});

test('the share and export buttons exist, and are bound', () => {
    for (const [testid, handler] of [
        ['bw-makecode-share', 'openMakeCodeShare'],
        ['bw-makecode-export', 'exportMakeCode']
    ]) {
        assert.ok(source.includes(`data-testid="${testid}"`), `${testid} button`);
        assert.match(source, new RegExp(`onClick=\\{this\\.${handler}\\}`), `${testid} onClick`);
        assert.match(source, new RegExp(`this\\.${handler} = this\\.${handler}\\.bind\\(this\\)`),
            `${handler} must be bound, or "this" is undefined when it fires`);
    }
});

test('the micro:bit tab appears for an imported .py, which has no DEVICE line', () => {
    // Hiding it would hide the Run-on-simulator button for the one
    // imported program that needs no translation at all.
    assert.match(source,
        /this\.currentDevice\(\) === 'microbit' \|\| \(this\.state\.buffers\.micropython \|\| ''\)\.trim\(\)/,
        'and it reads that buffer defensively — see the buffer-shape test below');
    assert.match(source, /importedPython: res\.kind === 'micropython'/);
});

test('a status message gets every argument its template names', () => {
    // `mcArcade` grew a `button` parameter and the call site did not, so
    // the status line said "Press undefined to build" — through a green
    // build, because no unit test reads that text. The browser gate
    // printed it; this keeps it printed-once.
    const template = /mcArcade: \((.*?)\) =>/.exec(source);
    assert.ok(template, 'the English template');
    const parameters = template[1].split(',').length;
    const call = /this\.L\.mcArcade\(([\s\S]*?)\);/.exec(source);
    assert.ok(call, 'the call site');
    // Arguments, counted at depth zero so `(res.sprites || []).length`
    // is one argument and not two.
    let depth = 0;
    let args = 1;
    for (const c of call[1]) {
        if ('([{'.includes(c)) depth++;
        else if (')]}'.includes(c)) depth--;
        else if (c === ',' && depth === 0) args++;
    }
    assert.equal(args, parameters, 'the call passes as many arguments as the message takes');
    assert.match(call[1], /this\.L\.toBlocks/, 'and the button label comes from the button');
});

test('every buffer set carries every language', () => {
    // A `buffers:` literal that spells out the set and omits one leaves
    // that key undefined, and the next render to read it dies. That is
    // not hypothetical: `loadExample` dropped `micropython`, and the
    // moment the micro:bit tab started reading it to decide whether to
    // show itself, loading any example crashed the pane. The unit tests
    // saw nothing; a browser gate caught it.
    const languages = ['pseudocode', 'python', 'javascript', 'c', 'basic', 'asm', 'micropython'];
    const literals = source.match(/buffers: \{pseudocode:[^}]*\}/g) || [];
    assert.ok(literals.length >= 5, `expected the buffer literals, found ${literals.length}`);
    for (const literal of literals) {
        const missing = languages.filter(lang => !literal.includes(`${lang}:`));
        assert.deepEqual(missing, [], `a buffer literal omits ${missing.join(', ')}: ${literal.slice(0, 90)}`);
    }
});

test('every MakeCode string exists in both languages', () => {
    const table = key => {
        const start = source.indexOf(`    ${key}: {`);
        assert.ok(start > 0, `${key} locale table`);
        const end = source.indexOf('\n    },', start);
        return source.slice(start, end);
    };
    const en = table('en');
    const de = table('de');
    const keys = [...en.matchAll(/^\s{8}(mc[A-Za-z]+):/gm)].map(m => m[1]);
    assert.ok(keys.length >= 12, `expected the MakeCode strings, found ${keys.length}`);
    for (const key of keys) {
        assert.ok(new RegExp(`^\\s{8}${key}:`, 'm').test(de), `${key} is missing its German`);
    }
});

test('the extensions offered and the extensions handled are the same list', () => {
    // IMPORT_ACCEPT is what the file dialog shows; isImportableArtefact is
    // what decides where a dropped file goes. A file offered but not
    // routed lands in the text path and reports "unknown file type".
    assert.equal(IMPORT_ACCEPT, '.hex,.uf2,.elf,.png');
    const accept = readFileSync(
        resolve(here, '../overlay/scratch-gui/src/lib/bw-makecode/accept.js'), 'utf8');
    for (const ext of IMPORT_ACCEPT.split(',')) {
        assert.ok(accept.includes(ext.slice(1)), `${ext} must appear in the routing test too`);
    }
});
