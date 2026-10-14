/**
 * One piece of content, two surfaces, one of them unreadable.
 *
 * The owner reported the example (i) panel in the menu bar as "too small and
 * does not wrap", and said the same content renders much better from the
 * Examples catalogue. Both already call the SAME `renderMarkdown` from
 * `bw-circuit-ui/intro-doc.jsx`, so the difference was never the rendering —
 * it was the container: 420 px wide, 12 px type, no wrapping rule, against the
 * catalogue's `min(880px, 94vw)` dialog. The fix is the catalogue's numbers,
 * not a second panel implementation.
 *
 * The C help note had the same disease in a worse form: 700 characters naming
 * the silent-tone gap, the 8086 port-I/O primitives and the MOVZX trap,
 * rendered as a bare inline `<span>` in a toolbar row, while BASIC and ASM
 * already had (i) toggles and panels of their own.
 *
 * These assertions read the styles as source text. That is deliberate: the
 * alternative is a browser gate for a padding value, and the defect being
 * guarded is "someone restyles one surface and not the other", which source
 * text catches at the point of edit.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(import.meta.dirname, '..');
const BUTTON = path.join(ROOT, 'overlay/scratch-gui/src/components/menu-bar/example-intro-button.jsx');
const CATALOGUE = path.join(ROOT, 'node_modules/bw-circuit-ui/src/components/ExamplesBrowser.jsx');
const IMPORTER = path.join(ROOT, 'overlay/scratch-gui/src/components/tw-pseudocode/pseudocode-importer.jsx');

test('the menu-bar (i) panel uses the catalogue\'s width and wraps, rather than its own 420px', () => {
    const button = readFileSync(BUTTON, 'utf8');
    assert.match(button, /width: 'min\(880px, 94vw\)'/,
        'the panel is not using the catalogue\'s width');
    assert.match(button, /maxHeight: '90vh'/, 'the panel is not using the catalogue\'s height');
    assert.match(button, /overflowWrap: 'anywhere'/,
        'without a wrapping rule a long token (a URL, a call signature) runs off the panel');
    assert.doesNotMatch(button, /width: 420/, 'the fixed 420px width is back');
});

test('both surfaces still render through ONE markdown implementation', () => {
    const button = readFileSync(BUTTON, 'utf8');
    const catalogue = readFileSync(CATALOGUE, 'utf8');
    for (const [name, source] of [['example-intro-button.jsx', button], ['ExamplesBrowser.jsx', catalogue]]) {
        assert.match(source, /renderMarkdown/, `${name} no longer uses the shared renderer`);
        assert.match(source, /intro-doc/, `${name} no longer imports from intro-doc`);
        assert.doesNotMatch(source, /function renderMarkdown/,
            `${name} defines its own renderMarkdown — one content, one renderer`);
    }
});

test('the C note has the (i) panel that BASIC and ASM already had, and is not inline in the toolbar', () => {
    const importer = readFileSync(IMPORTER, 'utf8');
    assert.match(importer, /data-testid="bw-c-info-toggle"/, 'the C note has no (i) toggle');
    assert.match(importer, /data-testid="bw-c-info-panel"/, 'the C note has no panel');
    assert.doesNotMatch(importer, /<span style=\{\{fontSize: 13, color: '#64748b'\}\}>\{this\.L\.cNote\}<\/span>/,
        'the C note is inline in the toolbar row again');
    // and the panel wraps, which is the whole complaint
    const panel = importer.slice(importer.indexOf('bw-c-info-panel') - 600, importer.indexOf('bw-c-info-panel'));
    assert.match(panel, /overflowWrap: 'anywhere'/, 'the C panel does not wrap long tokens');
    assert.match(panel, /maxWidth: 'min\(880px, 94vw\)'/, 'the C panel does not bound its width');
});

test('every language note that exists is reachable the same way (no odd one out)', () => {
    const importer = readFileSync(IMPORTER, 'utf8');
    for (const lang of ['basic', 'asm', 'c']) {
        assert.match(importer, new RegExp(`data-testid="bw-${lang}-info-toggle"`),
            `the ${lang} note has no (i) toggle while its siblings do`);
        assert.match(importer, new RegExp(`data-testid="bw-${lang}-info-panel"`),
            `the ${lang} note has no panel while its siblings do`);
    }
});

// The tone gap itself is the EMITTER's property, and the emitter (sb3-creator.js)
// is vendored from CrispStrobe/sb3-creator. Asserting how it behaves from here
// would be lite asserting a property of a file it does not own — the shape that
// bit five lanes today. What lite owns is this note's TEXT, so that is what is
// held here; the emitter's warning is asserted upstream, beside the code.
test('the C note still states the tone gap, in both languages it ships', () => {
    const importer = readFileSync(IMPORTER, 'utf8');
    assert.match(importer, /SILENT no-op on the 8051/, 'the English note lost the tone gap');
    assert.match(importer, /STILLEN No-op/, 'the German note lost the tone gap');
    assert.match(importer, /bw_outb\(port, value\)/, 'the note lost the 8086 port-I/O primitives');
    assert.match(importer, /MOVZX/, 'the note lost the MOVZX trap');
});
