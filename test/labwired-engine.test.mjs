/**
 * The heavy tier's availability probe.
 *
 * The engine is a 20 MB artifact fetched by `npm run sync:labwiredwasm`, so
 * whether it exists is a BUILD-time choice and whether it can be offered is
 * therefore a RUNTIME question. Two properties matter, and both are about not
 * lying:
 *
 *   1. Absence is an ANSWER, not an exception. A checkout that never fetched
 *      the artifact must get `null` and a reason — not a thrown error that a
 *      caller has to wrap, and not a picker entry that fails when clicked.
 *   2. The build must not depend on it. That one is enforced by the
 *      `webpackIgnore` comment on the import, asserted here because deleting it
 *      is a one-character edit that turns a 20 MB optional download into a hard
 *      build dependency of the whole app — and nothing else would notice.
 */
import {test, describe} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {resolve, dirname} from 'node:path';
import {fileURLToPath} from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const SRC = resolve(here, '../overlay/scratch-gui/src/lib/labwired-engine.js');

describe('labwired engine loader', () => {
    test('outside a browser it answers "not available", and says why', async () => {
        const {loadLabwired, isLabwiredAvailable, _resetLabwiredCache} = await import(SRC);
        _resetLabwiredCache();
        assert.equal(await loadLabwired(), null, 'absence must not throw');
        assert.match(loadLabwired.lastError, /browser-only/,
            'the reason must name the actual cause, not a URL parse failure');
        assert.equal(await isLabwiredAvailable(), false);
    });

    test('a failed load is remembered, not retried on every call', async () => {
        const {loadLabwired, _resetLabwiredCache} = await import(SRC);
        _resetLabwiredCache();
        await loadLabwired();
        const first = loadLabwired.lastError;
        delete loadLabwired.lastError;
        await loadLabwired();
        assert.equal(loadLabwired.lastError, undefined,
            'the second call re-ran the load; a 20 MB fetch must not repeat per keystroke');
        assert.ok(first, 'the first call should have recorded a reason');
    });

    test('the import is webpackIgnore\'d, so a build without the artifact still compiles', () => {
        const src = readFileSync(SRC, 'utf8');
        assert.match(src, /import\(\s*\/\* webpackIgnore: true \*\/\s*glue\s*\)/,
            'the dynamic import lost its webpackIgnore. Webpack would then resolve the path at '
            + 'BUILD time, so every build would need the 20 MB artifact present or fail to '
            + 'compile — the opposite of an on-demand engine.');
    });

    test('it loads from static/, which webpack copies wholesale', () => {
        const src = readFileSync(SRC, 'utf8');
        assert.match(src, /static\/labwired\/labwired_wasm\.js/);
        assert.match(src, /static\/labwired\/labwired_wasm_bg\.wasm/);
        assert.doesNotMatch(src, /generated\/labwired/,
            'src/generated is bundled by webpack; the point of static/ is that it is not');
    });
});

/**
 * The attach wiring, read rather than driven.
 *
 * These three properties are invisible to every other check here: the browser
 * gate needs the 20 MB artifact and a reachable compiler, and it passed for
 * MONTHS while all three were wrong — an engine that runs is not an engine that
 * is honest about what it cannot do. Contract-level, in the idiom of
 * debug-drawer-unsupported.test.mjs, so they always run.
 */
describe('the labwired attach path', () => {
    const RUNNER = resolve(here, '../overlay/scratch-gui/src/lib/bw-debug/debug-runner.js');
    const PANEL = resolve(here, '../overlay/scratch-gui/src/components/tw-pseudocode/debug-panel.jsx');

    test('it passes NO pin map, so the factory derives one from the board', () => {
        const src = readFileSync(RUNNER, 'utf8');
        const call = src.match(/createDebugTarget\('labwired'[\s\S]{0,400}?\}\)/);
        assert.ok(call, 'the labwired createDebugTarget call is gone — re-read this test');
        // THE documented mistake (bw-board LABWIRED-BRIDGE.md §0). Handing the
        // factory a header map means two descriptions of one bench with nothing
        // checking they agree, and — because the factory derives all four only
        // when they are ABSENT — it silently skips the derivation, so the
        // refusal ledger comes back empty on every bench and a pad the heavy
        // tier cannot drive looks carried.
        assert.doesNotMatch(call[0], /\bpins\s*:/,
            'the attach hands createDebugTarget a pin map again. The factory derives pins, '
            + 'chipYaml, clockHz AND the refusal ledger from the board — but only when they '
            + 'are absent, so passing one turns the ledger off.');
        assert.doesNotMatch(call[0], /\bchipYaml\s*:/,
            'same: a chipYaml passed here skips the derivation.');
        assert.match(call[0], /chipKind\s*:/,
            'chipKind is the one thing that must still be passed — the canonical loader '
            + 'rewrites every controller to `mcu`, so the netlist cannot say which silicon.');
    });

    test('the refusal ledger reaches the user instead of the floor', () => {
        const src = readFileSync(RUNNER, 'utf8');
        assert.match(src, /refusals\s*\}\s*=\s*await createDebugTarget\('labwired'/,
            'the attach no longer destructures `refusals` — a dead analog knob would '
            + 'silently stop saying why');
        assert.match(src, /engineNotes:\s*engineNotes\.length/,
            'the snapshot stopped publishing engineNotes, so nothing can render them');
        assert.match(readFileSync(PANEL, 'utf8'), /ui\.engineNotes/,
            'the panel stopped rendering engineNotes');
    });

    test('both tier caveats are stated where the engine is picked', () => {
        // Measured facts with a control, not hedges: LABWIRED-BRIDGE.md §4 and
        // §4c. Each produces a plausible wrong answer a learner blames on their
        // own program, which is exactly why they have to be readable BEFORE the
        // first Run rather than inferable from a blink at half the period.
        const panel = readFileSync(PANEL, 'utf8');
        const runner = readFileSync(RUNNER, 'utf8');
        // The 2x-clock caveat RETIRED with the level-pend repair (labwired-core
        // 0c0cd0ec, measured 0.97 entries/update both tiers) — its ABSENCE is
        // asserted below, so a stale vendored copy re-shipping the retired
        // sentence reads as the defect it would be.
        for (const [what, re] of [['analog injection', /analog input/i]]) {
            assert.match(panel, re, `the panel no longer states ${what}`);
            assert.match(runner, re, `the attach no longer states ${what}`);
        }
        // Bilingual, like every other learner-facing string in this panel.
        assert.match(panel, /lwCaveats: 'Heavy tier/, 'the English caveat string is gone');
        assert.ok(!/double speed/i.test(panel) && !/doppelt/i.test(panel),
            'the retired 2x-clock caveat is back in the panel — either the vendored '
            + 'engine regressed past the level-pend repair or stale text was restored');
        assert.match(panel, /lwCaveats: 'Schwere Stufe/, 'the caveat is not translated');
    });
});
