// SPDX-License-Identifier: BSD-3-Clause
// Copyright (c) 2026 Christian Ströbele (CrispStrobe)
// Current-app integration rig. The app owns preparation, hubs, control and physics.
import fs from 'node:fs';
import {SimSession, catalogFrom, prepareModel} from '../../../../overlay/scratch-gui/src/lib/bw-sim/sim-session.js';
import {loadJolt} from '../../../../overlay/scratch-gui/src/lib/bw-sim/physics/jolt-core.js';
import {createRobotLabApi} from '../../../../overlay/scratch-gui/src/lib/bw-sim/api/robot-lab-api.js';
import VirtualSpikeHubState from '../../../../overlay/scratch-gui/src/lib/virtual-hub/spike-hub-state.js';

export const catalog = catalogFrom(JSON.parse(fs.readFileSync(new URL(
  '../../../../overlay/scratch-gui/src/lib/bw-sim/part-meta/parts.json', import.meta.url))));

export async function createRig(modelText, {autoPorts} = {}) {
  if (autoPorts !== undefined && autoPorts !== false) throw new TypeError('Use ordinary import or explicit strict preparation.');
  const mat = 'plain';
  const prep = prepareModel(modelText, catalog, {mat, ...(autoPorts === false ? {autoPorts: false} : {})});
  if (!prep.mechanism) throw new Error(JSON.stringify(prep.issues));
  const hubState = new VirtualSpikeHubState();
  hubState.setSimulationEnabled(true);
  // fromText does not forward autoPorts. In strict mode use its native public
  // constructor with the untouched mechanism; no inferred physical field changes.
  const prepared = autoPorts === false
    ? {session: new SimSession({...prep, catalog, hubState, mat, J: await loadJolt()}), issues: prep.issues}
    : await SimSession.fromText(modelText, {catalog, hubState, mat});
  const {session, issues} = prepared;
  const api = createRobotLabApi({getSession: () => session, getStatus: () => 'running',
    start: async () => {}, locale: () => 'en'});
  return {session, api, prep, issues,
    preparationMode: autoPorts === false ? 'strict-autoPorts-false' : 'ordinary-default-import',
    async tick(ms) {session.tick(ms); await session.idle(); await null;},
    snapshot() {return {timeMs: session.time, encoders: {A: api.encoder('A')}};},
    dispose() {api.dispose(); session.dispose();}};
}
