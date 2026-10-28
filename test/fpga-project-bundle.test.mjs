// The FPGA lab's design (Verilog + constraints) and gate-builder canvas travel in
// the project file as one optional `fpga` section (lib/bw-project-bundle.js).
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {decodeProjectState, encodeProjectState, isContentKey, parseBundleDocument, BUNDLE_FORMAT, BUNDLE_VERSION} from
    '../overlay/scratch-gui/src/lib/bw-project-bundle.js';

const design = {hdl: 'module blink(output led);\n  assign led = 1\'b1;\nendmodule\n', text: 'IO_LOC "led" 15;'};
const gates = {gates: [{id: 'g1', type: 'and'}], wires: []};

test('both FPGA autosave keys are project content and round-trip through one section', () => {
    assert.ok(isContentKey('bw-fpga-autosave'));
    assert.ok(isContentKey('bw-fpga-gates-autosave'));
    assert.ok(!isContentKey('bw-fpga-guide-done'), 'the guide flag is a preference, not project content');
    const state = encodeProjectState({'bw-fpga-autosave': JSON.stringify(design),
        'bw-fpga-gates-autosave': JSON.stringify(gates)});
    assert.deepEqual(state.fpga, {design, gates});
    assert.deepEqual(decodeProjectState(state), {'bw-fpga-autosave': JSON.stringify(design),
        'bw-fpga-gates-autosave': JSON.stringify(gates)});
    assert.deepEqual(encodeProjectState({'bw-fpga-autosave': JSON.stringify(design)}).fpga, {design},
        'a design without a canvas stays a design only');
});

test('a saved bundle with an fpga section loads; malformed ones are refused', () => {
    const doc = state => JSON.stringify({format: BUNDLE_FORMAT, version: BUNDLE_VERSION, state});
    const loaded = parseBundleDocument(doc({fpga: {design}}));
    assert.equal(loaded.outcome, 'loaded');
    assert.deepEqual(loaded.report.unknownSections, [], 'fpga is a known section');
    assert.equal(loaded.state['bw-fpga-autosave'], JSON.stringify(design));
    assert.equal(parseBundleDocument(doc({fpga: {design: {hdl: 7}}})).outcome, 'invalid');
    assert.equal(parseBundleDocument(doc({fpga: {gates: []}})).outcome, 'invalid');
});

test('the FPGA tab and gate builder flush on save and reload on project load', () => {
    for (const file of ['fpga-tab.jsx', 'fpga-gate-builder-rf.jsx']) {
        const source = readFileSync(new URL(`../overlay/scratch-gui/src/components/tw-pseudocode/${file}`, import.meta.url), 'utf8');
        assert.match(source, /addEventListener\('bw-project-bundle-collect'/, `${file} flushes on save`);
        assert.match(source, /addEventListener\('bw-project-bundle-loaded'/, `${file} reloads on project load`);
    }
});
