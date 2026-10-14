/**
 * Everything the debug runner says in words, and the census that found it.
 *
 * The status line is what a learner watches while nothing else moves —
 * "compiling…", "starting the Pico emulator…", the ready sentence that says
 * where the output will appear. debug-runner.js writes all of it from pure lib
 * code with no props, so for a long time it said all of it in English.
 *
 * test/i18n-no-hardcoded-strings.test.mjs could not see that population: it
 * matches a user-facing sentence written as an OBJECT FIELD starting with a
 * capital, and status text is a POSITIONAL ARGUMENT in lowercase prose. The
 * ratchet at the bottom of this file is the one that can.
 */
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import path from 'node:path';
import {
    t, STRINGS, LOCALES, pickLocale
} from '../overlay/scratch-gui/src/lib/bw-debug/runner-status-l10n.js';
import {scan, summarise, classify, readArg, hasProse} from '../scripts/measure-status-strings.mjs';

const ROOT = path.resolve(import.meta.dirname, '..');
const RUNNER = path.join(ROOT, 'overlay/scratch-gui/src/lib/bw-debug/debug-runner.js');

test('every locale carries exactly the same keys, and English is the fallback', () => {
    assert.equal(LOCALES[0], 'en', 'English must be first — it is the fallback');
    const en = Object.keys(STRINGS.en).sort();
    assert.ok(en.length >= 55, `only ${en.length} keys — the table is not the one this asserts`);
    for (const loc of LOCALES) {
        assert.deepEqual(Object.keys(STRINGS[loc]).sort(), en,
            `${loc} does not carry exactly the keys English does`);
    }
});

test('German is a translation, not a copy — except where the word is a name', () => {
    // A name is what the thing is CALLED, or what the learner must type. These
    // are identical in both languages on purpose, and listing them here is what
    // stops the "differs" rule below from being quietly weakened later.
    const NAMES = new Set(['noun.rom', 'noun.com', 'noun.ramRom', 'run.pc']);
    const same = [];
    for (const k of Object.keys(STRINGS.en)) {
        if (t('de', k) === t('en', k)) same.push(k);
    }
    assert.deepEqual(same.sort(), [...NAMES].sort(),
        'these keys are identical in German — either translate them or say here why they are names');
});

test('names and commands survive into German', () => {
    // Translating any of these would be worse than useless: DIR is typed, A> is
    // what appears, and the rest are what the things are called.
    assert.match(t('de', 'cpm-system.ready'), /CP\/M 2\.2.*DIR.*A>/);
    assert.match(t('de', 'ready.bbcbasic'), /BBC BASIC \(Z80\)/);
    assert.match(t('de', 'ready.tali'), /Tali Forth 2.*ok/);
    assert.match(t('de', 'ready.riscv', {label: 'x'}), /RISC-V \(RV32IMA\)/);
    assert.match(t('de', 'ready.free386NoMedia'), /free-386/);
    assert.match(t('de', 'ready.xtBios'), /CGA/);
    assert.match(t('de', 'ready.free386Floppy', {name: 'a'}), /VGA/);
});

test('interpolation fills every placeholder, in both languages', () => {
    const CASES = [
        ['run.pc', {pc: '1a2b'}, /PC=\$1a2b/],
        ['built.plain', {bytes: 12, points: 3}, /12/],
        ['built.device', {bytes: 412, device: 'AVR', points: 7}, /412.*AVR.*7/],
        ['built.labwired', {bytes: 9}, /9/],
        ['run.runningTo', {address: '7c00'}, /0x7c00/],
        ['run.exited', {code: 2}, /2/],
        ['boot.media', {name: 'x.rom'}, /x\.rom/],
        ['boot.riscv', {label: 'demo'}, /demo/],
        ['boot.dosBench', {name: 'H.COM'}, /H\.COM/],
        ['boot.free386Named', {name: 'fd.img'}, /fd\.img/],
        ['boot.cpmShim', {name: 'p.com'}, /p\.com/],
        ['ready.py65mon', {name: 'a'}, /a/],
        ['ready.extracted', {name: 'a', chips: 'ram, rom'}, /ram, rom/],
        ['ready.eater', {name: 'a'}, /\$6000/],
        ['ready.cpmShim', {name: 'a'}, /a/],
        ['ready.romOnMap', {name: 'a', map: 'b'}, /a.*b/],
        ['ready.riscv', {label: 'z'}, /z/],
        ['ready.dosBench', {name: 'H.COM', format: 'com'}, /H\.COM.*\.com/],
        ['ready.floppyBoot', {name: 'fd'}, /fd/],
        ['ready.free386Floppy', {name: 'fd'}, /fd/],
        ['ready.free386Disk', {name: 'hd'}, /hd/]
    ];
    for (const loc of LOCALES) {
        for (const [key, vars, shape] of CASES) {
            const out = t(loc, key, vars);
            assert.doesNotMatch(out, /\{\w+\}/, `${loc}/${key} left a placeholder unfilled: ${out}`);
            if (loc === 'en') assert.match(out, shape, `${key} lost its value`);
        }
    }
});

test('an unknown locale or key falls back rather than rendering nothing', () => {
    assert.equal(pickLocale('fr'), 'en');
    assert.equal(pickLocale(undefined), 'en');
    assert.equal(t('fr', 'ready.tali'), t('en', 'ready.tali'));
    assert.equal(t('de-DE', 'ready.tali'), t('de', 'ready.tali'), 'a regional tag resolves to its base');
    assert.ok(String(t('en', 'nope.not.a.key') || '').length > 0);
});

// ---------------------------------------------------------------------------
// THE RATCHET. Measured 2026-09-25 with scripts/measure-status-strings.mjs:
// 68 status strings in debug-runner.js, 52 of them English. It is 0 now, and
// this holds it there — a new `setStatus('ready', 'some prose')` reddens here
// even though the field-shaped i18n rule cannot see it.
test('no status string in the runner is a hardcoded sentence', () => {
    const sum = summarise(scan(readFileSync(RUNNER, 'utf8')));
    assert.ok(sum.total >= 60, `only ${sum.total} status strings parsed — the scan is wrong before anything is concluded`);
    assert.equal(sum.untranslated, 0,
        `${sum.untranslated} hardcoded status string(s) — route them through lib/bw-debug/runner-status-l10n.js `
        + '(run: node scripts/measure-status-strings.mjs)');
});

test('THE RATCHET CAN FAIL: the scan sees a literal, a template and a call', () => {
    // Synthetic, so this cannot pass by accident when the real file is clean.
    const sample = [
        "setStatus('building', 'reading the project…');",
        'setStatus(\'ready\', `${n} bytes`);',
        "setStatus('ready', S('ready.tali'));",
        "readyMsg = 'plain english'; if (x) { other(); }"
    ].join('\n');
    const rows = scan(sample);
    assert.deepEqual(rows.map(r => r.shape), ['literal', 'template', 'translated', 'literal']);
    assert.equal(summarise(rows).untranslated, 3);
    // readArg stops at the SEMICOLON — without that the last row swallowed
    // `; if (x) { other(); }` and reported text no call ever received.
    assert.equal(rows[3].text, "'plain english'");
    // The one-letter binding is the translated shape here; a bare /\b[tT]\(/
    // would miss `cpmSystemT(` entirely, since the T has no word boundary.
    assert.equal(classify("cpmSystemT(uiLang(), 'k')"), 'translated');
    assert.equal(classify('someOtherCall(x)'), 'expression');
    assert.equal(readArg("'a', 'b')", 0), "'a'");

    // AN EXPRESSION CAN HIDE PROSE, and this is how the last one was found:
    // `result.accepted ? \`Reached 0x${…}\` : result.reason` starts with an
    // identifier, so shape alone called it "text from somewhere else" and the
    // ratchet let an English sentence stand. Reading the rows rather than the
    // count is what caught it.
    assert.equal(classify("x ? `Reached 0x${a}` : y"), 'literal');
    assert.equal(classify("S(cfg ? 'map.extracted' : 'map.searle')"), 'translated');
    assert.equal(classify("cfg ? S('map.extracted') : S('map.searle')"), 'expression');
    assert.equal(hasProse("S('ready.tali')"), false, 'a dotted key is not prose');
    assert.equal(hasProse('`Reached 0x${a}`'), true, 'a spaced sentence is');
    assert.equal(hasProse('x.y || z'), false);
});
