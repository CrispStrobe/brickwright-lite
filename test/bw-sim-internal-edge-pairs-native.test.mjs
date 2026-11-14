// SPDX-License-Identifier: BSD-3-Clause
// Genuine native API calls. Faults are injected only after the real operation.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {compile} from '../overlay/scratch-gui/src/lib/bw-sim/mech/compile.js';
import {loadJolt, createPhysicsCore} from '../overlay/scratch-gui/src/lib/bw-sim/physics/jolt-core.js';

const catalog = new Map(JSON.parse(readFileSync(new URL('../overlay/scratch-gui/src/lib/bw-sim/part-meta/parts.json', import.meta.url))).parts.map(p => [p.part, p]));
const model = {version: 1, internalEdgeRemovalPairs: [['b', 'a'], ['c', 'a']], parts: ['a', 'b', 'c'].map((id, i) =>
    ({id, part: '3001.dat', position: [i * 200, 0, 0], rotation: [1, 0, 0, 0, 1, 0, 0, 0, 1]}))};
const mechanism = compile(model, catalog, {ground: false, version: 2});
const J = await loadJolt();

test('missing native pair API refuses before any native world allocation', () => {
    let allocations = 0;
    const oldModule = new Proxy(J, {get(target, property) {
        if (property === 'PhysicsSystem') return {prototype: {}};
        if (property === 'JoltSettings') allocations++;
        return target[property];
    }});
    assert.throws(() => createPhysicsCore(oldModule, mechanism), /needs an engine/);
    assert.equal(allocations, 0);
});

test('real native setup rejection, API throw and cleanup throws preserve primary and dispose owner once', () => {
    const proto = J.PhysicsSystem.prototype, set = proto.SetSimInternalEdgeRemovalPair, clear = proto.ClearSimInternalEdgeRemovalPairs, destroy = J.destroy;
    assert.equal(typeof set, 'function');assert.equal(typeof clear, 'function');
    for (const mode of ['reject', 'throw', 'clear-throw', 'disposal-throw']) {
        const primary = new Error(`primary-${mode}`), secondary = new Error(`cleanup-${mode}`);
        let sets = 0, clears = 0, disposals = 0, ownedBodies = null, observed;
        proto.SetSimInternalEdgeRemovalPair = function (...args) {
            assert.equal(set.apply(this, args), true, 'genuine native pair operation accepts real body IDs');
            if (++sets === 2) {if (mode === 'reject') return false;throw primary;}
            return true;
        };
        proto.ClearSimInternalEdgeRemovalPairs = function () {
            clears++;assert.equal(clear.call(this), true);
            if (mode === 'clear-throw') throw secondary;
            return true;
        };
        J.destroy = object => {
            const owner = object instanceof J.JoltInterface;
            if (owner) {disposals++;ownedBodies = object.GetPhysicsSystem().GetNumBodies();}
            destroy(object);
            if (owner && mode === 'disposal-throw') throw secondary;
        };
        try { createPhysicsCore(J, mechanism); } catch (error) { observed = error; }
        finally {proto.SetSimInternalEdgeRemovalPair = set;proto.ClearSimInternalEdgeRemovalPairs = clear;J.destroy = destroy;}
        assert(observed);
        if (mode === 'reject') assert.match(observed.message, /Could not configure/);
        else assert.equal(observed, primary);
        assert.equal(sets, 2);assert.equal(clears, 1);assert.equal(disposals, 1);
        assert.equal(ownedBodies, mechanism.bodies.length, 'owner contains every nascent body at disposal');
        if (mode === 'clear-throw' || mode === 'disposal-throw') assert.deepEqual(observed.cleanupErrors, [secondary]);
        // The owner destructor releases the engine's Factory/types and bodies;
        // immediately creating another actual world catches incomplete teardown.
        const recovery = createPhysicsCore(J, mechanism);
        try {assert.equal(recovery.snapshot().bodyIds.length, mechanism.bodies.length);}
        finally {recovery.destroy();}
    }
});

test('unchanged selected-pair configuration survives real core checkpoint/rollback', () => {
    const core = createPhysicsCore(J, mechanism, {stepHz: 200});
    try {
        core.step(.02);core.checkpoint();core.step(.05);const first = core.snapshot();
        core.rollback();core.step(.05);assert.deepEqual(core.snapshot(), first);
    } finally {core.destroy();}
});
