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
