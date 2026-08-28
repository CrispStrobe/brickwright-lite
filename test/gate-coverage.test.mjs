/**
 * A browser gate that CI never runs decays into decoration.
 *
 * THE EVIDENCE THIS RESTS ON (swept 2026-08-27, against a current build, with
 * the servers and PROOF_URL each script expects — so these are not setup
 * failures):
 *
 *   17 scripts/verify-*.mjs are referenced by no workflow. FOUR still pass.
 *   THIRTEEN do not. Two more had already rotted and were repaired that day:
 *   verify-debugger-solo could not get past its first click (a starter overlay
 *   it never dismissed, a textarea the editor stopped being, and two button
 *   titles from a UI model that no longer exists), and verify-labwired-engine
 *   was written and simply never wired in.
 *
 * The failures are not interesting individually — they are stale selectors and
 * expired assumptions, exactly what happens to any check nothing exercises. The
 * structural point is that NOTHING NOTICED. Each one was written to catch a
 * regression its author had just been bitten by, and each stopped being able to.
 *
 * So: a new gate must be wired into a workflow, or listed below as knowingly
 * unwired. The list is a ratchet, not a blessing — it should only ever shrink.
 * Adding to it is a deliberate act that shows up in review; forgetting to wire
 * a gate in is not.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import {readdirSync, readFileSync} from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(import.meta.dirname, '..');

/**
 * Gates that no workflow runs, with their state when this list was made.
 * REMOVE an entry by wiring the gate into .github/workflows/build.yml — after
 * making it pass, which for most of these means bringing it up to the current
 * UI rather than tweaking a selector.
 */
const KNOWN_UNWIRED = {
    // All four gates that still passed have now been adopted into build.yml
    // (bluetooth, blinkenrocket, hub faces, retro console) — a passing gate
    // nothing runs is the most dangerous kind, since "it passes" stays true
    // only until the day it quietly does not.
    //
    // verify-microbit.mjs and verify-microbit-debug-toggle.mjs were adopted
    // out of the FAILING list below, and both failed for one reason: the
    // starter-journeys backdrop covers a first visit and swallowed every
    // click, so each spent its whole timeout retrying the first one. One
    // addInitScript each. Worth trying on the four still listed as timing
    // out before anyone rewrites a selector.
    // Already broken. Each needs its assumptions rechecked against the app as
    // it is now, not its selectors patched until it goes quiet.
    'verify-about-dialog.mjs': 'FAILS (2026-08-27)',
    'verify-basic-run.mjs': 'FAILS (2026-08-27)',
    'verify-chrome-sweep.mjs': 'FAILS (2026-08-27)',
    'verify-controller-panel.mjs': 'FAILS — no Controller button in the stage header (2026-08-27)',
    'verify-faceplate-matrix.mjs': 'FAILS — timeout (2026-08-27)',
    'verify-instruments-scroll.mjs': 'FAILS — timeout (2026-08-27)',
    'verify-interaction.mjs': 'FAILS — timeout (2026-08-27)',
    'verify-intro.mjs': 'FAILS (2026-08-27)',
    'verify-schematic.mjs': 'FAILS — timeout (2026-08-27)',
    'verify-ssd1306-face.mjs': 'FAILS — 0 ssd1306 case handlers in the built chunk (2026-08-27)',
    'verify-starter-journeys.mjs': 'FAILS — lesson search finds no Wave 1 topic (2026-08-27)',
};

const workflowText = readdirSync(path.join(ROOT, '.github/workflows'))
    .filter(f => f.endsWith('.yml'))
    .map(f => readFileSync(path.join(ROOT, '.github/workflows', f), 'utf8'))
    .join('\n');

const gates = readdirSync(path.join(ROOT, 'scripts'))
    .filter(f => f.startsWith('verify-') && f.endsWith('.mjs'));

test('every browser gate is either run by CI or knowingly listed as not', () => {
    const unwired = gates.filter(g => !workflowText.includes(g));
    const undeclared = unwired.filter(g => !(g in KNOWN_UNWIRED));
    assert.deepEqual(undeclared, [],
        `these gates are run by nothing and are not in KNOWN_UNWIRED: ${undeclared.join(', ')}. ` +
        'Wire them into .github/workflows/build.yml, or add them to that list with their state. ' +
        'A gate nothing runs stops working and nobody finds out — 13 of 17 already had.');
});

test('the unwired list only shrinks — entries that are now wired must be removed', () => {
    // Without this the list rots too: a gate could be wired into CI and still
    // sit here claiming to be unwatched, which is exactly the kind of stale
    // bookkeeping that made the sweep necessary.
    const wrongly = Object.keys(KNOWN_UNWIRED).filter(g => workflowText.includes(g));
    assert.deepEqual(wrongly, [],
        `these are in KNOWN_UNWIRED but ARE run by a workflow — delete them from the list: ${wrongly.join(', ')}`);
});

test('every listed gate still exists', () => {
    const missing = Object.keys(KNOWN_UNWIRED).filter(g => !gates.includes(g));
    assert.deepEqual(missing, [],
        `KNOWN_UNWIRED names gates that no longer exist: ${missing.join(', ')}`);
});
