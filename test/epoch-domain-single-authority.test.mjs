/**
 * LITE READS THE EPOCH RULE; IT DOES NOT KEEP A COPY.
 *
 * The vendored `instruction-debug-events.js` stamps `<domain>-<label>-<epoch>`
 * on a time fact after a backward clock move, and exports `logicalTimeDomain()`
 * to take it back off. Lite compares time facts in exactly one place that
 * matters — `debug-runner.js`'s `replayClockDomain`, which every replay
 * comparison and every reverse step flows through.
 *
 * ## What a local copy cost, measured 2026-09-11
 *
 * `replayClockDomain` was `domain => String(domain).replace(/-reset-\d+$/, '')`.
 * Three of the four cores lite ships stamp `rewind`:
 *
 *     avr8js-adapter.js  rewindLabel: 'reset'
 *     z80-debug.js       rewindLabel: 'rewind'
 *     m6502-debug.js     rewindLabel: 'rewind'
 *     i8086-debug.js     rewindLabel: 'rewind'
 *
 * So after ANY restore the replayed event carried `z80-cycles-rewind-1` while
 * the recorded one carried `z80-cycles`, they compared unequal, and the reverse
 * step refused:
 *
 *     replayed event stream diverged
 *
 * The debug-history browser proof had been failing on that, and the refusal
 * names a symptom three layers from the cause. Nothing in the node suite caught
 * it because EVERY TEST HERE DEFINES ITS OWN `logicalDomain` — and all of them
 * strip both labels, because whoever wrote them read the builder. The tests were
 * doing the app's job, so they passed while the app failed.
 *
 * ## So this file checks the app, not a string
 *
 * The rule must be IMPORTED, every core's label must be one the imported parser
 * can strip, and no app file may write the pattern out again.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {logicalTimeDomain, REWIND_LABELS}
    from '../overlay/scratch-gui/src/lib/bw-board/instruction-debug-events.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const APP = path.join(ROOT, 'overlay/scratch-gui/src');
const BOARD = path.join(ROOT, 'overlay/scratch-gui/src/lib/bw-board');

const walk = (dir, out = []) => {
    for (const name of fs.readdirSync(dir)) {
        const p = path.join(dir, name);
        if (fs.statSync(p).isDirectory()) walk(p, out);
        else if (/\.(js|jsx|mjs)$/.test(p)) out.push(p);
    }
    return out;
};

test('the vendored authority is importable and strips every declared label', () => {
    // Species 1: if the export vanished at a pin bump, every assertion below
    // that leans on it would be about `undefined`.
    assert.equal(typeof logicalTimeDomain, 'function',
        'the vendored module no longer exports logicalTimeDomain — a pin bump removed the '
        + 'authority and lite is comparing clock domains with nothing');
    assert.ok(Array.isArray(REWIND_LABELS) && REWIND_LABELS.length >= 2,
        'REWIND_LABELS is gone or collapsed; the label set is what every reader derives from');
    for (const label of REWIND_LABELS) {
        assert.equal(logicalTimeDomain(`z80-cycles-${label}-3`), 'z80-cycles',
            `the imported parser does not strip the declared label "${label}"`);
    }
    assert.equal(logicalTimeDomain('z80-cycles'), 'z80-cycles',
        'the parser truncates an unstamped domain, so two different clocks would compare equal');
});

test('every core lite ships stamps a label the imported parser can strip', () => {
    // DERIVED FROM THE VENDORED SOURCE, not from a list of the cores I know
    // about — the fourth core is the one a list misses. A pin bump that adds a
    // core with a new label fails here by name rather than at a user's reverse
    // step.
    const found = [];
    for (const file of fs.readdirSync(BOARD).filter(f => f.endsWith('.js'))) {
        const text = fs.readFileSync(path.join(BOARD, file), 'utf8');
        for (const m of text.matchAll(/rewindLabel:\s*'([^']+)'/g)) found.push([file, m[1]]);
    }
    assert.ok(found.length >= 3,
        `only ${found.length} rewindLabel declaration(s) found in the vendored tree — the scan `
        + 'stopped matching, and an enumeration that finds nothing approves everything');
    const unstrippable = found.filter(([, label]) => !REWIND_LABELS.includes(label));
    assert.deepEqual(unstrippable, [],
        'these cores stamp an epoch label lite cannot strip, so every replay after a restore '
        + 'diverges: ' + unstrippable.map(([f, l]) => `${f} -> ${l}`).join(', '));
});

test('no app file keeps its own copy of the epoch pattern', () => {
    // THE DEFECT AS A RULE. One local regex, in one file, broke reverse
    // debugging for three of four targets and was invisible to a node suite
    // whose every test carried the CORRECT version of the same rule.
    //
    // The vendored module that declares it is exempt — it is the authority.
    const offenders = [];
    for (const file of walk(APP)) {
        if (file.endsWith(path.join('bw-board', 'instruction-debug-events.js'))) continue;
        fs.readFileSync(file, 'utf8').split('\n').forEach((line, i) => {
            if (/^\s*(\/\/|\*|\/\*)/.test(line)) return;      // a comment may quote it
            if (/-(?:reset|rewind)-\\d\+/.test(line) || /-reset-\\d\+/.test(line)) {
                offenders.push(`${path.relative(ROOT, file)}:${i + 1}`);
            }
        });
    }
    assert.deepEqual(offenders, [],
        'these files write the epoch-suffix pattern out again instead of importing '
        + '`logicalTimeDomain`:\n    ' + offenders.join('\n    ')
        + '\n\n  A copy does not follow REWIND_LABELS when a core is added. That is how '
        + 'lite came to strip `-reset-` for three cores that stamp `-rewind-`.');
});

test('a replayed fact from after a restore compares EQUAL to the one recorded before it', () => {
    // The behavioural claim, driven through lite's own normalizer shape rather
    // than asserted about a regex. This is the comparison `compareReplayValues`
    // performs, and the one that was returning "diverged".
    const normalize = event => {
        const {schema, seq, inputCursor, ...fact} = event;
        return {...fact, time: {...fact.time, domain: logicalTimeDomain(fact.time.domain)}};
    };
    const recorded = {kind: 'retire', cpuId: 'z80', seq: 1,
        time: {ticks: 10n, domain: 'z80-cycles', hz: 4e6}};
    const replayed = {kind: 'retire', cpuId: 'z80', seq: 9,
        time: {ticks: 10n, domain: 'z80-cycles-rewind-1', hz: 4e6}};

    assert.notEqual(recorded.time.domain, replayed.time.domain,
        'fixture: the two facts already carry the same domain, so this case would pass with '
        + 'the defect present');
    assert.deepEqual(normalize(replayed), normalize(recorded),
        'a fact replayed after a restore does not compare equal to the one recorded before '
        + 'it, so every reverse step refuses with `replayed event stream diverged`');

    // AND THE APP MUST BE WIRED TO THIS FUNCTION, not merely agree with it.
    //
    // Everything above is true about `logicalTimeDomain`. Restoring the old
    // local regex in debug-runner.js leaves every assertion above GREEN, because
    // none of them reads what the app actually uses — which is exactly the shape
    // that let a correct rule live in the tests while the app carried a wrong
    // one. `replayClockDomain` is a const inside a factory and cannot be
    // imported, so the wiring is asserted at the source.
    const runner = fs.readFileSync(
        path.join(APP, 'lib/bw-debug/debug-runner.js'), 'utf8');
    assert.match(runner, /const replayClockDomain = logicalTimeDomain;/,
        "debug-runner.js does not assign the imported authority to `replayClockDomain`. "
        + 'Everything else in this file can be green while the app compares clock domains '
        + 'with its own rule — that is the defect, not a variation of it.');
    assert.match(runner, /import\s*\{[^}]*logicalTimeDomain[^}]*\}\s*from\s*'\.\.\/bw-board\/instruction-debug-events\.js'/,
        'debug-runner.js references logicalTimeDomain without importing it from the vendored '
        + 'module that declares it');
});
