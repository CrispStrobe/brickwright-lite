/**
 * Wave 3 — "One idea, several languages" — is only teachable if the app can
 * actually render each language a lesson names, for that lesson's own example.
 *
 * A lesson promising a Python view of a program the compiler cannot emit Python
 * for is Wave 1's defect class in a new costume: the checkpoint asks the learner
 * to compare two views and one of them is not there. So every declared variant
 * is GENERATED here, from the example's own program.bw, through the same
 * sb3-creator the browser bundles.
 *
 * WHAT THIS DOES NOT CHECK, and it is the important limit: whether the generated
 * code is CORRECT. It asserts each variant renders and is non-trivial. A Python
 * view that compiles but disagrees with the blocks would pass — and that is
 * precisely this wave's nightmare, so it is written down rather than implied.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync, existsSync} from 'node:fs';
import path from 'node:path';
import {INTEGRATED, REPO} from './helpers/bw-integrated.mjs';

const EX = path.join(REPO, 'overlay/scratch-gui/examples');
const WAVE = path.join(REPO, 'overlay/scratch-gui/src/components/gui/lesson-waves/languages-3.json');

// ── Instrument check: the compiler under test is lite's own ─────────────────
//
// The compiler has to be imported from the integrated tree (it is the only place
// its dependencies resolve), which is a second checkout and therefore a second
// everything. Comparing bytes is what makes the result attributable to THIS
// repo rather than to whatever another session has in flight.
const overlayCompiler = readFileSync(path.join(REPO, 'overlay/scratch-gui/src/lib/sb3-creator.js'));
const integratedCompiler = readFileSync(path.join(INTEGRATED, 'src/lib/sb3-creator.js'));

test('instrument: the integrated compiler is byte-identical to the overlay copy', () => {
    assert.ok(overlayCompiler.equals(integratedCompiler),
        `the integrated sb3-creator differs from overlay/ (${integratedCompiler.length} vs ` +
        `${overlayCompiler.length} bytes). Run \`node scripts/integrate.mjs\`; until then any ` +
        `language-matrix result belongs to a tree this repo does not own.`);
});

const SB3Creator = (await import(path.join(INTEGRATED, 'src/lib/sb3-creator.js'))).default;
const index = (() => {
    const raw = JSON.parse(readFileSync(path.join(EX, 'index.json'), 'utf8'));
    return new Map((Array.isArray(raw) ? raw : raw.examples).map(e => [e.id, e]));
})();
const lessons = JSON.parse(readFileSync(WAVE, 'utf8')).lessons;

/** Languages sb3-creator can emit in-bundle, and how. */
const EMITTERS = {
    python: c => c.generatePython(),
    javascript: c => c.generateJavaScript(),
    c: c => c.generateC()
};
/** Declared languages that are not generated code. */
const NON_EMITTED = new Set(['pseudocode', 'blocks']);
/** Declared languages not emitted directly by sb3-creator — each needs a stated route. */
const NO_LOCAL_EMITTER = new Map([
    ['asm', 'linked locally by the bundled SDCC pipeline; see docs/LESSON-REVIEW-WAVE-3.md']
]);

test('every language a Wave 3 lesson declares renders from its own example', () => {
    assert.equal(lessons.length, 12);
    let variants = 0;
    for (const lesson of lessons) {
        const entry = index.get(lesson.exampleId);
        assert.ok(entry, `${lesson.id} names ${lesson.exampleId}, absent from the index`);
        const programPath = path.join(EX, entry.files.program);
        assert.ok(existsSync(programPath), `${lesson.exampleId} ships no program`);
        const source = readFileSync(programPath, 'utf8');

        const creator = new SB3Creator();
        creator.parse(source);   // a parse failure throws and fails the test, which is right

        for (const lang of lesson.languages) {
            variants++;
            if (lang === 'pseudocode') {
                assert.ok(source.split('\n').length > 3, `${lesson.id}: pseudocode view is empty`);
                continue;
            }
            if (lang === 'blocks') {
                const blocks = (creator.project?.targets || [])
                    .reduce((n, t) => n + Object.keys(t.blocks || {}).length, 0);
                assert.ok(blocks > 0, `${lesson.id}: ${lesson.exampleId} compiles to zero blocks`);
                continue;
            }
            if (NO_LOCAL_EMITTER.has(lang)) continue;
            const emit = EMITTERS[lang];
            assert.ok(emit, `${lesson.id} declares "${lang}", which nothing here knows how to emit. ` +
                `Either sb3-creator grew an emitter — add it to EMITTERS — or the lesson promises ` +
                `a view that does not exist.`);
            const out = emit(creator);
            assert.ok(out && out.length > 40,
                `${lesson.id}: the ${lang} view of ${lesson.exampleId} came back empty`);
        }
    }
    // Coverage, so a run that generated nothing cannot report success.
    assert.ok(variants >= 60, `only ${variants} variants exercised`);
});

test('the declared 8051 asm view has a pinned local linked-listing route', () => {
    const asmLessons = lessons.filter(l => l.languages.includes('asm')).map(l => l.id);
    assert.deepEqual(asmLessons, ['languages-protocols'],
        'the set of lessons declaring asm changed — re-measure and update ' +
        'docs/LESSON-REVIEW-WAVE-3.md');
    const compiler = readFileSync(path.join(REPO, 'overlay/scratch-gui/src/lib/sdcc-wasm/compiler.js'), 'utf8');
    const route = readFileSync(path.join(REPO, 'overlay/scratch-gui/src/lib/sdcc-wasm/listing-route.js'), 'utf8');
    const intercept = readFileSync(path.join(REPO, 'overlay/scratch-gui/src/lib/sdcc-wasm/intercept.js'), 'utf8');
    const importer = readFileSync(path.join(REPO,
        'overlay/scratch-gui/src/components/tw-pseudocode/pseudocode-importer.jsx'), 'utf8');
    assert.match(compiler, /listingFromRst/);
    assert.match(compiler, /main\.rst/,
        'the local listing must be linked evidence, not relocatable assembler output');
    assert.match(route, /compileLocal\(code,\s*\{target, fosc, disassemble:\s*true\}\)/);
    assert.match(intercept, /disassemble:\s*body\.disassemble/,
        'the local compiler boundary must retain the listing request flag');
    assert.match(importer, /linked locally for bundled 8051 targets/);
    assert.match(importer, /8051-Ziele lokal gelinkt/);
    const lesson = lessons.find(l => l.id === 'languages-protocols');
    assert.match(lesson.variants.asm.en, /local|offline/i);
    assert.match(lesson.variants.asm.en, /source mode.*hosted/i);
    assert.match(lesson.variants.asm.de, /lokal|offline/i);
    assert.match(lesson.variants.asm.de, /Source-Modus.*gehostet/i);
});
