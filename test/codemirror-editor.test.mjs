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
