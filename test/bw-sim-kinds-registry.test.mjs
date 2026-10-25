// SPDX-License-Identifier: BSD-3-Clause
/**
 * The mechanism kind registries (overlay/scratch-gui/src/lib/bw-sim/registry/kinds.js,
 * kinds/; docs/ROBOT-LAB-ARCHITECTURE.md §6.2): the v1 connector and gear rules are
 * the built-in modules, and a connector kind and a coupling kind that only a test
 * module defines (test/fixtures/bw-sim/toy-kinds.mjs) are compiled — joints, a
 * coupling, validation — without any edit to the compiler.
 */
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {compile} from '../overlay/scratch-gui/src/lib/bw-sim/mech/compile.js';
import {validateCompiledMechanism, validatePartMeta, mechanismV1} from '../overlay/scratch-gui/src/lib/bw-sim/contracts.js';
import {BUILTIN_KINDS, withKinds} from '../overlay/scratch-gui/src/lib/bw-sim/kinds/index.js';
import {ConnectorKindRegistry, CouplingKindRegistry} from '../overlay/scratch-gui/src/lib/bw-sim/registry/kinds.js';
import {edgeKind} from '../overlay/scratch-gui/src/lib/bw-sim/mech/graph.js';
import {TOY_CONNECTORS, TOY_BELT, TOY_MODEL, toyCatalog} from './fixtures/bw-sim/toy-kinds.mjs';

const TOY_KINDS = withKinds(BUILTIN_KINDS, {connectors: TOY_CONNECTORS, couplings: [TOY_BELT]});

test('the built-in connector kinds pair exactly as the v1 edge rule does', () => {
    const types = ['pin', 'axle', 'stud', 'ball', 'pinhole', 'axlehole', 'antistud', 'ballsocket'];
    // Two connectors at one point on one axis, long enough to seat: only the type rule decides.
    const at = (type, friction) => ({id: type, type, position: [0, 0, 0], axis: [0, 0, 1], length: 20, friction});
    for (const a of types) {
        for (const b of types) {
            for (const friction of [undefined, false]) {
                const pair = BUILTIN_KINDS.connectors.pair(at(a, friction), at(b, friction));
                // v1 (mech/graph.js before R2) tried a as the shaft, then b; ballsocket is never a shaft.
                const v1 = ['ballsocket'].includes(a) ? null : edgeKind(at(a, friction), at(b, friction));
                const v1rev = ['ballsocket'].includes(b) ? null : edgeKind(at(b, friction), at(a, friction));
                const expected = v1 || v1rev || null;
                assert.equal(pair ? pair.kind : null, expected, `${a} + ${b} (friction ${friction})`);
            }
        }
    }
    // Geometry still decides: a pin 30 LDU off its hole's axis does not seat.
    const pin = {id: 'p', type: 'pin', position: [30, 0, 0], axis: [0, 0, 1], length: 20};
    assert.equal(BUILTIN_KINDS.connectors.pair(pin, {id: 'h', type: 'pinhole', position: [0, 0, 0], axis: [0, 0, 1], length: 20}), null);
});

test('registries refuse malformed or duplicate modules and never change the built-ins', () => {
    assert.throws(() => new ConnectorKindRegistry([{kind: 'x', pairs: [{with: 'y'}]}]), /pair rule/);
    assert.throws(() => BUILTIN_KINDS.connectors.with({kind: 'pin'}), /registered twice/);
    assert.throws(() => new CouplingKindRegistry([{id: 'x', kind: 'x'}]), /exactly one of mesh, detect/);
    assert.equal(TOY_KINDS.connectors.has('toy-peg'), true);
    assert.equal(BUILTIN_KINDS.connectors.has('toy-peg'), false, 'the built-in registry is not changed by a test\'s');
    assert.equal(BUILTIN_KINDS.couplings.ofKind('belt'), null);
});

test('a connector kind and a coupling kind from a test module compile without editing the compiler', () => {
    const catalog = toyCatalog();
    // The part metadata names the new kinds: valid only where they are registered.
    for (const meta of catalog.values()) {
        assert.ok(validatePartMeta(meta).some(p => /is not one of/.test(p)), `${meta.part} is refused without the kind`);
        assert.deepEqual(validatePartMeta(meta, {connectorKinds: TOY_KINDS.connectors}), [], meta.part);
    }
    // Built-in kinds only: the pegs join nothing, the parts are three loose bodies.
    const plain = compile(TOY_MODEL, catalog, {ground: false, version: 2});
    assert.equal(plain.joints.length, 0);
    assert.equal(plain.bodies.length, 3);
    assert.ok(plain.diagnostics.some(d => d.code === 'loose-part'));
    // With the toy kinds: each pulley turns on a hinge in the base, and the belt couples them.
    const m = compile(TOY_MODEL, catalog, {ground: false, version: 2, kinds: TOY_KINDS});
    assert.deepEqual(m.diagnostics, []);
    assert.equal(m.joints.length, 2);
    assert.ok(m.joints.every(j => j.type === 'hinge' && Math.abs(Math.abs(j.axis[2]) - 1) < 1e-12), JSON.stringify(m.joints));
    const base = m.bodies.find(b => b.parts.includes('base')).id;
    assert.ok(m.joints.every(j => j.body1 === base), 'the pulleys turn in the base');
    assert.equal(m.couplings.length, 1);
    const [belt] = m.couplings;
    assert.equal(belt.kind, 'belt');
    assert.deepEqual([...belt.parts].sort(), ['large', 'small']);
    const radius = {small: 10, large: 20};
    assert.equal(belt.ratio, radius[belt.parts[0]] / radius[belt.parts[1]], 'r1 / r2, the pulleys in joint order');
    // The registered kind validates the coupling; without the registry it is refused.
    assert.deepEqual(validateCompiledMechanism(m, {kinds: TOY_KINDS}), []);
    assert.ok(validateCompiledMechanism(m).some(p => /'belt' is not gear, rackAndPinion or a registered coupling kind/.test(p)));
    assert.ok(validateCompiledMechanism({...m, couplings: [{...belt, ratio: -1}]}, {kinds: TOY_KINDS}).some(p => /ratio > 0/.test(p)));
    // The module names the bodies it ties: they never collide (R3's filter), besides the jointed pairs.
    const bodyOf = id => m.bodies.find(b => b.parts.includes(id)).id;
    const pair = [bodyOf('small'), bodyOf('large')].sort();
    assert.ok(m.noCollide.some(p => p[0] === pair[0] && p[1] === pair[1]), JSON.stringify(m.noCollide));
    // v1 cannot say "belt": its view has no gears, and the default compile is that view.
    assert.deepEqual(mechanismV1(m).gears, []);
    assert.deepEqual(compile(TOY_MODEL, catalog, {ground: false, kinds: TOY_KINDS}), mechanismV1(m));
});
