// SPDX-License-Identifier: BSD-3-Clause
import test from 'node:test';
import assert from 'node:assert/strict';
import {SimSession} from '../overlay/scratch-gui/src/lib/bw-sim/sim-session.js';
// Exercise actual session methods against fake transport edges; no physics world.
test('a disposal callback during accepted replay fences pose and analytical publication', () => {
    const session = Object.create(SimSession.prototype), publications = [];
    const sent = {at: performance.now(), batch: {key: 'same', steps: 1, ms: 5}};
    Object.assign(session, {_disposed: false, _inFlight: sent, worker: true, scene: 1, _idle: [], _steps: 0, _ticks: [],
        stats: {roundTripMs:0,maxRoundTripMs:0,workerMs:0,diverged:0,mainMs:0},
        core: {update: () => publications.push('pose')}, _precisionAnalysis: {accept: () => publications.push('precision')},
        client: {simDispose: async () => {}}, _exportHubs: () => ({}), _hubsKey: () => 'same',
        bridge: {replay: () => { session.dispose(); return 0; }, dispose: () => {}},
        listeners: new Set([() => publications.push('listener')])});
    session._receive(sent, {frames:[],workMs:0,bodies:new Float64Array(7)});
    assert.deepEqual(publications, []);
    assert.equal(session._inFlight, null);
});
test('disposal and unsubscribe during advance prevent stale snapshot callbacks', () => {
    const session = Object.create(SimSession.prototype), calls = [];
    const skipped = () => calls.push('unsubscribed'), late = () => calls.push('late');
    Object.assign(session, {_disposed:false, listeners:new Set([() => {calls.push('first');session.listeners.delete(skipped);}, skipped,
        () => {calls.push('dispose');session._disposed=true;}, late])});
    session._advanced(); assert.deepEqual(calls,['first','dispose']);
});
