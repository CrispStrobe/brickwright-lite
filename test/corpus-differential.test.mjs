/**
 * Corpus-differential CI sampling test.
 *
 * Env-gated: runs only when CORPUS_DIFFERENTIAL=1. Default off in CI because
 * it needs network access (the hosted compile service) and takes ~30–60 s per
 * sample pair.
 *
 * Runs oracle-differential.mjs in corpus mode with a small rotating sample:
 * 6 pairs per run, offset derived from the day-of-year so successive CI runs
 * cover different parts of the gallery without manual coordination.
 *
 * Enable in CI with:
 *   CORPUS_DIFFERENTIAL=1 node --test test/corpus-differential.test.mjs
 */
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {dirname, join} from 'node:path';
import {fileURLToPath} from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const SCRIPT = join(here, '..', 'scripts', 'oracle-differential.mjs');

const enabled = process.env.CORPUS_DIFFERENTIAL === '1';

test('corpus differential: rotating sample agrees', {skip: !enabled && 'CORPUS_DIFFERENTIAL not set'}, () => {
    const SAMPLE_SIZE = 6;
    // Rotate offset by day-of-year so successive runs cover the gallery.
    const dayOfYear = Math.floor((Date.now() - new Date(new Date().getFullYear(), 0, 0)) / 86400000);
    // No modulus here on purpose. This used to wrap at a hardcoded 200 "to stay
    // in range" while the gallery yields 224 eligible pairs, so the last 24 were
    // unreachable by the rotation — and a caller cannot know that bound, because
    // only the script counts the pairs. It now wraps against the real count, so
    // the honest thing to pass is the raw rotation.
    const offset = dayOfYear * SAMPLE_SIZE;

    const out = execFileSync(process.execPath, [SCRIPT, 'corpus', String(SAMPLE_SIZE), String(offset)], {
        cwd: join(here, '..'),
        encoding: 'utf8',
        timeout: 180_000, // 3 min ceiling
        env: {...process.env},
    });
    console.log(out);
    // oracle-differential.mjs exits non-zero on any diff; execFileSync throws on that.
    // If we reach here, every pair agreed.
});

// A rotating-sample gate cannot tell "fixed" from "not sampled": the day the
// rotation moves off a failing program the gate goes green with the defect
// still there, and the program's name goes with it — the same family as a moved
// skip, the number looks fine because the question stopped being asked. These
// anchors run EVERY time, both devices, so a regression on them shows up on the
// run it appears rather than once every ~37 days. The three were the offset-1518
// sample that failed 2026-09-10; p14-serial-pot -> nano is a benign serial
// cadence divergence (see scripts/corpus-cadence.mjs and
// docs/corpus-differential-p14-cadence.md).
const REGRESSION_ANCHORS = [
    'arduino-sk-p12-knock-lock',
    'arduino-sk-p13-touch-lamp',
    'arduino-sk-p14-serial-pot'
];

test('corpus differential: regression anchors run every time', {skip: !enabled && 'CORPUS_DIFFERENTIAL not set'}, () => {
    const out = execFileSync(process.execPath, [SCRIPT, 'cases', ...REGRESSION_ANCHORS], {
        cwd: join(here, '..'),
        encoding: 'utf8',
        timeout: 180_000,
        env: {...process.env},
    });
    console.log(out);
    // 'cases' exits non-zero on any semantic diff (execFileSync throws), so
    // reaching here means no anchor is a WHAT disagreement. Assert the input
    // POPULATION too — every anchor must have actually run: a green that
    // compared nothing is the fixed-vs-not-sampled hole in miniature.
    for (const id of REGRESSION_ANCHORS) {
        assert.match(out, new RegExp(`${id} -> `), `${id} must actually run, not be skipped away`);
    }
    assert.doesNotMatch(out, /: DIFF| ERROR /, 'no anchor may be a semantic diff or an error');
    // p14-serial-pot -> nano is the known benign serial-cadence divergence. It
    // must be exercised AND recognised as cadence — not silently agreeing (that
    // would mean the divergence stopped, and the KNOWN_SERIAL_CADENCE entry can
    // be retired — investigate, don't ignore), and not failing.
    assert.match(out, /arduino-sk-p14-serial-pot -> nano: SKEW \([^)]*serial cadence/,
        'p14->nano must still be present as a recognised benign cadence SKEW; if this fails, ' +
        'either a real regression appeared or the divergence stopped and the known-divergence entry should be retired');
});
