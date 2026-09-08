import {test} from 'node:test';
import assert from 'node:assert/strict';
import {demo, load} from '../overlay/scratch-gui/src/lib/bw-286-lab/runtime.js';
import {toEditorDraft, fromEditorDraft} from '../overlay/scratch-gui/src/lib/bw-286-lab/editor-draft.js';
const enabled = {enabled: true};
const draft = () => toEditorDraft(demo(), enabled);

test('both editor conversion directions require explicit enable', () => {
    assert.throws(() => toEditorDraft(demo()), /EXPERIMENT_DISABLED/);
    assert.throws(() => fromEditorDraft(draft()), /EXPERIMENT_DISABLED/);
});
test('editor-shaped JSON round trip preserves all wires and executes the same guest', () => {
    const recipe = demo(), document = toEditorDraft(recipe, enabled);
    assert.equal(document.circuit.wires.length, recipe.wires.length);
    assert.equal(document.circuit.parts.length, 12);
    assert.ok(document.circuit.parts.every(part => part.terminals.length > 0));
    const converted = fromEditorDraft(JSON.parse(JSON.stringify(document)), enabled);
    assert.deepEqual(converted, recipe);
    const session = load(converted); session.initialize();
    assert.equal(session.run().cpu.retired, 47);
    assert.equal(session.inspectBank('ram0').bytes[0x288], 10);
});
test('layout edits are saved in the draft but do not affect engine configuration', () => {
    const document = draft(), before = fromEditorDraft(document, enabled);
    document.circuit.parts[0].x = -250; document.circuit.parts[0].rotation = 90;
    document.circuit.parts[1].y = 987;
    assert.deepEqual(fromEditorDraft(document, enabled), before);
    assert.equal(document.circuit.parts[0].x, -250);
});
test('unsupported editor constructs and incorrect terminals never silently drop', () => {
    for (const mutate of [
        d => d.circuit.parts[0].kind = 'i8086',
        d => d.circuit.parts[0].kind = 'harris_lab_80386',
        d => d.circuit.parts[0].params.foo = 1,
        d => d.circuit.parts[0].terminals.pop(),
        d => d.circuit.parts[0].x = Infinity,
        d => d.circuit.parts[0].rotation = 45,
        d => d.circuit.wires[0].from.part = 'missing',
        d => d.circuit.wires[0].from.terminal = 'READY',
        d => d.circuit.wires[1].id = d.circuit.wires[0].id,
        d => d.circuit.wires[0].netId = 'implicit-net',
        d => d.circuit.holeWires.push({from: 'a', to: 'b'}),
        d => d.circuit.pcb = {},
        d => d.circuit.vcc = 3.3,
        d => d.configuration.backend = 'v86'
    ]) {
        const document = draft(); mutate(document);
        assert.throws(() => fromEditorDraft(document, enabled));
    }
    assert.throws(() => fromEditorDraft(draft().circuit, enabled));
});
test('deliberate disconnected wire remains disconnected and faults on real execution', () => {
    const document = draft();
    document.circuit.wires = document.circuit.wires.filter(w => !(w.to.part === 'rom0' && w.to.terminal === 'vcc'));
    const recipe = fromEditorDraft(document, enabled);
    assert.equal(recipe.wires.length, demo().wires.length - 1);
    const session = load(recipe);
    assert.throws(() => session.initialize());
    assert.equal(session.inspect().status, 'faulted');
});
