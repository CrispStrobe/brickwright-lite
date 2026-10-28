/**
 * A refusal the learner never sees is a silent refusal.
 *
 * `bw-project-bundle.js` classifies a sidecar it will not apply and the Code
 * tab writes the reason into its status strip. That strip is ONE TAB'S surface,
 * and opening a project changes the active tab — measured 2026-09-02, the
 * assertion for the invalid-JSON notice found the right text in a HIDDEN span,
 * 32 polls running. The app was correct and the learner still saw nothing.
 *
 * So every refusal also raises an app-level alert, on the surface gui.jsx mounts
 * outside the tab strip. This file asserts the mapping is total: a fourth
 * refusal outcome added to the importer without an alert fails here rather than
 * shipping as a notice nobody receives.
 *
 * The browser half of this lives in scripts/verify-project-bundle-integrity.mjs,
 * which waits for the alert BEFORE clicking any tab. This half is cheap and
 * catches the rename; that half catches the notice never rendering.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import path from 'node:path';
import {balancedAfter} from './helpers/js-scope.mjs';

const ROOT = path.resolve(import.meta.dirname, '..');
const read = rel => readFileSync(path.join(ROOT, rel), 'utf8');

const importer = read('overlay/scratch-gui/src/components/tw-pseudocode/pseudocode-importer.jsx');
const registry = read('overlay/scratch-gui/src/lib/alerts/index.jsx');
const bundle = read('overlay/scratch-gui/src/lib/bw-project-bundle.js');

/** The outcomes the importer treats as "the file's state was NOT applied". */
const refusedOutcomes = () => {
    const clause = importer.match(/const refused = ([^;]+);/);
    assert.ok(clause, 'pseudocode-importer no longer declares `const refused =` — update this test');
    return [...clause[1].matchAll(/outcome === '([^']+)'/g)].map(m => m[1]).sort();
};

/** alertId strings the importer can dispatch for a refusal. */
const dispatchedAlertIds = () => {
    const block = importer.match(/const alertId = ([\s\S]*?);\n/);
    assert.ok(block, 'pseudocode-importer no longer maps an outcome to an alertId');
    return [...block[1].matchAll(/'(bw[A-Za-z]+)'/g)].map(m => m[1]).sort();
};

const registeredAlertIds = () =>
    [...registry.matchAll(/alertId: '(bwBundleRefused[A-Za-z]+)'/g)].map(m => m[1]).sort();

test('every refusal outcome the importer recognises can raise an alert', () => {
    const outcomes = refusedOutcomes();
    assert.ok(outcomes.length >= 3, `expected the three known refusals, got ${outcomes.join(', ')}`);
    const ids = dispatchedAlertIds();
    assert.equal(ids.length, outcomes.length,
        `${outcomes.length} refusal outcomes (${outcomes.join(', ')}) but ${ids.length} alert ids ` +
        `(${ids.join(', ')}). A refusal with no alert is written only into the Code tab's status ` +
        'strip, which the learner is not looking at after a project load.');
});

test('the dispatch sits where `refused` is actually in scope', () => {
    // This file did not catch its own worst bug, and that is the point of this
    // test. The first version of the dispatch block was inserted at the wrong
    // `const saved = this.readAutosave();` — there are two, and the earlier one
    // is the MOUNT-TIME buffer restore, where `refused` and `outcome` do not
    // exist. Every check above still passed: the mapping was total, every id was
    // registered, the outcomes matched the producer. The app threw
    // `ReferenceError: refused is not defined` from the top-level component on
    // every start, and 13 browser gates went red.
    //
    // So a mapping test that never asks WHERE the mapping lives is a grep, not a
    // gate. Position is the thing that failed, so position is what is asserted.
    const declaresRefused = importer.indexOf('const refused =');
    const dispatches = importer.indexOf('this.props.dispatch(showStandardAlert(');
    assert.ok(declaresRefused >= 0, 'the importer no longer declares `const refused =`');
    assert.ok(dispatches >= 0, 'the importer no longer dispatches a refusal alert');
    assert.ok(dispatches > declaresRefused,
        'the refusal dispatch reads `refused` before it is declared — it has been ' +
        'placed outside _onBundleLoaded, which throws at the top level on every app start');

    // And it must be inside the SAME handler, not merely later in the file: the
    // next `_on...` assignment after the declaration bounds it.
    const nextHandler = importer.indexOf('this._on', declaresRefused);
    assert.ok(nextHandler === -1 || dispatches < nextHandler,
        'the refusal dispatch has drifted past the end of _onBundleLoaded');
});

test('every alert the importer dispatches is registered', () => {
    const registered = registeredAlertIds();
    const missing = dispatchedAlertIds().filter(id => !registered.includes(id));
    assert.deepEqual(missing, [],
        `the importer dispatches alert ids that lib/alerts/index.jsx does not define: ${missing.join(', ')}. ` +
        'An unregistered alertId is dropped by the reducer, so the alert never appears.');
});

test('the refusal outcomes match what bw-project-bundle can actually produce', () => {
    // The producer's vocabulary, so a new refusal kind in the bundle reader
    // cannot quietly bypass the notice the consumer owes the learner.
    const produced = new Set([...bundle.matchAll(/outcome: '([^']+)'/g)].map(m => m[1]));
    const unknown = refusedOutcomes().filter(outcome => !produced.has(outcome));
    assert.deepEqual(unknown, [],
        `the importer refuses on outcomes bw-project-bundle.js never emits: ${unknown.join(', ')}`);
});

test('a successful load retires every refusal notice', () => {
    // Found in CP6's own vanilla-cleared screenshot: empty Code, no widgets, no chip — and a
    // banner reading "what you had is still here". Each alert's clearList retires the OTHER two,
    // so a second bad file replaces the first notice; but a GOOD load raises nothing, therefore
    // cleared nothing, and the stale notice then described the opposite of what had happened.
    // A notice must not outlive the condition it describes.
    const registered = registeredAlertIds();
    const refusalIds = registered.filter(id => id.startsWith('bwBundleRefused'));
    assert.ok(refusalIds.length >= 3, `expected the refusal alerts, got ${refusalIds.join(', ')}`);

    assert.match(importer, /closeAlertWithId/,
        'the importer must be able to retire a refusal notice, not only raise one');
    const elseBranch = importer.match(/\}\s*else if \(this\.props\.dispatch\) \{([\s\S]*?)\n {12}\}/);
    assert.ok(elseBranch, 'the non-refused path must clear the notices');
    for (const id of refusalIds) {
        assert.ok(elseBranch[1].includes(id) ||
            /REFUSAL_ALERTS/.test(elseBranch[1]),
        `${id} is never retired on a successful load`);
    }
    // The clearing must be driven by the SAME list the registry defines, not a hand-copy that can
    // drift — a fourth refusal alert must not be silently left un-retired.
    // Bracket-matched, not lazily captured: a nested `]` would end the old capture early and
    // the comparison below would then be made against a SHORTER list than the file declares.
    const listed = balancedAfter(importer, 'const REFUSAL_ALERTS =');
    const named = [...listed.matchAll(/'([^']+)'/g)].map(m => m[1]).sort();
    assert.deepEqual(named, refusalIds.slice().sort(),
        'the retired set must be exactly the registered refusal alerts');
});
