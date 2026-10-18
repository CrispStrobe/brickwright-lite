// The build editor's Studio/LeoCAD tools (lib/bw-sim/editor/editor-parity.js and
// the editor-state.js commands built on it): colour, mirror, align / distribute,
// "to the grid", the measuring tape, typed rotations and the LDraw clipboard.
// Every check reads what the code produced and compares it with a fact computed
// here independently (connector positions, determinants, bounds), never with a
// value the test itself fed in.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createEditor} from '../overlay/scratch-gui/src/lib/bw-sim/editor/editor-state.js';
import {
    COMMON_COLORS, alignMoves, clipboardText, colorPalette, degreesToRotation, distributeMoves, gridMoves, measureBetween, measurePoint,
    mirrorCounterpart, mirrorPivot, mirrorPoses, partBounds, partSymmetry, partsFromClipboard, rotationToDegrees, selectionUnits
} from '../overlay/scratch-gui/src/lib/bw-sim/editor/editor-parity.js';
import {worldAxisRotation} from '../overlay/scratch-gui/src/lib/bw-sim/editor/transform-math.js';
import {parseModel, serializeModel} from '../overlay/scratch-gui/src/lib/bw-sim/model/ldraw-model.js';
import {validatePlacedModel} from '../overlay/scratch-gui/src/lib/bw-sim/contracts.js';
import {parseLDConfig} from '../overlay/scratch-gui/src/lib/bw-sim/view/ldraw-colors.js';

const json = path => JSON.parse(readFileSync(new URL(`../${path}`, import.meta.url), 'utf8'));
const CATALOG = new Map(json('overlay/scratch-gui/src/lib/bw-sim/part-meta/parts.json').parts.map(p => [p.part, p]));
const I3 = [1, 0, 0, 0, 1, 0, 0, 0, 1];

const det = m => m[0] * (m[4] * m[8] - m[5] * m[7]) - m[1] * (m[3] * m[8] - m[5] * m[6]) + m[2] * (m[3] * m[7] - m[4] * m[6]);
const mulV = (m, v) => [0, 1, 2].map(r => m[r * 3] * v[0] + m[r * 3 + 1] * v[1] + m[r * 3 + 2] * v[2]);
const mul = (a, b) => [0, 1, 2].flatMap(r => [0, 1, 2].map(c => a[r * 3] * b[c] + a[r * 3 + 1] * b[3 + c] + a[r * 3 + 2] * b[6 + c]));
const orthonormal = m => {
    const t = [m[0], m[3], m[6], m[1], m[4], m[7], m[2], m[5], m[8]];
    return mul(m, t).every((v, i) => Math.abs(v - I3[i]) < 1e-9);
};
/** A rotation about an arbitrary unit axis (Rodrigues), independent of the module under test. */
const axisAngle = (axis, angle) => {
    const l = Math.hypot(...axis);
    const [x, y, z] = axis.map(v => v / l);
    const c = Math.cos(angle), s = Math.sin(angle), t = 1 - c;
    return [t * x * x + c, t * x * y - s * z, t * x * z + s * y, t * x * y + s * z, t * y * y + c, t * y * z - s * x,
        t * x * z - s * y, t * y * z + s * x, t * z * z + c];
};
/** The 24 rotations that map axes to axes. */
const AXIS_ROTATIONS = (() => {
    const out = [];
    const perms = [[0, 1, 2], [0, 2, 1], [1, 0, 2], [1, 2, 0], [2, 0, 1], [2, 1, 0]];
    for (const p of perms) {
        for (let signs = 0; signs < 8; signs++) {
            const m = new Array(9).fill(0);
            for (let r = 0; r < 3; r++) m[r * 3 + p[r]] = (signs >> r) & 1 ? -1 : 1;
            if (Math.abs(det(m) - 1) < 1e-9) out.push(m);
        }
    }
    return out;
})();
/** Connector points of a placed part in the model frame, rounded for set comparison. */
const connectorPoints = (placed, catalog) => (catalog.get(placed.part).connectors || [])
    .map(c => mulV(placed.rotation, c.position).map((v, i) => Math.round((v + placed.position[i]) * 1000) / 1000))
    .map(p => p.map(v => (v === 0 ? 0 : v)).join(','))
    .sort();
const reflectPoint = (axis, pivot) => p => p.map((v, i) => (i === (axis === 'x' ? 0 : 2) ? 2 * pivot - v : v));

// ---- colour ------------------------------------------------------------------------------

test('the colour palette puts the common LEGO colours first and lists every other LDConfig colour after them', () => {
    const colors = parseLDConfig(readFileSync(new URL('../overlay/scratch-gui/static/ldraw/LDConfig.ldr', import.meta.url), 'utf8'));
    const {common, more} = colorPalette(colors);
    assert.deepEqual(common.map(c => c.code), COMMON_COLORS.filter(c => colors.has(c)), 'the common palette, in its order');
    assert.ok(common.length >= 30, `common palette has ${common.length} colours`);
    assert.equal(common.find(c => c.code === 71).name, 'Light Bluish Grey', 'English names come from LDConfig, as words');
    const listed = new Set([...common, ...more].map(c => c.code));
    for (const code of colors.keys()) if (code !== 16 && code !== 24) assert.ok(listed.has(code), `LDConfig colour ${code} is offered`);
    assert.ok(!listed.has(16) && !listed.has(24), 'the inherit colours are not paint');
    const firstClear = more.findIndex(c => c.alpha < 1);
    assert.ok(firstClear > 0 && more.slice(firstClear).every(c => c.alpha < 1), 'see-through colours come last');
});

test('paint colours a whole selection in one undo step, and the colours survive the LDraw file', () => {
    const model = {version: 1, parts: [
        {id: 'a', part: '32524.dat', color: 71, position: [0, 0, 0], rotation: I3.slice()},
        {id: 'b', part: '32523.dat', color: 71, position: [0, -20, 0], rotation: I3.slice()},
        {id: 'c', part: '2780.dat', color: 0, position: [40, 0, 0], rotation: I3.slice()}
    ]};
    const ed = createEditor({model, catalog: CATALOG});
    ed.apply({type: 'paint', ids: ['a', 'b'], color: 322});
    assert.deepEqual(ed.model.parts.map(p => p.color), [322, 322, 0]);
    assert.equal(ed.canUndo, true);
    ed.undo();
    assert.deepEqual(ed.model.parts.map(p => p.color), [71, 71, 0], 'one undo restores both');
    assert.equal(ed.canUndo, false, 'it was ONE undo step');
    ed.redo();
    assert.deepEqual(ed.model.parts.map(p => p.color), [322, 322, 0]);
    assert.throws(() => ed.apply({type: 'paint', ids: ['a', 'b'], color: 322}), /nothing changes/, 'a repaint in the same colour is not an undo step');
    assert.throws(() => ed.apply({type: 'paint', ids: ['a'], color: -1}), /bad colour/);
    assert.throws(() => ed.apply({type: 'paint', ids: ['zz'], color: 4}), /unknown id/);

    const text = serializeModel(ed.model, {name: 'c.ldr'});
    assert.match(text, /^1 322 /m, 'the colour is the LDraw line\'s colour field');
    const back = parseModel(text, {catalog: CATALOG});
    assert.deepEqual(back.refusals, []);
    assert.deepEqual(back.model.parts.map(p => [p.id, p.color]), [['a', 322], ['b', 322], ['c', 0]]);
});

// ---- mirror ------------------------------------------------------------------------------

test('mirroring any catalog part in any of the 24 axis turns, or a free turn, never makes an improper rotation', () => {
    const free = [axisAngle([1, 2, 3], 0.7), axisAngle([-2, 1, 0.5], 2.1), axisAngle([0, 1, 0], Math.PI / 12)];
    let n = 0;
    for (const part of CATALOG.keys()) {
        for (const rotation of [...AXIS_ROTATIONS, ...free]) {
            for (const axis of ['x', 'z']) {
                const [m] = mirrorPoses([{id: 'p', part, position: [10, -20, 30], rotation}], CATALOG, axis, 0);
                assert.ok(Math.abs(det(m.rotation) - 1) < 1e-9 && orthonormal(m.rotation), `${part} ${axis}: det ${det(m.rotation)}`);
                assert.equal(validatePlacedModel({version: 1, parts: [{id: 'p', part: m.part, position: m.position, rotation: m.rotation}]}, CATALOG).length, 0);
                n++;
            }
        }
    }
    assert.ok(n > 3000, `${n} mirrors checked`);
});

test('a symmetric part (beam, gear, liftarm) mirrors exactly: its connectors land on the mirror images of the old ones', () => {
    const turned = axisAngle([1, 1, 0], Math.PI / 2 * 0.37);
    for (const part of ['32524.dat', '32348.dat', '3648.dat', '6629.dat', '32526.dat', '2780.dat']) {
        assert.ok(partSymmetry(CATALOG.get(part)), `${part} is its own mirror image`);
        for (const rotation of [I3, AXIS_ROTATIONS[5], AXIS_ROTATIONS[17], turned]) {
            for (const axis of ['x', 'z']) {
                const placed = {id: 'p', part, position: [40, -10, 60], rotation};
                const pivot = 15;
                const [m] = mirrorPoses([placed], CATALOG, axis, pivot);
                assert.equal(m.how, 'mirrored');
                assert.equal(m.part, part);
                const expected = (CATALOG.get(part).connectors || []).map(c => reflectPoint(axis, pivot)(mulV(rotation, c.position).map((v, i) => v + placed.position[i])))
                    .map(p => p.map(v => Math.round(v * 1000) / 1000).map(v => (v === 0 ? 0 : v)).join(',')).sort();
                assert.deepEqual(connectorPoints(m, CATALOG), expected, `${part} mirrored across ${axis}`);
            }
        }
    }
});

/** A made-up left/right pair (as LDraw has them: 41769 / 41770 wedge plates): one connector off-centre. */
const PAIR_CATALOG = new Map([...CATALOG,
    ['9001.dat', {part: '9001.dat', name: 'Wedge plate 4 x 2 Left', category: 'beam',
        connectors: [{id: 'h0', type: 'pinhole', position: [10, 0, 0], axis: [0, 1, 0]}, {id: 'h1', type: 'pinhole', position: [10, 0, 20], axis: [0, 1, 0]},
            {id: 'h2', type: 'pinhole', position: [-10, 0, 20], axis: [0, 1, 0]}, {id: 's0', type: 'axlehole', position: [10, -4, 0], axis: [0, 1, 0]}],
        colliders: []}],
    ['9002.dat', {part: '9002.dat', name: 'Wedge plate 4 x 2 Right', category: 'beam',
        connectors: [{id: 'h0', type: 'pinhole', position: [-10, 0, 0], axis: [0, 1, 0]}, {id: 'h1', type: 'pinhole', position: [-10, 0, 20], axis: [0, 1, 0]},
            {id: 'h2', type: 'pinhole', position: [10, 0, 20], axis: [0, 1, 0]}, {id: 's0', type: 'axlehole', position: [-10, -4, 0], axis: [0, 1, 0]}],
        colliders: []}],
    // Handed, no counterpart: like a motor that exists one way round only.
    ['9003.dat', {part: '9003.dat', name: 'Handed widget', category: 'beam',
        connectors: [{id: 'h0', type: 'pinhole', position: [10, 0, 0], axis: [0, 1, 0]}, {id: 'h1', type: 'pinhole', position: [0, 0, 30], axis: [1, 0, 0]},
            {id: 's0', type: 'axlehole', position: [0, -6, 0], axis: [0, 1, 0]}],
        colliders: []}],
    // An explicit counterpart, across the part's own z.
    ['9004.dat', {part: '9004.dat', name: 'Fairing A', category: 'beam', mirror: {part: '9005.dat', axis: 'z'},
        connectors: [{id: 'h0', type: 'pinhole', position: [0, 0, 10], axis: [0, 1, 0]}, {id: 'h1', type: 'pinhole', position: [20, 0, 10], axis: [0, 1, 0]},
            {id: 's0', type: 'axlehole', position: [20, -4, 10], axis: [0, 1, 0]}],
        colliders: []}],
    ['9005.dat', {part: '9005.dat', name: 'Fairing B', category: 'beam', mirror: {part: '9004.dat', axis: 'z'},
        connectors: [{id: 'h0', type: 'pinhole', position: [0, 0, -10], axis: [0, 1, 0]}, {id: 'h1', type: 'pinhole', position: [20, 0, -10], axis: [0, 1, 0]},
            {id: 's0', type: 'axlehole', position: [20, -4, -10], axis: [0, 1, 0]}],
        colliders: []}]
]);

test('a left part mirrors into its right counterpart (by name or by meta.mirror), connectors on the mirror images', () => {
    assert.deepEqual(mirrorCounterpart('9001.dat', PAIR_CATALOG), {part: '9002.dat', axis: 'x'});
    assert.deepEqual(mirrorCounterpart('9002.dat', PAIR_CATALOG), {part: '9001.dat', axis: 'x'});
    assert.deepEqual(mirrorCounterpart('9004.dat', PAIR_CATALOG), {part: '9005.dat', axis: 'z'});
    assert.equal(mirrorCounterpart('32524.dat', PAIR_CATALOG), null, 'a beam has none');
    assert.equal(partSymmetry(PAIR_CATALOG.get('9001.dat')), null, 'the left part is not its own mirror image');
    assert.equal(partSymmetry(PAIR_CATALOG.get('9003.dat')), null, 'nor is the handed one');
    for (const part of ['9001.dat', '9002.dat', '9004.dat']) {
        for (const rotation of [I3, AXIS_ROTATIONS[3], AXIS_ROTATIONS[11], axisAngle([0.3, 1, -0.2], 1.1)]) {
            for (const axis of ['x', 'z']) {
                const placed = {id: 'p', part, position: [0, 0, 0], rotation};
                const [m] = mirrorPoses([placed], PAIR_CATALOG, axis, 30);
                assert.equal(m.how, 'swapped');
                assert.notEqual(m.part, part, 'the counterpart takes its place');
                assert.ok(Math.abs(det(m.rotation) - 1) < 1e-9);
                const expected = PAIR_CATALOG.get(part).connectors.map(c => reflectPoint(axis, 30)(mulV(rotation, c.position)))
                    .map(p => p.map(v => Math.round(v * 1000) / 1000).map(v => (v === 0 ? 0 : v)).join(',')).sort();
                assert.deepEqual(connectorPoints(m, PAIR_CATALOG), expected, `${part} → ${m.part} across ${axis}`);
            }
        }
    }
});

test('a handed part with no counterpart goes to the mirrored spot and keeps its handedness', () => {
    const rotation = AXIS_ROTATIONS[7];
    const [m] = mirrorPoses([{id: 'p', part: '9003.dat', position: [50, -8, 20], rotation}], PAIR_CATALOG, 'x', 10);
    assert.equal(m.how, 'kept');
    assert.equal(m.part, '9003.dat');
    assert.deepEqual(m.position, [-30, -8, 20], 'its origin is mirrored');
    assert.ok(Math.abs(det(m.rotation) - 1) < 1e-9, 'a proper rotation');
    // Its axes are the mirrored axes (M·R·M): the turn looks mirrored, the part itself is not.
    const M = [-1, 0, 0, 0, 1, 0, 0, 0, 1];
    assert.deepEqual(m.rotation.map(v => v + 0), mul(mul(M, rotation), M).map(v => v + 0));
});

test('the mirror command: one undo step, ports and groups kept, twice is the identity, the file stays valid', () => {
    const model = {version: 1, parts: [
        {id: 'a', part: '9001.dat', color: 4, position: [20, 0, 0], rotation: I3.slice()},
        {id: 'b', part: '32348.dat', color: 71, position: [60, -20, 40], rotation: AXIS_ROTATIONS[9].slice()},
        {id: 'm', part: '54696p01.dat', port: 'A', position: [100, -40, 0], rotation: I3.slice()},
        {id: 'x', part: '32524.dat', position: [-200, 0, 0], rotation: I3.slice()}
    ], groups: [{id: 'g1', name: 'Arm', parts: ['a', 'b']}]};
    const ed = createEditor({model, catalog: PAIR_CATALOG});
    const before = ed.model;
    const ids = ['a', 'b', 'm'];
    const pivot = mirrorPivot(before, PAIR_CATALOG, ids, 'x');
    ed.apply({type: 'mirror', ids, axis: 'x'});
    const after = ed.model;
    assert.equal(after.parts.find(p => p.id === 'a').part, '9002.dat', 'left became right');
    assert.equal(after.parts.find(p => p.id === 'm').port, 'A', 'the motor keeps its port');
    assert.deepEqual(after.groups, before.groups, 'the group is the same parts');
    assert.deepEqual(after.parts.find(p => p.id === 'x'), before.parts.find(p => p.id === 'x'), 'an unselected part is untouched');
    for (const id of ids) {
        const was = before.parts.find(p => p.id === id);
        const now = after.parts.find(p => p.id === id);
        assert.equal(now.position[0], 2 * pivot - was.position[0], `${id} mirrored about x = ${pivot}`);
        assert.equal(now.position[2], was.position[2]);
    }
    assert.deepEqual(validatePlacedModel(after, PAIR_CATALOG), []);
    const back = parseModel(serializeModel(after), {catalog: PAIR_CATALOG}).model;
    assert.deepEqual(back.parts.map(p => [p.part, p.position, p.rotation]), after.parts.map(p => [p.part, p.position, p.rotation]));

    ed.undo();
    assert.deepEqual(ed.model, before, 'one undo');
    ed.redo();
    assert.deepEqual(ed.model, after);
    ed.apply({type: 'mirror', ids, axis: 'x'});
    const twice = ed.model;
    for (const p of before.parts) {
        const q = twice.parts.find(x => x.id === p.id);
        assert.equal(q.part, p.part);
        assert.deepEqual(q.position, p.position);
        assert.ok(q.rotation.every((v, i) => Math.abs(v - p.rotation[i]) < 1e-12), `${p.id}: mirrored twice is where it was`);
    }
    assert.throws(() => ed.apply({type: 'mirror', ids, axis: 'y'}), /bad axis/);
});

test('mirroring one symmetric beam in place changes nothing, and the command says so instead of recording a step', () => {
    const ed = createEditor({model: {version: 1, parts: [{id: 'a', part: '32524.dat', position: [0, 0, 0], rotation: I3.slice()}]}, catalog: CATALOG});
    assert.throws(() => ed.apply({type: 'mirror', ids: ['a'], axis: 'x'}), /nothing moves/);
    assert.equal(ed.canUndo, false);
});

// ---- align / distribute / grid ---------------------------------------------------------------

const row = () => ({version: 1, parts: [
    {id: 'a', part: '32524.dat', position: [0, 0, 0], rotation: I3.slice()},
    {id: 'b', part: '32523.dat', position: [47, -30, 13], rotation: I3.slice()},
    {id: 'c', part: '32316.dat', position: [130, 0, -21], rotation: AXIS_ROTATIONS[4].slice()},
    {id: 'd', part: '2780.dat', position: [210, -10, 40], rotation: I3.slice()},
    {id: 'e', part: '2780.dat', position: [220, -10, 40], rotation: I3.slice()}
], groups: [{id: 'g1', name: 'Pins', parts: ['d', 'e']}]});

test('align lines up the edges or centres of the selection on an axis; a group moves as one', () => {
    const ids = ['a', 'b', 'c', 'd', 'e'];
    for (const [axis, k] of [['x', 0], ['y', 1], ['z', 2]]) {
        for (const mode of ['min', 'centre', 'max']) {
            const ed = createEditor({model: row(), catalog: CATALOG});
            const before = ed.model;
            ed.apply({type: 'align', ids, axis, mode});
            const after = ed.model;
            const units = selectionUnits(after, CATALOG, ids);
            assert.equal(units.length, 4, 'the two grouped pins are one unit');
            const at = u => (mode === 'min' ? u.bounds.min[k] : mode === 'max' ? u.bounds.max[k] : (u.bounds.min[k] + u.bounds.max[k]) / 2);
            const values = units.map(at);
            assert.ok(values.every(v => Math.abs(v - values[0]) < 1e-6), `${axis} ${mode}: ${values}`);
            // Only that axis moved, and the group kept its shape.
            for (const p of after.parts) {
                const was = before.parts.find(q => q.id === p.id);
                for (let i = 0; i < 3; i++) if (i !== k) assert.equal(p.position[i], was.position[i]);
                assert.deepEqual(p.rotation, was.rotation);
            }
            const gap = s => s.parts.find(p => p.id === 'e').position[0] - s.parts.find(p => p.id === 'd').position[0];
            assert.equal(gap(after), gap(before));
            ed.undo();
            assert.deepEqual(ed.model, before, `${axis} ${mode}: one undo`);
            ed.redo();
            assert.deepEqual(ed.model, after);
        }
    }
});

test('align needs two things to line up; a single part or group alone is refused', () => {
    assert.deepEqual(alignMoves({model: row(), catalog: CATALOG, ids: ['d', 'e'], axis: 'x', mode: 'min'}), []);
    const ed = createEditor({model: row(), catalog: CATALOG});
    assert.throws(() => ed.apply({type: 'align', ids: ['a'], axis: 'x', mode: 'min'}), /nothing moves/);
    assert.throws(() => ed.apply({type: 'align', ids: ['a', 'b'], axis: 'q', mode: 'min'}), /bad axis/);
    assert.throws(() => ed.apply({type: 'align', ids: ['a', 'b'], axis: 'x', mode: 'top'}), /bad mode/);
});

test('distribute spreads the centres evenly between the two outermost', () => {
    const ids = ['a', 'b', 'c', 'd', 'e'];
    const ed = createEditor({model: row(), catalog: CATALOG});
    const before = ed.model;
    const centre = u => (u.bounds.min[0] + u.bounds.max[0]) / 2;
    const was = selectionUnits(before, CATALOG, ids).map(centre).sort((x, y) => x - y);
    ed.apply({type: 'distribute', ids, axis: 'x'});
    const now = selectionUnits(ed.model, CATALOG, ids).map(centre).sort((x, y) => x - y);
    assert.equal(now[0], was[0], 'the first stays');
    assert.equal(now.at(-1), was.at(-1), 'the last stays');
    const steps = now.slice(1).map((v, i) => v - now[i]);
    assert.ok(steps.every(s => Math.abs(s - steps[0]) < 1e-6), `equal steps: ${steps}`);
    ed.undo();
    assert.deepEqual(ed.model, before);
    assert.deepEqual(distributeMoves({model: before, catalog: CATALOG, ids: ['a', 'b'], axis: 'x'}), [], 'two units: nothing to spread');
});

test('to the grid puts each unit\'s first part on the floor grid in x and z, height untouched', () => {
    const ed = createEditor({model: row(), catalog: CATALOG});
    const before = ed.model;
    ed.apply({type: 'toGrid', ids: ['b', 'c', 'd', 'e'], grid: 10});
    const after = ed.model;
    for (const id of ['b', 'c', 'd']) {
        const p = after.parts.find(q => q.id === id);
        assert.ok(p.position[0] % 10 === 0 && p.position[2] % 10 === 0, `${id} on the grid: ${p.position}`);
        assert.equal(p.position[1], before.parts.find(q => q.id === id).position[1]);
    }
    assert.deepEqual(gridMoves({model: after, catalog: CATALOG, ids: ['b', 'c'], grid: 10}), [], 'already on the grid');
    ed.undo();
    assert.deepEqual(ed.model, before);
});

test('a part\'s bounds are its colliders\' extent, turned with it', () => {
    const beam7 = CATALOG.get('32524.dat');
    const flat = partBounds({position: [0, 0, 0], rotation: I3}, beam7);
    const turned = partBounds({position: [0, 0, 0], rotation: worldAxisRotation('y', Math.PI / 2)}, beam7);
    assert.ok(flat.max[2] - flat.min[2] > 130, 'a beam 7 is 7 holes long along its own z');
    assert.ok(Math.abs((turned.max[0] - turned.min[0]) - (flat.max[2] - flat.min[2])) < 1e-6, 'turned a quarter, that length is along x');
});

// ---- measuring ------------------------------------------------------------------------------

test('the measuring tape: LDU, studs (20 LDU) and millimetres (0.4 mm per LDU)', () => {
    const m = measureBetween([10, -20, 5], [70, -20, 85]);
    assert.deepEqual(m.delta, [60, 0, 80]);
    assert.equal(m.ldu, 100);
    assert.equal(m.studs, 100 / 20);
    assert.equal(m.mm, 100 * 0.4);
});

test('a measured point on a part snaps to the hole next to it', () => {
    const beam = {id: 'a', part: '32524.dat', position: [100, -24, 40], rotation: worldAxisRotation('y', Math.PI / 2)};
    const meta = CATALOG.get('32524.dat');
    const holes = meta.connectors.map(c => mulV(beam.rotation, c.position).map((v, i) => v + beam.position[i]));
    const near = holes[2].map((v, i) => v + [3, -4, 2][i]);
    const got = measurePoint(beam, meta, near);
    assert.deepEqual(got.point, holes[2]);
    assert.equal(got.connector, meta.connectors[2].id);
    const far = measurePoint(beam, meta, [0, 300, 0]);
    assert.equal(far.connector, null, 'nothing near: the point itself');
    // Two holes of one beam: whole studs apart.
    const d = measureBetween(measurePoint(beam, meta, holes[0]).point, measurePoint(beam, meta, holes[6]).point);
    assert.equal(d.studs, 6);
});

// ---- typed rotations ---------------------------------------------------------------------------

test('typed degrees round-trip, and 90° about y is the editor\'s quarter turn', () => {
    for (const angles of [[0, 0, 0], [30, 45, 60], [-120, 10, 170], [90, 0, -90], [12.5, -33, 0.25]]) {
        const r = degreesToRotation(angles);
        assert.ok(Math.abs(det(r) - 1) < 1e-9 && orthonormal(r));
        const back = degreesToRotation(rotationToDegrees(r));
        assert.ok(back.every((v, i) => Math.abs(v - r[i]) < 1e-6), `${angles} → ${rotationToDegrees(r)}`);
    }
    assert.deepEqual(degreesToRotation([0, 90, 0]), worldAxisRotation('y', Math.PI / 2));
    assert.deepEqual(rotationToDegrees(worldAxisRotation('x', Math.PI / 2)), [90, 0, 0]);
    for (const r of AXIS_ROTATIONS) {
        const back = degreesToRotation(rotationToDegrees(r));
        assert.deepEqual(back.map(v => v + 0), r.map(v => v + 0), 'an axis turn comes back exactly');
    }
});

// ---- the clipboard ------------------------------------------------------------------------------

test('copied parts are LDraw text that pastes back with colour, pose, port and group', () => {
    const model = {version: 1, parts: [
        {id: 'a', part: '32524.dat', color: 4, position: [0, 0, 0], rotation: I3.slice()},
        {id: 'b', part: '2780.dat', color: 0, position: [0, -10, 20], rotation: AXIS_ROTATIONS[6].slice()},
        {id: 'm', part: '54675.dat', color: 15, port: 'C', position: [60, -40, 0], rotation: I3.slice()},
        {id: 'z', part: '32523.dat', color: 1, position: [500, 0, 0], rotation: I3.slice()}
    ], groups: [{id: 'g1', name: 'Pinned', parts: ['a', 'b']}]};
    const text = clipboardText(model, ['a', 'b', 'm']);
    assert.equal((text.match(/^1 /gm) || []).length, 3, 'three type-1 lines (what Studio and LeoCAD read)');
    assert.doesNotMatch(text, /32523\.dat/, 'only the selection');
    const got = partsFromClipboard(text, CATALOG);
    assert.equal(got.refused, 0);
    assert.deepEqual(got.parts.map(p => [p.part, p.color, p.position, p.rotation, p.port]),
        model.parts.slice(0, 3).map(p => [p.part, p.color, p.position, p.rotation, p.port]));
    const parsed = parseModel(text, {catalog: CATALOG}).model;
    assert.deepEqual(parsed.groups.map(g => [g.name, g.parts.slice().sort()]), [['Pinned', ['a', 'b']]]);
});

test('LDraw text from another program pastes its known parts and counts the rest', () => {
    // As BrickLink Studio puts parts on the clipboard: plain type-1 lines, a part we do not have.
    const studio = '0 Untitled\r\n1 14 0 -24 0 1 0 0 0 1 0 0 0 1 32524.dat\r\n1 4 40 -8 0 1 0 0 0 1 0 0 0 1 3001.dat\r\n1 0 0 0 20 0 0 1 0 1 0 -1 0 0 2780.dat\r\n';
    const got = partsFromClipboard(studio, CATALOG);
    assert.deepEqual(got.parts.map(p => [p.part, p.color]), [['32524.dat', 14], ['2780.dat', 0]]);
    assert.equal(got.refused, 1, 'the brick it does not know');
    assert.equal(partsFromClipboard('just some words', CATALOG), null, 'no parts: not LDraw');
    assert.equal(partsFromClipboard('', CATALOG), null);
    const mirrored = partsFromClipboard('1 4 0 0 0 -1 0 0 0 1 0 0 0 1 32524.dat\r\n', CATALOG);
    assert.equal(mirrored.parts.length, 0, 'a mirrored (det −1) line is not pasted');
    assert.equal(mirrored.refused, 1);
});
