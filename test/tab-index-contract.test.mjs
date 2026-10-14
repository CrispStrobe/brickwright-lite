// CircuitTab decides whether it is visible from a hard-coded tab index.
//
//     isVisible: state.scratchGui.editorTab.activeTabIndex === 4
//
// That number is not a preference, it is a claim about the order of <TabPanel>
// elements in gui.jsx. Nothing enforces the claim, and everything that depends
// on it fails SILENTLY when it stops being true:
//
//   - `_syncStageAttr` never sets data-bw-hide-stage, so "Full width" does
//     nothing (this is the bug that took three rounds and a headless browser to
//     find once already — see 4e3c18d)
//   - `load()` never runs on tab entry, so `stc` is never re-read and the
//     debugger's pin gate never opens
//   - `_stagePortalOn` inverts: the circuit portals into the stage column while
//     the user is looking at the circuit tab
//
// No error, no warning, three features quietly wrong. The risk became real when
// pane-slots (322f62a) made panel CONTENT movable: reordering or inserting a
// panel is now an ordinary thing to do.
//
// So the index is asserted here, derived from the source. If someone reorders
// the tabs, this fails and names the new index instead of shipping a GUI where
// the circuit tab believes it is invisible.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const repo = resolve(here, '..');

const GUI = 'packages/scratch-gui/src/components/gui/gui.jsx';
const TAB = 'overlay/scratch-gui/src/components/tw-pseudocode/circuit-tab.jsx';

const integrated = existsSync(resolve(repo, 'packages/scratch-gui/src'));
const skip = integrated ? false : 'run `npm run integrate` first';

/** The index of the TabPanel that renders <CircuitTab />, counted in source order. */
function circuitPanelIndexFromSource (src) {
    // Walk the panels in order and find which one contains <CircuitTab.
    const panels = src.split(/<TabPanel\b/).slice(1);
    return panels.findIndex((p) => /<CircuitTab\b/.test(p));
}

/** The index circuit-tab.jsx believes it has. */
function claimedIndex (src) {
    const m = src.match(/activeTabIndex\s*===\s*(\d+)/);
    return m ? Number(m[1]) : null;
}

test('circuit-tab.jsx agrees with gui.jsx about which tab it is', {skip}, () => {
    const gui = readFileSync(resolve(repo, GUI), 'utf8');
    const tab = readFileSync(resolve(repo, TAB), 'utf8');

    const actual = circuitPanelIndexFromSource(gui);
    const claimed = claimedIndex(tab);

    assert.notEqual(actual, -1,
        `no <TabPanel> in ${GUI} renders <CircuitTab />. Either the tab was ` +
        `removed — in which case delete this test and the isVisible mapping — ` +
        `or it is now rendered indirectly, and this test has gone blind.`);
    assert.notEqual(claimed, null,
        `${TAB} no longer compares activeTabIndex to a literal. If visibility is ` +
        `now derived some better way, delete this test; if it is derived some ` +
        `WORSE way, that is the bug.`);
    assert.equal(claimed, actual,
        `circuit-tab.jsx says it is tab ${claimed}, but gui.jsx renders ` +
        `<CircuitTab /> in TabPanel ${actual}.\n\n` +
        `Nothing throws when these disagree — the tab simply believes it is ` +
        `never visible. Full width stops working, the pin gate never opens, and ` +
        `the stage portal inverts. Update the mapping in circuit-tab.jsx to ` +
        `${actual}.`);
});

test('the derivation is not vacuous', {skip}, () => {
    // A parser that finds nothing would pass the test above by accident once the
    // -1 guard is satisfied, so prove it can actually count panels and locate a
    // named component. Same reason the selector ratchet asserts used.length > 0:
    // a check that finds nothing to check is blind, not passing.
    const gui = readFileSync(resolve(repo, GUI), 'utf8');
    const panelCount = gui.split(/<TabPanel\b/).length - 1;
    assert.ok(panelCount >= 4,
        `found only ${panelCount} TabPanels in gui.jsx — the parser is probably ` +
        `broken rather than the GUI being that small`);
    assert.equal(circuitPanelIndexFromSource('<TabPanel>a</TabPanel><TabPanel><CircuitTab /></TabPanel>'), 1,
        'the index derivation does not work on a known input');
});
