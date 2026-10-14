// Every learner-facing string is translatable, and every locale is complete.
//
// The rule this enforces: no user-facing prose in logic. Challenge titles and
// briefs, grader verdicts, panel labels and the tab's build messages all come
// from l10n.js, keyed; a literal English sentence sitting in challenges.js or
// grader.js is a string no translator can reach, and it will render English in
// a German page however good the rest of the translation is.
//
// It also refuses a HALF-DONE translation. A locale missing keys would render
// English for those and look finished.
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {STRINGS, LOCALES, t, tn, pickLocale} from '../overlay/scratch-gui/src/lib/bw-fpga/l10n.js';
import {CHALLENGES, challengeTitle, challengeBrief} from '../overlay/scratch-gui/src/lib/bw-fpga/challenges.js';
import {IC_CIRCUITS, circuitLabel, circuitHint} from '../overlay/scratch-gui/src/lib/bw-fpga/logic-ic-circuit.js';

const src = rel => readFileSync(new URL(`../overlay/scratch-gui/src/${rel}`, import.meta.url), 'utf8');

test('every locale carries every key — no half-done translation', () => {
    const en = Object.keys(STRINGS.en).sort();
    for (const loc of LOCALES) {
        const keys = Object.keys(STRINGS[loc]).sort();
        const missing = en.filter(k => !STRINGS[loc][k]);
        const extra = keys.filter(k => !STRINGS.en[k]);
        assert.deepEqual(missing, [], `${loc} is missing keys`);
        assert.deepEqual(extra, [], `${loc} has keys English does not`);
    }
});

test('every challenge has a title and a brief in every locale', () => {
    for (const c of CHALLENGES) {
        for (const loc of LOCALES) {
            const title = challengeTitle(c, loc);
            const brief = challengeBrief(c, loc);
            assert.ok(title && !title.startsWith('challenge.'), `${c.id} has no ${loc} title`);
            assert.ok(brief && !brief.startsWith('challenge.'), `${c.id} has no ${loc} brief`);
        }
    }
});

test('every buildable circuit has a label and hint in every locale', () => {
    for (const spec of Object.values(IC_CIRCUITS)) {
        for (const loc of LOCALES) {
            assert.ok(!circuitLabel(spec, loc).startsWith('circuit.'), `${spec.id} has no ${loc} label`);
            assert.ok(!circuitHint(spec, loc).startsWith('circuit.'), `${spec.id} has no ${loc} hint`);
        }
    }
});

test('the translated locale is genuinely different from English', () => {
    // Guards against a "translation" that copied the English table across.
    const en = STRINGS.en;
    for (const loc of LOCALES.filter(l => l !== 'en')) {
        const same = Object.keys(en).filter(k => STRINGS[loc][k] === en[k]);
        // A few keys legitimately match (part numbers, symbols); most must not.
        assert.ok(same.length < Object.keys(en).length * 0.2,
            `${loc} is ${Math.round(100 * same.length / Object.keys(en).length)}% identical to English`);
    }
});

test('NO learner-facing prose is left in the curriculum or the grader', () => {
    // The rule, enforced. Scanned line by line — a literal matcher run over the
    // whole file spans newlines and reports nonsense, which is how the first
    // version of this test "found" prose in `expect: i => ({y: i.a & i.b})`.
    //
    // A line is prose if it holds a quoted literal of several words. Two things
    // are deliberately NOT prose: developer errors (`throw new ...`), which no
    // learner ever sees and which a translator would only obscure, and part
    // numbers like '74HC86 Quad XOR', which are the same in every language.
    const isProse = lit => {
        const body = lit.slice(1, -1);
        if (body.length < 40) return false;
        if (/^74[A-Z]{2}/.test(body)) return false;
        return body.split(/\s+/).filter(w => /[a-z]{3}/.test(w)).length >= 5;
    };
    for (const rel of ['lib/bw-fpga/challenges.js', 'lib/bw-fpga/grader.js', 'lib/bw-fpga/logic-ic-circuit.js']) {
        const offenders = [];
        for (const line of src(rel).split('\n')) {
            const code = line.replace(/^\s*\/\/.*$/, '');
            if (/^\s*[*/]/.test(code) || /throw new/.test(code)) continue;
            for (const lit of code.match(/'(?:[^'\\]|\\.)*'/g) || []) {
                if (isProse(lit)) offenders.push(lit.slice(0, 60));
            }
        }
        assert.deepEqual(offenders, [],
            `${rel} still carries prose no translator can reach`);
    }
});

test('the detector would actually catch a relapse', () => {
    // A guard that cannot fail is worse than none, and the first version of
    // this one could not. Feed it the shape it exists to catch.
    const isProse = lit => {
        const body = lit.slice(1, -1);
        if (body.length < 40) return false;
        if (/^74[A-Z]{2}/.test(body)) return false;
        return body.split(/\s+/).filter(w => /[a-z]{3}/.test(w)).length >= 5;
    };
    assert.equal(isProse("'Open the Circuit tab and build it there — this challenge grades the board.'"), true);
    assert.equal(isProse("'74HC86 Quad XOR two-input exclusive or gate'"), false, 'part numbers are not prose');
    assert.equal(isProse("'grade.real.pass.exhaustive'"), false, 'keys are not prose');
    assert.equal(isProse("'a'"), false);
});

test('plural forms come from the language, never an appended "s"', () => {
    // The first cut of this work appended an English "s" to a shared template
    // and produced "4 Eingangskombinations". Plurals are per-locale forms.
    assert.ok(!JSON.stringify(STRINGS).includes('{plural}'), 'no plural-suffix slots survive');
    assert.equal(tn('de', 'count.inputs', 1), '1 Eingang');
    assert.equal(tn('de', 'count.inputs', 4), '4 Eingänge');
    assert.equal(tn('en', 'count.inputs', 1), '1 input');
    assert.equal(tn('en', 'count.inputs', 4), '4 inputs');
    // Every count key must have BOTH forms in every locale.
    const bases = new Set(Object.keys(STRINGS.en)
        .filter(k => k.endsWith('.one') || k.endsWith('.other'))
        .map(k => k.replace(/\.(one|other)$/, '')));
    assert.ok(bases.size >= 5, 'there are count-aware keys to check');
    for (const loc of LOCALES) {
        for (const base of bases) {
            assert.ok(STRINGS[loc][`${base}.one`], `${loc} lacks ${base}.one`);
            assert.ok(STRINGS[loc][`${base}.other`], `${loc} lacks ${base}.other`);
        }
    }
});

test('an unknown locale falls back to English rather than breaking', () => {
    assert.equal(pickLocale('fr'), 'en');
    assert.equal(pickLocale(undefined), 'en');
    assert.equal(pickLocale('de-CH'), 'de', 'a regional tag still finds its language');
    assert.equal(t('fr', 'panel.title'), t('en', 'panel.title'));
});

test('a missing placeholder is left visible, not rendered as undefined', () => {
    assert.equal(t('en', 'problem.needInput', {}), 'Add an input named "{name}".');
    assert.ok(!t('en', 'problem.needInput', {}).includes('undefined'));
});

test('the panel and tab read their strings from the table', () => {
    const panel = src('components/tw-pseudocode/fpga-challenges.jsx');
    assert.match(panel, /import \{t\} from '\.\.\/\.\.\/lib\/bw-fpga\/l10n\.js'/);
    assert.match(panel, /challengeTitle\(c, locale\)/, 'titles are translated');
    assert.match(panel, /challengeBrief\(activeC, locale\)/, 'so are briefs');
    const tab = src('components/tw-pseudocode/fpga-tab.jsx');
    assert.match(tab, /circuitLabel\(spec, props\.locale\)/, 'the picker lists translated names');
    assert.match(tab, /tr\(loc, built\.chips\.length \? 'build\.circuit' : 'build\.chip'/, 'and the build message is a template');
});

test('a single-part circuit does not report "0 gates"', () => {
    // Seen in a browser drive: "Built a 2-bit counter: 0 gates in 1 chip".
    // A chip-based spec has no gates to count, so it gets its own sentence.
    const tab = src('components/tw-pseudocode/fpga-tab.jsx');
    assert.match(tab, /built\.chips\.length \? 'build\.circuit' : 'build\.chip'/,
        'the message branches on whether there are gates at all');
    for (const loc of LOCALES) {
        assert.ok(STRINGS[loc]['build.chip'], `${loc} needs the chip-only sentence`);
        assert.ok(!STRINGS[loc]['build.chip'].includes('{gates}'),
            `${loc}'s chip sentence must not mention a gate count`);
    }
});

test('no hardcoded title/aria/placeholder is left in the FPGA components', () => {
    // Tooltips are user-facing too. These were English-only while every
    // sentence around them was translated — the easiest kind of string to
    // forget, because nothing renders it until you hover.
    for (const rel of [
        'components/tw-pseudocode/fpga-gate-builder-rf.jsx',
        'components/tw-pseudocode/fpga-tab.jsx',
        'components/tw-pseudocode/fpga-challenges.jsx'
    ]) {
        const raw = src(rel).match(/(?:title|aria-label|placeholder)="[A-Z][^"]{4,}"/g) || [];
        assert.deepEqual(raw, [], `${rel} has hardcoded user-facing attributes`);
    }
});

test('the stage header uses react-intl, and is not this module\'s business', () => {
    // Checked rather than assumed while auditing: the Scratch stage header —
    // including the fullscreen control and the right-pane view chooser — goes
    // through scratch-gui's own react-intl messages, which is the correct
    // mechanism for components that live in that tree. It is NOT missing
    // translation, and it must not be dragged into this table.
    const header = src('components/stage-header/stage-header.jsx');
    assert.match(header, /import \{defineMessages, injectIntl/, 'it uses react-intl');
    for (const id of ['fullscreenControl', 'unFullStageSizeMessage', 'fullStageSizeMessage',
        'largeStageSizeMessage', 'smallStageSizeMessage', 'scratchStage']) {
        assert.match(header, new RegExp(`${id}:`), `the ${id} message is defined`);
        assert.match(header, new RegExp(`messages\\.${id}`), `and actually used`);
    }
    // The one raw string is a brand name, which is not translated anywhere.
    const raw = header.match(/(?:title|alt|aria-label)="[A-Z][^"]{2,}"/g) || [];
    assert.deepEqual(raw, ['alt="Scratch"'], 'only the product name is a literal');
});
