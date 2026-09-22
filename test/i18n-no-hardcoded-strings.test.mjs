// No user-facing string may be hardcoded in a component we own.
//
// This is repo-wide on purpose. A per-feature check only protects the feature
// somebody remembered to write it for, and the strings that actually went
// missing were the ones nobody was looking at: tooltips and aria-labels, which
// render only on hover or to a screen reader, so no amount of clicking through
// the UI reveals them.
//
// Three mechanisms are legitimate, and lib/bw-i18n.js says which to use when:
//   - react-intl (defineMessages/formatMessage) for scratch-gui's own tree,
//   - a local table read with the store's locale, for ours,
//   - a shared table (lib/bw-fpga/l10n.js) for modules with no props.
// What is NOT legitimate is a literal.
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync, readdirSync} from 'node:fs';
import {resolve, dirname, relative} from 'node:path';
import {fileURLToPath} from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');

// Walk the tree directly rather than asking `git ls-files`: this gate should
// not depend on a tool resolved from PATH, and it should still work in a
// checkout that is not a git repository.
const walk = dir => {
    const out = [];
    for (const entry of readdirSync(dir, {withFileTypes: true})) {
        const full = resolve(dir, entry.name);
        if (entry.isDirectory()) out.push(...walk(full));
        else if (entry.name.endsWith('.jsx')) out.push(relative(root, full));
    }
    return out;
};
const files = [
    ...walk(resolve(root, 'overlay/scratch-gui/src/components')),
    ...walk(resolve(root, 'overlay/scratch-gui/src/containers'))
];

/** Attributes a person reads: tooltips, accessible names, input hints. */
const ATTR = /(?:title|aria-label|placeholder)="([A-Z][^"]{4,})"/g;

/** Brand names are the same in every language and are not translated. */
const BRANDS = new Set(['Scratch', 'BrickWright', 'Arduboy']);

test('no component hardcodes a title, aria-label or placeholder', () => {
    const offenders = [];
    for (const rel of files) {
        const text = readFileSync(resolve(root, rel), 'utf8');
        for (const m of text.matchAll(ATTR)) {
            if (BRANDS.has(m[1])) continue;
            offenders.push(`${rel.replace('overlay/scratch-gui/src/', '')}: ${m[1].slice(0, 50)}`);
        }
    }
    assert.deepEqual(offenders, [],
        'these render to a person and cannot be translated — see lib/bw-i18n.js');
});

test('the audit actually walks the tree', () => {
    // A guard that scanned nothing would pass. The count is a floor, not a
    // fixture: it only has to prove the walk happened.
    assert.ok(files.length > 50, `expected to scan the component tree, saw ${files.length} files`);
    assert.ok(files.some(f => f.includes('stage-header')), 'including scratch-gui components');
    assert.ok(files.some(f => f.includes('tw-pseudocode')), 'and our own');
});

test('the shared machinery documents which mechanism to use', () => {
    // Three patterns in one codebase is how strings go missing. The rule has to
    // live somewhere a person will find it, next to the thing it describes.
    const doc = readFileSync(resolve(root, 'overlay/scratch-gui/src/lib/bw-i18n.js'), 'utf8');
    assert.match(doc, /react-intl/, 'it names the upstream mechanism');
    assert.match(doc, /do NOT move those/i, 'and warns against absorbing scratch-gui strings');
    assert.match(doc, /state\.locales\.locale/, 'it names where the locale comes from');
    assert.match(doc, /lib\/bw-fpga\/l10n\.js/, 'and points at the shared-table example');
});

test('nobody reimplements locale-picking or interpolation any more', () => {
    // Every component used to carry its own pickLocale and its own template
    // literals, which is exactly how they drifted apart.
    const copies = [];
    for (const rel of files) {
        const text = readFileSync(resolve(root, rel), 'utf8');
        if (/const pickLocale = /.test(text) && !/from '.*bw-i18n\.js'/.test(text)) {
            copies.push(rel.replace('overlay/scratch-gui/src/', ''));
        }
    }
    // Existing copies are grandfathered; the count must not GROW.
    assert.ok(copies.length <= 8,
        `${copies.length} components still define their own pickLocale: ${copies.join(', ')}`);
});

test('no component reads a locale identifier it does not have', () => {
    // Twice now, an i18n edit reached for a locale that was not in scope:
    //   props.locale inside `({onUseVerilog, seed, locale}) => …`  (props undefined)
    //   at(locale, …) inside `({vm}) => …`                        (locale undefined)
    // Both are ReferenceErrors at RENDER, which unmount the React tree — the
    // app comes up blank, and the flag-off build never compiles the file, so
    // nothing else says a word. The first version of this guard covered three
    // files by name; the second bug landed in a file it did not list. It now
    // walks everything.
    const offenders = [];
    for (const rel of files) {
        const text = readFileSync(resolve(root, rel), 'utf8');
        // Only files that actually translate. Scope-tracking by regex is crude
        // (a `constructor(props)` or a multi-line parameter list fools it), and
        // a guard that cries wolf on untouched files gets switched off. Both
        // real bugs were in files that import these helpers, which is the
        // population this needs to cover.
        if (!/bw-i18n\.js|bw-fpga\/l10n\.js/.test(text)) continue;
        const lines = text.split('\n');
        const moduleHasLocale = /^(?:const|let|var|function)\s+locale\b/m.test(text);
        let params = null;          // parameter text of the innermost component
        lines.forEach((line, i) => {
            const decl = /^(?:export\s+)?(?:const|function)\s+[A-Z][A-Za-z0-9_]*\s*=?\s*(?:function\s*)?\(([^)]*)\)/.exec(line);
            if (decl) params = decl[1];
            if (params === null || /^\s*[*/]/.test(line)) return;
            const hasPropsParam = /\bprops\b/.test(params);
            const hasLocaleParam = /\blocale\b/.test(params);
            // `this.props.x` is a class component reading its own props and is
            // fine; only a BARE `props.x` needs a parameter called props.
            if (/(?<!this\.)\bprops\.\w/.test(line) && !hasPropsParam) {
                offenders.push(`${rel}:${i + 1} reads props.x with no props param`);
            }
            // A bare `locale` argument, where nothing defines one.
            if (/\b(?:at|t|tr|pt)\(\s*locale\s*,/.test(line) && !hasLocaleParam && !moduleHasLocale) {
                offenders.push(`${rel}:${i + 1} reads a bare locale that is not in scope`);
            }
        });
    }
    assert.deepEqual(offenders, [], 'these throw at render and blank the app');
});
