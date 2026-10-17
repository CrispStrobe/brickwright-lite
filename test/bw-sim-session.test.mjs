// SPDX-License-Identifier: BSD-3-Clause
/**
 * The Sim Lab session as the pane uses it, headless: the shipped reference
 * model (static/sim-lab/models/driving-base.ldr) is fetched the way the
 * browser fetches it, its LDraw closure is loaded from the vendored
 * static/ldraw/ through the same fetch, and SimSession drives it from the
 * virtual SPIKE hub.
 *
 *   - fetchLDrawClosure finds exactly the files flattenPart needs, with none missing;
 *   - prepareModel lists problems instead of throwing: an unknown part and a
 *     mirrored part come back as named issues while the rest compiles;
 *   - a session built from the shipped model drives forward under the S1
 *     motor commands and reads physical encoders;
 *   - a model with no hub still runs (it settles under gravity) and says why
 *     nothing moves.
 */
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync, existsSync} from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {fetchLDrawClosure} from '../overlay/scratch-gui/src/lib/bw-sim/ldraw/ldraw-fetch.js';
import {flattenPart} from '../overlay/scratch-gui/src/lib/bw-sim/ldraw/ldraw-geometry.js';
import {SimSession, prepareModel, catalogFrom, MODELS, MODELS_BASE} from '../overlay/scratch-gui/src/lib/bw-sim/sim-session.js';
import VirtualSpikeHubState from '../overlay/scratch-gui/src/lib/virtual-hub/spike-hub-state.js';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const STATIC = path.join(ROOT, 'overlay/scratch-gui');
const CATALOG = catalogFrom(JSON.parse(readFileSync(path.join(ROOT, 'overlay/scratch-gui/src/lib/bw-sim/part-meta/parts.json'), 'utf8')));

/** fetch() over the overlay's static folder, as the app serves it. */
const fetchImpl = async url => {
    const file = path.join(STATIC, url);
    if (!existsSync(file)) return {ok: false, status: 404, text: async () => ''};
    const text = readFileSync(file, 'latin1');
    return {ok: true, status: 200, text: async () => text};
};
const shippedModel = async () => (await fetchImpl(`${MODELS_BASE}${MODELS[0].file}`)).text();

test('the LDraw closure fetch finds exactly what the geometry reader needs', async () => {
    const parts = ['45601.dat', '54696p01.dat', '39367p01.dat'];
    const {read, files, missing} = await fetchLDrawClosure(parts, {fetchImpl});
    assert.deepEqual(missing, []);
    const needed = new Set(parts.flatMap(p => flattenPart(p, read).files));
    assert.deepEqual([...files.keys()].sort(), [...needed].sort());
});

test('prepareModel lists problems instead of throwing', () => {
    const text = [
        '1 71 0 0 0 1 0 0 0 1 0 0 0 1 45601.dat',
        '1 4 0 0 0 1 0 0 0 1 0 0 0 1 not-a-part.dat',
        '1 4 0 0 0 -1 0 0 0 1 0 0 0 1 32524.dat'
    ].join('\n');
    const {mechanism, issues} = prepareModel(text, CATALOG);
    assert.ok(mechanism, 'the hub alone still compiles');
    const codes = issues.map(i => i.code);
    for (const code of ['unknown-part', 'bad-matrix', 'no-motor']) assert.ok(codes.includes(code), `${code} in ${codes}`);
});

test('an empty model is an error, not a crash', () => {
    const {mechanism, issues} = prepareModel('0 nothing here\n', CATALOG);
    assert.equal(mechanism, null);
    assert.equal(issues.at(-1).code, 'empty-model');
});

test('the shipped driving base drives from the virtual hub', async () => {
    const hubState = new VirtualSpikeHubState();
    const {session, issues} = await SimSession.fromText(await shippedModel(), {hubState, catalog: CATALOG});
    assert.deepEqual(issues.filter(i => i.severity === 'error'), []);
    const hubBody = session.bridge.hubBody;
    const start = session.core.bodyPose(hubBody).position;
    hubState.motors.runAtSpeed('A', -555);
    hubState.motors.runAtSpeed('B', 555);
    for (let t = 0; t < 2000; t += 16) session.tick(16);
    const end = session.core.bodyPose(hubBody).position;
    assert.ok(end[2] - start[2] < -0.3, `moved ${(end[2] - start[2]).toFixed(3)} m along z`);
    assert.ok(hubState.data.motors[1].position > 600, `B encoder ${hubState.data.motors[1].position}`);
    session.dispose();
});

test('a model without a hub settles and says nothing will move', async () => {
    const hubState = new VirtualSpikeHubState();
    const {session, issues} = await SimSession.fromText('1 71 0 -200 0 1 0 0 0 1 0 0 0 1 32524.dat\n', {hubState, catalog: CATALOG});
    assert.equal(session.bridge, null);
    assert.ok(issues.some(i => i.code === 'no-motor'));
    session.tick(1000);
    session.dispose();
});
